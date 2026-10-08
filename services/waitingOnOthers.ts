/**
 * Waiting on Others (/dashboard/waiting-on-others) read model.
 *
 * Answers "what work did I initiate where the next meaningful step belongs
 * to someone else?" — the structural mirror of My Tasks ("work assigned to
 * me") and Awaiting My Response ("what needs my response"), read from the
 * opposite direction. A record is included ONLY when BOTH sides are
 * provable from existing, already-production fields:
 *
 *   A. the viewer genuinely initiated/owns the workflow, AND
 *   B. the next actor is a real, different, specific person.
 *
 * Never inferred from department/org/manager/role/team/email-domain/
 * "created around the same time" — confirmed by exhaustive schema audit
 * (ApprovalRecord, ManualApprovalDetail, ApprovalConfirmationRequest,
 * InvestigationCase, Action Center, My Tasks, My Approvals, Awaiting My
 * Response, respondToConfirmation(), AuditLog) to be exactly the same
 * three per-user-assignable record types services/myTasks.ts already
 * established as the only genuine ones in this schema, each read from its
 * opposite (initiator, not assignee) side:
 *
 *  1. CONFIRMATION — ApprovalConfirmationRequest where requestedByUserId
 *     is the viewer (the real, already-production field set at creation by
 *     services/manual-approvals.ts / app/api/approvals/[id]/confirmations,
 *     never inferred) and decision is still PENDING, addressed to an
 *     approverEmail that is NOT the viewer's own (a self-addressed request
 *     is ME -> ME, a My Task, never Waiting on Others — see
 *     confirmationWhere()). A single ApprovalRecord can genuinely have
 *     MORE THAN ONE outstanding ApprovalConfirmationRequest from different
 *     approvers (no uniqueness constraint on approvalRecordId alone) — see
 *     "MULTI-PARTY GROUPING" below for why this is handled as ONE row per
 *     approvalRecordId, not one row per request.
 *  2. VERIFICATION — the exact mirror of My Tasks' VERIFICATION type:
 *     ManualApprovalDetail where recorderUserId is the viewer (the real
 *     field recording who actually recorded the manual approval, set at
 *     creation by services/manual-approvals.ts's createManualApproval) and
 *     secondPersonRequired is true with a real secondVerifierUserId set to
 *     someone else, still unverified (secondVerifiedAt null).
 *  3. INVESTIGATION — the exact mirror of My Tasks' INVESTIGATION type:
 *     InvestigationCase where createdByUserId is the viewer (real,
 *     already-production field) and assignedToUserId is a real, different
 *     user, with status still unresolved (OPEN/IN_PROGRESS/ESCALATED).
 *     Gated by the exact same role list ('/investigations') My Tasks
 *     already uses — a viewer who could never open the real investigation
 *     detail page never sees an investigation-type waiting row either.
 *
 * EXCLUDED, WITH REASONS (per the architecture audit — "if either
 * condition cannot be proven from existing data, do not include the
 * record"):
 *  - Bare ApprovalRecord (ingested from Slack/Gmail/Teams/the Universal
 *    Gateway, no ManualApprovalDetail/ApprovalConfirmationRequest) has no
 *    authoritative "which ApprovLine user initiated this and is waiting on
 *    someone else" field anywhere in this schema — sourcePlatform records
 *    WHERE it came from, not WHO on this side is depending on a response.
 *  - A reminder/escalate/cancel follow-up action: no such backend action
 *    exists anywhere in this codebase for either ApprovalConfirmationRequest
 *    or InvestigationCase, so none is exposed here (see section 26's "no
 *    fake Send Reminder button" rule) — every row's only action is View
 *    Workflow, reusing the exact existing /approvals/[id] and
 *    /investigations/[id] detail pages, never a second detail engine.
 *
 * MULTI-PARTY GROUPING: CONFIRMATION rows are grouped by approvalRecordId
 * (not by individual ApprovalConfirmationRequest.id) so that "Waiting on
 * Finance + Security" (2 outstanding approvers) is never misrepresented as
 * "Waiting on Finance" merely because the raw request table has a row per
 * approver. Grouping naturally self-corrects as approvers respond: a
 * resolved request (decision != PENDING) simply drops out of the group,
 * never requires tracking or re-deriving "who already completed."
 *
 * SORTING/PAGINATION: the same two-phase cross-source pattern services/
 * myTasks.ts already established (phase 1: plain Prisma, full matching id
 * set per branch, never bounded; phase 2: one parameterized raw SQL
 * UNION ALL across the (up to 3) branches, computing due/priority and doing
 * the real ORDER BY + LIMIT/OFFSET; phase 3: full typed row fetch for just
 * that page) — extended with an aggregation step for CONFIRMATION's
 * multi-party grouping.
 *
 * TENANT ISOLATION: every query starts from organizationId: viewer.
 * organizationId, taken from the server-resolved tenant, never a
 * client-supplied value. ACTOR ISOLATION: requestedByUserId/recorderUserId/
 * createdByUserId are always matched against the server-resolved
 * viewer.userId — never a client-supplied id — and the next-actor field is
 * always required to be a real, different person, so a user can never see
 * their own ME -> ME work surface here.
 */

import { Prisma, type InvestigationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { hasAnyRole, ROUTE_PERMISSIONS } from '@/lib/rbac';
import { type ActionCenterViewer } from '@/services/action-center';
import { isDemoApprovalRecord } from '@/lib/demo-detection';
import {
  WAITING_ON_OTHERS_TYPE_LABELS,
  deriveDueBucket,
  formatDueLabel,
  formatWaitingDuration,
  formatWaitingOnLabel,
  type WaitingOnOthersType,
  type WaitingOnOthersSort,
  type WaitingOnOthersDueBucket,
} from '@/lib/waiting-on-others';

export { WAITING_ON_OTHERS_TYPE_LABELS };
export type { WaitingOnOthersType, WaitingOnOthersSort, WaitingOnOthersDueBucket };

const QUERY_TIMEOUT_MS = 5000;
export const WAITING_ON_OTHERS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

function canSeeInvestigations(role: ActionCenterViewer['role']): boolean {
  return hasAnyRole(role, ROUTE_PERMISSIONS['/investigations'] ?? []);
}

export type WaitingOnOthersFilters = {
  q?: string;
  type?: WaitingOnOthersType;
  waitingOn?: string;
  source?: string;
  due?: WaitingOnOthersDueBucket;
  sort?: WaitingOnOthersSort;
  page?: number;
  pageSize?: number;
};

export type WaitingOnOthersPerson = { name: string; email: string | null };

export type WaitingOnOthersRow = {
  id: string; // `${type}:${sourceId}` — stable, globally unique across all source tables
  sourceId: string;
  type: WaitingOnOthersType;
  title: string;
  category: string | null;
  department: string | null;
  sourcePlatform: string | null;
  waitingOn: WaitingOnOthersPerson[];
  waitingOnLabel: string;
  expectedAction: string;
  statusLabel: string;
  dueAt: Date | null;
  dueLabel: string;
  dueBucket: WaitingOnOthersDueBucket;
  requestedAt: Date; // the authoritative ME -> OTHER transition timestamp
  waitingLabel: string;
  detailHref: string;
  isDemo: boolean;
};

export type WaitingOnOthersKpis = {
  waiting: number;
  dueSoon: number;
  overdue: number;
  longestWaitingLabel: string | null;
};

export type WaitingOnOthersResult = {
  kpis: WaitingOnOthersKpis;
  rows: WaitingOnOthersRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: WaitingOnOthersSort;
  canSeeInvestigations: boolean;
};

function confirmationWhere(viewer: ActionCenterViewer): Prisma.ApprovalConfirmationRequestWhereInput {
  return {
    organizationId: viewer.organizationId,
    requestedByUserId: viewer.userId,
    decision: 'PENDING',
    // A self-addressed confirmation request (recorder === approver) is
    // ME -> ME, never Waiting on Others - Prisma's case-insensitive mode
    // isn't supported inside a nested `not`, so the negation is expressed
    // as a sibling NOT clause instead (functionally identical).
    NOT: { approverEmail: { equals: viewer.email, mode: 'insensitive' } },
  };
}

function verificationWhere(viewer: ActionCenterViewer): Prisma.ApprovalRecordWhereInput {
  return {
    organizationId: viewer.organizationId,
    manualDetail: {
      is: {
        recorderUserId: viewer.userId,
        secondPersonRequired: true,
        secondVerifierUserId: { not: null, notIn: [viewer.userId] },
        secondVerifiedAt: null,
      },
    },
  };
}

function investigationWhere(viewer: ActionCenterViewer): Prisma.InvestigationCaseWhereInput {
  return {
    organizationId: viewer.organizationId,
    createdByUserId: viewer.userId,
    assignedToUserId: { not: null, notIn: [viewer.userId] },
    status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] },
  };
}

const approvalRowSelect = {
  id: true,
  subject: true,
  department: true,
  category: true,
  sourcePlatform: true,
  sourceLink: true,
  correlationId: true,
} satisfies Prisma.ApprovalRecordSelect;

const investigationRowSelect = {
  id: true,
  title: true,
  department: true,
  type: true,
  status: true,
  createdAt: true,
  assignedTo: { select: { name: true, email: true } },
} satisfies Prisma.InvestigationCaseSelect;

/** Phase 2 of the two-phase cross-source sort/paginate — see this module's
 *  header comment. Each id list must already be the exact, fully-scoped,
 *  already-tenant/viewer/next-actor-matched set from phase 1.
 *  confirmationGroupIds are ApprovalRecord ids (post multi-party grouping),
 *  not ApprovalConfirmationRequest ids. */
async function fetchSortedPage(args: {
  confirmationApprovalIds: string[];
  verificationApprovalIds: string[];
  investigationIds: string[];
  viewerId: string;
  sort: WaitingOnOthersSort;
  page: number;
  pageSize: number;
}): Promise<Array<{ type: WaitingOnOthersType; id: string }>> {
  const { confirmationApprovalIds, verificationApprovalIds, investigationIds, viewerId, sort, page, pageSize } = args;
  if (confirmationApprovalIds.length === 0 && verificationApprovalIds.length === 0 && investigationIds.length === 0) return [];
  const offset = (page - 1) * pageSize;

  const orderBy = (() => {
    switch (sort) {
      case 'newest': return Prisma.sql`s.requested_at DESC, s.type ASC, s.id ASC`;
      case 'oldest': return Prisma.sql`s.requested_at ASC, s.type ASC, s.id ASC`;
      case 'longestWaiting': return Prisma.sql`s.requested_at ASC, s.type ASC, s.id ASC`;
      case 'due': return Prisma.sql`s.due_at ASC NULLS LAST, s.requested_at ASC, s.type ASC, s.id ASC`;
      default: return Prisma.sql`s.priority_bucket ASC, s.due_at ASC NULLS LAST, s.requested_at ASC, s.type ASC, s.id ASC`;
    }
  })();

  const branches: Prisma.Sql[] = [];

  if (confirmationApprovalIds.length > 0) {
    branches.push(Prisma.sql`
      SELECT
        g."approvalRecordId" AS id,
        'CONFIRMATION' AS type,
        MIN(g."createdAt") AS requested_at,
        MIN(g."expiresAt") AS due_at,
        CASE
          WHEN MIN(g."expiresAt") < NOW() THEN 0
          WHEN MIN(g."expiresAt")::date = CURRENT_DATE THEN 1
          WHEN MIN(g."expiresAt") <= NOW() + INTERVAL '14 days' THEN 2
          ELSE 3
        END AS priority_bucket
      FROM "ApprovalConfirmationRequest" g
      WHERE g."approvalRecordId" IN (${Prisma.join(confirmationApprovalIds)})
        AND g."requestedByUserId" = ${viewerId}
        AND g.decision = 'PENDING'
      GROUP BY g."approvalRecordId"
    `);
  }

  if (verificationApprovalIds.length > 0) {
    branches.push(Prisma.sql`
      SELECT
        ar.id AS id,
        'VERIFICATION' AS type,
        ar."createdAt" AS requested_at,
        NULL::timestamp AS due_at,
        3 AS priority_bucket
      FROM "ApprovalRecord" ar
      WHERE ar.id IN (${Prisma.join(verificationApprovalIds)})
    `);
  }

  if (investigationIds.length > 0) {
    branches.push(Prisma.sql`
      SELECT
        ic.id AS id,
        'INVESTIGATION' AS type,
        ic."createdAt" AS requested_at,
        NULL::timestamp AS due_at,
        3 AS priority_bucket
      FROM "InvestigationCase" ic
      WHERE ic.id IN (${Prisma.join(investigationIds)})
    `);
  }

  const unioned = Prisma.join(branches, ' UNION ALL ');

  const rows = await prisma.$queryRaw<Array<{ id: string; type: WaitingOnOthersType }>>(Prisma.sql`
    SELECT s.id, s.type FROM (${unioned}) s
    ORDER BY ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return rows.map((r) => ({ id: r.id, type: r.type }));
}

export async function getWaitingOnOthersOverview(viewer: ActionCenterViewer, filters: WaitingOnOthersFilters): Promise<WaitingOnOthersResult> {
  const pageSize = (WAITING_ON_OTHERS_PAGE_SIZE_OPTIONS as readonly number[]).includes(filters.pageSize ?? -1)
    ? (filters.pageSize as number)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const sort = filters.sort ?? 'priority';
  const now = new Date();
  const seesInvestigations = canSeeInvestigations(viewer.role);

  const q = filters.q?.trim();
  const waitingOn = filters.waitingOn?.trim();
  const source = filters.source?.trim();

  const includeConfirmation = !filters.type || filters.type === 'CONFIRMATION';
  const includeVerification = !filters.type || filters.type === 'VERIFICATION';
  const includeInvestigation = (!filters.type || filters.type === 'INVESTIGATION') && seesInvestigations;

  const confirmationRequestWhere: Prisma.ApprovalConfirmationRequestWhereInput = {
    AND: [
      confirmationWhere(viewer),
      q ? { approvalRecord: { is: { subject: { contains: q, mode: 'insensitive' } } } } : {},
      waitingOn ? { OR: [{ approverName: { contains: waitingOn, mode: 'insensitive' } }, { approverEmail: { contains: waitingOn, mode: 'insensitive' } }] } : {},
      source ? { approvalRecord: { is: { sourcePlatform: { contains: source, mode: 'insensitive' } } } } : {},
    ],
  };
  const verificationRecordWhere: Prisma.ApprovalRecordWhereInput = {
    AND: [
      verificationWhere(viewer),
      q ? { subject: { contains: q, mode: 'insensitive' } } : {},
      source ? { sourcePlatform: { contains: source, mode: 'insensitive' } } : {},
      waitingOn
        ? { manualDetail: { is: { secondVerifier: { is: { OR: [{ name: { contains: waitingOn, mode: 'insensitive' } }, { email: { contains: waitingOn, mode: 'insensitive' } }] } } } } }
        : {},
    ],
  };
  const investigationCaseWhere: Prisma.InvestigationCaseWhereInput = {
    AND: [
      investigationWhere(viewer),
      q ? { title: { contains: q, mode: 'insensitive' } } : {},
      waitingOn ? { assignedTo: { is: { OR: [{ name: { contains: waitingOn, mode: 'insensitive' } }, { email: { contains: waitingOn, mode: 'insensitive' } }] } } } : {},
      // INVESTIGATION has no sourcePlatform field anywhere in this schema -
      // an active source filter must exclude every investigation row
      // rather than silently ignore the filter for this one type.
      source ? { id: { in: [] } } : {},
    ],
  };

  const [confirmationGroupRows, verificationIdRows, investigationIdRows] = await withTimeout(
    'waiting-on-others:load-phase1',
    Promise.all([
      includeConfirmation
        ? prisma.approvalConfirmationRequest.findMany({ where: confirmationRequestWhere, select: { approvalRecordId: true }, distinct: ['approvalRecordId'] })
        : Promise.resolve([]),
      includeVerification ? prisma.approvalRecord.findMany({ where: verificationRecordWhere, select: { id: true } }) : Promise.resolve([]),
      includeInvestigation ? prisma.investigationCase.findMany({ where: investigationCaseWhere, select: { id: true } }) : Promise.resolve([]),
    ]),
    QUERY_TIMEOUT_MS,
  );

  const confirmationApprovalIds = confirmationGroupRows.map((r) => r.approvalRecordId);
  const verificationApprovalIds = verificationIdRows.map((r) => r.id);
  const investigationIds = investigationIdRows.map((r) => r.id);

  // Real, unfiltered live KPIs (section 11) — always the viewer's full
  // current-state matching set, independent of the page's own search/type
  // filters, matching the identical convention My Tasks/Awaiting My
  // Response KPI strips already use.
  const [allConfirmationGroups, allVerificationCount, allInvestigationCount] = await Promise.all([
    prisma.approvalConfirmationRequest.groupBy({ by: ['approvalRecordId'], where: confirmationWhere(viewer), _min: { expiresAt: true, createdAt: true } }),
    prisma.approvalRecord.count({ where: verificationWhere(viewer) }),
    seesInvestigations ? prisma.investigationCase.count({ where: investigationWhere(viewer) }) : Promise.resolve(0),
  ]);

  const waiting = allConfirmationGroups.length + allVerificationCount + allInvestigationCount;
  let dueSoon = 0;
  let overdue = 0;
  let oldestStart: Date | null = null;
  for (const g of allConfirmationGroups) {
    const dueAt = g._min.expiresAt ?? null;
    const bucket = deriveDueBucket(dueAt, now);
    if (bucket === 'OVERDUE') overdue++;
    else if (bucket === 'DUE_SOON') dueSoon++;
    const startedAt = g._min.createdAt ?? null;
    if (startedAt && (!oldestStart || startedAt < oldestStart)) oldestStart = startedAt;
  }
  if (seesInvestigations || allVerificationCount > 0) {
    const [oldestVerification, oldestInvestigation] = await Promise.all([
      allVerificationCount > 0
        ? prisma.approvalRecord.findFirst({ where: verificationWhere(viewer), orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
        : Promise.resolve(null),
      seesInvestigations && allInvestigationCount > 0
        ? prisma.investigationCase.findFirst({ where: investigationWhere(viewer), orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
        : Promise.resolve(null),
    ]);
    if (oldestVerification && (!oldestStart || oldestVerification.createdAt < oldestStart)) oldestStart = oldestVerification.createdAt;
    if (oldestInvestigation && (!oldestStart || oldestInvestigation.createdAt < oldestStart)) oldestStart = oldestInvestigation.createdAt;
  }

  const sortedPage = await fetchSortedPage({ confirmationApprovalIds, verificationApprovalIds, investigationIds, viewerId: viewer.userId, sort, page, pageSize });

  const confirmationIdsOnPage = sortedPage.filter((r) => r.type === 'CONFIRMATION').map((r) => r.id);
  const verificationIdsOnPage = sortedPage.filter((r) => r.type === 'VERIFICATION').map((r) => r.id);
  const investigationIdsOnPage = sortedPage.filter((r) => r.type === 'INVESTIGATION').map((r) => r.id);

  const [approvalRows, investigationRows, pendingRequestsOnPage] = await Promise.all([
    [...confirmationIdsOnPage, ...verificationIdsOnPage].length > 0
      ? prisma.approvalRecord.findMany({ where: { id: { in: [...confirmationIdsOnPage, ...verificationIdsOnPage] } }, select: approvalRowSelect })
      : Promise.resolve([]),
    investigationIdsOnPage.length > 0 ? prisma.investigationCase.findMany({ where: { id: { in: investigationIdsOnPage } }, select: investigationRowSelect }) : Promise.resolve([]),
    // Batched, single lookup for the full outstanding-approver list per
    // approval on this page only — never per-row, same "fetch once after
    // pagination" convention lib/myTasks.ts's own due-date backfill uses.
    confirmationIdsOnPage.length > 0
      ? prisma.approvalConfirmationRequest.findMany({
          where: { approvalRecordId: { in: confirmationIdsOnPage }, requestedByUserId: viewer.userId, decision: 'PENDING', NOT: { approverEmail: { equals: viewer.email, mode: 'insensitive' } } },
          select: { approvalRecordId: true, approverName: true, approverEmail: true, createdAt: true, expiresAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const approvalById = new Map(approvalRows.map((r) => [r.id, r]));
  const investigationById = new Map(investigationRows.map((r) => [r.id, r]));
  const pendingByApproval = new Map<string, typeof pendingRequestsOnPage>();
  for (const req of pendingRequestsOnPage) {
    const list = pendingByApproval.get(req.approvalRecordId) ?? [];
    list.push(req);
    pendingByApproval.set(req.approvalRecordId, list);
  }

  // Verification secondVerifier names + the real request timestamp
  // (ManualApprovalDetail.createdAt - set in the same transaction as the
  // ApprovalRecord itself, the moment the recorder designated the second
  // verifier) - page-only, batched, never per-row.
  const verificationDetail = verificationIdsOnPage.length > 0
    ? await prisma.manualApprovalDetail.findMany({
        where: { approvalRecordId: { in: verificationIdsOnPage } },
        select: { approvalRecordId: true, createdAt: true, secondVerifier: { select: { name: true, email: true } } },
      })
    : [];
  const verificationDetailByApproval = new Map(verificationDetail.map((d) => [d.approvalRecordId, d]));

  const rows: WaitingOnOthersRow[] = sortedPage
    .map(({ type, id }): WaitingOnOthersRow | null => {
      if (type === 'CONFIRMATION') {
        const r = approvalById.get(id);
        if (!r) return null;
        // pending is guaranteed non-empty here: id only ever reaches this
        // branch because confirmationGroupRows' phase-1 distinct() query
        // already proved at least one matching PENDING request exists.
        const pending = pendingByApproval.get(id) ?? [];
        const dueAt = pending.length > 0 ? pending.reduce((min, p) => (p.expiresAt < min ? p.expiresAt : min), pending[0].expiresAt) : null;
        const requestedAt = pending.length > 0 ? pending.reduce((min, p) => (p.createdAt < min ? p.createdAt : min), pending[0].createdAt) : now;
        const names = pending.map((p) => p.approverName || p.approverEmail);
        return {
          id: `CONFIRMATION:${r.id}`,
          sourceId: r.id,
          type: 'CONFIRMATION',
          title: r.subject,
          category: r.category,
          department: r.department,
          sourcePlatform: r.sourcePlatform,
          waitingOn: pending.map((p) => ({ name: p.approverName || p.approverEmail, email: p.approverEmail })),
          waitingOnLabel: formatWaitingOnLabel(names),
          expectedAction: 'Confirm, correct, or reject',
          statusLabel: deriveDueBucket(dueAt, now) === 'OVERDUE' ? 'Overdue' : 'Waiting',
          dueAt,
          dueLabel: formatDueLabel(dueAt, now),
          dueBucket: deriveDueBucket(dueAt, now),
          requestedAt,
          waitingLabel: formatWaitingDuration(requestedAt, now),
          detailHref: `/approvals/${r.id}`,
          isDemo: isDemoApprovalRecord(r),
        };
      }
      if (type === 'VERIFICATION') {
        const r = approvalById.get(id);
        if (!r) return null;
        const detail = verificationDetailByApproval.get(id);
        const verifier = detail?.secondVerifier;
        const name = verifier?.name || verifier?.email || 'the assigned verifier';
        const requestedAt = detail?.createdAt ?? now;
        return {
          id: `VERIFICATION:${r.id}`,
          sourceId: r.id,
          type: 'VERIFICATION',
          title: r.subject,
          category: r.category,
          department: r.department,
          sourcePlatform: r.sourcePlatform,
          waitingOn: verifier ? [{ name: verifier.name ?? verifier.email, email: verifier.email }] : [],
          waitingOnLabel: formatWaitingOnLabel(verifier ? [name] : []),
          expectedAction: 'Complete second-person verification',
          statusLabel: 'Waiting',
          dueAt: null,
          dueLabel: formatDueLabel(null, now),
          dueBucket: 'NORMAL',
          requestedAt,
          waitingLabel: formatWaitingDuration(requestedAt, now),
          detailHref: `/approvals/${r.id}`,
          isDemo: isDemoApprovalRecord(r),
        };
      }
      const inv = investigationById.get(id);
      if (!inv) return null;
      const assignee = inv.assignedTo;
      const name = assignee?.name || assignee?.email || 'the assigned investigator';
      return {
        id: `INVESTIGATION:${inv.id}`,
        sourceId: inv.id,
        type: 'INVESTIGATION',
        title: inv.title,
        category: inv.type,
        department: inv.department,
        sourcePlatform: null,
        waitingOn: assignee ? [{ name: assignee.name ?? assignee.email, email: assignee.email }] : [],
        waitingOnLabel: formatWaitingOnLabel(assignee ? [name] : []),
        expectedAction: 'Continue the investigation',
        statusLabel: investigationStatusLabel(inv.status),
        dueAt: null,
        dueLabel: formatDueLabel(null, now),
        dueBucket: 'NORMAL',
        requestedAt: inv.createdAt,
        waitingLabel: formatWaitingDuration(inv.createdAt, now),
        detailHref: `/investigations/${inv.id}`,
        isDemo: false,
      };
    })
    .filter((r): r is WaitingOnOthersRow => r !== null);

  const total = confirmationApprovalIds.length + verificationApprovalIds.length + investigationIds.length;

  return {
    kpis: {
      waiting,
      dueSoon,
      overdue,
      longestWaitingLabel: oldestStart ? formatWaitingDuration(oldestStart, now).replace(/^Waiting /, '') : null,
    },
    rows,
    total,
    page,
    pageSize,
    sort,
    canSeeInvestigations: seesInvestigations,
  };
}

function investigationStatusLabel(status: InvestigationStatus): string {
  switch (status) {
    case 'OPEN': return 'Open';
    case 'IN_PROGRESS': return 'In Progress';
    case 'ESCALATED': return 'Escalated';
    case 'RESOLVED': return 'Resolved';
    case 'CLOSED': return 'Closed';
    default: return status;
  }
}
