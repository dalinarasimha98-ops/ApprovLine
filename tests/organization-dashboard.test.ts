import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveDashboardRange } from '../services/dashboard';

// NOTE: matches every other test in this repo (see tests/action-center.test.ts's
// documented rationale) - there is no live-database test harness in this
// environment, so this suite covers (Part 1) real executed unit tests against
// the pure, Clerk/Prisma-independent logic services/dashboard.ts exports, and
// (Part 2) static-analysis of the already-written service/page source to lock
// in the architectural invariants this rebuild depends on: reuse of existing
// engines (no duplicate business logic), tenant isolation, RBAC gating, a
// single shared date range, and no fabricated metrics.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// ─── Part 1: resolveDashboardRange() - real executed logic ──────────────────

{
  const range = resolveDashboardRange('7d');
  assert.equal(range.key, '7d');
  assert.equal(range.days, 7);
  const spanMs = range.dateRange.to.getTime() - range.dateRange.from.getTime();
  assert.equal(Math.round(spanMs / (24 * 60 * 60 * 1000)), 7);
  // Previous period is the same length and ends exactly where the current
  // period begins - no gap, no overlap.
  assert.equal(range.prevDateRange.to.getTime(), range.dateRange.from.getTime());
  const prevSpanMs = range.prevDateRange.to.getTime() - range.prevDateRange.from.getTime();
  assert.equal(Math.round(prevSpanMs / (24 * 60 * 60 * 1000)), 7);
}

{
  const range = resolveDashboardRange('90d');
  assert.equal(range.key, '90d');
  assert.equal(range.label, 'Last 90 days');
}

// Unknown/garbage input defaults to 30d rather than throwing or silently
// picking an arbitrary window - a client-tampered `range` query param must
// never crash the page.
{
  const range = resolveDashboardRange('not-a-real-range' as never);
  assert.equal(range.key, '30d');
  assert.equal(range.days, 30);
}
{
  const range = resolveDashboardRange(undefined);
  assert.equal(range.key, '30d');
}

// ─── Part 2: static analysis - reuse, not a new business-logic universe ────

const dashboardService = read('services/dashboard.ts');

// Every number on the dashboard must come from an existing, already-
// authoritative engine - see this task's explicit "do not create
// dashboardApprovalService/dashboardRiskService/..." rule.
assert.match(dashboardService, /getCoreAnalytics/);
assert.match(dashboardService, /getSettingsOverview/);
assert.match(dashboardService, /loadActionCenter/);
assert.match(dashboardService, /getIntegrationSummary/);
assert.match(dashboardService, /loadDashboardApprovalRecords/);
assert.match(dashboardService, /getUnifiedSourceSummariesForApprovals/);
// Never a second, invented compliance/risk formula - only real riskLevel
// values grouped, no numeric threshold invented.
assert.doesNotMatch(dashboardService, /100 - \(\(/); // the old fabricated complianceScore shape
assert.doesNotMatch(dashboardService, /18\.6/); // the old fabricated avg-approval-time fallback

// Tenant isolation: every query is scoped by the caller-supplied
// organizationId (from the server-resolved viewer), never re-derived from a
// request-controlled value inside this file.
assert.match(dashboardService, /organizationId = viewer\.organizationId/);
assert.doesNotMatch(dashboardService, /searchParams/);

// The single shared date range flows into every date-scoped query - the
// same `range` object backs analytics, the period rows query, and the
// recent-approvals query, so no card can silently render a different window.
assert.match(dashboardService, /getCoreAnalytics\(organizationId, \{ dateRange: range\.dateRange, prevDateRange: range\.prevDateRange \}\)/);
assert.match(dashboardService, /createdAt: \{ gte: range\.dateRange\.from, lte: range\.dateRange\.to \}/);
assert.match(dashboardService, /from: range\.dateRange\.from\.toISOString\(\), to: range\.dateRange\.to\.toISOString\(\)/);

// Pending Approvals KPI and the Open Action Items card both read the same
// Action Center kpis.needsAttention value - they can never disagree about
// what "pending" means.
assert.match(dashboardService, /pendingApprovals: \{ value: actionCenter\?\.kpis\.needsAttention/);

// ─── Part 2b: services/analytics.ts - no fabricated fallback left ──────────

const analytics = read('services/analytics.ts');
assert.doesNotMatch(analytics, /return 18\.6/);
assert.match(analytics, /avgApprovalTimeHours: number \| null/);
assert.match(analytics, /if \(avgTime !== null && avgTime > 48\)/);

// ─── Part 2c: app/dashboard/page.tsx - RBAC, no dead fabrication left ───────

const dashboardPage = read('app/dashboard/page.tsx');

// The old hardcoded "System Health" card (six services always shown as
// green, regardless of real status) must be gone.
assert.doesNotMatch(dashboardPage, /Capture Engine.*AI Classifier.*Integrations.*Data Pipeline/s);
// The old locally-fabricated compliance formula must be gone from the page
// itself - the page only ever reads overview.kpis.complianceScore.value.
assert.doesNotMatch(dashboardPage, /100 - \(\(highRiskApprovals/);

// Organization-only data (Users & Teams, Compliance Frameworks, Workflow
// Performance) is gated to the same roles the real destination pages
// already enforce (lib/rbac.ts's ROUTE_PERMISSIONS), so this page can never
// show a role a summary of something it would be redirected away from.
assert.match(dashboardPage, /canSeeUsers = hasAnyRole\(role, \['AUDITOR', 'MANAGER', 'ADMIN', 'OWNER'\]\)/);
assert.match(dashboardPage, /canSeeCompliance = hasAnyRole\(role, \['ADMIN', 'AUDITOR', 'OWNER'\]\)/);
assert.match(dashboardPage, /canSeeWorkflows = hasAnyRole\(role, \['ADMIN', 'AUDITOR', 'OWNER'\]\)/);

const rbac = read('lib/rbac.ts');
assert.match(rbac, /'\/settings\/users':\s*\['AUDITOR', 'MANAGER', 'ADMIN', 'OWNER'\]/);
assert.match(rbac, /'\/trust\/compliance':\s*\['ADMIN', 'AUDITOR', 'OWNER'\]/);
assert.match(rbac, /'\/playbooks':\s*\['ADMIN', 'AUDITOR', 'OWNER'\]/);

// The page never trusts a client-supplied organizationId/tenantId - the
// only source of tenant identity is the server-resolved getDashboardTenant().
assert.match(dashboardPage, /const tenant = await getDashboardTenant\(/);
assert.doesNotMatch(dashboardPage, /rawParams\.organizationId/);
assert.doesNotMatch(dashboardPage, /rawParams\.tenantId/);

// Recent Approvals reuses the real approval-detail experience (ApprovalTable
// -> ApprovalPreviewPanel), never a second detail system.
assert.match(dashboardPage, /import \{ ApprovalTable, type ApprovalTableRecord \} from '@\/components\/dashboard\/ApprovalTable'/);

// Degraded-data banner uses the existing auto-retry pattern, not a dead link.
assert.match(dashboardPage, /AutoRetryOnDegraded/);

console.log('Validated Organization Dashboard read-model reuse, tenant isolation, shared date range, RBAC gating, and removal of fabricated metrics.');
