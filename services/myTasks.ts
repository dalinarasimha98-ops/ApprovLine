/**
 * My Tasks (/dashboard/tasks) read model.
 *
 * Answers "what work has been assigned to me, what is due, what is
 * overdue, and what should I do next?" — a personal projection over
 * EXISTING work sources, never a new generic Task model. Confirmed via
 * exhaustive schema audit: only three real, per-user-assignable,
 * actionable record types exist anywhere in this app today:
 *
 *  1. CONFIRMATION — a manual/verbal approval whose ManualApprovalDetail.
 *     verificationStatus is PENDING_CONFIRMATION, assigned to the viewer
 *     via the SAME ApprovalRecord.approverUserId/approverEmail match
 *     services/action-center.ts's viewerAssignmentWhere() already uses.
 *     The real action is services/manual-approvals.ts's
 *     respondToConfirmation() — the exact same transaction My Approvals'
 *     "Complete Confirmation" action already calls via
 *     /api/approvals/[id]/confirmations/respond.
 *  2. VERIFICATION — a manual/verbal approval whose ManualApprovalDetail.
 *     secondPersonRequired is true and secondVerifiedAt is still null,
 *     assigned via secondVerifierUserId. The real action is the existing
 *     /api/approvals/[id]/second-verification route (already wired into
 *     ManualApprovalPanel's "Verify record"/"Reject verification" buttons).
 *  3. INVESTIGATION — an InvestigationCase assigned to the viewer via its
 *     own real, already-production assignedToUserId field (set/cleared by
 *     the existing app/api/investigations/[id] PATCH route), not yet
 *     RESOLVED/CLOSED. The real detail surface is the existing
 *     /investigations/[id] page.
 *
 * Two types this app's own spec examples name (Evidence Request, Playbook
 * Task, Correction Request) do NOT exist as genuine per-user-assigned
 * record types — confirmed by schema audit: evidence-association review
 * (ApprovalEvidenceAssociation.status) is role-gated (canManageManualApprovals),
 * never assigned to a specific user; PlaybookDocument.ownerUserId is upload
 * attribution, not a task assignment; a "correction" is an outcome of
 * responding to a Confirmation task (ApprovalConfirmationDecision.CORRECTED),
 * not a separate record type. Per this module's own spec ("ONLY include
 * types backed by real existing data"), neither is included.
 *
 * REUSE, NOT A SECOND ENGINE:
 *  - Investigation visibility is gated by the EXACT role list lib/rbac.ts's
 *    ROUTE_PERMISSIONS['/investigations'] already uses (AUDITOR/MANAGER/
 *    ADMIN/OWNER) — a viewer who could never open the real investigation
 *    detail page never sees an investigation-type task either, rather than
 *    showing a task whose own canonical workflow is inaccessible to them.
 *  - "Recent Activity"/Completed reuses the exact investigation.created /
 *    investigation.note_added audit actions services/dashboard.ts's
 *    MEANINGFUL_AUDIT_ACTIONS already allowlists, plus investigation.
 *    status_changed (added to that same allowlist — a real, pre-existing
 *    audit action this allowlist simply hadn't included yet) and the real
 *    APPROVER_CONFIRMATION_(CONFIRMED|REJECTED|CORRECTED) and
 *    MANUAL_APPROVAL_SECOND_PERSON_(VERIFIED|REJECTED) actions My
 *    Approvals' hardening pass already proved real.
 *
 * SORTING/PAGINATION: a real database ORDER BY + LIMIT/OFFSET across BOTH
 * source tables at once (the viewer's entire matching set, never a bounded
 * in-memory sort) — the same two-phase pattern services/myApprovals.ts's
 * fetchSortedPageIds() established, extended to a 3-branch UNION ALL (one
 * branch per task type) since task rows now span two different Prisma
 * models (ApprovalRecord, InvestigationCase) that cannot be sorted together
 * through Prisma's own `orderBy`. Phase 1 (plain, fully-typed Prisma) fetches
 * each branch's already-tenant/viewer/status-scoped matching IDs; phase 2
 * (one parameterized raw SQL query, Prisma.sql/Prisma.join only, never
 * string-concatenated) is constrained to exactly those already-vetted IDs,
 * computes each branch's due-date/priority expression, and does the real
 * cross-source ORDER BY + LIMIT/OFFSET; phase 3 fetches full typed row data
 * for just that one page from each source table and re-keys it to the order
 * phase 2 already computed.
 *
 * DUE DATES are never invented: only CONFIRMATION tasks have a real due
 * date anywhere in this schema (the viewer's own PENDING
 * ApprovalConfirmationRequest.expiresAt — identical definition to My
 * Approvals'). VERIFICATION and INVESTIGATION tasks have no due-date field
 * anywhere in this schema (InvestigationCase.dateRangeEnd describes the
 * investigation's own scope period, not a deadline, so it is deliberately
 * NOT used as one) — their dueAt is always null, displayed as "No due date".
 *
 * TENANT ISOLATION: every query starts from `organizationId: viewer.
 * organizationId`, taken from the server-resolved tenant, never a
 * client-supplied value.
 */

import { Prisma, type InvestigationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { hasAnyRole } from '@/lib/rbac';
import { ROUTE_PERMISSIONS } from '@/lib/rbac';
import { type ActionCenterViewer } from '@/services/action-center';
import { MY_TASK_TYPE_LABELS, INVESTIGATION_STATUS_LABELS, isInvestigationOpen, type MyTaskType, type MyTaskSort, type MyTaskStatusFilter } from '@/lib/my-tasks';
import { isDemoApprovalRecord } from '@/lib/demo-detection';

export { MY_TASK_TYPE_LABELS };
export type { MyTaskType, MyTaskSort, MyTaskStatusFilter };

const QUERY_TIMEOUT_MS = 5000;
export const MY_TASKS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const DUE_SOON_HORIZON_DAYS = 14;

function canSeeInvestigations(role: ActionCenterViewer['role']): boolean {
  return hasAnyRole(role, ROUTE_PERMISSIONS['/investigations'] ?? []);
}

export type MyTasksFilters = {
  q?: string;
  type?: MyTaskType;
  riskLevel?: string;
  status?: MyTaskStatusFilter; // default 'OPEN'
  from?: string;
  to?: string;
  sort?: MyTaskSort;
  page?: number;
  pageSize?: number;
};

export type MyTaskRow = {
  id: string; // `${type}:${sourceId}` — stable, globally unique across both source tables
  sourceId: string;
  type: MyTaskType;
  title: string;
  statusLabel: string;
  isOpen: boolean;
  riskLevel: string | null;
  department: string | null;
  category: string | null;
  dueAt: Date | null;
  occurredAt: Date;
  updatedAt: Date;
  detailHref: string;
  actionLabel: string | null;
  isDemo: boolean;
};

export type MyTasksKpis = {
  openTasks: number;
  dueToday: number;
  overdue: number;
  dueSoon: number;
  completed: number;
  awaitingResponse: number;
};

export type MyTasksResult = {
  kpis: MyTasksKpis;
  rows: MyTaskRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: MyTaskSort;
  canSeeInvestigations: boolean;
};

const approvalTaskSelect = {
  id: true,
  subject: true,
  department: true,
  category: true,
  riskLevel: true,
  occurredAt: true,
  updatedAt: true,
  correlationId: true,
  sourceLink: true,
  manualDetail: {
    select: {
      verificationStatus: true,
      secondPersonRequired: true,
      secondVerifiedAt: true,
      secondVerifierUserId: true,
    },
  },
} satisfies Prisma.ApprovalRecordSelect;

const investigationTaskSelect = {
  id: true,
  title: true,
  department: true,
  type: true,
  riskLevel: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InvestigationCaseSelect;

function approvalConfirmationWhere(viewer: ActionCenterViewer, open: boolean): Prisma.ApprovalRecordWhereInput {
  const email = viewer.email.toLowerCase();
  return {
    organizationId: viewer.organizationId,
    OR: [{ approverUserId: viewer.userId }, { approverEmail: { equals: email, mode: 'insensitive' } }],
    manualDetail: {
      is: open
        ? { verificationStatus: 'PENDING_CONFIRMATION' }
        : { verificationStatus: { in: ['CONFIRMED_BY_APPROVER', 'DISPUTED', 'SUPERSEDED'] } },
    },
  };
}

function approvalVerificationWhere(viewer: ActionCenterViewer, open: boolean): Prisma.ApprovalRecordWhereInput {
  return {
    organizationId: viewer.organizationId,
    manualDetail: {
      is: {
        secondPersonRequired: true,
        secondVerifierUserId: viewer.userId,
        ...(open ? { secondVerifiedAt: null } : { secondVerifiedAt: { not: null } }),
      },
    },
  };
}

function investigationWhere(viewer: ActionCenterViewer, open: boolean): Prisma.InvestigationCaseWhereInput {
  return {
    organizationId: viewer.organizationId,
    assignedToUserId: viewer.userId,
    status: { in: open ? ['OPEN', 'IN_PROGRESS', 'ESCALATED'] : ['RESOLVED', 'CLOSED'] },
  };
}

function dateRangeFilter(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
}

/** Phase 2 of the two-phase cross-source sort/paginate — see this module's
 *  header comment. Each id list must already be the exact, fully-scoped,
 *  already-tenant/viewer/status-matched set from phase 1. Returns the
 *  requested page as (type, sourceId) pairs in final sorted order. */
async function fetchSortedTaskPage(args: {
  confirmationIds: string[];
  verificationIds: string[];
  investigationIds: string[];
  email: string;
  sort: MyTaskSort;
  page: number;
  pageSize: number;
}): Promise<Array<{ type: MyTaskType; id: string }>> {
  const { confirmationIds, verificationIds, investigationIds, email, sort, page, pageSize } = args;
  if (confirmationIds.length === 0 && verificationIds.length === 0 && investigationIds.length === 0) return [];
  const offset = (page - 1) * pageSize;

  const orderBy = (() => {
    switch (sort) {
      case 'newest': return Prisma.sql`s.occurred_at DESC, s.type ASC, s.id ASC`;
      case 'oldest': return Prisma.sql`s.occurred_at ASC, s.type ASC, s.id ASC`;
      case 'lastActivity': return Prisma.sql`s.updated_at DESC, s.type ASC, s.id ASC`;
      case 'due': return Prisma.sql`s.due_at ASC NULLS LAST, s.occurred_at DESC, s.type ASC, s.id ASC`;
      default: return Prisma.sql`s.priority_bucket ASC, s.due_at ASC NULLS LAST, s.occurred_at DESC, s.type ASC, s.id ASC`;
    }
  })();

  const branches: Prisma.Sql[] = [];

  if (confirmationIds.length > 0) {
    branches.push(Prisma.sql`
      SELECT
        ar.id AS id,
        'CONFIRMATION' AS type,
        ar."occurredAt" AS occurred_at,
        ar."updatedAt" AS updated_at,
        due.due_at AS due_at,
        CASE
          WHEN due.due_at IS NOT NULL AND due.due_at < NOW() THEN 0
          WHEN due.due_at IS NOT NULL AND due.due_at::date = CURRENT_DATE THEN 1
          WHEN due.due_at IS NOT NULL AND due.due_at <= NOW() + INTERVAL '14 days' THEN 2
          WHEN lower(COALESCE(ar."riskLevel", '')) IN ('high', 'critical') THEN 3
          ELSE 4
        END AS priority_bucket
      FROM "ApprovalRecord" ar
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
      WHERE ar.id IN (${Prisma.join(confirmationIds)})
    `);
  }

  if (verificationIds.length > 0) {
    branches.push(Prisma.sql`
      SELECT
        ar.id AS id,
        'VERIFICATION' AS type,
        ar."occurredAt" AS occurred_at,
        ar."updatedAt" AS updated_at,
        NULL::timestamp AS due_at,
        CASE
          WHEN lower(COALESCE(ar."riskLevel", '')) IN ('high', 'critical') THEN 3
          ELSE 4
        END AS priority_bucket
      FROM "ApprovalRecord" ar
      WHERE ar.id IN (${Prisma.join(verificationIds)})
    `);
  }

  if (investigationIds.length > 0) {
    branches.push(Prisma.sql`
      SELECT
        ic.id AS id,
        'INVESTIGATION' AS type,
        ic."createdAt" AS occurred_at,
        ic."updatedAt" AS updated_at,
        NULL::timestamp AS due_at,
        CASE
          WHEN lower(COALESCE(ic."riskLevel", '')) IN ('high', 'critical') THEN 3
          ELSE 4
        END AS priority_bucket
      FROM "InvestigationCase" ic
      WHERE ic.id IN (${Prisma.join(investigationIds)})
    `);
  }

  const unioned = Prisma.join(branches, ' UNION ALL ');

  const rows = await prisma.$queryRaw<Array<{ id: string; type: MyTaskType }>>(Prisma.sql`
    SELECT s.id, s.type FROM (${unioned}) s
    ORDER BY ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return rows.map((r) => ({ id: r.id, type: r.type }));
}

export async function getMyTasksOverview(viewer: ActionCenterViewer, filters: MyTasksFilters): Promise<MyTasksResult> {
  const pageSize = (MY_TASKS_PAGE_SIZE_OPTIONS as readonly number[]).includes(filters.pageSize ?? -1)
    ? (filters.pageSize as number)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const sort = filters.sort ?? 'priority';
  const statusFilter = filters.status ?? 'OPEN';
  const open = statusFilter === 'OPEN';
  const email = viewer.email.toLowerCase();
  const now = new Date();
  const seesInvestigations = canSeeInvestigations(viewer.role);

  const q = filters.q?.trim();
  const approvalSearchWhere: Prisma.ApprovalRecordWhereInput | undefined = q ? { subject: { contains: q, mode: 'insensitive' } } : undefined;
  const investigationSearchWhere: Prisma.InvestigationCaseWhereInput | undefined = q ? { title: { contains: q, mode: 'insensitive' } } : undefined;

  const riskWhere = filters.riskLevel ? { riskLevel: { equals: filters.riskLevel, mode: 'insensitive' as const } } : undefined;
  const range = dateRangeFilter(filters.from, filters.to);
  // Completed-at proxies (see this module's header comment): ManualApprovalDetail.
  // updatedAt for Confirmation, ManualApprovalDetail.secondVerifiedAt for
  // Verification, InvestigationCase.resolvedAt for Investigation — only
  // applied when viewing Completed (current-state Open queues never
  // disappear based on a creation/completion date filter).
  const confirmationCompletedRange = !open && range ? { manualDetail: { is: { updatedAt: range } } } : undefined;
  const verificationCompletedRange = !open && range ? { manualDetail: { is: { secondVerifiedAt: range } } } : undefined;
  const investigationCompletedRange = !open && range ? { resolvedAt: range } : undefined;

  const includeConfirmation = !filters.type || filters.type === 'CONFIRMATION';
  const includeVerification = !filters.type || filters.type === 'VERIFICATION';
  const includeInvestigation = (!filters.type || filters.type === 'INVESTIGATION') && seesInvestigations;

  const confirmationWhere: Prisma.ApprovalRecordWhereInput = {
    AND: [approvalConfirmationWhere(viewer, open), riskWhere ?? {}, approvalSearchWhere ?? {}, confirmationCompletedRange ?? {}],
  };
  const verificationWhereFinal: Prisma.ApprovalRecordWhereInput = {
    AND: [approvalVerificationWhere(viewer, open), riskWhere ?? {}, approvalSearchWhere ?? {}, verificationCompletedRange ?? {}],
  };
  const investigationWhereFinal: Prisma.InvestigationCaseWhereInput = {
    AND: [investigationWhere(viewer, open), riskWhere ?? {}, investigationSearchWhere ?? {}, investigationCompletedRange ?? {}],
  };

  const [
    confirmationIdRows,
    verificationIdRows,
    investigationIdRows,
    confirmationCount,
    verificationCount,
    investigationCount,
    awaitingResponse,
  ] = await withTimeout(
    'my-tasks:load-phase1',
    Promise.all([
      includeConfirmation ? prisma.approvalRecord.findMany({ where: confirmationWhere, select: { id: true } }) : Promise.resolve([]),
      includeVerification ? prisma.approvalRecord.findMany({ where: verificationWhereFinal, select: { id: true } }) : Promise.resolve([]),
      includeInvestigation ? prisma.investigationCase.findMany({ where: investigationWhereFinal, select: { id: true } }) : Promise.resolve([]),
      prisma.approvalRecord.count({ where: { AND: [approvalConfirmationWhere(viewer, true)] } }),
      prisma.approvalRecord.count({ where: { AND: [approvalVerificationWhere(viewer, true)] } }),
      seesInvestigations ? prisma.investigationCase.count({ where: investigationWhere(viewer, true) }) : Promise.resolve(0),
      // "Awaiting Response" means genuinely actionable right now: a real,
      // non-expired PENDING ApprovalConfirmationRequest — the EXACT same
      // condition components/approvals/ManualApprovalPanel.tsx's
      // myPendingConfirmation uses to decide whether to render the
      // Confirm/Correct/Reject buttons at all. An expired-but-still-PENDING
      // request is counted in the Overdue KPI instead (see below), never
      // double-counted here — this is what keeps the KPI and the row-level
      // "Awaiting Response" status label in exact agreement.
      prisma.approvalConfirmationRequest.count({
        where: { organizationId: viewer.organizationId, decision: 'PENDING', approverEmail: { equals: email, mode: 'insensitive' }, expiresAt: { gt: now } },
      }),
    ]),
    QUERY_TIMEOUT_MS,
  );

  // Real, deterministic KPIs — Due Today/Overdue/Due Soon only apply to
  // CONFIRMATION tasks (the only type with a real due date anywhere in this
  // schema); VERIFICATION/INVESTIGATION contribute to Open Tasks but never
  // to a due-date bucket that doesn't exist for them.
  const openConfirmationIds = (await prisma.approvalRecord.findMany({
    where: { AND: [approvalConfirmationWhere(viewer, true)] },
    select: { id: true },
  })).map((r) => r.id);
  let dueToday = 0;
  let overdue = 0;
  let dueSoon = 0;
  if (openConfirmationIds.length > 0) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
    const dueSoonHorizon = new Date(now.getTime() + DUE_SOON_HORIZON_DAYS * 86_400_000);
    [dueToday, overdue, dueSoon] = await Promise.all([
      prisma.approvalConfirmationRequest.count({
        where: { organizationId: viewer.organizationId, decision: 'PENDING', approverEmail: { equals: email, mode: 'insensitive' }, approvalRecordId: { in: openConfirmationIds }, expiresAt: { gte: startOfToday, lt: startOfTomorrow } },
      }),
      prisma.approvalConfirmationRequest.count({
        where: { organizationId: viewer.organizationId, decision: 'PENDING', approverEmail: { equals: email, mode: 'insensitive' }, approvalRecordId: { in: openConfirmationIds }, expiresAt: { lt: now } },
      }),
      prisma.approvalConfirmationRequest.count({
        where: { organizationId: viewer.organizationId, decision: 'PENDING', approverEmail: { equals: email, mode: 'insensitive' }, approvalRecordId: { in: openConfirmationIds }, expiresAt: { gt: startOfTomorrow, lte: dueSoonHorizon } },
      }),
    ]);
  }

  const confirmationIds = confirmationIdRows.map((r) => r.id);
  const verificationIds = verificationIdRows.map((r) => r.id);
  const investigationIds = investigationIdRows.map((r) => r.id);

  const sortedPage = await fetchSortedTaskPage({ confirmationIds, verificationIds, investigationIds, email, sort, page, pageSize });

  const approvalIdsOnPage = [...new Set(sortedPage.filter((r) => r.type !== 'INVESTIGATION').map((r) => r.id))];
  const investigationIdsOnPage = [...new Set(sortedPage.filter((r) => r.type === 'INVESTIGATION').map((r) => r.id))];

  const [approvalRows, investigationRows] = await Promise.all([
    approvalIdsOnPage.length > 0 ? prisma.approvalRecord.findMany({ where: { id: { in: approvalIdsOnPage } }, select: approvalTaskSelect }) : Promise.resolve([]),
    investigationIdsOnPage.length > 0 ? prisma.investigationCase.findMany({ where: { id: { in: investigationIdsOnPage } }, select: investigationTaskSelect }) : Promise.resolve([]),
  ]);
  const approvalById = new Map(approvalRows.map((r) => [r.id, r]));
  const investigationById = new Map(investigationRows.map((r) => [r.id, r]));

  const rows: MyTaskRow[] = sortedPage
    .map(({ type, id }): MyTaskRow | null => {
      if (type === 'CONFIRMATION') {
        const r = approvalById.get(id);
        if (!r) return null;
        return {
          id: `CONFIRMATION:${r.id}`,
          sourceId: r.id,
          type: 'CONFIRMATION',
          title: r.subject,
          // statusLabel/actionLabel for the open case are provisional here —
          // see the dueAt backfill block below, which replaces both with
          // the real 3-way state (Awaiting Response / Overdue / Needs
          // Confirmation) once it knows, per row, whether a genuine
          // non-expired confirmation request actually exists.
          statusLabel: open ? 'Needs Confirmation' : 'Completed',
          isOpen: open,
          riskLevel: r.riskLevel,
          department: r.department,
          category: r.category,
          dueAt: null,
          occurredAt: r.occurredAt,
          updatedAt: r.updatedAt,
          detailHref: `/approvals/${r.id}`,
          actionLabel: open ? 'View Approval' : null,
          isDemo: isDemoApprovalRecord(r),
        };
      }
      if (type === 'VERIFICATION') {
        const r = approvalById.get(id);
        if (!r) return null;
        return {
          id: `VERIFICATION:${r.id}`,
          sourceId: r.id,
          type: 'VERIFICATION',
          title: r.subject,
          statusLabel: open ? 'Open' : 'Completed',
          isOpen: open,
          riskLevel: r.riskLevel,
          department: r.department,
          category: r.category,
          dueAt: null,
          occurredAt: r.occurredAt,
          updatedAt: r.updatedAt,
          detailHref: `/approvals/${r.id}`,
          actionLabel: open ? 'Complete Verification' : null,
          isDemo: isDemoApprovalRecord(r),
        };
      }
      const inv = investigationById.get(id);
      if (!inv) return null;
      return {
        id: `INVESTIGATION:${inv.id}`,
        sourceId: inv.id,
        type: 'INVESTIGATION',
        title: inv.title,
        statusLabel: INVESTIGATION_STATUS_LABELS[inv.status as InvestigationStatus],
        isOpen: isInvestigationOpen(inv.status as InvestigationStatus),
        riskLevel: inv.riskLevel,
        department: inv.department,
        category: inv.type,
        dueAt: null,
        occurredAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        detailHref: `/investigations/${inv.id}`,
        actionLabel: open ? 'Open Investigation' : null,
        isDemo: false,
      };
    })
    .filter((r): r is MyTaskRow => r !== null);

  // Real due dates AND real per-row status for the CONFIRMATION rows on
  // this one page only — a single batched lookup (never per-row), reusing
  // the exact same viewer-email-matched PENDING confirmation request every
  // other due-date figure on this page already uses.
  //
  // The status/action split below mirrors components/approvals/
  // ManualApprovalPanel.tsx's own myPendingConfirmation condition EXACTLY
  // (decision PENDING + expiresAt > now) — that is the real, only gate on
  // whether the Confirm/Correct/Reject buttons render on the destination
  // page at all. Showing "Awaiting Response" / "Complete Confirmation" for
  // a row that condition excludes would send the viewer to a page with no
  // working confirm button:
  //   - a genuine, non-expired PENDING request exists -> "Awaiting
  //     Response" / "Complete Confirmation" (the button really works)
  //   - a PENDING request exists but has expired -> "Overdue" / "View
  //     Approval" (the confirmation flow is closed; a new request is
  //     needed, which is not a self-service action for the assignee)
  //   - no request has been sent yet -> "Needs Confirmation" / "View
  //     Approval" (assigned, but nothing to respond to yet)
  const confirmationIdsNeedingDue = rows.filter((r) => r.type === 'CONFIRMATION').map((r) => r.sourceId);
  if (confirmationIdsNeedingDue.length > 0) {
    const pending = await prisma.approvalConfirmationRequest.findMany({
      where: { organizationId: viewer.organizationId, decision: 'PENDING', approverEmail: { equals: email, mode: 'insensitive' }, approvalRecordId: { in: confirmationIdsNeedingDue } },
      select: { approvalRecordId: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
    });
    const dueByRecord = new Map<string, Date>();
    for (const p of pending) {
      if (!dueByRecord.has(p.approvalRecordId)) dueByRecord.set(p.approvalRecordId, p.expiresAt);
    }
    for (const row of rows) {
      if (row.type !== 'CONFIRMATION') continue;
      const dueAt = dueByRecord.get(row.sourceId) ?? null;
      row.dueAt = dueAt;
      if (!open) continue; // completed rows keep their 'Completed' label untouched
      if (!dueAt) {
        row.statusLabel = 'Needs Confirmation';
        row.actionLabel = 'View Approval';
      } else if (dueAt.getTime() > now.getTime()) {
        row.statusLabel = 'Awaiting Response';
        row.actionLabel = 'Complete Confirmation';
      } else {
        row.statusLabel = 'Overdue';
        row.actionLabel = 'View Approval';
      }
    }
  }

  const total = confirmationIds.length + verificationIds.length + investigationIds.length;

  return {
    kpis: {
      openTasks: confirmationCount + verificationCount + investigationCount,
      dueToday,
      overdue,
      dueSoon,
      completed: 0, // filled by caller via a second, date-ranged call when needed (see getMyTasksCompletedCount)
      awaitingResponse,
    },
    rows,
    total,
    page,
    pageSize,
    sort,
    canSeeInvestigations: seesInvestigations,
  };
}

/** A separate, explicitly date-ranged count — kept out of getMyTasksOverview's
 *  single Promise.all because it has a genuinely different scope (completed,
 *  period-bound) from every other KPI there (open, current-state), matching
 *  the same current-state-vs-historical split Individual Dashboard and My
 *  Approvals already established. */
export async function getMyTasksCompletedCount(viewer: ActionCenterViewer, from?: string, to?: string): Promise<number> {
  const range = dateRangeFilter(from, to);
  const seesInvestigations = canSeeInvestigations(viewer.role);
  const [confirmationDone, verificationDone, investigationDone] = await withTimeout(
    'my-tasks:completed',
    Promise.all([
      prisma.approvalRecord.count({ where: { AND: [approvalConfirmationWhere(viewer, false), range ? { manualDetail: { is: { updatedAt: range } } } : {}] } }),
      prisma.approvalRecord.count({ where: { AND: [approvalVerificationWhere(viewer, false), range ? { manualDetail: { is: { secondVerifiedAt: range } } } : {}] } }),
      seesInvestigations
        ? prisma.investigationCase.count({ where: { AND: [investigationWhere(viewer, false), range ? { resolvedAt: range } : {}] } })
        : Promise.resolve(0),
    ]),
    QUERY_TIMEOUT_MS,
  );
  return confirmationDone + verificationDone + investigationDone;
}
