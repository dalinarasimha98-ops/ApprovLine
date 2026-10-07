/**
 * My Approvals (/dashboard/approvals?view=mine) read model.
 *
 * Answers "what approvals am I responsible for reviewing and deciding?" —
 * NOT a second approval engine, and NOT a duplicate of Action Center
 * (/dashboard/pending-actions). Action Center is an OPEN-items-only
 * operational queue (PENDING/RESOLVED, no historical view, no date-range
 * filtering). My Approvals is the viewer's full personal approval
 * workspace: open items AND decided history (Approved/Rejected), with the
 * same richer filter/sort/pagination surface the org-wide Approval History
 * page (/dashboard/approvals, lib/approvalRecords.ts) already has — just
 * scoped to the viewer's own identity instead of the whole organization.
 *
 * REUSE, NOT A SECOND ENGINE:
 *  - Viewer scoping is services/action-center.ts's own viewerIdentityWhere()
 *    (real User.id / case-insensitive email match — never a name guess,
 *    never fuzzy-matched by company/department/email-domain).
 *  - Generic filters (search, department, source, category, risk, occurred
 *    date range) reuse lib/approvalRecords.ts's buildApprovalRecordsWhere()
 *    verbatim (ANDed with the viewer scope), so "my approvals" filters
 *    exactly the same way "all approvals" already does — no second filter
 *    grammar.
 *  - "Pending My Decision" / "Due Today" / "Overdue" reuse
 *    services/action-center.ts's computeKpis(viewer, true) — the exact
 *    same real query Action Center and the Individual Dashboard already
 *    use, forced to personal scope. Never a second due/overdue definition.
 *  - "Due Soon" reuses the identical ApprovalConfirmationRequest.expiresAt
 *    field and the same (tomorrow, +14d] horizon services/
 *    individualDashboard.ts already established for the same concept.
 *  - Row shape/select reuses lib/approvalRecords.ts's approvalRecordListSelect
 *    and services/evidence/records.ts's getUnifiedSourceSummariesForApprovals
 *    (same pair every other approvals surface uses), plus the minimum extra
 *    fields (manualDetail verification/second-verification state, the one
 *    pending confirmation request) needed to show a genuine personal status
 *    and due date — never a second evidence or source-summary query.
 *
 * DECISION ACTIONS: this app has no generic Approve/Reject action for a
 * classifier-originated PENDING_REVIEW record anywhere (confirmed by
 * exhaustive grep — the only status-mutating human actions are: recording a
 * manual/verbal approval, responding to a confirmation request, and
 * second-person verification). This read model never fabricates a decision
 * state the real engine can't produce; "personalStatus" below is always one
 * of the four real ApprovalRecord/ManualApprovalDetail states.
 *
 * SORTING: "priority" order is a real, deterministic bucket (overdue → due
 * today → due soon → open high/critical risk → other open → closed) built
 * from actual fields (confirmationRequest.expiresAt, riskLevel, status) —
 * never a fabricated score. Because a few of these buckets depend on a
 * related row (the pending confirmation's expiresAt) that Prisma can't
 * cheaply order by across a mixed open/closed table, sorting happens in JS
 * over a bounded fetch (MAX_SORTABLE_ROWS) rather than at the DB level. The
 * displayed `total` count is always exact (a separate COUNT query); only the
 * relative ORDER of items beyond that bound is not guaranteed — an honest,
 * documented limit for a personal queue, not silently wrong data. The
 * derivation/sort logic itself lives in lib/my-approvals.ts, which imports
 * nothing from Prisma — mirroring this codebase's existing lib/action-center.ts
 * (pure) + services/action-center.ts (DB-wiring) split, so that logic runs
 * as real executed unit tests (tests/my-approvals.test.ts) rather than only
 * static source-regex assertions.
 *
 * TENANT ISOLATION: every query starts from `organizationId: viewer.
 * organizationId`, taken from the server-resolved tenant, never from a
 * client-supplied value. The viewer's identity is likewise always the
 * server-resolved session identity.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { approvalRecordListSelect, buildApprovalRecordsWhere, type ApprovalListFilters, type ApprovalListRecord } from '@/lib/approvalRecords';
import { getUnifiedSourceSummariesForApprovals, type ApprovalSourceSummary } from '@/services/evidence/records';
import { computeKpis, viewerIdentityWhere, type ActionCenterViewer } from '@/services/action-center';
import {
  derivePersonalStatus,
  viewerConfirmationRequest,
  sortRows,
  type MyApprovalPersonalStatus,
  type MyApprovalsSort,
  type MyApprovalsStatusFilter,
} from '@/lib/my-approvals';

export type { MyApprovalPersonalStatus, MyApprovalsSort, MyApprovalsStatusFilter };

const QUERY_TIMEOUT_MS = 5000;
export const MY_APPROVALS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const MAX_SORTABLE_ROWS = 300;
const DUE_SOON_HORIZON_DAYS = 14;

export type MyApprovalsFilters = {
  q?: string;
  department?: string;
  sourcePlatform?: string;
  category?: string;
  riskLevel?: string;
  status?: MyApprovalsStatusFilter;
  from?: string;
  to?: string;
  sort?: MyApprovalsSort;
  page?: number;
  pageSize?: number;
};

const myApprovalRecordSelect = {
  ...approvalRecordListSelect,
  updatedAt: true,
  manualDetail: {
    select: {
      verificationStatus: true,
      secondPersonRequired: true,
      secondVerifierUserId: true,
      secondVerifiedAt: true,
    },
  },
  confirmationRequests: {
    where: { decision: 'PENDING' as const },
    orderBy: { expiresAt: 'asc' as const },
    take: 1,
    select: { id: true, expiresAt: true, approverEmail: true },
  },
} satisfies Prisma.ApprovalRecordSelect;

/** DB-level mirror of lib/my-approvals.ts's derivePersonalStatus() priority
 *  rule (a pending confirmation always wins over the raw status), needed
 *  here because this filters at the Prisma query level rather than over
 *  already-fetched rows. */
function statusWhereClause(status: MyApprovalsStatusFilter | undefined): Prisma.ApprovalRecordWhereInput | undefined {
  const confirmationPending = { manualDetail: { is: { verificationStatus: 'PENDING_CONFIRMATION' as const } } };
  if (!status) return undefined;
  if (status === 'CONFIRMATION_REQUIRED') return confirmationPending;
  if (status === 'PENDING_REVIEW') return { status: 'PENDING_REVIEW', NOT: confirmationPending };
  if (status === 'APPROVED') return { status: 'APPROVED', NOT: confirmationPending };
  return { status: 'REJECTED', NOT: confirmationPending };
}

export type MyApprovalRow = ApprovalListRecord & {
  sources: ApprovalSourceSummary | null;
  personalStatus: MyApprovalPersonalStatus;
  dueAt: Date | null;
  canCompleteConfirmation: boolean;
  canCompleteVerification: boolean;
};

export type MyApprovalsKpis = {
  pendingMyDecision: number;
  dueToday: number;
  overdue: number;
  dueSoon: number;
  approved: number;
  rejected: number;
};

export type MyApprovalsResult = {
  kpis: MyApprovalsKpis;
  rows: MyApprovalRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: MyApprovalsSort;
};

export async function getMyApprovalsOverview(
  viewer: ActionCenterViewer,
  filters: MyApprovalsFilters,
): Promise<MyApprovalsResult> {
  const pageSize = (MY_APPROVALS_PAGE_SIZE_OPTIONS as readonly number[]).includes(filters.pageSize ?? -1)
    ? (filters.pageSize as number)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const sort = filters.sort ?? 'priority';
  const now = new Date();

  const identity = viewerIdentityWhere(viewer);
  const genericFilters: ApprovalListFilters = {
    organizationId: viewer.organizationId,
    q: filters.q,
    department: filters.department,
    sourcePlatform: filters.sourcePlatform,
    category: filters.category,
    riskLevel: filters.riskLevel,
    from: filters.from,
    to: filters.to,
  };
  const genericWhere = buildApprovalRecordsWhere(genericFilters);
  const statusWhere = statusWhereClause(filters.status);

  const where: Prisma.ApprovalRecordWhereInput = {
    organizationId: viewer.organizationId,
    AND: [identity, genericWhere, ...(statusWhere ? [statusWhere] : [])],
  };

  const [totalCount, boundedRows, kpiBase, dueSoon, approved, rejected] = await withTimeout(
    'my-approvals:load',
    Promise.all([
      prisma.approvalRecord.count({ where }),
      prisma.approvalRecord.findMany({
        where,
        select: myApprovalRecordSelect,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: MAX_SORTABLE_ROWS,
      }),
      computeKpis(viewer, true),
      prisma.approvalConfirmationRequest.count({
        where: {
          organizationId: viewer.organizationId,
          decision: 'PENDING',
          expiresAt: { gt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), lte: new Date(now.getTime() + DUE_SOON_HORIZON_DAYS * 86_400_000) },
          approvalRecord: { is: identity },
        },
      }),
      prisma.approvalRecord.count({
        where: {
          organizationId: viewer.organizationId,
          AND: [
            identity,
            statusWhereClause('APPROVED')!,
            filters.from || filters.to
              ? { occurredAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } }
              : {},
          ],
        },
      }),
      prisma.approvalRecord.count({
        where: {
          organizationId: viewer.organizationId,
          AND: [
            identity,
            statusWhereClause('REJECTED')!,
            filters.from || filters.to
              ? { occurredAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } }
              : {},
          ],
        },
      }),
    ]),
    QUERY_TIMEOUT_MS,
  );

  const email = viewer.email.toLowerCase();
  const sorted = sortRows(boundedRows, sort, now.getTime(), email);
  const pageRows = sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  const sourceSummaries = await getUnifiedSourceSummariesForApprovals(viewer.organizationId, pageRows.map((r) => r.id));

  const rows: MyApprovalRow[] = pageRows.map((r) => {
    const personalStatus = derivePersonalStatus(r);
    const dueAt = viewerConfirmationRequest(r, email)?.expiresAt ?? null;
    const canCompleteConfirmation = personalStatus === 'CONFIRMATION_REQUIRED' && viewerConfirmationRequest(r, email) !== null;
    const canCompleteVerification = Boolean(
      r.manualDetail?.secondPersonRequired &&
      r.manualDetail.secondVerifierUserId === viewer.userId &&
      !r.manualDetail.secondVerifiedAt,
    );
    return {
      id: r.id,
      subject: r.subject,
      sourceLink: r.sourceLink,
      correlationId: r.correlationId,
      approverName: r.approverName,
      approverEmail: r.approverEmail,
      department: r.department,
      category: r.category,
      riskLevel: r.riskLevel,
      sourcePlatform: r.sourcePlatform,
      confidence: r.confidence,
      status: r.status,
      createdAt: r.createdAt,
      occurredAt: r.occurredAt,
      sources: sourceSummaries.get(r.id) ?? null,
      personalStatus,
      dueAt,
      canCompleteConfirmation,
      canCompleteVerification,
    };
  });

  return {
    kpis: {
      pendingMyDecision: kpiBase.needsAttention,
      dueToday: kpiBase.dueToday,
      overdue: kpiBase.overdue,
      dueSoon,
      approved,
      rejected,
    },
    rows,
    total: totalCount,
    page,
    pageSize,
    sort,
  };
}
