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
 * SORTING/PAGINATION: real database ORDER BY + LIMIT/OFFSET across the
 * viewer's ENTIRE matching set, not a bounded in-memory sort. "priority"
 * order is a real, deterministic bucket (overdue → due today → due soon →
 * open high/critical risk → other open → closed) built from actual fields
 * (confirmationRequest.expiresAt, riskLevel, status) — never a fabricated
 * score. Because that bucket (and the "due" sort) depends on a related row
 * (the one PENDING ApprovalConfirmationRequest addressed to this viewer)
 * that Prisma's `orderBy` cannot express across a mixed open/closed table,
 * fetchSortedPageIds() below runs one raw SQL query computing it, built in
 * two phases so the tenant/viewer/filter WHERE clause is NEVER duplicated
 * in SQL:
 *   1. The normal, fully type-checked Prisma `where` (identical to the one
 *      used for the COUNT and every other query on this page) selects just
 *      the matching row IDs — cheap even for a large matching set, since
 *      only bare primary keys are fetched.
 *   2. A single parameterized raw SQL query (Prisma.sql/Prisma.join only —
 *      never string-concatenated SQL) is constrained to `WHERE id IN
 *      (<those already-vetted IDs>)`, so it can never see a row outside
 *      what phase 1 already proved belongs to this organization and viewer.
 *      It computes the due-date/priority expression, ORDERs BY it with a
 *      deterministic id tiebreaker, and applies the real LIMIT/OFFSET for
 *      the requested page — returning just the page's IDs in final order.
 * The full typed row data for that one page is then fetched normally via
 * Prisma (myApprovalRecordSelect) and re-keyed to match the ID order phase
 * 2 already computed — a cheap re-ordering of ≤100 rows, not sort logic.
 *
 * TENANT ISOLATION: every query starts from `organizationId: viewer.
 * organizationId`, taken from the server-resolved tenant, never from a
 * client-supplied value. The viewer's identity is likewise always the
 * server-resolved session identity. The raw SQL phase inherits this
 * scoping transitively (see above) rather than re-deriving it.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { approvalRecordListSelect, buildApprovalRecordsWhere, type ApprovalListFilters, type ApprovalListRecord } from '@/lib/approvalRecords';
import { getUnifiedSourceSummariesForApprovals, type ApprovalSourceSummary } from '@/services/evidence/records';
import { computeKpis, viewerIdentityWhere, type ActionCenterViewer } from '@/services/action-center';
import {
  derivePersonalStatus,
  viewerConfirmationRequest,
  type MyApprovalPersonalStatus,
  type MyApprovalsSort,
  type MyApprovalsStatusFilter,
} from '@/lib/my-approvals';

export type { MyApprovalPersonalStatus, MyApprovalsSort, MyApprovalsStatusFilter };

const QUERY_TIMEOUT_MS = 5000;
export const MY_APPROVALS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
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
      recorder: { select: { name: true, email: true } },
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
  /** The real ManualApprovalDetail.recorder for a manual/verbal record —
   *  null for a plain classifier/system-originated record, which genuinely
   *  has no distinct "who recorded this" person. Never a fabricated value. */
  requestedByName: string | null;
};

/** Phase 2 of the two-phase sort/paginate described in this module's own
 *  header comment. `idList` must already be the exact, fully-scoped set of
 *  matching IDs from phase 1 (never a client-supplied list). Returns the
 *  requested page's IDs in final sorted order; the caller fetches full row
 *  data for just those IDs afterward. */
async function fetchSortedPageIds(args: {
  idList: string[];
  email: string;
  sort: MyApprovalsSort;
  page: number;
  pageSize: number;
}): Promise<string[]> {
  const { idList, email, sort, page, pageSize } = args;
  if (idList.length === 0) return [];
  const offset = (page - 1) * pageSize;

  // A fixed, hardcoded SQL fragment chosen by a type-safe switch over the
  // MyApprovalsSort union — `sort` itself is never interpolated into SQL.
  const orderBy = (() => {
    switch (sort) {
      case 'newest': return Prisma.sql`s.occurred_at DESC, s.id ASC`;
      case 'oldest': return Prisma.sql`s.occurred_at ASC, s.id ASC`;
      case 'lastActivity': return Prisma.sql`s.updated_at DESC, s.id ASC`;
      case 'due': return Prisma.sql`s.due_at ASC NULLS LAST, s.occurred_at DESC, s.id ASC`;
      default: return Prisma.sql`s.priority_bucket ASC, s.due_at ASC NULLS LAST, s.occurred_at DESC, s.id ASC`;
    }
  })();

  // The "is open" condition repeated in each CASE branch below mirrors
  // lib/my-approvals.ts's derivePersonalStatus() exactly: a pending
  // confirmation addressed to this viewer always wins over the raw status,
  // so this can never disagree with the personalStatus shown on the row
  // itself. due_at is the earliest PENDING ApprovalConfirmationRequest
  // addressed to this exact viewer email (never the earliest for anyone),
  // matching lib/my-approvals.ts's viewerConfirmationRequest().
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id FROM (
      SELECT
        ar.id,
        ar."occurredAt" AS occurred_at,
        ar."updatedAt" AS updated_at,
        due.due_at AS due_at,
        CASE
          WHEN (mad."verificationStatus" = 'PENDING_CONFIRMATION' OR ar.status = 'PENDING_REVIEW')
               AND due.due_at IS NOT NULL AND due.due_at < NOW() THEN 0
          WHEN (mad."verificationStatus" = 'PENDING_CONFIRMATION' OR ar.status = 'PENDING_REVIEW')
               AND due.due_at IS NOT NULL AND due.due_at::date = CURRENT_DATE THEN 1
          WHEN (mad."verificationStatus" = 'PENDING_CONFIRMATION' OR ar.status = 'PENDING_REVIEW')
               AND due.due_at IS NOT NULL AND due.due_at <= NOW() + INTERVAL '14 days' THEN 2
          WHEN (mad."verificationStatus" = 'PENDING_CONFIRMATION' OR ar.status = 'PENDING_REVIEW')
               AND lower(COALESCE(ar."riskLevel", '')) IN ('high', 'critical') THEN 3
          WHEN (mad."verificationStatus" = 'PENDING_CONFIRMATION' OR ar.status = 'PENDING_REVIEW') THEN 4
          ELSE 5
        END AS priority_bucket
      FROM "ApprovalRecord" ar
      LEFT JOIN "ManualApprovalDetail" mad ON mad."approvalRecordId" = ar.id
      LEFT JOIN LATERAL (
        SELECT acr."expiresAt" AS due_at
        FROM "ApprovalConfirmationRequest" acr
        WHERE acr."organizationId" = ar."organizationId"
          AND acr."approvalRecordId" = ar.id
          AND acr.decision = 'PENDING'
          AND lower(acr."approverEmail") = lower(${email})
        ORDER BY acr."expiresAt" ASC
        LIMIT 1
      ) due ON true
      WHERE ar.id IN (${Prisma.join(idList)})
    ) s
    ORDER BY ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return rows.map((r) => r.id);
}

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

  const [totalCount, matchingIdRows, kpiBase, dueSoon, approved, rejected] = await withTimeout(
    'my-approvals:load',
    Promise.all([
      prisma.approvalRecord.count({ where }),
      // Phase 1 of the two-phase sort (see this module's header comment) —
      // the exact same typed `where` as every other query here, just
      // selecting bare IDs. Not bounded to a page or a fixed cap: a
      // personal queue's matching-ID set is cheap to fetch in full even at
      // several hundred rows, unlike fetching full row payloads would be.
      prisma.approvalRecord.findMany({ where, select: { id: true } }),
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

  // Phase 2: a real database ORDER BY + LIMIT/OFFSET across the FULL
  // matching set (see this module's header comment and fetchSortedPageIds's
  // own doc comment) — never a bounded in-memory sort.
  const idList = matchingIdRows.map((r) => r.id);
  const sortedPageIds = await fetchSortedPageIds({ idList, email, sort, page, pageSize });

  let rows: MyApprovalRow[] = [];
  if (sortedPageIds.length > 0) {
    const pageRowsUnordered = await prisma.approvalRecord.findMany({
      where: { id: { in: sortedPageIds } },
      select: myApprovalRecordSelect,
    });
    const byId = new Map(pageRowsUnordered.map((r) => [r.id, r]));
    // Re-key to the order fetchSortedPageIds already computed — a cheap
    // reordering of ≤pageSize rows, never a re-derivation of sort logic.
    const pageRows = sortedPageIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));

    const sourceSummaries = await getUnifiedSourceSummariesForApprovals(viewer.organizationId, pageRows.map((r) => r.id));

    rows = pageRows.map((r) => {
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
        requestedByName: r.manualDetail?.recorder?.name ?? r.manualDetail?.recorder?.email ?? null,
      };
    });
  }

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
