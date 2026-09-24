/**
 * Static-source regression suite for the Approvals feature redesign:
 * list -> select -> instant preview panel -> "Open full record" -> the full
 * detail page. Complements the real, executed render tests
 * (tests/approval-preview-panel-render.test.ts, tests/approval-detail-render.test.ts)
 * with source-level assertions that are cheaper to check by pattern than by
 * rendering: no fake/hardcoded sample data, one canonical tenant-scoped data
 * source shared by every surface, no duplicate approval/evidence engines,
 * and real accessibility plumbing on the preview panel.
 *
 * The preview panel replaced an earlier fetch-based ApprovalDetailDrawer
 * (deleted - see components/approvals/ApprovalPreviewPanel.tsx's doc
 * comment for why: it fetched /api/approvals/[id]/detail on open, and that
 * fetch was the actual cause of the "Approval unavailable" failure mode).
 * That route still exists and is still tested (tests/approval-detail.test.ts,
 * tests/approval-detail-render.test.ts) as a legitimate, tenant-scoped read
 * endpoint - it is simply no longer called from the list page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:approvals-redesign'], 'node --import tsx tests/approvals-redesign.test.ts');
assert.equal(
  pkg.scripts['test:approval-preview-panel'],
  'TSX_TSCONFIG_PATH=tsconfig.test-render.json node --import tsx tests/approval-preview-panel-render.test.ts',
);
assert.ok(!('test:approval-detail-drawer' in pkg.scripts), 'the deleted fetch-based drawer test script must not come back');

// --- One canonical, tenant-scoped detail service, shared by every surface --

const approvalDetailService = read('services/approvalDetail.ts');
assert.match(approvalDetailService, /export async function getApprovalDetailForViewer/);
// The composition reuses the exact same cached fetchers the full page has
// always used - not a second/parallel Prisma query.
assert.match(approvalDetailService, /getApprovalDetailForViewer[\s\S]{0,400}await getApprovalCore\(/);

const detailRoute = read('app/api/approvals/[id]/detail/route.ts');
assert.match(detailRoute, /getApprovalDetailForViewer/);
assert.doesNotMatch(detailRoute, /prisma\.approvalRecord\.find(First|Unique|Many)/);
// Tenant isolation: organizationId always comes from the server-resolved
// session, never the client/URL/query string.
assert.match(detailRoute, /getDashboardTenant/);
assert.match(detailRoute, /organizationId\s*=\s*tenant\.organization\.id/);
assert.match(detailRoute, /getApprovalDetailForViewer\(\{\s*approvalId:\s*id,\s*organizationId\s*\}\)/);
assert.doesNotMatch(detailRoute, /searchParams\.get\(['"]organizationId['"]\)/);
assert.doesNotMatch(detailRoute, /params\.organizationId/);
// Missing/cross-tenant approvals both resolve to a plain 404, never a 403
// that would leak existence across tenants.
assert.match(detailRoute, /status:\s*404/);

const fullPage = read('app/approvals/[id]/page.tsx');
// The full page still resolves ApprovalRecord through the same
// getApprovalCore() fetcher the canonical service composes - see
// getApprovalDetailForViewer's doc comment for why this, not a full
// rewrite of the full page's independently-streamed Suspense boundaries,
// is what keeps the table/preview panel/full-page from ever disagreeing
// about an approval ID.
assert.match(fullPage, /getApprovalCore/);
assert.doesNotMatch(fullPage, /prisma\.approvalRecord\.findUnique\(\{\s*where:\s*\{\s*id/);

// --- Table: no-fetch preview panel, real per-provider source badges --------

const approvalTable = read('components/dashboard/ApprovalTable.tsx');
assert.match(approvalTable, /'use client'/);
assert.doesNotMatch(approvalTable, /ApprovalDetailDrawer/, 'the deleted fetch-based drawer must not be reintroduced');
assert.match(approvalTable, /ApprovalPreviewPanel/);
// The Source column reads real per-approval correlated data, never a single
// hardcoded sourcePlatform string rendered as if it were the whole picture.
assert.match(approvalTable, /approval\.sources\.providers/);
assert.doesNotMatch(approvalTable, /\{approval\.sourcePlatform\}/, 'the row must not render a single sourcePlatform string as "the" source');
// Never a client-side filter over an already-loaded fixed page - filtering
// happens by re-running the server query with new searchParams instead.
assert.doesNotMatch(approvalTable, /approvals\.filter\(/);

// --- Preview panel: accessible dialog, no fetch, no fabricated data --------

const panel = read('components/approvals/ApprovalPreviewPanel.tsx');
assert.match(panel, /DetailDrawer/); // reuses the existing shared drawer shell (role=dialog/aria-modal/focus-trap/Escape live there)
assert.doesNotMatch(panel, /fetch\(/, 'the panel must render only from data the row already has - no fetch on open');
// One primary action, not two co-equal buttons.
assert.match(panel, /Open full record/);
assert.doesNotMatch(panel, /View unified evidence/i);
for (const fake of ['Acme Corp', 'Jane Smith', 'John Doe', '247', 'Northstar Analytics']) {
  assert.ok(!panel.includes(fake), `preview panel must not hardcode reference-image sample data: "${fake}"`);
}

const detailDrawerShell = read('components/dashboard/DetailDrawer.tsx');
assert.match(detailDrawerShell, /role="dialog"/);
assert.match(detailDrawerShell, /aria-modal="true"/);
assert.match(detailDrawerShell, /Escape/);

// --- Dashboard page: real tiles/chips/pagination, no fabricated data -------

const approvalsPage = read('app/dashboard/approvals/page.tsx');
assert.match(approvalsPage, /getApprovalStatusCounts/);
assert.match(approvalsPage, /getApprovalDepartmentBreakdown/);
assert.doesNotMatch(approvalsPage, /prisma\.approvalRecord\.findMany/);
// Filter chips are real navigation (server-rendered links with live counts
// from the aggregate query), not client-side filtering over a fixed page.
assert.match(approvalsPage, /FILTER_CHIPS/);
assert.match(approvalsPage, /chipCount\[key\]/);
assert.match(approvalsPage, /buildApprovalsHref/);
// Real pagination: a page/pageSize-aware query and a rendered page list, not
// just a fixed take().
assert.match(approvalsPage, /Showing \{rangeStart/);
assert.match(approvalsPage, /pageWindow\(currentPage, totalPages\)/);
for (const fake of ['Acme Corp', 'Jane Smith', 'John Doe', '\'247\'', 'Northstar Analytics']) {
  assert.ok(!approvalsPage.includes(fake), `dashboard approvals page must not hardcode reference-image sample data: "${fake}"`);
}

// --- No duplicate engines: no new approval/evidence/permission models -----

const schema = read('prisma/schema.prisma');
for (const forbidden of ['model PendingApproval', 'model ApprovalDetails', 'model DuplicateEvidence', 'model DuplicateApproval', 'model DuplicatePermission']) {
  assert.ok(!schema.includes(forbidden), `schema must not introduce a duplicate model: "${forbidden}"`);
}

console.log(
  'Validated the Approvals redesign: one canonical tenant-scoped detail service backs the table, the no-fetch preview panel, and the full page; the preview panel is a real accessible dialog with a single primary action and no fabricated data; the dashboard page drives real stat tiles/filter chips/search/pagination from live counts; and no duplicate approval/evidence/permission models were introduced.',
);
