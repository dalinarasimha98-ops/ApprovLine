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

// ─── Part 2c: app/dashboard/page.tsx + the view it renders ──────────────────
//
// app/dashboard/page.tsx is now a thin Server Component wrapper (tenant
// resolution + data fetching only); every card/KPI/RBAC-gate lives in the
// pure, Clerk-independent components/dashboard/OrganizationDashboardView.tsx
// it renders - split out specifically so the view can be rendered directly
// (react-dom/server's renderToStaticMarkup) with real seeded data for
// visual/responsive verification without live Clerk credentials.

const dashboardPage = read('app/dashboard/page.tsx');
const dashboardView = read('components/dashboard/OrganizationDashboardView.tsx');

// The old hardcoded "System Health" card (six services always shown as
// green, regardless of real status) must be gone.
assert.doesNotMatch(dashboardView, /Capture Engine.*AI Classifier.*Integrations.*Data Pipeline/s);
// The old locally-fabricated compliance formula must be gone from the
// render layer - it only ever reads overview.kpis.complianceScore.value.
assert.doesNotMatch(dashboardView, /100 - \(\(highRiskApprovals/);

// Organization-only data (Users & Teams, Compliance Frameworks, Playbook
// Status) is gated to the same roles the real destination pages already
// enforce (lib/rbac.ts's ROUTE_PERMISSIONS), so this page can never show a
// role a summary of something it would be redirected away from.
assert.match(dashboardView, /canSeeUsers = hasAnyRole\(role, \['AUDITOR', 'MANAGER', 'ADMIN', 'OWNER'\]\)/);
assert.match(dashboardView, /canSeeCompliance = hasAnyRole\(role, \['ADMIN', 'AUDITOR', 'OWNER'\]\)/);
assert.match(dashboardView, /canSeeWorkflows = hasAnyRole\(role, \['ADMIN', 'AUDITOR', 'OWNER'\]\)/);

const rbac = read('lib/rbac.ts');
assert.match(rbac, /'\/settings\/users':\s*\['AUDITOR', 'MANAGER', 'ADMIN', 'OWNER'\]/);
assert.match(rbac, /'\/trust\/compliance':\s*\['ADMIN', 'AUDITOR', 'OWNER'\]/);
assert.match(rbac, /'\/playbooks':\s*\['ADMIN', 'AUDITOR', 'OWNER'\]/);

// The page never trusts a client-supplied organizationId/tenantId - the
// only source of tenant identity is the server-resolved getDashboardTenant().
assert.match(dashboardPage, /const tenant = await getDashboardTenant\(/);
assert.doesNotMatch(dashboardPage, /rawParams\.organizationId/);
assert.doesNotMatch(dashboardPage, /rawParams\.tenantId/);
assert.match(dashboardPage, /getDashboardOverview\(\s*\{ organizationId, userId: tenant\.user\.id, email: tenant\.user\.email, role \}/);

// Recent Approvals reuses the real approval-detail experience (ApprovalTable
// -> ApprovalPreviewPanel), never a second detail system.
assert.match(dashboardView, /import \{ ApprovalTable, type ApprovalTableRecord \} from '@\/components\/dashboard\/ApprovalTable'/);

// Degraded-data banner uses the existing auto-retry pattern, not a dead link.
assert.match(dashboardView, /AutoRetryOnDegraded/);

// ─── Part 3: final hardening pass - no misleading values, real semantics ──

// Compliance Score never shows a numeric value (the underlying formula
// would report a misleading 100% for an org with zero qualifying
// approvals in the period) without a real-data gate.
assert.match(dashboardService, /value: analytics && analytics\.approvals\.total > 0 \? analytics\.complianceScore : null/);
assert.match(dashboardView, /overview\.kpis\.complianceScore\.value !== null \? `\$\{overview\.kpis\.complianceScore\.value\}%` : 'Not enough data'/);
assert.match(dashboardView, /No qualifying approvals in this period/);

// Top Integrations never implies "X of Y possible" when X can legitimately
// exceed Y (multiple connected accounts of the same catalog provider) -
// two separate facts, not a fraction, and worded identically to
// Organization Settings' own connected/catalog KPI (SettingsShell.tsx).
assert.doesNotMatch(dashboardView, /overview\.integrations\.connectedCount\} of \$\{overview\.integrations\.nativeCatalogSize\} connected/);
assert.match(dashboardView, /overview\.integrations\.connectedCount\} connected · \$\{overview\.integrations\.nativeCatalogSize\} in catalog/);
const settingsShellSource = read('components/settings/SettingsShell.tsx');
assert.match(settingsShellSource, /connectedIntegrations\} connected · \$\{data\.kpis\.integrationsInCatalog\} in catalog/);

// Playbook card never claims to measure "performance" from a document
// listing alone - real per-playbook rates come only from actually-run
// ApprovalComplianceEvaluation rows (never fabricated), and the card falls
// back to a real status chip (never a fake percentage) when a playbook has
// never been evaluated.
assert.match(dashboardView, /Playbook Status/);
assert.doesNotMatch(dashboardView, /Workflow Performance/);
assert.match(dashboardService, /approvalComplianceEvaluation\.findMany/);
assert.match(dashboardService, /complianceRate: evaluations \? Math\.round\(evaluations\.sum \/ evaluations\.count\) : null/);

// Compliance Frameworks card uses the exact same isEnabled -> label mapping
// the real Compliance Hub uses (ComplianceHubShell.tsx), so the same
// framework can never read "Active" on one page and something else here.
const complianceHubShell = read('components/compliance/ComplianceHubShell.tsx');
assert.match(complianceHubShell, /fw\.isEnabled \? '● Active' : '○ Inactive'/);
assert.match(dashboardView, /framework\.isEnabled \? 'Active' : 'Inactive'/);
assert.doesNotMatch(dashboardView, /'Compliant'/); // never a certification claim from isEnabled alone

// Recent Activity is filtered to a real allowlist of customer-meaningful
// audit actions - never an unfiltered tail that could surface Founder
// Console actions (customer.*, founder_demo.*, pilot.*) on the customer
// dashboard, or drown real events in low-value personal-preference noise.
assert.match(dashboardService, /MEANINGFUL_AUDIT_ACTIONS/);
assert.match(dashboardService, /action: \{ in: MEANINGFUL_AUDIT_ACTIONS \}/);
assert.doesNotMatch(dashboardService, /'THEME_PREFERENCE_UPDATED'/);
assert.doesNotMatch(dashboardService, /'customer\./);
assert.doesNotMatch(dashboardService, /'founder_demo\./);
assert.doesNotMatch(dashboardService, /'pilot\./);

// Plan & Usage card: real billing source (services/settings.ts's
// CustomerAccount-backed billing, the same one Organization Settings'
// Billing & Plan tab reads), real plan-catalog limits (lib/plans.ts's
// commercialPlans), no invented MRR/ARR/invoice/renewal-date field, and
// gated to the same roles that can reach the real Billing & Plan tab.
assert.match(dashboardView, /Plan & Usage/);
assert.match(dashboardView, /canSeeBilling = hasAnyRole\(role, \['ADMIN', 'OWNER'\]\)/);
assert.match(dashboardView, /Plan not provisioned/);
assert.doesNotMatch(dashboardView, /overview\.billing\.mrr|overview\.billing\.arr|estimatedArrUsd|renewalDate|invoiceAmount/);
assert.match(dashboardService, /commercialPlans\[settings\.billing\.planTier\]/);

// "Manage Plan" deep-links to the real Billing & Plan tab, which now
// actually honors the ?tab= param instead of always opening on Overview.
assert.match(dashboardView, /href="\/dashboard\/settings\?tab=billing"/);
assert.match(settingsShellSource, /searchParams\.get\('tab'\)/);
assert.match(settingsShellSource, /useState<Tab>\(initialTab\)/);

// ─── Part 3b: found via real Playwright rendering, not static review ───────
//
// Rendering the real component with real seeded data (react-dom/server +
// Playwright screenshots, see scripts/render-dashboard-preview.mjs) surfaced
// two real bugs no static-source review had caught:

// 1. The Approvals by Category donut's center total came from the separate
// totalApprovals KPI (a different query, getCoreAnalytics) while its slices
// came from the categories aggregate (a direct ApprovalRecord groupBy) -
// the screenshot showed "0 Total" in the center while the slice percentages
// summed to a real, populated 100%, exactly the "chart total and KPI total
// must not disagree" failure mode. Fixed to derive the total from the
// slices themselves, the same pattern Risk Distribution already used.
assert.match(dashboardView, /total=\{overview\.categories\.reduce\(\(sum, c\) => sum \+ c\.count, 0\)\}/);
assert.doesNotMatch(dashboardView, /total=\{overview\.kpis\.totalApprovals\.value\}/);

// 2. The date-range and chart-granularity segmented controls had no
// explicit focus-visible ring, unlike every other interactive control in
// this design system (e.g. components/dashboard/ApprovalTable.tsx's
// buttons) - relying on the browser's bare default outline instead.
assert.match(dashboardView, /focus-visible:ring-2 focus-visible:ring-al-accent/);

// ─── Part 4: view/page split - a pure, renderable presentation layer ───────
//
// The view component takes plain props (no Clerk, no Prisma), so it can be
// rendered directly with react-dom/server for visual verification without
// live Clerk credentials (see scripts/render-dashboard-preview.mjs).
assert.doesNotMatch(dashboardView, /@clerk|getDashboardTenant|from '@\/lib\/prisma'/);
assert.match(dashboardPage, /import \{ OrganizationDashboardView, str, type RawSearchParams \} from '@\/components\/dashboard\/OrganizationDashboardView'/);

// ─── Part 5: production incident regression guard - connection pool ────────
//
// A production incident (ApprovalQueryCircuitOpenError on GET /dashboard,
// plus an unrelated /dashboard/settings/integrations request timing out
// fetching a pool connection) traced back to this file: getCoreAnalytics,
// getSettingsOverview, and loadActionCenter each internally fan out into
// 7-14 of their own parallel Prisma queries, and the original version of
// this function fired all three of those PLUS this file's own ~7 queries
// inside one Promise.all - 40+ simultaneous connection requests against
// this app's connection_limit of 5 (see lib/env.ts's
// normalizeDatabaseUrlForPrisma), starving every other concurrent request
// on the shared pool, not just this page. Fixed by awaiting the three
// composite calls one at a time and batching only this file's own smaller
// queries together. This must never regress back to a single combined
// Promise.all, and getIntegrationSummary/getApprovalStatusCounts must
// never be re-fetched here now that getSettingsOverview/actionCenter
// already provide the same numbers.
assert.doesNotMatch(dashboardService, /const \[\s*analytics,\s*settings,\s*actionCenter,/);
assert.match(dashboardService, /const analytics = await safe\('dashboard:coreAnalytics'/);
assert.match(dashboardService, /const settings = await safe\('dashboard:settingsOverview'/);
assert.match(dashboardService, /const actionCenter = await safe<ActionCenterResult \| null>\('dashboard:actionCenter'/);
assert.doesNotMatch(dashboardService, /getIntegrationSummary\(organizationId\)/);
assert.doesNotMatch(dashboardService, /getApprovalStatusCounts\(organizationId\)/);
assert.doesNotMatch(dashboardService, /import \{[^}]*getIntegrationSummary/);
assert.doesNotMatch(dashboardService, /import \{[^}]*getApprovalStatusCounts/);
assert.match(dashboardService, /connectedCount: settings\?\.kpis\.connectedIntegrations \?\? 0/);

console.log('Validated Organization Dashboard read-model reuse, tenant isolation, shared date range, RBAC gating, honest empty states, real integration/playbook/compliance semantics, filtered activity feed, a real Plan & Usage card, and bounded connection-pool concurrency.');
