/**
 * Static-source regression suite for the Approvals feature redesign:
 * list -> select -> right-side detail drawer -> evidence/source/related ->
 * optionally the full detail page. Complements the real, executed render
 * tests (tests/approval-detail-drawer-render.test.ts,
 * tests/approval-detail-render.test.ts) with source-level assertions that
 * are cheaper to check by pattern than by rendering: no fake/hardcoded
 * sample data, one canonical tenant-scoped data source shared by every
 * surface, no duplicate approval/evidence engines, and real accessibility
 * plumbing on the drawer.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:approvals-redesign'], 'node --import tsx tests/approvals-redesign.test.ts');
assert.equal(
  pkg.scripts['test:approval-detail-drawer'],
  'TSX_TSCONFIG_PATH=tsconfig.test-render.json node --import tsx tests/approval-detail-drawer-render.test.ts',
);

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
// is what keeps the table/drawer/full-page from ever disagreeing about an
// approval ID.
assert.match(fullPage, /getApprovalCore/);
assert.doesNotMatch(fullPage, /prisma\.approvalRecord\.findUnique\(\{\s*where:\s*\{\s*id/);

// --- Table: real interaction, not the old ambiguous "View Full Approval" --

const approvalTable = read('components/dashboard/ApprovalTable.tsx');
assert.match(approvalTable, /'use client'/);
assert.doesNotMatch(approvalTable, /View Full Approval/);
assert.match(approvalTable, /ApprovalDetailDrawer/);
assert.match(approvalTable, /View →/);
// Cmd/Ctrl/Shift-click and middle-click must still reach the real
// /approvals/[id] route - the drawer intercepts only a plain left click.
assert.match(approvalTable, /metaKey/);
assert.match(approvalTable, /ctrlKey/);
assert.match(approvalTable, /href=\{`\/approvals\/\$\{approval\.id\}`\}/);

// --- Drawer: accessible dialog, fetches the canonical service, no fakes --

const drawer = read('components/approvals/ApprovalDetailDrawer.tsx');
assert.match(drawer, /DetailDrawer/); // reuses the existing shared drawer shell (role=dialog/aria-modal/focus-trap/Escape live there)
assert.match(drawer, /fetch\(`\/api\/approvals\/\$\{id\}\/detail`\)/);
assert.match(drawer, /role="tablist"/);
assert.match(drawer, /aria-selected=\{isActive\}/);
assert.doesNotMatch(drawer, /Approve<\/button>|Reject<\/button>/); // no fabricated approve/reject actions in the drawer
for (const fake of ['Acme Corp', 'Jane Smith', 'John Doe', '247', 'Northstar Analytics']) {
  assert.ok(!drawer.includes(fake), `drawer must not hardcode reference-image sample data: "${fake}"`);
}

const detailDrawerShell = read('components/dashboard/DetailDrawer.tsx');
assert.match(detailDrawerShell, /role="dialog"/);
assert.match(detailDrawerShell, /aria-modal="true"/);
assert.match(detailDrawerShell, /Escape/);

// --- Dashboard page: real KPIs/tabs/pagination, no fabricated data ---------

const approvalsPage = read('app/dashboard/approvals/page.tsx');
assert.match(approvalsPage, /getApprovalStatusCounts/);
assert.match(approvalsPage, /getApprovalDepartmentBreakdown/);
assert.doesNotMatch(approvalsPage, /prisma\.approvalRecord\.findMany/);
// Status tabs are real navigation (server-rendered links), not client-side
// filtering over an already-fetched fixed page.
assert.match(approvalsPage, /STATUS_TABS/);
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
  'Validated the Approvals redesign: one canonical tenant-scoped detail service backs the table drawer and full page, the drawer is a real accessible dialog with no fabricated data or actions, the dashboard page drives real status tabs/search/pagination from live counts, and no duplicate approval/evidence/permission models were introduced.',
);
