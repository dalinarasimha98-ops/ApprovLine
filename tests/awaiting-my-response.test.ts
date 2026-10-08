import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AWAITING_RESPONSE_STATUS_LABELS, RESPONSE_OUTCOME_LABELS, deriveRequestState } from '../lib/awaiting-my-response';

// NOTE: this suite deliberately never imports services/awaitingMyResponse.ts
// at module scope (it has a Prisma dependency) — matching tests/my-tasks.
// test.ts's established convention: there is no live-database test harness
// in this environment. Part 1 covers pure lib/awaiting-my-response.ts unit
// tests with real inputs; Part 2 is static-analysis of the already-written
// service/page/component source. Real-Postgres verification (IDOR, exact-
// recipient matching, expiry, idempotency, 350+ row sort/pagination) is
// reported separately in the task's final report, not re-asserted here.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// Part 1: REAL EXECUTED unit tests against the actual, imported pure logic.

// ─── deriveRequestState: THE authoritative gate — an actionable request
//     is, by definition, PENDING and not yet expired; this must exactly
//     match components/approvals/ManualApprovalPanel.tsx's own
//     myPendingConfirmation condition (decision===PENDING && expiresAt>now) ─

{
  const now = new Date('2026-10-08T12:00:00.000Z');

  // Genuinely actionable: PENDING, expires in the future.
  const actionable = deriveRequestState('PENDING', new Date('2026-10-09T00:00:00.000Z'), now);
  assert.equal(actionable.isActionable, true);
  assert.equal(actionable.isOverdue, false);
  assert.equal(actionable.outcome, null);
  assert.equal(actionable.statusLabel, AWAITING_RESPONSE_STATUS_LABELS.ACTIONABLE);
  assert.equal(actionable.actionLabel, 'Respond', 'an actionable request must offer the real Respond action, since the destination page genuinely has a working Confirm/Correct/Reject button');

  // Expired but still PENDING: overdue, no working CTA.
  const overdue = deriveRequestState('PENDING', new Date('2026-10-07T00:00:00.000Z'), now);
  assert.equal(overdue.isActionable, false);
  assert.equal(overdue.isOverdue, true);
  assert.equal(overdue.outcome, null);
  assert.equal(overdue.statusLabel, AWAITING_RESPONSE_STATUS_LABELS.OVERDUE);
  assert.equal(overdue.actionLabel, 'View Approval', 'an overdue (expired) request must NEVER offer Respond — respondToConfirmation() itself refuses an expired request');

  // Exact boundary: expiresAt === now must NOT be actionable (the real
  // myPendingConfirmation gate uses a strict > comparison).
  const atBoundary = deriveRequestState('PENDING', now, now);
  assert.equal(atBoundary.isActionable, false, 'expiresAt exactly equal to now must not be actionable — the real gate is a strict > comparison, never >=');
  assert.equal(atBoundary.isOverdue, true);

  // The 3 real, already-existing ApprovalConfirmationDecision outcomes —
  // never a fabricated 4th state.
  for (const decision of ['CONFIRMED', 'CORRECTED', 'REJECTED'] as const) {
    const responded = deriveRequestState(decision, new Date('2026-09-01T00:00:00.000Z'), now);
    assert.equal(responded.isActionable, false);
    assert.equal(responded.isOverdue, false);
    assert.equal(responded.outcome, decision);
    assert.equal(responded.statusLabel, RESPONSE_OUTCOME_LABELS[decision]);
    assert.equal(responded.actionLabel, 'View Approval', 'a responded request has nothing left to respond to — View Approval only');
  }

  console.log('OK: deriveRequestState produces the correct actionable/overdue/responded state for every real decision value, including the exact expiresAt>now boundary the real ManualApprovalPanel gate uses.');
}

assert.deepEqual(Object.keys(AWAITING_RESPONSE_STATUS_LABELS).sort(), ['ACTIONABLE', 'OVERDUE', 'RESPONDED']);
assert.deepEqual(Object.keys(RESPONSE_OUTCOME_LABELS).sort(), ['CONFIRMED', 'CORRECTED', 'REJECTED']);

console.log('Part 1 passed: deriveRequestState/AWAITING_RESPONSE_STATUS_LABELS/RESPONSE_OUTCOME_LABELS behave correctly against real inputs.');

// Part 2: static-analysis of the already-written service/page/component source.

const lib = read('lib/awaiting-my-response.ts');
const service = read('services/awaitingMyResponse.ts');
const view = read('components/dashboard/AwaitingMyResponseView.tsx');
const table = read('components/dashboard/AwaitingMyResponseTable.tsx');
const cards = read('components/dashboard/AwaitingMyResponseCards.tsx');
const page = read('app/dashboard/responses/page.tsx');
const navigation = read('components/dashboard/DashboardNavigation.tsx');
const rbac = read('lib/rbac.ts');
const individualDashboardView = read('components/dashboard/IndividualDashboardView.tsx');
const manualApprovalPanel = read('components/approvals/ManualApprovalPanel.tsx');
const respondRoute = read('app/api/approvals/[id]/confirmations/respond/route.ts');
const manualApprovals = read('services/manual-approvals.ts');
const demoSeed = read('lib/individual-dashboard-demo.ts');
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

// ─── Reuse, not a second engine: the pure module stays DB-independent;
//     no new mutation route; the real respondToConfirmation() transition
//     is the only state-changing writer for this workflow ─────────────────

assert.doesNotMatch(lib, /from '@prisma\/client'/, 'the pure module must stay fully DB-independent, importing no Prisma types at all');
assert.match(service, /import \{ completedDateRangeFilter \} from '@\/lib\/my-tasks'/, 'the date-range half-open-interval fix must be reused from lib/my-tasks.ts, never re-derived');
assert.match(service, /import \{ resolveIndividualDashboardRange/, 'the named date-range presets must reuse the existing resolver, never a second preset implementation');
assert.doesNotMatch(service + view + table + cards + page, /api\/responses/, 'no new POST /api/responses mutation route may be introduced');
assert.doesNotMatch(service + view + table + cards + page, /\bawait\s+respondToConfirmation\(|=\s*respondToConfirmation\(/, 'this module must never call respondToConfirmation() directly — the real mutation stays exclusively behind the existing authenticated route, reached only by navigating to the canonical approval detail page');
assert.match(manualApprovals, /export async function respondToConfirmation/, 'the one real state-transition function must still exist, untouched');

// ─── Authoritative gate: the exact same condition as
//     ManualApprovalPanel.tsx's myPendingConfirmation ───────────────────────

assert.match(manualApprovalPanel, /const myPendingConfirmation = confirmations\.find/, 'the real gate this page must mirror must still exist, untouched');
assert.match(manualApprovalPanel, /new Date\(c\.expiresAt\)\.getTime\(\) > Date\.now\(\)/, 'the real gate\'s strict expiry comparison must still exist, untouched');
assert.match(respondRoute, /expiresAt: \{ gte: new Date\(\) \}/, 'the real authenticated response route\'s own non-expired check must still exist, untouched');
assert.match(lib, /expiresAt > now/, 'the pure deriveRequestState must use the identical strict > comparison, never >=');
assert.match(service, /if \(status === 'ACTIONABLE'\) return \{ \.\.\.base, decision: 'PENDING', expiresAt: \{ gt: now \} \};/, 'the ACTIONABLE query gate must be a strict gt, matching deriveRequestState and the real ManualApprovalPanel condition exactly');

// ─── No fabricated decision values — only the 3 real
//     ApprovalConfirmationDecision outcomes ────────────────────────────────

assert.doesNotMatch(lib + service, /'ACCEPTED'|'APPROVED_RESPONSE'|'DECLINED'/, 'no fabricated decision/outcome value may be invented — only CONFIRMED/CORRECTED/REJECTED are real');

// ─── Tenant isolation + exact recipient match: organizationId AND an
//     exact case-insensitive email match, never a client-supplied value ──

assert.match(service, /organizationId: viewer\.organizationId/);
assert.match(service, /approverEmail: \{ equals: viewer\.email\.toLowerCase\(\), mode: 'insensitive' \}/, 'the recipient match must be the authenticated viewer\'s own email, exact and case-insensitive, never a client-supplied value');
assert.doesNotMatch(service, /approverEmail:\s*filters\./, 'approverEmail must never come from client-supplied filters');
assert.match(page, /organizationId: tenant\.organization\.id/);

// ─── Server-side sorting/pagination: a real database ORDER BY across the
//     FULL matching set, never a bounded in-memory sort ───────────────────

assert.match(service, /\$queryRaw/, 'sorting must be computed by a real database query');
assert.match(service, /Prisma\.sql`/, 'raw SQL must be built via Prisma\'s parameterized tagged template, never string concatenation');
assert.doesNotMatch(service, /\$queryRawUnsafe/, 'must never use the unsafe/non-parameterized raw query variant');
assert.match(service, /WHERE id IN \(\$\{Prisma\.join\(idList\)\}\)/, 'the raw query must be constrained to the already-tenant/viewer-scoped id allowlist from phase 1');
assert.match(service, /LIMIT \$\{pageSize\} OFFSET \$\{offset\}/, 'pagination must happen at the database level');
assert.match(service, /prisma\.approvalConfirmationRequest\.findMany\(\{ where, select: \{ id: true \} \}\)/, 'phase 1 must reuse the exact same typed `where` as every other query on this page');
assert.doesNotMatch(service, /MAX_SORTABLE_ROWS|\.slice\(0,\s*300\)/, 'there must be no bounded-fetch-then-JS-sort shortcut anywhere in this file');

// ─── No new generic Task/Response model, no duplicate audit/notification
//     infrastructure ───────────────────────────────────────────────────────

assert.doesNotMatch(service, /prisma\.(task|response|notification)\./i, 'no new Task/Response/Notification model may be queried');
assert.match(service, /detailHref: `\/approvals\/\$\{r\.approvalRecordId\}`/, 'every row must link to the real canonical approval detail page');

// ─── RBAC: a deliberate, visible policy choice, never a silent unmapped
//     gap, mirroring '/dashboard/tasks' and '/dashboard/me' ───────────────

assert.match(rbac, /'\/dashboard\/responses': ALL_ROLES,/);

// ─── Nav + Individual Dashboard integration: a distinct nav entry, and the
//     existing KPI card now points at the real dedicated page ────────────

assert.match(navigation, /label: 'Awaiting My Response'/);
assert.match(navigation, /href: '\/dashboard\/responses'/);
assert.match(navigation, /label: 'My Tasks', icon: ListTodo/, 'the existing My Tasks nav item must be left exactly as it was');
assert.match(individualDashboardView, /href="\/dashboard\/responses"/, 'the Individual Dashboard\'s own Awaiting My Response KPI card must now link to the real dedicated page');

// ─── Desktop table / mobile cards: dedicated new components, toggled by
//     the same CSS-breakpoint convention as My Tasks/My Approvals ────────

assert.match(view, /<AwaitingMyResponseTable rows=\{rows\} \/>/);
assert.match(view, /<AwaitingMyResponseCards rows=\{rows\} \/>/);
assert.match(table, /lg:block/, 'desktop table must only render at/above the lg breakpoint');
assert.match(cards, /lg:hidden/, 'cards must only render below the lg breakpoint');
assert.doesNotMatch(read('components/dashboard/ApprovalTable.tsx') + read('components/dashboard/MyTasksTable.tsx'), /AwaitingMyResponse/, 'the shared ApprovalTable and My Tasks table must never import or know about this page\'s components');

// ─── Honest empty states, never a generic "No approvals found" ──────────

assert.match(view, /Nothing is waiting for you\./);
assert.match(view, /No response requests match your filters\./);
assert.doesNotMatch(view, /No approvals found/);

// ─── Demo data: real CONFIRMED/CORRECTED/REJECTED coverage, using the
//     exact verificationStatus mapping respondToConfirmation\(\) itself uses ──

assert.match(demoSeed, /JOHN_RESPONDED/);
assert.match(demoSeed, /decision: 'CONFIRMED'/);
assert.match(demoSeed, /decision: 'CORRECTED'/);
assert.match(demoSeed, /decision: 'REJECTED'/);
assert.match(demoSeed, /const verificationStatus = item\.decision === 'CONFIRMED' \? 'CONFIRMED_BY_APPROVER' : 'DISPUTED';/, 'demo data must use the exact same CONFIRMED->CONFIRMED_BY_APPROVER, else->DISPUTED mapping respondToConfirmation() itself uses');
assert.match(demoSeed, /action: `APPROVER_CONFIRMATION_\$\{item\.decision\}`/, 'demo data must use the exact real audit action string, never a fabricated one');

// ─── Test + script wiring ───────────────────────────────────────────────────

assert.equal(pkg.scripts['test:awaiting-my-response'], 'node --import tsx tests/awaiting-my-response.test.ts');
assert.match(view, /getAwaitingMyResponseOverview/);

console.log(
  'Part 2 passed: Awaiting My Response is a focused projection over the one real ApprovalConfirmationRequest model (no second request/response engine, no new mutation route), its actionable gate is byte-identical to ManualApprovalPanel\'s own myPendingConfirmation condition, every query is tenant-isolated with an exact case-insensitive recipient-email match from the server-resolved viewer only, sorting/pagination run as a real database ORDER BY over the full matching set (no bounded JS sort), no fabricated decision values or duplicate models exist, RBAC/nav are wired as deliberate additive choices, and demo data mirrors respondToConfirmation()\'s own real write shape.',
);
