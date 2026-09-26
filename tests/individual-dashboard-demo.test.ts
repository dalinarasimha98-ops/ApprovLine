import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis coverage (this repo's established pattern - see every
// other tests/*.test.ts file) for the isolated Individual Dashboard demo
// workspace: lib/individual-dashboard-demo.ts. There is no live-database
// test harness in this environment, so real-DB behavior (KPI numbers,
// tenant isolation, reset safety) was verified directly against a scratch
// Postgres instance and is reported in the final validation report rather
// than re-asserted here at runtime.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const demoLib = read('lib/individual-dashboard-demo.ts');
const detection = read('lib/demo-detection.ts');
const cli = read('scripts/seed-individual-dashboard-demo.ts');
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

// ─── Isolation: its own dedicated Organization, never a real customer one ──

assert.match(demoLib, /export const INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG = 'individual-dashboard-demo'/);
assert.match(demoLib, /slug: INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG/);
// The seed function creates a brand-new Organization - it never accepts or
// looks up a caller-supplied organizationId to inject demo data into,
// unlike lib/demo-data.ts's org-wide workspace-demo engine.
assert.match(demoLib, /const organization = await tx\.organization\.create\(/);
assert.doesNotMatch(demoLib, /organizationId:\s*args\.organizationId|function seedIndividualDashboardDemo\([^)]*organizationId/);

// Reset is guarded to the exact demo slug before it ever deletes anything -
// the same pattern services/founderDemoGenerator.ts's
// deleteFounderDemoWorkspace() uses so a real customer Organization can
// never be deleted through this path.
assert.match(demoLib, /where:\s*\{\s*slug:\s*INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG\s*\}/);
assert.match(demoLib, /if \(organization\.slug !== INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG\) return false;/);

// ─── Reuse, not a second engine ─────────────────────────────────────────────

// Confirmation tokens reuse the real helper services/manual-approvals.ts
// already exports (used by the real confirmation-request API route) rather
// than a second, ad hoc token-hashing implementation.
assert.match(demoLib, /import \{ createConfirmationToken \} from '@\/services\/manual-approvals'/);
assert.doesNotMatch(demoLib, /createHash\(|randomBytes\(/);

// Registers into the EXISTING demo-detection convention (isDemoApprovalRecord)
// instead of inventing a second "is this demo data" check.
assert.match(detection, /'individual-dashboard-demo-v'/);
assert.match(demoLib, /correlationId: `\$\{DEMO_RUN_ID\}:/);

// Cache invalidation reuses the existing helper - never a bespoke one.
assert.match(demoLib, /import \{ invalidateApprovalRecordsCache \} from '@\/lib\/approvalRecords'/);

// ─── Real architecture, no fabricated KPI numbers ──────────────────────────
//
// Every ApprovalRecord/ManualApprovalDetail/ApprovalConfirmationRequest/
// AuditLog row is created via a real Prisma write with real relations
// (approverUserId, recorderUserId, requestedByUserId, secondVerifierUserId
// all point at real User rows created in the same transaction) - the
// dashboard's KPIs are then whatever computeKpis()/getIndividualDashboardOverview()
// actually compute from these rows, never a hardcoded number written
// alongside them.
assert.match(demoLib, /tx\.approvalRecord\.create\(/);
assert.match(demoLib, /tx\.manualApprovalDetail\.create\(/);
assert.match(demoLib, /tx\.manualApprovalVersion\.create\(/);
assert.match(demoLib, /tx\.approvalConfirmationRequest\.create\(/);
assert.match(demoLib, /tx\.auditLog\.create\(/);
assert.doesNotMatch(demoLib, /totalApprovals:\s*\d|myPendingApprovals:\s*\d|dueToday:\s*\d|overdue:\s*\d/);

// "Waiting on Others" items never resolve to John's own identity - the
// approver is always the OTHER party, so viewerIdentityWhere() (approverUserId/
// approverEmail/manualDetail.secondVerifierUserId/confirmationRequests.approverEmail)
// can never match John on these rows, keeping them out of My Pending Approvals.
assert.match(demoLib, /requestedByUserId: john\.id,\s*\n\s*expiresAt: daysFromNowAt\(item\.expiresInDays\)/);

// ─── CLI + package.json wiring ──────────────────────────────────────────────

assert.match(cli, /import \{ seedIndividualDashboardDemo, resetIndividualDashboardDemo, INDIVIDUAL_DASHBOARD_DEMO_USER_EMAIL \} from '@\/lib\/individual-dashboard-demo'/);
assert.match(cli, /process\.argv\.includes\('--reset'\)/);
assert.equal(pkg.scripts['seed:individual-dashboard-demo'], 'tsx scripts/seed-individual-dashboard-demo.ts');
assert.equal(pkg.scripts['reset:individual-dashboard-demo'], 'tsx scripts/seed-individual-dashboard-demo.ts --reset');

console.log('Validated the isolated Individual Dashboard demo workspace: dedicated (never-production) Organization, reset guarded to its exact slug, real Prisma writes reusing existing confirmation-token/cache-invalidation/demo-detection helpers, no hardcoded KPI numbers, and CLI + package.json wiring for seed/reset.');
