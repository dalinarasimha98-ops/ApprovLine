/**
 * Individual User Dashboard (/dashboard/me) read model.
 *
 * This answers a different question than services/dashboard.ts's
 * Organization Dashboard: not "how is the workspace performing" but "what
 * requires MY attention, what have I done, what is waiting for me, and
 * what am I waiting on." Every number here is scoped to the current
 * viewer's own identity, regardless of role - an Owner still has personal
 * approvals assigned to them.
 *
 * REUSE, NOT A SECOND ENGINE:
 *  - "My Pending Approvals" / "Due Today" / "Overdue" -> services/
 *    action-center.ts's computeKpis(viewer, forcePersonalScope=true) - the
 *    exact same real query Action Center itself uses, just forced to
 *    personal scope even for roles Action Center normally shows org-wide
 *    data to. Never a second definition of "pending"/"overdue."
 *  - The viewer-identity match (real User.id / email, never a name guess)
 *    is services/action-center.ts's own viewerIdentityWhere(), exported
 *    for reuse here rather than re-derived.
 *  - "My Approvals" list reuses lib/approvalRecords.ts's
 *    approvalRecordListSelect (the same field shape ApprovalTable/
 *    ApprovalPreviewPanel already render) and services/evidence/
 *    records.ts's getUnifiedSourceSummariesForApprovals - the identical
 *    pair the Organization Dashboard's Recent Approvals and
 *    /dashboard/approvals already use - so a row here opens the exact same
 *    real approval-detail experience, not a second one.
 *  - "My Recent Activity" reuses services/dashboard.ts's
 *    MEANINGFUL_AUDIT_ACTIONS allowlist and describeAuditAction() - the
 *    same filtered, customer-meaningful event set the Organization
 *    Dashboard's Recent Activity uses - scoped here to actorUserId instead
 *    of unscoped, never a second audit-filtering allowlist.
 *
 * GENUINELY NEW (nothing else already exposes these): "Total Approvals"
 * (a period-scoped, viewer-identity-scoped count - no existing service
 * computes a per-user period total), "Awaiting My Response" and "Waiting
 * on Others" (both direct, small queries against the real
 * ApprovalConfirmationRequest.approverEmail/requestedByUserId fields - a
 * genuinely real "I was asked to confirm this" / "I asked someone else to
 * confirm this" distinction the schema already models, not invented), and
 * "Due Soon" (upcoming, not-yet-due confirmation deadlines - the same
 * expiresAt field computeKpis's dueToday/overdue already key off of, so
 * this page never mixes two different definitions of "due").
 *
 * DELIBERATELY OMITTED (no backing data model exists anywhere in this
 * schema, and inventing one was explicitly out of scope for this pass):
 * My Tasks (no task/todo model), Mentions & Requests (no comments/mentions
 * model), Recently Viewed (no view-history is ever recorded - the one
 * candidate audit action, 'view_approval_drawer', only fires on a FAILED
 * load, never a successful one), Saved/Followed Items (no save/follow
 * model), Demo Mode (no customer-facing demo toggle exists, only internal
 * founder/sales seed tooling).
 *
 * TENANT ISOLATION: every query is scoped by the server-resolved
 * organizationId passed in by the caller (see app/dashboard/me/page.tsx,
 * which resolves it via getDashboardTenant()), and by the viewer's own
 * real identity for every personal query - never a client-supplied value.
 */

import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { approvalRecordListSelect, type ApprovalListRecord } from '@/lib/approvalRecords';
import { getUnifiedSourceSummariesForApprovals, type ApprovalSourceSummary } from '@/services/evidence/records';
import { computeKpis, viewerIdentityWhere, openActionWhere, type ActionCenterViewer } from '@/services/action-center';
import { MEANINGFUL_AUDIT_ACTIONS, describeAuditAction } from '@/services/dashboard';
import type { DateRange } from '@/services/analytics';

export { describeAuditAction };

const QUERY_TIMEOUT_MS = 4500;

async function safe<T>(label: string, query: Promise<T>, fallback: T, degraded: string[]): Promise<T> {
  try {
    return await withTimeout(label, query, QUERY_TIMEOUT_MS);
  } catch (error) {
    console.error(`[individualDashboard] ${label} failed`, error);
    degraded.push(label);
    return fallback;
  }
}

// --- Date range --------------------------------------------------------------
//
// A genuinely different shape than services/dashboard.ts's
// resolveDashboardRange() (fixed 7/30/90-day rolling windows only) - this
// page's spec calls for calendar-month presets and an arbitrary custom
// range, which that function's rolling-window math can't express. Not a
// duplicate date-range engine so much as a superset one function can't
// honestly cover; the DateRange shape itself is still the one shared type
// (services/analytics.ts) every dashboard in this app already uses.

export type IndividualDashboardRangeKey = '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth' | 'custom';

export type IndividualDashboardRange = {
  key: IndividualDashboardRangeKey;
  label: string;
  dateRange: DateRange;
  prevDateRange: DateRange;
};

const ROLLING_DAYS: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 };
const ROLLING_LABELS: Record<'7d' | '30d' | '90d', string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

/** Unknown/garbage/missing input always falls back to a real 30-day
 *  window rather than throwing or silently picking an arbitrary one - a
 *  client-tampered `range` query param must never crash the page. Custom
 *  range with an invalid or reversed from/to pair falls back the same way. */
export function resolveIndividualDashboardRange(
  rawKey: string | string[] | undefined,
  customFrom?: string | string[] | undefined,
  customTo?: string | string[] | undefined,
): IndividualDashboardRange {
  const now = new Date();

  if (rawKey === 'custom' && typeof customFrom === 'string' && typeof customTo === 'string') {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from.getTime() <= to.getTime()) {
      const spanMs = Math.max(to.getTime() - from.getTime(), 24 * 60 * 60 * 1000);
      const prevTo = new Date(from.getTime());
      const prevFrom = new Date(prevTo.getTime() - spanMs);
      return {
        key: 'custom',
        label: `${from.toLocaleDateString()} – ${to.toLocaleDateString()}`,
        dateRange: { from, to },
        prevDateRange: { from: prevFrom, to: prevTo },
      };
    }
  }

  if (rawKey === 'thisMonth') {
    const from = startOfMonth(now.getFullYear(), now.getMonth());
    const prevFrom = startOfMonth(now.getFullYear(), now.getMonth() - 1);
    return { key: 'thisMonth', label: 'This month', dateRange: { from, to: now }, prevDateRange: { from: prevFrom, to: from } };
  }

  if (rawKey === 'lastMonth') {
    const from = startOfMonth(now.getFullYear(), now.getMonth() - 1);
    const to = startOfMonth(now.getFullYear(), now.getMonth());
    const prevFrom = startOfMonth(now.getFullYear(), now.getMonth() - 2);
    return { key: 'lastMonth', label: 'Last month', dateRange: { from, to }, prevDateRange: { from: prevFrom, to: from } };
  }

  const key: '7d' | '30d' | '90d' = rawKey === '7d' || rawKey === '90d' ? rawKey : '30d';
  const days = ROLLING_DAYS[key];
  const to = now;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const prevTo = new Date(from.getTime());
  const prevFrom = new Date(prevTo.getTime() - days * 24 * 60 * 60 * 1000);
  return { key, label: ROLLING_LABELS[key], dateRange: { from, to }, prevDateRange: { from: prevFrom, to: prevTo } };
}

// --- Read model ----------------------------------------------------------------

export type IndividualDashboardViewer = ActionCenterViewer & { name: string | null };

export type WaitingOnOthersItem = {
  id: string;
  subject: string;
  category: string | null;
  approvalStatus: string;
  currentApprover: string;
  submittedAt: string;
};

export type DueSoonItem = {
  id: string;
  subject: string;
  category: string | null;
  dueAt: string;
};

export type RecentActivityItem = { id: string; action: string; createdAt: string };

export type IndividualDashboardOverview = {
  range: IndividualDashboardRange;
  degraded: string[];
  kpis: {
    /** Period-scoped, viewer-identity-scoped - see the "GENUINELY NEW"
     *  note above. */
    totalApprovals: { value: number; prevValue: number | null };
    /** Live/unscoped (identical semantics to the Organization Dashboard's
     *  "Pending Approval Actions") - forced to personal scope via
     *  computeKpis(viewer, true) regardless of the viewer's role. */
    myPendingApprovals: { value: number };
    /** Both sourced from ApprovalConfirmationRequest.expiresAt via the
     *  same computeKpis() call - never a second "due" definition. */
    dueToday: { value: number };
    overdue: { value: number };
    /** Real ApprovalConfirmationRequest rows addressed to the viewer
     *  (approverEmail match) with decision still PENDING. */
    awaitingMyResponse: { value: number };
  };
  myApprovals: { records: (ApprovalListRecord & { sources: ApprovalSourceSummary | null })[]; total: number };
  dueSoon: DueSoonItem[];
  waitingOnOthers: WaitingOnOthersItem[];
  recentActivity: RecentActivityItem[];
};

export async function getIndividualDashboardOverview(
  viewer: IndividualDashboardViewer,
  range: IndividualDashboardRange,
): Promise<IndividualDashboardOverview> {
  const organizationId = viewer.organizationId;
  const degraded: string[] = [];
  const identity = viewerIdentityWhere(viewer);
  const email = viewer.email.toLowerCase();
  const now = new Date();
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dueSoonHorizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // computeKpis() is itself a composite call (see its own doc comment) -
  // awaited on its own rather than folded into the Promise.all below, the
  // same connection-pool-conscious sequencing pattern services/
  // dashboard.ts's getDashboardOverview() already established (and the
  // exact incident that pattern was fixed to prevent).
  const actionCenterKpis = await safe(
    'individual:actionCenterKpis',
    computeKpis(viewer, true),
    { needsAttention: 0, dueToday: 0, overdue: 0, highPriority: 0, recentlyResolved: 0 },
    degraded,
  );

  const [
    totalApprovalsCurrent,
    totalApprovalsPrev,
    awaitingMyResponse,
    myApprovalRows,
    waitingOnOthersRows,
    recentActivityRows,
    dueSoonRows,
  ] = await Promise.all([
    safe(
      'individual:totalApprovalsCurrent',
      prisma.approvalRecord.count({ where: { organizationId, ...identity, createdAt: { gte: range.dateRange.from, lte: range.dateRange.to } } }),
      0,
      degraded,
    ),
    safe(
      'individual:totalApprovalsPrev',
      prisma.approvalRecord.count({ where: { organizationId, ...identity, createdAt: { gte: range.prevDateRange.from, lte: range.prevDateRange.to } } }),
      0,
      degraded,
    ),
    safe(
      'individual:awaitingMyResponse',
      prisma.approvalConfirmationRequest.count({ where: { organizationId, approverEmail: { equals: email, mode: 'insensitive' }, decision: 'PENDING' } }),
      0,
      degraded,
    ),
    safe(
      'individual:myApprovals',
      prisma.approvalRecord.findMany({
        where: { organizationId, AND: [identity, openActionWhere()] },
        select: approvalRecordListSelect,
        orderBy: [{ createdAt: 'desc' }],
        take: 8,
      }),
      [],
      degraded,
    ),
    safe(
      'individual:waitingOnOthers',
      prisma.approvalConfirmationRequest.findMany({
        where: { organizationId, requestedByUserId: viewer.userId, decision: 'PENDING' },
        select: {
          id: true,
          createdAt: true,
          approverName: true,
          approverEmail: true,
          approvalRecord: { select: { subject: true, category: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      [],
      degraded,
    ),
    safe(
      'individual:recentActivity',
      prisma.auditLog.findMany({
        where: { organizationId, actorUserId: viewer.userId, action: { in: MEANINGFUL_AUDIT_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, action: true, createdAt: true },
      }),
      [],
      degraded,
    ),
    // "Due soon" = the same confirmation-expiry concept dueToday/overdue
    // above already use, just the upcoming (not-yet-due) slice of it - one
    // consistent definition of "due" for the whole page, never a second
    // one built from ApprovalRecord.dueDate (a different, more sparsely
    // populated field - see its own schema doc comment).
    safe(
      'individual:dueSoon',
      prisma.approvalConfirmationRequest.findMany({
        where: {
          organizationId,
          decision: 'PENDING',
          expiresAt: { gt: startOfTomorrow, lte: dueSoonHorizon },
          approvalRecord: { is: identity },
        },
        select: { id: true, expiresAt: true, approvalRecord: { select: { id: true, subject: true, category: true } } },
        orderBy: { expiresAt: 'asc' },
        take: 6,
      }),
      [],
      degraded,
    ),
  ]);

  const sourceSummaries = await safe(
    'individual:sourceSummaries',
    getUnifiedSourceSummariesForApprovals(organizationId, myApprovalRows.map((r) => r.id)),
    new Map<string, ApprovalSourceSummary>(),
    degraded,
  );

  return {
    range,
    degraded,
    kpis: {
      totalApprovals: { value: totalApprovalsCurrent, prevValue: totalApprovalsPrev > 0 ? totalApprovalsPrev : null },
      myPendingApprovals: { value: actionCenterKpis.needsAttention },
      dueToday: { value: actionCenterKpis.dueToday },
      overdue: { value: actionCenterKpis.overdue },
      awaitingMyResponse: { value: awaitingMyResponse },
    },
    myApprovals: {
      records: myApprovalRows.map((record) => ({ ...record, sources: sourceSummaries.get(record.id) ?? null })),
      total: myApprovalRows.length,
    },
    dueSoon: dueSoonRows.map((r) => ({
      id: r.approvalRecord.id,
      subject: r.approvalRecord.subject,
      category: r.approvalRecord.category,
      dueAt: r.expiresAt.toISOString(),
    })),
    waitingOnOthers: waitingOnOthersRows.map((r) => ({
      id: r.id,
      subject: r.approvalRecord.subject,
      category: r.approvalRecord.category,
      approvalStatus: r.approvalRecord.status,
      currentApprover: r.approverName || r.approverEmail,
      submittedAt: r.createdAt.toISOString(),
    })),
    recentActivity: recentActivityRows.map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAt.toISOString() })),
  };
}
