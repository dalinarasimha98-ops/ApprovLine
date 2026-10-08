import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  derivePersonalStatus,
  viewerConfirmationRequest,
  type MinimalApprovalForMyApprovals,
} from '../lib/my-approvals';

// NOTE: this suite deliberately never imports services/myApprovals.ts at
// module scope (it has a Prisma dependency) — matching tests/action-center.
// test.ts's established convention for the same real reason: there is no
// live-database test harness in this environment (see CLAUDE.md's own "no
// Jest/Vitest runner... no live-database test harness" note). Part 1 covers
// pure lib/my-approvals.ts unit tests with real inputs; Part 2 is
// static-analysis of the already-written service/page/component source.
// Real-Postgres verification (query correctness, tenant isolation,
// pagination) is reported separately in the task's final report, not
// re-asserted here.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

function mkRow(overrides: Partial<MinimalApprovalForMyApprovals> = {}): MinimalApprovalForMyApprovals {
  return {
    status: 'PENDING_REVIEW',
    riskLevel: 'medium',
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    manualDetail: null,
    confirmationRequests: [],
    ...overrides,
  };
}

const EMAIL = 'viewer@example.com';

// Part 1: REAL EXECUTED unit tests against the actual, imported pure logic.

// ─── derivePersonalStatus: a pending confirmation always wins over the raw
//     status, mirroring services/action-center.ts's deriveActionType() ──────

assert.equal(derivePersonalStatus(mkRow({ status: 'PENDING_REVIEW' })), 'PENDING_REVIEW');
assert.equal(derivePersonalStatus(mkRow({ status: 'APPROVED' })), 'APPROVED');
assert.equal(derivePersonalStatus(mkRow({ status: 'REJECTED' })), 'REJECTED');
// Recorded as APPROVED, but still awaiting the named approver's confirmation
// — CONFIRMATION_REQUIRED wins, exactly like Action Center's deriveActionType().
assert.equal(
  derivePersonalStatus(mkRow({ status: 'APPROVED', manualDetail: { verificationStatus: 'PENDING_CONFIRMATION' } })),
  'CONFIRMATION_REQUIRED',
);
assert.equal(
  derivePersonalStatus(mkRow({ status: 'PENDING_REVIEW', manualDetail: { verificationStatus: 'CONFIRMED_BY_APPROVER' } })),
  'PENDING_REVIEW',
);

// ─── viewerConfirmationRequest: never the earliest pending request — only
//     the one genuinely addressed to this viewer's email ───────────────────

{
  const row = mkRow({ confirmationRequests: [{ expiresAt: new Date('2026-02-01'), approverEmail: 'someone-else@example.com' }] });
  assert.equal(viewerConfirmationRequest(row, EMAIL), null, 'a confirmation addressed to someone else must never be attributed to this viewer');
}
{
  const req = { expiresAt: new Date('2026-02-01'), approverEmail: EMAIL.toUpperCase() };
  const row = mkRow({ confirmationRequests: [req] });
  assert.deepEqual(viewerConfirmationRequest(row, EMAIL), req, 'email match must be case-insensitive');
}
assert.equal(viewerConfirmationRequest(mkRow(), EMAIL), null, 'no confirmation request at all -> null, never invented');

// NOTE: priorityBucket()/sortRows() no longer exist in this module — sorting
// moved to a real database ORDER BY (services/myApprovals.ts's
// fetchSortedPageIds(), a single parameterized raw SQL query built in two
// phases so the WHERE clause is never duplicated in SQL) so it is correct
// across the viewer's ENTIRE matching set rather than a bounded in-memory
// sort. There is no pure-JS sort function left to unit-test; its SQL
// equivalent is proven against a real Postgres instance (see the task's
// real-Postgres verification report, which seeds 300+ rows specifically to
// prove a row ordered after row #300 can still sort ahead of row #1).

console.log('Part 1 passed: derivePersonalStatus/viewerConfirmationRequest behave correctly against real inputs, including the exact-email-match invariant.');

// Part 2: static-analysis of the already-written service/page/component source.

const myApprovalsService = read('services/myApprovals.ts');
const myApprovalsLib = read('lib/my-approvals.ts');
const approvalsPage = read('app/dashboard/approvals/page.tsx');
const myApprovalsView = read('components/dashboard/MyApprovalsView.tsx');
const myApprovalCards = read('components/dashboard/MyApprovalCards.tsx');
const manualApprovals = read('services/manual-approvals.ts');
const tokenRoute = read('app/api/confirmations/[token]/route.ts');
const respondRoute = read('app/api/approvals/[id]/confirmations/respond/route.ts');
const approvalDetailPage = read('app/approvals/[id]/page.tsx');
const manualApprovalPanel = read('components/approvals/ManualApprovalPanel.tsx');
const approvalTable = read('components/dashboard/ApprovalTable.tsx');
const navigation = read('components/dashboard/DashboardNavigation.tsx');
const actionCenterService = read('services/action-center.ts');
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

// ─── Reuse, not a second engine ─────────────────────────────────────────────

assert.match(myApprovalsService, /import \{[^}]*computeKpis[^}]*viewerIdentityWhere[^}]*\} from '@\/services\/action-center'/s);
assert.match(myApprovalsService, /import \{[^}]*approvalRecordListSelect[^}]*buildApprovalRecordsWhere[^}]*\} from '@\/lib\/approvalRecords'/s);
assert.match(myApprovalsService, /computeKpis\(viewer, true\)/);
assert.doesNotMatch(myApprovalsLib, /from '@prisma\/client'/, 'the pure derivation/sort module must stay DB-independent, mirroring lib/action-center.ts');

// ─── Tenant isolation: every query starts from the server-resolved
//     organizationId, never a client-supplied value ────────────────────────

assert.match(myApprovalsService, /organizationId: viewer\.organizationId/);
assert.doesNotMatch(myApprovalsService, /organizationId:\s*filters\.organizationId/, 'organizationId must come from the server-resolved viewer, never request filters');
assert.match(approvalsPage, /organizationId: tenant\.organization\.id/);
assert.match(respondRoute, /organizationId: tenant\.organization\.id/);

// ─── Exact-identity matching only — no fuzzy matching ──────────────────────

assert.match(respondRoute, /approverEmail: \{ equals: tenant\.user\.email, mode: 'insensitive' \}/);
assert.doesNotMatch(respondRoute, /department|company|domain/i);

// ─── The default view is unchanged org-wide behavior — "mine" is an
//     explicit opt-in, never a silent default (never remove existing
//     functionality / never break existing deep links) ────────────────────

assert.match(approvalsPage, /str\(rawParams, 'view'\) === 'mine'/);
assert.doesNotMatch(approvalsPage, /str\(rawParams, 'view'\) !== 'all'/, 'the branch condition must gate on an explicit mine request, not default away from all');

// ─── No fabricated decision action: only the three real human-driven
//     mutations exist anywhere (manual approval, confirmation response,
//     second-person verification) ───────────────────────────────────────────

assert.doesNotMatch(myApprovalsService, /APPROVAL_APPROVED|APPROVAL_REJECTED|APPROVAL_CORRECTION_REQUESTED|CONFIRMATION_COMPLETED/, 'these illustrative audit action names were confirmed not to exist in this codebase and must never be invented');
assert.match(manualApprovals, /action: `APPROVER_CONFIRMATION_\$\{input\.decision\}`/);
assert.match(respondRoute, /respondToConfirmation/);
assert.match(manualApprovalPanel, /submitSecondVerification/);
assert.match(manualApprovalPanel, /completeConfirmation/);
assert.match(manualApprovalPanel, /myPendingConfirmation/);

// ─── Shared confirmation state machine: one real transition, two entry
//     points (public token + authenticated in-app), never duplicated ───────

assert.match(manualApprovals, /export async function respondToConfirmation/);
assert.match(tokenRoute, /respondToConfirmation\(confirmation\.id, parsed\.data\)/);
assert.match(respondRoute, /respondToConfirmation\(confirmation\.id, parsed\.data\)/);
assert.doesNotMatch(tokenRoute, /await prisma\.\$transaction/, 'the token route must no longer duplicate the transaction now that it is shared');

// ─── CORRECT confirmation outcome: a real, already-wired
//     ApprovalConfirmationDecision (schema enum + respondToConfirmation +
//     the public ApprovalConfirmationForm), reused in-app with the exact
//     same { summary } correction shape — never a fabricated decision ─────

const confirmationForm = read('components/approvals/ApprovalConfirmationForm.tsx');
const prismaSchema = read('prisma/schema.prisma');
assert.match(prismaSchema, /enum ApprovalConfirmationDecision \{\s*PENDING\s*CONFIRMED\s*REJECTED\s*CORRECTED\s*\}/, 'CORRECTED must already be a real decision value in the schema, not something this task invents');
assert.match(confirmationForm, /correction: \{ summary: correction\.trim\(\) \}/, 'the existing public confirmation form\'s real correction shape');
assert.match(manualApprovalPanel, /decision === 'CORRECTED'/);
assert.match(manualApprovalPanel, /correction = \{ summary: summary\.trim\(\) \}/, 'My Approvals\' in-app Correct action must reuse the exact same { summary } shape, not a new one');
assert.match(manualApprovalPanel, /onClick={\(\) => completeConfirmation\('CORRECTED'\)}/);

// ─── Server-side sorting/pagination: a real database ORDER BY across the
//     FULL matching set, never a bounded in-memory sort ───────────────────

assert.doesNotMatch(myApprovalsService, /MAX_SORTABLE_ROWS/, 'the bounded-fetch-then-JS-sort approach must be fully removed');
assert.match(myApprovalsService, /\$queryRaw/, 'sorting must be computed by a real database query');
assert.match(myApprovalsService, /Prisma\.sql`/, 'raw SQL must be built via Prisma\'s parameterized tagged template, never string concatenation');
assert.match(myApprovalsService, /Prisma\.join\(idList\)/, 'the id allowlist must be passed as parameterized values, never interpolated as a raw string');
// No raw string concatenation of untrusted input into SQL anywhere in this
// file (every ${...} interpolation must be inside a Prisma.sql tagged
// template, which parameterizes automatically) — a plain `+` string build
// feeding $queryRaw/$queryRawUnsafe would be a real SQL-injection surface.
assert.doesNotMatch(myApprovalsService, /\$queryRawUnsafe/, 'must never use the unsafe/non-parameterized raw query variant');
assert.match(myApprovalsService, /WHERE ar\.id IN \(\$\{Prisma\.join\(idList\)\}\)/, 'the raw query must be constrained to the already-tenant-scoped id allowlist from phase 1, never re-deriving its own WHERE clause');
assert.match(myApprovalsService, /LIMIT \$\{pageSize\} OFFSET \$\{offset\}/, 'pagination must happen at the database level');
assert.match(myApprovalsService, /prisma\.approvalRecord\.findMany\(\{ where, select: \{ id: true \} \}\)/, 'phase 1 must reuse the exact same typed `where` as every other query on this page');

// ─── ApprovalTable extension is additive-only — zero behavior change for
//     every existing caller that does not pass the new optional fields ────

assert.match(approvalTable, /showDueColumn\s*=\s*false/);
assert.match(approvalTable, /personalStatus\?:/);
assert.match(approvalTable, /dueAt\?:\s*Date \| null/);

// ─── Nav: a distinct "My Approvals" entry exists, never a reskin of the
//     existing "Approvals" item or Action Center ───────────────────────────

assert.match(navigation, /label: 'My Approvals'/);
assert.match(navigation, /href: '\/dashboard\/approvals\?view=mine'/);
assert.match(navigation, /label: 'Approvals', icon: FileCheck2/, 'the existing org-wide nav item must be left exactly as it was');

// ─── Second-person verification wiring reuses the existing authenticated
//     route and its exact RBAC rule — never a new permission model ────────

assert.match(approvalDetailPage, /currentUserEmail=\{tenant\.user\.email\}/);
assert.match(actionCenterService, /export const ORG_WIDE_VISIBILITY_ROLES/);
assert.match(actionCenterService, /export function hasOrgWideVisibility/);

// ─── Mobile card presentation: a My Approvals-specific component, the
//     shared ApprovalTable is never modified except via its own small,
//     additive exports; both presentations are fed the same server-loaded
//     rows, never a second fetch ──────────────────────────────────────────

assert.match(myApprovalsView, /<div className="hidden lg:block">\s*<ApprovalTable approvals=\{approvalRows\} showDueColumn \/>/, 'desktop table (>=1024px) must stay the existing, untouched ApprovalTable');
assert.match(myApprovalsView, /<MyApprovalCards approvals=\{approvalRows\} \/>/, 'mobile/tablet cards must be fed the exact same approvalRows array, never a separate fetch');
assert.match(myApprovalCards, /lg:hidden/, 'cards must only render below the lg breakpoint, matching the table\'s hidden lg:block');
assert.match(myApprovalCards, /sm:grid-cols-2/, 'a 2-up grid at the sm/tablet breakpoint for a denser "compact" presentation, single-column below it');
assert.match(myApprovalCards, /import \{\s*type ApprovalTableRecord,\s*personalStatusClass,\s*PERSONAL_STATUS_LABELS,\s*dueDateClass,\s*resolvedProviders,\s*\} from '@\/components\/dashboard\/ApprovalTable'/, 'cards must reuse ApprovalTable\'s own exported helpers, never re-derive duplicate status/risk logic');
assert.doesNotMatch(approvalTable, /MyApprovalCards/, 'the shared ApprovalTable must never import or know about the My Approvals-specific card component');
assert.match(myApprovalCards, /approval\.requestedByName \?/, 'requester is shown only when a real one exists, never a fabricated value');
assert.match(myApprovalsService, /requestedByName: r\.manualDetail\?\.recorder\?\.name/, 'requester must come from the real ManualApprovalDetail.recorder, never invented');

// ─── Test + script wiring ───────────────────────────────────────────────────

assert.equal(pkg.scripts['test:my-approvals'], 'node --import tsx tests/my-approvals.test.ts');
assert.match(myApprovalsView, /getMyApprovalsOverview/);

console.log(
  'Part 2 passed: My Approvals reuses the existing viewer-identity/KPI/filter engine (no second approval engine), scopes every query from the server-resolved tenant (no client-supplied organizationId), uses exact case-insensitive email matching only, keeps the org-wide default behavior fully intact behind an explicit `view=mine` opt-in, never invents a fabricated decision action or audit string, shares one real confirmation-response transition between the public token route and the new authenticated route, extends ApprovalTable additively, and adds a distinct nav entry alongside (not instead of) the existing Approvals/Action Center items.',
);
