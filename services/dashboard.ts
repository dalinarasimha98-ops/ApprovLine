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
 *  - Integration connected-count -> services/settings.ts's
 *    getSettingsOverview() again (its kpis.connectedIntegrations/
 *    integrationsInCatalog are already services/integrations/summary.ts's
 *    getIntegrationSummary() under the hood, the single shared computation
 *    Organization Settings and the Integrations page already use) -
 *    deliberately NOT a second direct call to getIntegrationSummary(), see
 *    the connection-pool note below.
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
 * CONNECTION POOL: getCoreAnalytics/getSettingsOverview/loadActionCenter are
 * each a composite call that internally fans out into 7-14 of its own
 * parallel Prisma queries. getDashboardOverview() awaits them ONE AT A TIME
 * (never inside the same Promise.all as each other or as this file's own
 * queries) and never re-fetches a number one of them already computed
 * (getIntegrationSummary/getApprovalStatusCounts were both removed as
 * direct calls here for exactly this reason) - this app's shared connection
 * pool is small (connection_limit: 5, see lib/env.ts's
 * normalizeDatabaseUrlForPrisma) and is shared across every concurrent
 * request app-wide, not just this page; see the incident note on
 * getDashboardOverview() itself for the production outage this fixed.
 *
 * TENANT ISOLATION: every query is scoped by the server-resolved
 * organizationId passed in by the caller (never a client-supplied value -
 * see app/dashboard/page.tsx, which resolves it via getDashboardTenant()).
 */

import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { loadDashboardApprovalRecords, type ApprovalListRecord } from '@/lib/approvalRecords';
import { getUnifiedSourceSummariesForApprovals, type ApprovalSourceSummary } from '@/services/evidence/records';
import { getCoreAnalytics, type CoreAnalytics, type DateRange } from '@/services/analytics';
import { getSettingsOverview, type SettingsOverview } from '@/services/settings';
import { loadActionCenter, type ActionCenterViewer, type ActionCenterKpis, type ActionCenterResult } from '@/services/action-center';
import { commercialPlans } from '@/lib/plans';

const QUERY_TIMEOUT_MS = 4500;

/**
 * Recent Activity is meant to answer "what happened in my organization
 * recently" for an Owner/Admin - not a raw AuditLog tail. Unfiltered, that
 * tail is dominated by low-signal personal-preference writes
 * (THEME_PREFERENCE_UPDATED, NOTIFICATION_PREFERENCES_UPDATED), internal
 * read/diagnostic tracking rows (approval_status_counts_query,
 * evidence_retrieval, view_approval_drawer), and - critically - Founder
 * Console actions performed on this org's CustomerAccount (customer.*,
 * founder_demo.*, gateway.demo.*, pilot.*), which must never surface on the
 * customer-facing Organization Dashboard at all. This allowlist is the
 * real, already-emitted action strings (grepped from every
 * `auditLog.create`/`writeAuditLog` call site) that describe something an
 * organization admin would recognize as an actual operational event -
 * never a new audit-logging engine, just a filter over the one that
 * already exists.
 */
const MEANINGFUL_AUDIT_ACTIONS = [
  'approval_record.created',
  'approval_record.created_from_ingestion',
  'MANUAL_APPROVAL_CREATED',
  'MANUAL_APPROVAL_UPDATED',
  'user.invited',
  'user.reactivated',
  'user.invite_cancelled',
  'team.created',
  'team.deleted',
  'team.member.added',
  'team.member.removed',
  'team.member.role_changed',
  'integration.slack.connected',
  'integration.slack.disconnected',
  'integration.gmail.connected',
  'integration.outlook.connected',
  'integration.teams.connected',
  'integration.jira.connected',
  'integration.servicenow.connected',
  'integration.zoom.connected',
  'integration.provider.status_changed',
  'playbook.document.replaced',
  'playbook.document.archived',
  'playbook.document.deleted',
  'playbook.compliance.evaluated',
  'investigation.created',
  'investigation.note_added',
  'APPROVAL_POLICY_UPDATED',
  'BRANDING_UPDATED',
  'DEFAULT_SETTINGS_UPDATED',
  'DOMAIN_UPDATED',
  'settings.organization_updated',
  'COMPLIANCE_ISSUE_CREATED',
  'COMPLIANCE_ISSUE_RESOLVED',
  'COMPLIANCE_CONTROL_UPDATED',
  'COMPLIANCE_ATTESTATION_COMPLETED',
];

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

/** Human-readable labels for the MEANINGFUL_AUDIT_ACTIONS allowlist above -
 *  a plain capitalize-the-machine-name fallback reads poorly for dotted/
 *  underscored action strings (e.g. "User.Invited"), so the Recent Activity
 *  card gets an explicit, readable label for every action it can actually
 *  render, and only falls back to the naive transform for anything new. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  'approval_record.created': 'Approval captured',
  'approval_record.created_from_ingestion': 'Approval captured',
  MANUAL_APPROVAL_CREATED: 'Manual approval recorded',
  MANUAL_APPROVAL_UPDATED: 'Manual approval updated',
  'user.invited': 'User invited',
  'user.reactivated': 'User reactivated',
  'user.invite_cancelled': 'Invite cancelled',
  'team.created': 'Team created',
  'team.deleted': 'Team deleted',
  'team.member.added': 'Team member added',
  'team.member.removed': 'Team member removed',
  'team.member.role_changed': 'Team member role changed',
  'integration.slack.connected': 'Slack connected',
  'integration.slack.disconnected': 'Slack disconnected',
  'integration.gmail.connected': 'Gmail connected',
  'integration.outlook.connected': 'Outlook connected',
  'integration.teams.connected': 'Microsoft Teams connected',
  'integration.jira.connected': 'Jira connected',
  'integration.servicenow.connected': 'ServiceNow connected',
  'integration.zoom.connected': 'Zoom connected',
  'integration.provider.status_changed': 'Integration status changed',
  'playbook.document.replaced': 'Playbook updated',
  'playbook.document.archived': 'Playbook archived',
  'playbook.document.deleted': 'Playbook deleted',
  'playbook.compliance.evaluated': 'Playbook compliance evaluated',
  'investigation.created': 'Investigation opened',
  'investigation.note_added': 'Investigation note added',
  APPROVAL_POLICY_UPDATED: 'Approval policy changed',
  BRANDING_UPDATED: 'Branding updated',
  DEFAULT_SETTINGS_UPDATED: 'Default settings changed',
  DOMAIN_UPDATED: 'Custom domain updated',
  'settings.organization_updated': 'Organization settings updated',
  COMPLIANCE_ISSUE_CREATED: 'Compliance issue opened',
  COMPLIANCE_ISSUE_RESOLVED: 'Compliance issue resolved',
  COMPLIANCE_CONTROL_UPDATED: 'Compliance control updated',
  COMPLIANCE_ATTESTATION_COMPLETED: 'Compliance attestation completed',
};

export function describeAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replaceAll('_', ' ').replaceAll('.', ' - ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type DashboardViewer = ActionCenterViewer;

export type DashboardRiskSlice = { level: 'low' | 'medium' | 'high' | 'unclassified'; label: string; count: number; percentage: number };

export type DashboardWorkflow = {
  id: string;
  name: string;
  status: 'READY' | 'UPLOADED' | 'INDEXING' | 'ERROR' | 'ARCHIVED' | 'SUPERSEDED';
  updatedAt: string;
  /** Real average ApprovalComplianceEvaluation.score (services/playbooks.ts's
   *  evaluateApprovalCompliance()) across every evaluation run against one
   *  of this playbook's rules - null when this playbook has never been
   *  evaluated against a real approval yet (evaluation is triggered
   *  on-demand via /api/playbooks/evaluate, not automatically for every
   *  approval, so this is commonly null for a freshly-uploaded playbook -
   *  an honest "not enough data" state, never a fabricated percentage). */
  complianceRate: number | null;
  evaluatedCount: number;
  /** Most recent ApprovalComplianceEvaluation.createdAt against one of this
   *  playbook's rules - null when evaluatedCount is 0. Never invented when
   *  evaluation metrics don't exist (Section 7's explicit instruction). */
  lastEvaluatedAt: string | null;
};

export type ConnectedIntegration = { provider: string; connectedAt: string };

/** One real, database-backed Workspace Readiness check (Section 4). Every
 *  item's `complete` flag is derived directly from data already computed
 *  elsewhere in this file - never a second, independent notion of
 *  "configured." `href` is only set when the viewer's role can actually
 *  reach that destination (checked by the caller in
 *  OrganizationDashboardView, which already knows the real per-card RBAC
 *  gates - this file doesn't duplicate a permission system, per the
 *  project's "never create a second permission system" rule). */
export type WorkspaceReadinessItem = {
  id: 'organization' | 'usersAndTeams' | 'integrations' | 'playbook' | 'compliance' | 'approvalCaptureActive' | 'approvalActivityInPeriod';
  label: string;
  complete: boolean;
  detail: string;
};

export type DashboardOverview = {
  range: DashboardRange;
  granularity: ActivityGranularity;
  degraded: string[];
  kpis: {
    totalApprovals: { value: number; prevValue: number | null };
    /** Live/unscoped - see openItems.needsAttention below, which is the
     *  exact same number under a distinct label ("Pending Approval
     *  Actions"), so the two never contradict each other while still each
     *  being independently correct (Section 2). */
    pendingApprovals: { value: number };
    highRiskApprovals: { value: number; prevValue: number | null };
    avgApprovalTimeHours: { value: number | null; prevValue: number | null };
    /** null when there are no qualifying approvals in the selected period -
     *  the underlying formula would otherwise report a perfect 100% for an
     *  org with zero data, which is a misleading value, not a real score. */
    complianceScore: { value: number | null; prevValue: number | null };
  };
  activity: ActivityBucket[];
  categories: NamedCount[];
  riskDistribution: DashboardRiskSlice[];
  recentApprovals: { records: (ApprovalListRecord & { sources: ApprovalSourceSummary | null })[]; total: number; degraded: boolean };
  connectors: CoreAnalytics['connectorActivity'];
  integrations: { connectedCount: number; nativeCatalogSize: number; issueCount: number; connectedList: ConnectedIntegration[] };
  workflows: { items: DashboardWorkflow[]; total: number; active: number };
  usersAndTeams: { totalUsers: number; adminUsers: number; totalTeams: number; pendingInvites: number };
  complianceFrameworks: SettingsOverview['complianceFrameworks'];
  openItems: ActionCenterKpis;
  /** True only when this organization has NEVER captured a single
   *  ApprovalRecord, all time (not date-range scoped) - distinct from
   *  "zero approvals in the selected period," which periodRows/kpis
   *  already represent on their own. Drives Workspace Readiness's
   *  "Approval capture not yet active" vs "No approval activity in
   *  selected period" distinction (Section 4). */
  hasEverCapturedApproval: boolean;
  workspaceReadiness: WorkspaceReadinessItem[];
  billing: SettingsOverview['billing'];
  /**
   * Real plan-limit context for the dashboard's Plan & Usage card, derived
   * from lib/plans.ts's commercialPlans[planTier] - the same catalog
   * Organization Settings' Billing & Plan tab and the public pricing page
   * already read. connectedSystemLimit/seatLimit are null when the plan is
   * contract-defined with no fixed cap (a real state, not missing data).
   * approvalsThisMonth has no plan-level cap anywhere in this catalog, so
   * it is never rendered as a fraction of an invented limit.
   */
  planLimits: { seatLimit: number | null; connectedSystemLimit: number | null; approvalsThisMonth: number } | null;
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

  // Deliberately SEQUENTIAL, not one big Promise.all: getCoreAnalytics,
  // getSettingsOverview, and loadActionCenter are each themselves a
  // composite call that internally fans out into 7-14 of its own parallel
  // Prisma queries. Firing all three (plus this file's own queries) inside
  // a single Promise.all previously asked this app's shared connection
  // pool (connection_limit: 5, see lib/env.ts's normalizeDatabaseUrlForPrisma
  // and the identical rationale already documented on the pre-rebuild
  // version of this page) for 40+ connections simultaneously - which in
  // production tripped lib/approvalRecords.ts's circuit breaker on this
  // page AND starved unrelated concurrent requests (e.g.
  // /dashboard/settings/integrations) waiting on the same pool. Awaiting
  // each composite call in turn bounds the peak simultaneous demand to
  // whichever single call is heaviest, trading some latency for not taking
  // the shared pool down for every other page.
  const analytics = await safe('dashboard:coreAnalytics', getCoreAnalytics(organizationId, { dateRange: range.dateRange, prevDateRange: range.prevDateRange }), null as unknown as CoreAnalytics, degraded);
  const settings = await safe('dashboard:settingsOverview', getSettingsOverview(organizationId), null as unknown as SettingsOverview, degraded);
  const actionCenter = await safe<ActionCenterResult | null>('dashboard:actionCenter', loadActionCenter(viewer, {}), null, degraded);

  // This file's own, smaller queries - batched together (not also stacked
  // on top of the three composite calls above). getIntegrationSummary()
  // and getApprovalStatusCounts() are deliberately NOT re-fetched here:
  // getSettingsOverview already computed the identical integration summary
  // internally (settings.kpis.connectedIntegrations/integrationsInCatalog),
  // and getApprovalStatusCounts was only ever used as a fallback for
  // actionCenter's own pending count - refetching it doubled the exact
  // query class (approvalRecord queries in lib/approvalRecords.ts) that
  // was tripping the circuit breaker.
  const [
    periodRows,
    integrationIssueCount,
    connectedIntegrationRows,
    allTimeApprovalCount,
    playbooks,
    playbookEvaluations,
    recentApprovalsPage,
    recentAudit,
  ] = await Promise.all([
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
    // Directly against Integration - deliberately NOT derived from
    // analytics.connectorActivity, which only lists a provider that has
    // approval messages WITHIN the selected period. A real CONNECTED
    // integration with zero approval volume this period is still a real,
    // connected integration, and Section 6's "show a compact list of the
    // most relevant connected integrations if real connection records
    // exist" requires that to render regardless of period activity.
    safe(
      'dashboard:connectedIntegrations',
      prisma.integration.findMany({
        where: { organizationId, status: 'CONNECTED' },
        select: { provider: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      [],
      degraded,
    ),
    // Unscoped by date range on purpose - distinguishes "this org has never
    // captured a single approval" (Workspace Readiness: "Approval capture
    // not yet active") from "this org has real history but nothing fell in
    // the selected window" (Workspace Readiness: "No approval activity in
    // selected period") - periodRows/analytics can't tell those apart.
    safe('dashboard:allTimeApprovalCount', prisma.approvalRecord.count({ where: { organizationId } }), 0, degraded),
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
      'dashboard:playbookEvaluations',
      prisma.approvalComplianceEvaluation.findMany({
        where: { organizationId, rule: { isNot: null } },
        select: { score: true, createdAt: true, rule: { select: { documentId: true } } },
        take: 3000,
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
    safe(
      'dashboard:recentAudit',
      prisma.auditLog.findMany({
        where: { organizationId, action: { in: MEANINGFUL_AUDIT_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, action: true, createdAt: true },
      }),
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

  // Real per-playbook average ApprovalComplianceEvaluation.score plus its
  // most recent evaluation timestamp, when this playbook has actually been
  // evaluated against a real approval at least once - never a fabricated
  // percentage or timestamp for a document with zero evaluations.
  const evaluationsByDocument = new Map<string, { sum: number; count: number; lastEvaluatedAt: Date }>();
  for (const evaluation of playbookEvaluations) {
    const documentId = evaluation.rule?.documentId;
    if (!documentId) continue;
    const bucket = evaluationsByDocument.get(documentId) ?? { sum: 0, count: 0, lastEvaluatedAt: evaluation.createdAt };
    bucket.sum += evaluation.score;
    bucket.count += 1;
    if (evaluation.createdAt > bucket.lastEvaluatedAt) bucket.lastEvaluatedAt = evaluation.createdAt;
    evaluationsByDocument.set(documentId, bucket);
  }

  const recentApprovalsRecords = recentApprovalsPage.records.map((record) => ({
    ...record,
    sources: sourceSummaries.get(record.id) ?? null,
  }));

  const connectedList: ConnectedIntegration[] = connectedIntegrationRows.map((row) => ({
    provider: row.provider,
    connectedAt: row.updatedAt.toISOString(),
  }));

  const organizationConfigured = settings?.organization.onboardedAt !== null && settings?.organization.onboardedAt !== undefined;
  const usersAndTeamsConfigured = (settings?.stats.totalTeams ?? 0) > 0;
  const integrationsConnected = (settings?.kpis.connectedIntegrations ?? 0) > 0;
  const playbookConfigured = (settings?.stats.totalPlaybooks ?? playbooks.length) > 0;
  const complianceConfigured = (settings?.complianceFrameworks.length ?? 0) > 0;
  const hasEverCapturedApproval = allTimeApprovalCount > 0;
  const hasApprovalActivityInPeriod = periodRows.length > 0;

  // Every check below is derived from a value already computed above in
  // this same function - Workspace Readiness is a read-only summary view
  // over that data, never a second, independent source of truth for any of
  // these facts (Section 4).
  const workspaceReadiness: WorkspaceReadinessItem[] = [
    {
      id: 'organization',
      label: 'Organization configured',
      complete: organizationConfigured,
      detail: organizationConfigured ? 'Workspace onboarding completed' : 'Workspace profile setup is incomplete',
    },
    {
      id: 'usersAndTeams',
      label: 'Users & teams configured',
      complete: usersAndTeamsConfigured,
      detail: usersAndTeamsConfigured
        ? `${settings?.stats.totalTeams ?? 0} team${(settings?.stats.totalTeams ?? 0) === 1 ? '' : 's'} configured`
        : 'No teams created yet',
    },
    {
      id: 'integrations',
      label: 'Integrations connected',
      complete: integrationsConnected,
      detail: integrationsConnected ? `${settings?.kpis.connectedIntegrations ?? 0} connected` : 'No integrations connected yet',
    },
    {
      id: 'playbook',
      label: 'Playbook configured',
      complete: playbookConfigured,
      detail: playbookConfigured ? `${settings?.stats.totalPlaybooks ?? playbooks.length} playbook${(settings?.stats.totalPlaybooks ?? playbooks.length) === 1 ? '' : 's'} configured` : 'No playbook uploaded yet',
    },
    {
      id: 'compliance',
      label: 'Compliance frameworks configured',
      complete: complianceConfigured,
      detail: complianceConfigured ? `${settings?.complianceFrameworks.length ?? 0} framework${(settings?.complianceFrameworks.length ?? 0) === 1 ? '' : 's'} configured` : 'No compliance frameworks configured yet',
    },
    {
      id: 'approvalCaptureActive',
      label: 'Approval capture active',
      complete: hasEverCapturedApproval,
      detail: hasEverCapturedApproval ? 'Approvals have been captured in this workspace' : 'Approval capture not yet active',
    },
    {
      id: 'approvalActivityInPeriod',
      label: 'Approval activity in selected period',
      complete: hasApprovalActivityInPeriod,
      detail: hasApprovalActivityInPeriod ? `Approvals captured ${range.label.toLowerCase()}` : `No approval activity in ${range.label.toLowerCase()}`,
    },
  ];

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
      pendingApprovals: { value: actionCenter?.kpis.needsAttention ?? 0 },
      // Period-scoped ("detected this period"), distinct from the live
      // "needs attention now" framing used by openItems.highPriority below -
      // both are computed from the same authoritative riskLevel field, just
      // with different, clearly-labeled scopes (see this file's header doc).
      highRiskApprovals: { value: analytics?.riskReduction.highRiskApprovalsDetected ?? 0, prevValue: analytics?.prevPeriod?.highRisk ?? null },
      avgApprovalTimeHours: { value: analytics?.avgApprovalTimeHours ?? null, prevValue: analytics?.prevPeriod?.avgApprovalTimeHours ?? null },
      complianceScore: {
        value: analytics && analytics.approvals.total > 0 ? analytics.complianceScore : null,
        prevValue: analytics?.prevPeriod && analytics.prevPeriod.total > 0 ? analytics.prevPeriod.complianceScore : null,
      },
    },
    activity,
    categories: categoryRows,
    riskDistribution,
    recentApprovals: { records: recentApprovalsRecords, total: recentApprovalsPage.total, degraded: recentApprovalsPage.degraded },
    connectors: analytics?.connectorActivity ?? [],
    // Reuses the exact counts getSettingsOverview() already computed via
    // services/integrations/summary.ts's getIntegrationSummary() - the same
    // shared computation Organization Settings and the Integrations page
    // use - rather than re-issuing that query a second time per dashboard
    // load (see the sequencing comment above `analytics`/`settings` for why
    // that duplication mattered).
    integrations: {
      connectedCount: settings?.kpis.connectedIntegrations ?? 0,
      nativeCatalogSize: settings?.kpis.integrationsInCatalog ?? 0,
      issueCount: integrationIssueCount,
      connectedList,
    },
    workflows: {
      items: playbooks.map((p) => {
        const evaluations = evaluationsByDocument.get(p.id);
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          updatedAt: p.updatedAt.toISOString(),
          complianceRate: evaluations ? Math.round(evaluations.sum / evaluations.count) : null,
          evaluatedCount: evaluations?.count ?? 0,
          lastEvaluatedAt: evaluations ? evaluations.lastEvaluatedAt.toISOString() : null,
        };
      }),
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
    hasEverCapturedApproval,
    workspaceReadiness,
    billing: settings?.billing ?? null,
    planLimits: settings?.billing
      ? {
          seatLimit: commercialPlans[settings.billing.planTier].seatLimit,
          connectedSystemLimit: commercialPlans[settings.billing.planTier].connectedSystemLimit,
          approvalsThisMonth: settings.kpis.approvalsThisMonth,
        }
      : null,
    recentAudit: recentAudit.map((a) => ({ id: a.id, action: a.action, createdAt: a.createdAt.toISOString() })),
  };
}
