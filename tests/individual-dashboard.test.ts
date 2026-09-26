import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveIndividualDashboardRange } from '../services/individualDashboard';

// NOTE: matches every other dashboard test in this repo - there is no live-
// database test harness in this environment, so this suite covers (Part 1)
// real executed unit tests against the pure, Clerk/Prisma-independent
// resolveIndividualDashboardRange() logic, and (Part 2) static-analysis of
// the already-written service/view/page source to lock in the
// architectural invariants this build depends on: reuse of Action Center's
// real engine (no duplicate business logic), tenant isolation, RBAC
// gating, one consistent "due" definition, and no fabricated sections for
// capabilities (tasks/mentions/saved items/recently-viewed/demo mode) that
// have no real backing data model in this schema.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// ─── Part 1: resolveIndividualDashboardRange() - real executed logic ───────

{
  const range = resolveIndividualDashboardRange('7d');
  assert.equal(range.key, '7d');
  const spanMs = range.dateRange.to.getTime() - range.dateRange.from.getTime();
  assert.equal(Math.round(spanMs / (24 * 60 * 60 * 1000)), 7);
  assert.equal(range.prevDateRange.to.getTime(), range.dateRange.from.getTime());
}

{
  const range = resolveIndividualDashboardRange('90d');
  assert.equal(range.key, '90d');
  assert.equal(range.label, 'Last 90 days');
}

// Calendar-month presets - genuinely different math than the rolling 7/30/90
// windows (a real month boundary, not "N days ago").
{
  const range = resolveIndividualDashboardRange('thisMonth');
  assert.equal(range.key, 'thisMonth');
  const now = new Date();
  assert.equal(range.dateRange.from.getDate(), 1);
  assert.equal(range.dateRange.from.getMonth(), now.getMonth());
  // Previous period is exactly last calendar month, ending where this
  // month begins - no gap, no overlap.
  assert.equal(range.prevDateRange.to.getTime(), range.dateRange.from.getTime());
}

{
  const range = resolveIndividualDashboardRange('lastMonth');
  assert.equal(range.key, 'lastMonth');
  const now = new Date();
  const expectedFromMonth = (now.getMonth() - 1 + 12) % 12;
  assert.equal(range.dateRange.from.getMonth(), expectedFromMonth);
  assert.equal(range.dateRange.from.getDate(), 1);
  assert.equal(range.dateRange.to.getDate(), 1);
}

// Custom range - real from/to, with a real previous-period comparison
// window of the same length immediately preceding it.
{
  const range = resolveIndividualDashboardRange('custom', '2026-09-01', '2026-09-25');
  assert.equal(range.key, 'custom');
  assert.equal(range.dateRange.from.toISOString().slice(0, 10), '2026-09-01');
  assert.equal(range.dateRange.to.toISOString().slice(0, 10), '2026-09-25');
  assert.equal(range.prevDateRange.to.getTime(), range.dateRange.from.getTime());
}

// Invalid custom range (reversed from/to, or garbage dates) must never
// throw or silently accept nonsense - falls back to the honest 30-day
// default instead.
{
  const range = resolveIndividualDashboardRange('custom', '2026-09-25', '2026-09-01');
  assert.equal(range.key, '30d');
}
{
  const range = resolveIndividualDashboardRange('custom', 'not-a-date', 'also-not-a-date');
  assert.equal(range.key, '30d');
}

// Unknown/garbage/missing range key defaults to 30d rather than throwing -
// a client-tampered `range` query param must never crash the page.
{
  const range = resolveIndividualDashboardRange('not-a-real-range' as never);
  assert.equal(range.key, '30d');
}
{
  const range = resolveIndividualDashboardRange(undefined);
  assert.equal(range.key, '30d');
}

// ─── Part 2: static analysis - reuse, not a second engine ──────────────────

const individualService = read('services/individualDashboard.ts');
const actionCenter = read('services/action-center.ts');

// Reuses Action Center's real, proven engine - never a second definition
// of "pending"/"due"/"overdue," and never a second identity-match/open-
// action predicate.
assert.match(individualService, /import \{ computeKpis, viewerIdentityWhere, openActionWhere, type ActionCenterViewer \} from '@\/services\/action-center'/);
assert.match(individualService, /computeKpis\(viewer, true\)/);
assert.doesNotMatch(individualService, /function viewerIdentityWhere/);
assert.doesNotMatch(individualService, /function openActionWhere/);

// forcePersonalScope defaults to false, so the real Action Center page
// (/dashboard/pending-actions) keeps its exact existing org-wide-for-
// privileged-roles behavior - this is an additive override, not a behavior
// change to the one existing call site.
assert.match(actionCenter, /export async function computeKpis\(viewer: ActionCenterViewer, forcePersonalScope = false\)/);
assert.match(actionCenter, /computeKpis\(viewer\),/); // the one existing call site, unchanged

// "Due Today"/"Overdue"/"Due Soon" all derive from the SAME
// ApprovalConfirmationRequest.expiresAt concept computeKpis already uses -
// never a second "due" definition built from ApprovalRecord.dueDate for
// just this one new list.
assert.match(individualService, /expiresAt: \{ gt: startOfTomorrow, lte: dueSoonHorizon \}/);
assert.doesNotMatch(individualService, /dueDate: \{|select:\s*\{[^}]*dueDate/);

// Reuses the exact same audit-action allowlist and label formatter the
// Organization Dashboard's Recent Activity already uses - never a second,
// possibly-diverging allowlist for "my" activity.
assert.match(individualService, /import \{ MEANINGFUL_AUDIT_ACTIONS, describeAuditAction \} from '@\/services\/dashboard'/);
assert.match(individualService, /action: \{ in: MEANINGFUL_AUDIT_ACTIONS \}/);

// Reuses the same approval-list field shape and source-summary lookup the
// Organization Dashboard's Recent Approvals already uses, so a row here
// opens the identical real approval-detail experience, not a second one.
assert.match(individualService, /import \{ approvalRecordListSelect, type ApprovalListRecord \} from '@\/lib\/approvalRecords'/);
assert.match(individualService, /import \{ getUnifiedSourceSummariesForApprovals, type ApprovalSourceSummary \} from '@\/services\/evidence\/records'/);

// ─── Part 3: tenant isolation + no client-trusted identity ─────────────────

assert.match(individualService, /const organizationId = viewer\.organizationId/);
assert.doesNotMatch(individualService, /searchParams/);

const page = read('app/dashboard/me/page.tsx');
assert.match(page, /const tenant = await getDashboardTenant\(/);
assert.doesNotMatch(page, /rawParams\.organizationId/);
assert.doesNotMatch(page, /rawParams\.userId/);
assert.match(page, /getIndividualDashboardOverview\(\s*\{ organizationId, userId: tenant\.user\.id, email: tenant\.user\.email, role, name: tenant\.user\.name \}/);

// ─── Part 4: RBAC - every role can reach their own personal dashboard ──────

const rbac = read('lib/rbac.ts');
assert.match(rbac, /'\/dashboard\/me': ALL_ROLES/);

// ─── Part 5: view/page split - a pure, renderable presentation layer ───────

const view = read('components/dashboard/IndividualDashboardView.tsx');
assert.doesNotMatch(view, /@clerk|getDashboardTenant|from '@\/lib\/prisma'/);
assert.match(page, /import \{ IndividualDashboardView, str, type RawSearchParams \} from '@\/components\/dashboard\/IndividualDashboardView'/);

// ─── Part 6: no fabricated sections for capabilities with no real data ─────
//
// My Tasks (no task/todo model), Mentions & Requests (no comments/mentions
// model), Recently Viewed (no view-history is ever recorded), Saved/
// Followed Items (no save/follow model), and Demo Mode (no customer-facing
// toggle exists) were all deliberately left out rather than faked - this
// locks that decision in so a future edit can't silently add a fake
// version of any of them back.
assert.doesNotMatch(view, /My Tasks/);
assert.doesNotMatch(view, /Mentions/i);
assert.doesNotMatch(view, /Recently Viewed/i);
assert.doesNotMatch(view, /Saved Items|Followed Items/i);
assert.doesNotMatch(view, /Demo Mode/i);

// ─── Part 7: honest empty states, no fabricated numbers ────────────────────

assert.match(view, /No approvals require your attention right now\./);
assert.match(view, /You&apos;re all caught up\./);
assert.match(view, /Nothing is waiting on another person\./);
assert.match(view, /Your actions will appear here as you work in ApprovLine\./);
assert.match(view, /No comparison available/);

// No graphs - a deliberate product decision (Section 17): this dashboard
// is lists/cards/queues, never a chart.
assert.doesNotMatch(view, /donut|pie chart|<svg viewBox="0 0 42 42"|Chart\(/i);

// ─── Part 8: real responsive bugs found by rendering, not static review ────
//
// Rendering the real component with real seeded data (react-dom/server +
// Playwright at 390/768px, see scripts/render-individual-dashboard-preview.mjs)
// surfaced a real horizontal-overflow bug, now fixed:
//
// The root <section> (and its xl:grid-cols-12 child rows) used `grid` with
// no explicit base column count - only responsive variants
// (sm:/xl:grid-cols-N). Below those breakpoints, CSS Grid's implicit
// column falls back to content-based `auto` sizing instead of being
// clamped to the container's width, so a longer label than the
// Organization Dashboard ever happened to use ("Awaiting My Response",
// "No comparison available") was enough to expose a structural gap that
// had been silently present all along. Fixed by giving every grid row an
// explicit `grid-cols-1` base, which uses `minmax(0, 1fr)` and is
// genuinely width-constrained.
assert.match(view, /className="grid grid-cols-1 gap-3 text-al-text-secondary"/);
assert.match(view, /className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"/);
assert.doesNotMatch(view, /className="grid gap-3 xl:grid-cols-12"/);

// The date-range picker's 6-item pill row (5 presets + Custom - twice the
// Organization Dashboard's 3-pill row) also needs to be allowed to wrap
// and shrink, or the same class of overflow returns the moment a
// narrower viewport can't fit it on one line.
const rangePicker = read('components/dashboard/IndividualRangePicker.tsx');
assert.match(rangePicker, /flex min-w-0 flex-wrap items-center/);

console.log('Validated the Individual User Dashboard: real Action Center reuse (forced personal scope, no duplicate engine), one consistent confirmation-expiry "due" definition across Due Today/Overdue/Due Soon, tenant isolation, RBAC (every role reachable), a pure renderable view layer, honest empty states, no fabricated metrics, no fake sections for My Tasks/Mentions/Recently Viewed/Saved Items/Demo Mode, and a real horizontal-overflow bug found and fixed by rendering with real data at mobile width.');
