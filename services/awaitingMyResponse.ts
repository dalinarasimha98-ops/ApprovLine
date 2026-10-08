/**
 * Awaiting My Response (/dashboard/responses) read model.
 *
 * Answers "what requests are explicitly waiting for MY response right
 * now?" — a focused response inbox over the ONE real existing model that
 * represents an explicit response request: ApprovalConfirmationRequest.
 * Never a second request/response engine, never a new mutation route.
 *
 * AUTHORITATIVE GATE — the exact same condition components/approvals/
 * ManualApprovalPanel.tsx's myPendingConfirmation uses (and the exact same
 * condition app/api/approvals/[id]/confirmations/respond/route.ts's own
 * database lookup uses) decides whether a request is genuinely actionable:
 *   decision === 'PENDING' AND expiresAt > now AND approverEmail exactly
 *   (case-insensitively) matches the authenticated viewer's own email.
 * A row this module ever labels "Awaiting Response" with a working
 * "Respond" action is, by construction, a row whose destination page
 * (/approvals/[id]) genuinely has a working Confirm/Correct/Reject button —
 * never a dead CTA. This mirrors the exact fix services/myTasks.ts's
 * CONFIRMATION type received in its own certification pass (see that
 * file's header comment) — reused here as the SAME real gate, not
 * re-derived.
 *
 * THREE REAL STATES, never mixed:
 *  - ACTIONABLE: decision PENDING, not yet expired — the only state that
 *    ever shows a working Respond action.
 *  - OVERDUE: decision still PENDING, but expiresAt has passed — a real,
 *    historical fact (the response window closed), shown separately with
 *    no misleading active CTA (View Approval only — per
 *    respondToConfirmation()'s own real refusal: an expired confirmation
 *    throws CONFIRMATION_NOT_FOUND, exactly like a stale one).
 *  - RESPONDED: decision CONFIRMED/CORRECTED/REJECTED — a real response
 *    was recorded, using the exact three decision values
 *    ApprovalConfirmationDecision already defines (never a fabricated 4th
 *    outcome).
 *
 * THE RESPONSE ACTION ITSELF: every row's primary action is a direct link
 * to the real existing canonical detail page (/approvals/[id]), where
 * components/approvals/ManualApprovalPanel.tsx already renders the real
 * Confirm/Correct/Reject buttons (gated by the identical myPendingConfirmation
 * condition) and calls the real respondToConfirmation() transaction via
 * the real authenticated route. No new dialog, no new mutation route, no
 * duplicated controls — per this module's own spec ("navigate to it
 * instead of duplicating the controls").
 *
 * REUSE, NOT DUPLICATION:
 *  - The date-range half-open-interval arithmetic (never `lte: endOfDay`)
 *    is lib/my-tasks.ts's completedDateRangeFilter() — the exact function
 *    My Tasks' own certification pass proved correct against real Postgres
 *    — reused verbatim here for the Responded history range, not
 *    re-derived or duplicated.
 *  - The named date-range presets (Last 7/30/90 days, This month, Last
 *    month, Custom) reuse services/individualDashboard.ts's existing
 *    resolveIndividualDashboardRange() for preset resolution/labeling —
 *    the one place these 6 presets are already implemented in this app.
 *    Its own `to` bound is only ever consumed here via a real half-open
 *    `lt` comparison (every non-custom preset's `to` is already a genuine
 *    instant — "now", or the real start of the following calendar month —
 *    so no further adjustment is needed there; only the raw custom
 *    "YYYY-MM-DD" strings need the same +1-day correction
 *    completedDateRangeFilter already proves correct).
 *
 * SORTING/PAGINATION: the same two-phase pattern services/myApprovals.ts
 * and services/myTasks.ts already established — phase 1 (plain, fully
 * typed Prisma) fetches the viewer's ENTIRE matching id set (never bounded
 * to a page); phase 2 (one parameterized Prisma.sql query) is constrained
 * to `WHERE id IN (<already-vetted ids>)`, computes the real priority
 * bucket, and does the real ORDER BY + LIMIT/OFFSET; phase 3 fetches full
 * row data for just that one page and re-keys it to the order phase 2
 * already computed. Never a bounded-then-JS-sorted shortcut.
 *
 * TENANT ISOLATION: every query starts from `organizationId: viewer.
 * organizationId` AND `approverEmail: { equals: viewer.email, mode:
 * 'insensitive' }`, both taken from the server-resolved tenant/session,
 * never a client-supplied value. A request addressed to the same email in
 * a DIFFERENT organization can never match, because organizationId is
 * always ANDed in first.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { isDemoApprovalRecord } from '@/lib/demo-detection';
import { completedDateRangeFilter } from '@/lib/my-tasks';
import { resolveIndividualDashboardRange, type IndividualDashboardRangeKey } from '@/services/individualDashboard';
import {
  AWAITING_RESPONSE_STATUS_LABELS,
  deriveRequestState,
  type AwaitingResponseStatusFilter,
  type AwaitingResponseSort,
  type AwaitingResponseDecision,
} from '@/lib/awaiting-my-response';
import type { ActionCenterViewer } from '@/services/action-center';

export { AWAITING_RESPONSE_STATUS_LABELS };
export type { AwaitingResponseStatusFilter, AwaitingResponseSort };

const QUERY_TIMEOUT_MS = 5000;
export const AWAITING_RESPONSE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const DUE_SOON_HORIZON_DAYS = 14;

export type AwaitingResponseFilters = {
  q?: string;
  source?: string;
  requester?: string;
  status?: AwaitingResponseStatusFilter; // default 'ACTIONABLE'
  range?: IndividualDashboardRangeKey; // only applied to RESPONDED history
  from?: string;
  to?: string;
  sort?: AwaitingResponseSort;
  page?: number;
  pageSize?: number;
};

export type AwaitingResponseRow = {
  id: string; // ApprovalConfirmationRequest.id
  approvalRecordId: string;
  title: string;
  department: string | null;
  category: string | null;
  riskLevel: string | null;
  sourcePlatform: string | null;
  requesterName: string | null;
  requesterEmail: string;
  requestedAt: Date;
  dueAt: Date;
  statusLabel: string;
  isActionable: boolean;
  isOverdue: boolean;
  outcome: AwaitingResponseDecision | null;
  responseNote: string | null;
  respondedAt: Date | null;
  detailHref: string;
  actionLabel: string;
  isDemo: boolean;
};

export type AwaitingResponseKpis = {
  awaitingResponse: number;
  dueToday: number;
  overdue: number;
  responded: number;
};

export type AwaitingResponseResult = {
  kpis: AwaitingResponseKpis;
  rows: AwaitingResponseRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: AwaitingResponseSort;
  respondedPeriodLabel: string;
};

const requestSelect = {
  id: true,
  approvalRecordId: true,
  decision: true,
  expiresAt: true,
  createdAt: true,
  respondedAt: true,
  responseNote: true,
  approvalRecord: {
    select: {
      subject: true,
      department: true,
      category: true,
      riskLevel: true,
      sourcePlatform: true,
      sourceLink: true,
      correlationId: true,
    },
  },
  requestedByUser: { select: { name: true, email: true } },
} satisfies Prisma.ApprovalConfirmationRequestSelect;

function baseWhere(viewer: ActionCenterViewer): Prisma.ApprovalConfirmationRequestWhereInput {
  return {
    organizationId: viewer.organizationId,
    approverEmail: { equals: viewer.email.toLowerCase(), mode: 'insensitive' },
  };
}

function statusWhere(viewer: ActionCenterViewer, status: AwaitingResponseStatusFilter, now: Date): Prisma.ApprovalConfirmationRequestWhereInput {
  const base = baseWhere(viewer);
  if (status === 'ACTIONABLE') return { ...base, decision: 'PENDING', expiresAt: { gt: now } };
  if (status === 'OVERDUE') return { ...base, decision: 'PENDING', expiresAt: { lte: now } };
  return { ...base, decision: { not: 'PENDING' } };
}

/** Resolves the preset/custom date range exactly once, reusing
 *  services/individualDashboard.ts's existing resolver for the 6 presets'
 *  labeling and (for non-custom keys) their already-correct `to` instant;
 *  only the raw custom "YYYY-MM-DD" strings get the same half-open +1-day
 *  correction lib/my-tasks.ts's completedDateRangeFilter already proves
 *  correct — never a re-derived or duplicated date-math implementation. */
function resolveRespondedRange(filters: Pick<AwaitingResponseFilters, 'range' | 'from' | 'to'>): { filter: { gte?: Date; lt?: Date } | undefined; label: string } {
  if (filters.range === 'custom' && (filters.from || filters.to)) {
    const filter = completedDateRangeFilter(filters.from, filters.to);
    const label = filters.from && filters.to
      ? `${new Date(filters.from).toLocaleDateString()} – ${new Date(filters.to).toLocaleDateString()}`
      : 'Custom range';
    return { filter, label };
  }
  if (!filters.range) return { filter: undefined, label: 'All time' };
  const resolved = resolveIndividualDashboardRange(filters.range, filters.from, filters.to);
  return { filter: { gte: resolved.dateRange.from, lt: resolved.dateRange.to }, label: resolved.label };
}

/** Phase 2 of the two-phase sort/paginate — see this module's header
 *  comment. `idList` must already be the exact, fully-scoped, already-
 *  tenant/viewer/status/filter-matched set from phase 1. Returns the
 *  requested page's ids in final sorted order. */
async function fetchSortedPage(args: { idList: string[]; now: Date; sort: AwaitingResponseSort; page: number; pageSize: number }): Promise<string[]> {
  const { idList, now, sort, page, pageSize } = args;
  if (idList.length === 0) return [];
  const offset = (page - 1) * pageSize;

  const orderBy = (() => {
    switch (sort) {
      case 'newest': return Prisma.sql`"createdAt" DESC, id ASC`;
      case 'oldest': return Prisma.sql`"createdAt" ASC, id ASC`;
      case 'due': return Prisma.sql`"expiresAt" ASC, id ASC`;
      default: return Prisma.sql`priority_bucket ASC, "expiresAt" ASC, id ASC`;
    }
  })();

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id FROM (
      SELECT
        id,
        "expiresAt",
        "createdAt",
        CASE
          WHEN "expiresAt" < ${now} THEN 0
          WHEN "expiresAt"::date = ${now}::date THEN 1
          WHEN "expiresAt" <= ${new Date(now.getTime() + DUE_SOON_HORIZON_DAYS * 86_400_000)} THEN 2
          ELSE 3
        END AS priority_bucket
      FROM "ApprovalConfirmationRequest"
      WHERE id IN (${Prisma.join(idList)})
    ) s
    ORDER BY ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);
  return rows.map((r) => r.id);
}

export async function getAwaitingMyResponseOverview(viewer: ActionCenterViewer, filters: AwaitingResponseFilters): Promise<AwaitingResponseResult> {
  const pageSize = (AWAITING_RESPONSE_PAGE_SIZE_OPTIONS as readonly number[]).includes(filters.pageSize ?? -1) ? (filters.pageSize as number) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const sort = filters.sort ?? 'priority';
  const status = filters.status ?? 'ACTIONABLE';
  const now = new Date();

  const q = filters.q?.trim();
  const searchWhere: Prisma.ApprovalConfirmationRequestWhereInput | undefined = q
    ? {
        OR: [
          { approvalRecord: { is: { subject: { contains: q, mode: 'insensitive' } } } },
          { approvalRecord: { is: { sourcePlatform: { contains: q, mode: 'insensitive' } } } },
          { approvalRecord: { is: { category: { contains: q, mode: 'insensitive' } } } },
          { requestedByUser: { is: { name: { contains: q, mode: 'insensitive' } } } },
          { requestedByUser: { is: { email: { contains: q, mode: 'insensitive' } } } },
        ],
      }
    : undefined;
  const sourceWhere: Prisma.ApprovalConfirmationRequestWhereInput | undefined = filters.source
    ? { approvalRecord: { is: { sourcePlatform: { contains: filters.source, mode: 'insensitive' } } } }
    : undefined;
  const requesterWhere: Prisma.ApprovalConfirmationRequestWhereInput | undefined = filters.requester
    ? { requestedByUser: { is: { OR: [{ name: { contains: filters.requester, mode: 'insensitive' } }, { email: { contains: filters.requester, mode: 'insensitive' } }] } } }
    : undefined;

  const { filter: respondedRangeFilter, label: respondedPeriodLabel } = resolveRespondedRange(filters);
  const respondedRangeWhere: Prisma.ApprovalConfirmationRequestWhereInput | undefined = status === 'RESPONDED' && respondedRangeFilter ? { respondedAt: respondedRangeFilter } : undefined;

  const where: Prisma.ApprovalConfirmationRequestWhereInput = {
    AND: [statusWhere(viewer, status, now), searchWhere ?? {}, sourceWhere ?? {}, requesterWhere ?? {}, respondedRangeWhere ?? {}],
  };

  const [idRows, awaitingResponse, dueToday, overdue, respondedTotal] = await withTimeout(
    'awaiting-my-response:load',
    Promise.all([
      prisma.approvalConfirmationRequest.findMany({ where, select: { id: true } }),
      prisma.approvalConfirmationRequest.count({ where: statusWhere(viewer, 'ACTIONABLE', now) }),
      prisma.approvalConfirmationRequest.count({ where: { ...statusWhere(viewer, 'ACTIONABLE', now), expiresAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) } } }),
      prisma.approvalConfirmationRequest.count({ where: statusWhere(viewer, 'OVERDUE', now) }),
      prisma.approvalConfirmationRequest.count({
        where: { AND: [statusWhere(viewer, 'RESPONDED', now), (() => { const r = resolveRespondedRange(filters); return r.filter ? { respondedAt: r.filter } : {}; })()] },
      }),
    ]),
    QUERY_TIMEOUT_MS,
  );

  const idList = idRows.map((r) => r.id);
  const total = idList.length;
  const sortedPageIds = await fetchSortedPage({ idList, now, sort, page, pageSize });

  const pageRowsUnordered = sortedPageIds.length > 0
    ? await prisma.approvalConfirmationRequest.findMany({ where: { id: { in: sortedPageIds } }, select: requestSelect })
    : [];
  const byId = new Map(pageRowsUnordered.map((r) => [r.id, r]));

  const rows: AwaitingResponseRow[] = sortedPageIds
    .map((id): AwaitingResponseRow | null => {
      const r = byId.get(id);
      if (!r) return null;
      const state = deriveRequestState(r.decision, r.expiresAt, now);
      return {
        id: r.id,
        approvalRecordId: r.approvalRecordId,
        title: r.approvalRecord.subject,
        department: r.approvalRecord.department,
        category: r.approvalRecord.category,
        riskLevel: r.approvalRecord.riskLevel,
        sourcePlatform: r.approvalRecord.sourcePlatform,
        requesterName: r.requestedByUser?.name ?? null,
        requesterEmail: r.requestedByUser?.email ?? '',
        requestedAt: r.createdAt,
        dueAt: r.expiresAt,
        statusLabel: state.statusLabel,
        isActionable: state.isActionable,
        isOverdue: state.isOverdue,
        outcome: state.outcome,
        responseNote: r.responseNote,
        respondedAt: r.respondedAt,
        detailHref: `/approvals/${r.approvalRecordId}`,
        actionLabel: state.actionLabel,
        isDemo: isDemoApprovalRecord(r.approvalRecord),
      };
    })
    .filter((r): r is AwaitingResponseRow => r !== null);

  return {
    kpis: { awaitingResponse, dueToday, overdue, responded: respondedTotal },
    rows,
    total,
    page,
    pageSize,
    sort,
    respondedPeriodLabel,
  };
}
