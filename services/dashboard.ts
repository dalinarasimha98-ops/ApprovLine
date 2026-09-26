/**
 * Organization Dashboard (/dashboard) read model.
 *
 * This is deliberately an ORCHESTRATION layer, not a new business-logic
 * engine: every number here is computed by re-calling an existing,
 * already-authoritative service/query used elsewhere in the app, so the
 * dashboard can never quietly disagree with the page that owns that number:
 *
 *  - Approval volume, risk-in-period, avg approval time, compliance score,
 *    per-connector activity, previous-period deltas -> services/analytics.ts's
 *    getCoreAnalytics() (the same engine /analytics's Executive Analytics
 *    page and /api/analytics/kpis already use).
 *  - Users/teams/pending-invites/compliance-framework/billing-plan data ->
 *    services/settings.ts's getSettingsOverview() (the same engine
 *    Organization Settings Overview already uses).
 *  - "Needs attention" / overdue / high-priority open-item counts ->
 *    services/action-center.ts's loadActionCenter() (the same engine
 *    /dashboard/pending-actions already uses) - this is also the number
 *    used for the top "Pending Approvals" KPI, so the KPI strip and the
 *    Open Action Items card can never show two different "pending" counts.
 *  - Recent approvals table -> lib/approvalRecords.ts's
 *    loadDashboardApprovalRecords() + services/evidence/records.ts's
 *    getUnifiedSourceSummariesForApprovals(), the exact pair
 *    /dashboard/approvals already uses to feed components/dashboard/
 *    ApprovalTable.tsx - so a row here opens the same real approval-detail
 *    preview panel, not a second detail experience.
 *  - Integration connected-count -> services/integrations/summary.ts's
 *    getIntegrationSummary() (the single shared computation Organization
 *    Settings and the Integrations page already use).
 *
 * The only genuinely new queries added here are ones nothing else already
 * exposes in the shape this page needs: a date-range-scoped category/risk
 * breakdown and daily activity buckets (small groupBy/select queries over
 * ApprovalRecord, the same pattern lib/approvalRecords.ts's
 * getApprovalDepartmentBreakdown already uses for `department` - applied to
 * `category`/`riskLevel` and, unlike that helper, actually respecting the
 * dashboard's selected date range), an integration-issue count (a filter on
 * the existing Integration.status enum), and a real playbook list (name +
 * status, no fabricated success percentage).
 *
 * TENANT ISOLATION: every query is scoped by the server-resolved
 * organizationId passed in by the caller (never a client-supplied value -
 * see app/dashboard/page.tsx, which resolves it via getDashboardTenant()).
 */

import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { getApprovalStatusCounts, loadDashboardApprovalRecords, type ApprovalListRecord } from '@/lib/approvalRecords';
import { getUnifiedSourceSummariesForApprovals, type ApprovalSourceSummary } from '@/services/evidence/records';
import { getCoreAnalytics, type CoreAnalytics, type DateRange } from '@/services/analytics';
import { getSettingsOverview, type SettingsOverview } from '@/services/settings';
import { loadActionCenter, type ActionCenterViewer, type ActionCenterKpis, type ActionCenterResult } from '@/services/action-center';
import { getIntegrationSummary } from '@/services/integrations/summary';

const QUERY_TIMEOUT_MS = 4500;

// --- Date range -------------------------------------------------------------

export type DashboardRangeKey = '7d' | '30d' | '90d';

export type DashboardRange = {
  key: DashboardRangeKey;
  label: string;
  days: number;
  dateRange: DateRange;
  prevDateRange: DateRange;
};

const RANGE_DAYS: Record<DashboardRangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };
const RANGE_LABELS: Record<DashboardRangeKey, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };

/** The single date-range resolution every card on the page shares - see
 *  app/dashboard/page.tsx, which reads this from a `range` search param and
 *  passes the SAME DashboardRange into every section built below, so no
 *  card can silently render a different window than the one shown in the
 *  page's own date-range selector. */
export function resolveDashboardRange(rawKey: string | string[] | undefined): DashboardRange {
  const key: DashboardRangeKey = rawKey === '7d' || rawKey === '90d' ? rawKey : '30d';
  const days = RANGE_DAYS[key];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const prevTo = new Date(from.getTime());
  const prevFrom = new Date(prevTo.getTime() - days * 24 * 60 * 60 * 1000);
  return { key, label: RANGE_LABELS[key], days, dateRange: { from, to }, prevDateRange: { from: prevFrom, to: prevTo } };
}

// --- Small helpers ------------------------------------------------------------

async function safe<T>(label: string, query: Promise<T>, fallback: T, degraded: string[]): Promise<T> {
  try {
    return await withTimeout(label, query, QUERY_TIMEOUT_MS);
  } catch (error) {
    console.error(`[dashboard] ${label} failed`, error);
    degraded.push(label);
    return fallback;
  }
}

export type NamedCount = { name: string; count: number; percentage: number };

/** Groups a set of names into up to `capNamed` individually-labeled buckets
 *  plus a single "Other" bucket for the remainder - only when there
 *  genuinely are more than `capNamed` distinct names, never a fabricated
 *  catch-all when everything already fit. */
function bucketWithOther(rows: Array<{ name: string; count: number }>, capNamed: number): NamedCount[] {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return [];
  const named = sorted.slice(0, capNamed);
  const rest = sorted.slice(capNamed);
  const restCount = rest.reduce((sum, r) => sum + r.count, 0);
  const buckets = restCount > 0 ? [...named, { name: 'Other', count: restCount }] : named;
  return buckets.map((b) => ({ name: b.name, count: b.count, percentage: Math.round((b.count / total) * 100) }));
}

// --- Activity chart (real, date-range-scoped) ---------------------------------

export type ActivityGranularity = 'day' | 'week' | 'month';

export type ActivityBucket = {
  label: string;
  approved: number;
  rejected: number;
  pending: number;
  highRisk: number;
};

function bucketKey(date: Date, granularity: ActivityGranularity): string {
  if (granularity === 'day') return date.toISOString().slice(0, 10);
  if (granularity === 'month') return date.toISOString().slice(0, 7);
  // ISO week key: Monday-anchored, stable across year boundaries for the
  // 7/30/90-day windows this dashboard ever renders.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function bucketLabel(key: string, granularity: ActivityGranularity): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  if (granularity === 'month') return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  if (granularity === 'week') return `Wk of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Builds real daily/weekly/monthly activity buckets from the SAME rows
 *  fetched for the selected date range - unlike services/analytics.ts's
 *  buildTimeSeries() (which always walks a fixed trailing 30 calendar days
 *  regardless of what range its input was scoped to), this always spans
 *  exactly the selected range, so switching the range selector and the
 *  chart can never disagree about what window is being shown. */
function buildActivityBuckets(
  rows: Array<{ createdAt: Date; status: string; approvalType: string; riskLevel: string | null }>,
  range: DashboardRange,
  granularity: ActivityGranularity,
): ActivityBucket[] {
  const buckets = new Map<string, ActivityBucket>();
  const step = granularity === 'day' ? 1 : granularity === 'week' ? 7 : 30;
  const cursor = new Date(range.dateRange.from);
  // Seed every bucket in the range (even empty ones) so a genuinely quiet
  // period renders as real zeros across the whole window, not a chart that
  // just stops.
  while (cursor <= range.dateRange.to) {
    const key = bucketKey(cursor, granularity);
    if (!buckets.has(key)) buckets.set(key, { label: bucketLabel(key, granularity), approved: 0, rejected: 0, pending: 0, highRisk: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + step);
  }
  for (const row of rows) {
    const key = bucketKey(row.createdAt, granularity);
    const bucket = buckets.get(key) ?? (() => {
      const created: ActivityBucket = { label: bucketLabel(key, granularity), approved: 0, rejected: 0, pending: 0, highRisk: 0 };
      buckets.set(key, created);
      return created;
    })();
    if (row.status === 'APPROVED') bucket.approved += 1;
    else if (row.status === 'REJECTED' || row.approvalType === 'REJECTION') bucket.rejected += 1;
    else if (row.status === 'PENDING_REVIEW') bucket.pending += 1;
    if (row.riskLevel === 'high' || row.riskLevel === 'critical') bucket.highRisk += 1;
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, bucket]) => bucket);
}

function defaultGranularity(range: DashboardRange): ActivityGranularity {
  return range.days <= 30 ? 'day' : 'week';
}

// --- Read model ----------------------------------------------------------------

export type DashboardViewer = ActionCenterViewer;

export type DashboardRiskSlice = { level: 'low' | 'medium' | 'high' | 'unclassified'; label: string; count: number; percentage: number };

export type DashboardWorkflow = { id: string; name: string; status: 'READY' | 'UPLOADED' | 'INDEXING' | 'ERROR' | 'ARCHIVED' | 'SUPERSEDED'; updatedAt: string };

export type DashboardOverview = {
  range: DashboardRange;
  granularity: ActivityGranularity;
  degraded: string[];
  kpis: {
    totalApprovals: { value: number; prevValue: number | null };
    pendingApprovals: { value: number };
    highRiskApprovals: { value: number; prevValue: number | null };
    avgApprovalTimeHours: { value: number | null; prevValue: number | null };
    complianceScore: { value: number; prevValue: number | null };
  };
  activity: ActivityBucket[];
  categories: NamedCount[];
  riskDistribution: DashboardRiskSlice[];
  recentApprovals: { records: (ApprovalListRecord & { sources: ApprovalSourceSummary | null })[]; total: number; degraded: boolean };
  connectors: CoreAnalytics['connectorActivity'];
  integrations: { connectedCount: number; nativeCatalogSize: number; issueCount: number };
  workflows: { items: DashboardWorkflow[]; total: number; active: number };
  usersAndTeams: { totalUsers: number; adminUsers: number; totalTeams: number; pendingInvites: number };
  complianceFrameworks: SettingsOverview['complianceFrameworks'];
  openItems: ActionCenterKpis;
  billing: SettingsOverview['billing'];
  recentAudit: { id: string; action: string; createdAt: string }[];
};

export async function getDashboardOverview(
  viewer: DashboardViewer,
  range: DashboardRange,
  granularityOverride?: ActivityGranularity,
): Promise<DashboardOverview> {
  const organizationId = viewer.organizationId;
  const degraded: string[] = [];
  const granularity = granularityOverride ?? defaultGranularity(range);
  const periodWhere = { organizationId, createdAt: { gte: range.dateRange.from, lte: range.dateRange.to } };

  const [
    analytics,
    settings,
    actionCenter,
    integrationSummary,
    periodRows,
    integrationIssueCount,
    playbooks,
    recentApprovalsPage,
    liveStatusCounts,
    recentAudit,
  ] = await Promise.all([
    safe('dashboard:coreAnalytics', getCoreAnalytics(organizationId, { dateRange: range.dateRange, prevDateRange: range.prevDateRange }), null as unknown as CoreAnalytics, degraded),
    safe('dashboard:settingsOverview', getSettingsOverview(organizationId), null as unknown as SettingsOverview, degraded),
    safe<ActionCenterResult | null>('dashboard:actionCenter', loadActionCenter(viewer, {}), null, degraded),
    safe('dashboard:integrationSummary', getIntegrationSummary(organizationId), { connectedCount: 0, nativeCatalogSize: 0 }, degraded),
    safe(
      'dashboard:periodRows',
      prisma.approvalRecord.findMany({
        where: periodWhere,
        select: { createdAt: true, status: true, approvalType: true, riskLevel: true, category: true },
        take: 3000,
      }),
      [],
      degraded,
    ),
    safe('dashboard:integrationIssues', prisma.integration.count({ where: { organizationId, status: { in: ['ERROR', 'NEEDS_REAUTH'] } } }), 0, degraded),
    safe(
      'dashboard:playbooks',
      prisma.playbookDocument.findMany({
        where: { organizationId, archivedAt: null },
        select: { id: true, name: true, status: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      [],
      degraded,
    ),
    safe(
      'dashboard:recentApprovals',
      loadDashboardApprovalRecords({ organizationId, from: range.dateRange.from.toISOString(), to: range.dateRange.to.toISOString(), pageSize: 6 }),
      { records: [] as ApprovalListRecord[], total: 0, page: 1, pageSize: 6, source: 'empty' as const, degraded: true, alert: false },
      degraded,
    ),
    safe('dashboard:liveStatusCounts', getApprovalStatusCounts(organizationId), { total: 0, approved: 0, pending: 0, rejected: 0, highRisk: 0, critical: 0, high: 0, multiSource: 0 }, degraded),
    safe(
      'dashboard:recentAudit',
      prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, action: true, createdAt: true } }),
      [],
      degraded,
    ),
  ]);

  const sourceSummaries = await safe(
    'dashboard:sourceSummaries',
    getUnifiedSourceSummariesForApprovals(organizationId, recentApprovalsPage.records.map((r) => r.id)),
    new Map<string, ApprovalSourceSummary>(),
    degraded,
  );
  if (recentApprovalsPage.degraded && !degraded.includes('dashboard:recentApprovals')) degraded.push('dashboard:recentApprovals');

  const categoryRows = bucketWithOther(
    Object.entries(
      periodRows.reduce<Record<string, number>>((map, row) => {
        const key = row.category?.trim() || 'Uncategorized';
        map[key] = (map[key] ?? 0) + 1;
        return map;
      }, {}),
    ).map(([name, count]) => ({ name, count })),
    7,
  );

  const riskCounts = { low: 0, medium: 0, high: 0, unclassified: 0 };
  for (const row of periodRows) {
    const level = row.riskLevel?.toLowerCase();
    if (level === 'low') riskCounts.low += 1;
    else if (level === 'medium') riskCounts.medium += 1;
    else if (level === 'high' || level === 'critical') riskCounts.high += 1;
    else riskCounts.unclassified += 1;
  }
  const riskTotal = periodRows.length;
  const riskDistribution: DashboardRiskSlice[] = (
    [
      { level: 'low' as const, label: 'Low', count: riskCounts.low },
      { level: 'medium' as const, label: 'Medium', count: riskCounts.medium },
      { level: 'high' as const, label: 'High', count: riskCounts.high },
      { level: 'unclassified' as const, label: 'Unclassified', count: riskCounts.unclassified },
    ]
  )
    .filter((slice) => slice.count > 0)
    .map((slice) => ({ ...slice, percentage: riskTotal > 0 ? Math.round((slice.count / riskTotal) * 100) : 0 }));

  const activity = buildActivityBuckets(periodRows, range, granularity);

  const recentApprovalsRecords = recentApprovalsPage.records.map((record) => ({
    ...record,
    sources: sourceSummaries.get(record.id) ?? null,
  }));

  return {
    range,
    granularity,
    degraded,
    kpis: {
      totalApprovals: { value: analytics?.approvals.total ?? 0, prevValue: analytics?.prevPeriod?.total ?? null },
      // Matches Action Center's own "needs attention" open-item definition
      // (services/action-center.ts) exactly - the same number the Open
      // Action Items card below renders - so this KPI and that card can
      // never disagree about what "pending" means. Deliberately NOT scoped
      // to the selected date range: an approval created 45 days ago that is
      // still open still needs action today.
      pendingApprovals: { value: actionCenter?.kpis.needsAttention ?? liveStatusCounts.pending },
      // Period-scoped ("detected this period"), distinct from the live
      // "needs attention now" framing used by openItems.highPriority below -
      // both are computed from the same authoritative riskLevel field, just
      // with different, clearly-labeled scopes (see this file's header doc).
      highRiskApprovals: { value: analytics?.riskReduction.highRiskApprovalsDetected ?? 0, prevValue: analytics?.prevPeriod?.highRisk ?? null },
      avgApprovalTimeHours: { value: analytics?.avgApprovalTimeHours ?? null, prevValue: analytics?.prevPeriod?.avgApprovalTimeHours ?? null },
      complianceScore: { value: analytics?.complianceScore ?? 0, prevValue: analytics?.prevPeriod?.complianceScore ?? null },
    },
    activity,
    categories: categoryRows,
    riskDistribution,
    recentApprovals: { records: recentApprovalsRecords, total: recentApprovalsPage.total, degraded: recentApprovalsPage.degraded },
    connectors: analytics?.connectorActivity ?? [],
    integrations: { connectedCount: integrationSummary.connectedCount, nativeCatalogSize: integrationSummary.nativeCatalogSize, issueCount: integrationIssueCount },
    workflows: {
      items: playbooks.map((p) => ({ id: p.id, name: p.name, status: p.status, updatedAt: p.updatedAt.toISOString() })),
      total: settings?.stats.totalPlaybooks ?? playbooks.length,
      active: settings?.kpis.workflowsActive ?? playbooks.filter((p) => p.status === 'READY').length,
    },
    usersAndTeams: {
      totalUsers: settings?.stats.totalUsers ?? 0,
      adminUsers: settings?.stats.adminUsers ?? 0,
      totalTeams: settings?.stats.totalTeams ?? 0,
      pendingInvites: settings?.kpis.pendingInvites ?? 0,
    },
    complianceFrameworks: settings?.complianceFrameworks ?? [],
    openItems: actionCenter?.kpis ?? { needsAttention: 0, dueToday: 0, overdue: 0, highPriority: 0, recentlyResolved: 0 },
    billing: settings?.billing ?? null,
    recentAudit: recentAudit.map((a) => ({ id: a.id, action: a.action, createdAt: a.createdAt.toISOString() })),
  };
}
