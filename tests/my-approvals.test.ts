import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  derivePersonalStatus,
  viewerConfirmationRequest,
  priorityBucket,
  sortRows,
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

// ─── priorityBucket: a real, deterministic bucket order — never a
//     fabricated priority score ─────────────────────────────────────────────

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const TODAY_LATER = new Date('2026-06-15T18:00:00Z');
const YESTERDAY = new Date('2026-06-14T12:00:00Z');
const IN_5_DAYS = new Date('2026-06-20T12:00:00Z');
const IN_30_DAYS = new Date('2026-07-15T12:00:00Z');

assert.equal(
  priorityBucket(mkRow({ confirmationRequests: [{ expiresAt: YESTERDAY, approverEmail: EMAIL }] }), NOW, EMAIL),
  0,
  'overdue open item sorts first',
);
assert.equal(
  priorityBucket(mkRow({ confirmationRequests: [{ expiresAt: TODAY_LATER, approverEmail: EMAIL }] }), NOW, EMAIL),
  1,
  'due today',
);
assert.equal(
  priorityBucket(mkRow({ confirmationRequests: [{ expiresAt: IN_5_DAYS, approverEmail: EMAIL }] }), NOW, EMAIL),
  2,
  'due within the 14-day due-soon horizon',
);
// A due date beyond the horizon falls back to the risk-level bucket, not "due soon".
assert.equal(
  priorityBucket(mkRow({ riskLevel: 'high', confirmationRequests: [{ expiresAt: IN_30_DAYS, approverEmail: EMAIL }] }), NOW, EMAIL),
  3,
  'far-future due date is not due-soon; falls through to open high-risk bucket',
);
assert.equal(priorityBucket(mkRow({ riskLevel: 'critical' }), NOW, EMAIL), 3, 'open + critical risk, no due date');
assert.equal(priorityBucket(mkRow({ riskLevel: 'low' }), NOW, EMAIL), 4, 'open, no due date, not high/critical risk');
assert.equal(priorityBucket(mkRow({ status: 'APPROVED', riskLevel: 'critical' }), NOW, EMAIL), 5, 'closed records always sort last, regardless of risk');
assert.equal(priorityBucket(mkRow({ status: 'REJECTED' }), NOW, EMAIL), 5, 'closed records always sort last');
// A confirmation addressed to someone else must not make this row look overdue.
assert.equal(
  priorityBucket(mkRow({ riskLevel: 'low', confirmationRequests: [{ expiresAt: YESTERDAY, approverEmail: 'someone-else@example.com' }] }), NOW, EMAIL),
  4,
  'another recipient\'s overdue confirmation must never leak into this viewer\'s urgency bucket',
);

// ─── sortRows: deterministic, stable, and real for every supported sort ────

{
  const overdue = mkRow({ confirmationRequests: [{ expiresAt: YESTERDAY, approverEmail: EMAIL }], occurredAt: new Date('2026-01-01') });
  const dueSoon = mkRow({ confirmationRequests: [{ expiresAt: IN_5_DAYS, approverEmail: EMAIL }], occurredAt: new Date('2026-02-01') });
  const closedNewer = mkRow({ status: 'APPROVED', occurredAt: new Date('2026-03-01'), updatedAt: new Date('2026-05-01') });
  const closedOlder = mkRow({ status: 'REJECTED', occurredAt: new Date('2026-01-15'), updatedAt: new Date('2026-01-20') });

  const priorityOrder = sortRows([closedOlder, dueSoon, closedNewer, overdue], 'priority', NOW, EMAIL);
  assert.deepEqual(priorityOrder, [overdue, dueSoon, closedNewer, closedOlder], 'priority sort: overdue, then due soon, then closed (newest occurredAt first within the tie)');

  const newestOrder = sortRows([overdue, closedNewer, dueSoon, closedOlder], 'newest', NOW, EMAIL);
  assert.deepEqual(newestOrder, [closedNewer, dueSoon, closedOlder, overdue]);

  const oldestOrder = sortRows([overdue, closedNewer, dueSoon, closedOlder], 'oldest', NOW, EMAIL);
  assert.deepEqual(oldestOrder, [overdue, closedOlder, dueSoon, closedNewer]);

  const lastActivityOrder = sortRows([overdue, closedNewer, dueSoon, closedOlder], 'lastActivity', NOW, EMAIL);
  assert.equal(lastActivityOrder[0], closedNewer, 'most recently updated row sorts first');

  const dueOrder = sortRows([closedNewer, dueSoon, overdue, closedOlder], 'due', NOW, EMAIL);
  assert.deepEqual(dueOrder.slice(0, 2), [overdue, dueSoon], 'items with a real due date always sort before items with none, earliest due date first');
}

// Sorting never mutates the input array in place (the caller's own array
// reference must stay untouched — a defensive-copy requirement any future
// edit to sortRows must preserve).
{
  const a = mkRow({ occurredAt: new Date('2026-01-01') });
  const b = mkRow({ occurredAt: new Date('2026-02-01') });
  const input = [a, b];
  const result = sortRows(input, 'oldest', NOW, EMAIL);
  assert.deepEqual(input, [a, b], 'input array order must be left untouched');
  assert.notEqual(result, input, 'sortRows must return a new array, not the same reference');
}

console.log('Part 1 passed: derivePersonalStatus/viewerConfirmationRequest/priorityBucket/sortRows all behave correctly against real inputs, including the exact-email-match and closed-always-last invariants.');

// Part 2: static-analysis of the already-written service/page/component source.

const myApprovalsService = read('services/myApprovals.ts');
const myApprovalsLib = read('lib/my-approvals.ts');
const approvalsPage = read('app/dashboard/approvals/page.tsx');
const myApprovalsView = read('components/dashboard/MyApprovalsView.tsx');
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

// ─── Test + script wiring ───────────────────────────────────────────────────

assert.equal(pkg.scripts['test:my-approvals'], 'node --import tsx tests/my-approvals.test.ts');
assert.match(myApprovalsView, /getMyApprovalsOverview/);

console.log(
  'Part 2 passed: My Approvals reuses the existing viewer-identity/KPI/filter engine (no second approval engine), scopes every query from the server-resolved tenant (no client-supplied organizationId), uses exact case-insensitive email matching only, keeps the org-wide default behavior fully intact behind an explicit `view=mine` opt-in, never invents a fabricated decision action or audit string, shares one real confirmation-response transition between the public token route and the new authenticated route, extends ApprovalTable additively, and adds a distinct nav entry alongside (not instead of) the existing Approvals/Action Center items.',
);
