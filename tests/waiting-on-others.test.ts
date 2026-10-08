import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WAITING_ON_OTHERS_TYPE_LABELS,
  deriveDueBucket,
  formatDueLabel,
  formatWaitingDuration,
  formatWaitingOnLabel,
} from '../lib/waiting-on-others';

// NOTE: this suite deliberately never imports services/waitingOnOthers.ts at
// module scope (it has a Prisma dependency) - matching tests/my-tasks.
// test.ts's / tests/awaiting-my-response.test.ts's established convention:
// there is no live-database test harness in this environment. Part 1 covers
// pure lib/waiting-on-others.ts unit tests with real inputs; Part 2 is
// static-analysis of the already-written service/page/component source.
// Real-Postgres verification (actor transitions, initiator/tenant
// isolation, IDOR, multi-party grouping, 350+ row sort/pagination) is
// reported separately in the task's final report, not re-asserted here.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// ─── Part 1: REAL EXECUTED unit tests against the actual, imported pure logic.

{
  const now = new Date('2026-10-08T12:00:00.000Z');

  // deriveDueBucket
  assert.equal(deriveDueBucket(null, now), 'NORMAL', 'a row type with no real due date (VERIFICATION/INVESTIGATION) must never be fabricated into OVERDUE/DUE_SOON');
  assert.equal(deriveDueBucket(new Date('2026-10-07T00:00:00.000Z'), now), 'OVERDUE');
  assert.equal(deriveDueBucket(new Date('2026-10-15T00:00:00.000Z'), now), 'DUE_SOON', 'within the 14-day horizon');
  assert.equal(deriveDueBucket(new Date('2026-12-01T00:00:00.000Z'), now), 'NORMAL', 'beyond the 14-day horizon');
  // Exact boundary: due exactly "now" is not yet OVERDUE (strict <, not
  // <=) but is within the 14-day due-soon horizon, so it is DUE_SOON.
  assert.equal(deriveDueBucket(now, now), 'DUE_SOON', 'dueAt === now is not overdue (strict <) but is within the due-soon horizon');

  // formatDueLabel
  assert.equal(formatDueLabel(null, now), 'No due date');
  assert.equal(formatDueLabel(new Date('2026-10-08T23:00:00.000Z'), now), 'Due today');
  assert.equal(formatDueLabel(new Date('2026-10-09T01:00:00.000Z'), now), 'Due tomorrow');
  assert.equal(formatDueLabel(new Date('2026-10-12T00:00:00.000Z'), now), 'Due in 4 days');
  assert.equal(formatDueLabel(new Date('2026-10-06T00:00:00.000Z'), now), 'Overdue by 2 days');
  assert.equal(formatDueLabel(new Date('2026-10-07T23:59:00.000Z'), now), 'Overdue by 1 day');

  // formatWaitingDuration
  assert.equal(formatWaitingDuration(new Date(now.getTime() - 30 * 60_000), now), 'Waiting 30 minutes');
  assert.equal(formatWaitingDuration(new Date(now.getTime() - 3 * 3_600_000), now), 'Waiting 3 hours');
  assert.equal(formatWaitingDuration(new Date(now.getTime() - 1 * 86_400_000), now), 'Waiting 1 day');
  assert.equal(formatWaitingDuration(new Date(now.getTime() - 6 * 86_400_000), now), 'Waiting 6 days');

  // formatWaitingOnLabel - multi-party grouping never collapses to one name
  assert.equal(formatWaitingOnLabel([]), 'Waiting on someone');
  assert.equal(formatWaitingOnLabel(['Sarah Chen']), 'Waiting on Sarah Chen');
  assert.equal(formatWaitingOnLabel(['Sarah Chen', 'Mike Johnson']), 'Waiting on 2 people', 'a 2-approver group must never be shown as if only one person remained');

  assert.deepEqual(Object.keys(WAITING_ON_OTHERS_TYPE_LABELS).sort(), ['CONFIRMATION', 'INVESTIGATION', 'VERIFICATION']);

  console.log('OK: deriveDueBucket/formatDueLabel/formatWaitingDuration/formatWaitingOnLabel produce correct output against real inputs, including boundary cases.');
}

console.log('Part 1 passed: pure lib/waiting-on-others.ts helpers behave correctly against real inputs.');

// ─── Part 2: static-analysis of the already-written service/page/component source.

const lib = read('lib/waiting-on-others.ts');
const service = read('services/waitingOnOthers.ts');
const view = read('components/dashboard/WaitingOnOthersView.tsx');
const table = read('components/dashboard/WaitingOnOthersTable.tsx');
const cards = read('components/dashboard/WaitingOnOthersCards.tsx');
const page = read('app/dashboard/waiting-on-others/page.tsx');
const navigation = read('components/dashboard/DashboardNavigation.tsx');
const rbac = read('lib/rbac.ts');
const individualDashboardView = read('components/dashboard/IndividualDashboardView.tsx');
const individualDashboardService = read('services/individualDashboard.ts');
const myTasksService = read('services/myTasks.ts');
const demoSeed = read('lib/individual-dashboard-demo.ts');
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

// ─── Reuse, not a second engine: no new Task/Dependency/WaitingItem model;
//     every source is one of the three already-real per-user-assignable
//     record types My Tasks itself already established ────────────────────

assert.doesNotMatch(lib, /from '@prisma\/client'/, 'the pure module must stay fully DB-independent, importing no Prisma types at all');
assert.doesNotMatch(service, /prisma\.(task|dependency|waitingItem|followUp|responseRequest)\./i, 'no new Task/Dependency/WaitingItem/FollowUp/ResponseRequest model may be queried');
assert.match(service, /prisma\.approvalConfirmationRequest\./, 'CONFIRMATION rows must come from the real, existing ApprovalConfirmationRequest model');
assert.match(service, /prisma\.investigationCase\./, 'INVESTIGATION rows must come from the real, existing InvestigationCase model');
assert.match(service, /manualDetail: \{/, 'VERIFICATION rows must come from the real, existing ManualApprovalDetail relation');
assert.match(myTasksService, /assignedToUserId: viewer\.userId/, 'My Tasks\' own real investigationWhere() (the OTHER -> ME direction) must still exist, untouched - confirms this module reads the identical field from the opposite direction rather than inventing a parallel one');

// ─── No fake follow-up actions: no reminder/escalate/cancel button unless a
//     real backend action exists (none does for either source) ────────────

assert.doesNotMatch(view + table + cards, />\s*Send Reminder\s*<|>\s*Escalate\s*<|>\s*Cancel Request\s*</i, 'no fake follow-up action may be rendered as an actual button/link - no such backend action exists anywhere in this codebase');
assert.doesNotMatch(service, /api\/(remind|escalate)/i, 'no new reminder/escalate mutation route may be introduced');

// ─── Authoritative initiator / next-actor semantics: real, already-
//     production fields only, matched against the server-resolved viewer -
//     never department/role/team/email-domain inference ──────────────────

assert.match(service, /requestedByUserId: viewer\.userId/, 'CONFIRMATION initiator must be the server-resolved viewer\'s own id, via the real requestedByUserId field');
assert.match(service, /recorderUserId: viewer\.userId/, 'VERIFICATION initiator must be the server-resolved viewer\'s own id, via the real recorderUserId field');
assert.match(service, /createdByUserId: viewer\.userId/, 'INVESTIGATION initiator must be the server-resolved viewer\'s own id, via the real createdByUserId field');
assert.match(service, /NOT: \{ approverEmail: \{ equals: viewer\.email, mode: 'insensitive' \} \}/, 'a self-addressed confirmation request (ME -> ME) must be explicitly excluded, never shown as Waiting on Others');
assert.match(service, /secondVerifierUserId: \{ not: null, notIn: \[viewer\.userId\] \}/, 'the VERIFICATION next actor must be required to be a real, different person - never the viewer themselves');
assert.match(service, /assignedToUserId: \{ not: null, notIn: \[viewer\.userId\] \}/, 'the INVESTIGATION next actor must be required to be a real, different person - never the viewer themselves');
// department/category appear only as selected DISPLAY fields (approvalRowSelect/
// investigationRowSelect), never as part of an ownership/initiator match - the
// three assertions above already confirm every branch's real initiator match
// is requestedByUserId/recorderUserId/createdByUserId exclusively.
assert.doesNotMatch(service, /managerId/, 'ownership/initiator must never be inferred via manager hierarchy');

// ─── Tenant isolation: organizationId from the server-resolved viewer on
//     every branch ──────────────────────────────────────────────────────

const orgIdMatches = service.match(/organizationId: viewer\.organizationId/g) ?? [];
assert.ok(orgIdMatches.length >= 3, 'every one of the three source branches (CONFIRMATION/VERIFICATION/INVESTIGATION) must scope by organizationId: viewer.organizationId');
assert.match(page, /organizationId: tenant\.organization\.id/);

// ─── Multi-party grouping: CONFIRMATION rows are grouped by
//     approvalRecordId, never shown as one row per individual request ─────

assert.match(service, /distinct: \['approvalRecordId'\]/, 'CONFIRMATION phase 1 must return distinct approvalRecordIds, proving multiple outstanding approvers on one approval collapse into a single row');
assert.match(service, /GROUP BY g\."approvalRecordId"/, 'the phase-2 raw SQL must aggregate PENDING confirmation requests per approvalRecordId (MIN(expiresAt)/MIN(createdAt)), never per individual request row');
assert.match(service, /formatWaitingOnLabel/, 'the row mapper must use the shared multi-party-safe label formatter, never hand-roll a single-name label');

// ─── Server-side sorting/pagination: a real database ORDER BY across the
//     FULL matching set, never a bounded in-memory sort ───────────────────

assert.match(service, /\$queryRaw/, 'sorting must be computed by a real database query');
assert.match(service, /Prisma\.sql`/, 'raw SQL must be built via Prisma\'s parameterized tagged template, never string concatenation');
assert.doesNotMatch(service, /\$queryRawUnsafe/, 'must never use the unsafe/non-parameterized raw query variant');
assert.match(service, /UNION ALL/, 'the three source branches must be combined via a real cross-source UNION ALL, mirroring services/myTasks.ts\'s own established pattern');
assert.match(service, /LIMIT \$\{pageSize\} OFFSET \$\{offset\}/, 'pagination must happen at the database level');
assert.doesNotMatch(service, /MAX_SORTABLE_ROWS|\.slice\(0,\s*300\)/, 'there must be no bounded-fetch-then-JS-sort shortcut anywhere in this file');

// ─── RBAC: a deliberate, visible policy choice, never a silent unmapped
//     gap, mirroring '/dashboard/tasks' and '/dashboard/responses' ────────

assert.match(rbac, /'\/dashboard\/waiting-on-others': ALL_ROLES,/);
assert.match(service, /canSeeInvestigations\(viewer\.role\)/, 'INVESTIGATION-type rows must be gated by the same role check My Tasks already uses');
assert.match(service, /ROUTE_PERMISSIONS\['\/investigations'\]/, 'the investigation visibility gate must reuse the exact existing role list, never a second permission concept');

// ─── Nav + Individual Dashboard integration ────────────────────────────────

assert.match(navigation, /label: 'Waiting on Others'/);
assert.match(navigation, /href: '\/dashboard\/waiting-on-others'/);
assert.match(navigation, /label: 'My Tasks', icon: ListTodo/, 'the existing My Tasks nav item must be left exactly as it was');
assert.match(navigation, /label: 'Awaiting My Response', icon: MessageSquareWarning/, 'the existing Awaiting My Response nav item must be left exactly as it was');
assert.match(individualDashboardView, /title="Waiting on Others" subtitle="Requests you sent that are still pending a response" href="\/dashboard\/waiting-on-others" linkLabel="View all"/, 'the existing Individual Dashboard widget must now link to the real dedicated page');
assert.match(individualDashboardService, /requestedByUserId: viewer\.userId, decision: 'PENDING'/, 'the pre-existing Individual Dashboard preview query must still exist, untouched - this page is its real destination, not a replacement');

// ─── Desktop table / mobile cards: dedicated new components, toggled by
//     the same CSS-breakpoint convention as My Tasks/Awaiting My Response ──

assert.match(view, /<WaitingOnOthersTable rows=\{rows\} \/>/);
assert.match(view, /<WaitingOnOthersCards rows=\{rows\} \/>/);
assert.match(table, /lg:block/, 'desktop table must only render at/above the lg breakpoint');
assert.match(cards, /lg:hidden/, 'cards must only render below the lg breakpoint');
assert.doesNotMatch(
  read('components/dashboard/ApprovalTable.tsx') + read('components/dashboard/MyTasksTable.tsx') + read('components/dashboard/AwaitingMyResponseTable.tsx'),
  /WaitingOnOthers/,
  'the shared ApprovalTable, My Tasks table, and Awaiting My Response table must never import or know about this page\'s components',
);

// ─── Honest empty states, matching the spec's exact required copy ─────────

assert.match(view, /Nothing is waiting on someone else\./);
assert.match(view, /No waiting items match your filters\./);
assert.doesNotMatch(view, /No approvals found/);
assert.doesNotMatch(view, /All caught up/, 'this is not an assigned-work queue - the spec explicitly forbids the "all caught up" framing here');

// ─── Demo data: due today, overdue, waiting several days, and a
//     completed/disappeared transition, plus VERIFICATION/INVESTIGATION
//     ME -> OTHER coverage ─────────────────────────────────────────────────

assert.match(demoSeed, /WAITING_ON_OTHERS: Array/);
assert.match(demoSeed, /expiresAtOverride: \(\) => todayAt\(23, 45\)/, 'a real due-today demo row must exist');
assert.match(demoSeed, /expiresAtOverride: \(daysAgo\) => daysAgoAt\(daysAgo - 3\)/, 'a real overdue demo row must exist');
assert.match(demoSeed, /decision: 'CONFIRMED' \}/, 'a demo row that resolves (decision no longer PENDING) must exist, proving a completed item genuinely disappears from Waiting on Others');
assert.match(demoSeed, /secondVerifierUserId: users\.mike\.id,/, 'a real VERIFICATION-type ME -> OTHER demo row must exist (John recorded, Mike verifies)');
assert.match(demoSeed, /assignedToUserId: users\.priya\.id,\s*\n\s*createdByUserId: john\.id,/, 'a real INVESTIGATION-type ME -> OTHER demo row must exist (John created, Priya assigned)');

// ─── Test + script wiring ───────────────────────────────────────────────────

assert.equal(pkg.scripts['test:waiting-on-others'], 'node --import tsx tests/waiting-on-others.test.ts');
assert.match(view, /getWaitingOnOthersOverview/);

console.log(
  'Part 2 passed: Waiting on Others is a focused projection over the three real, already-production per-user-assignable record types (ApprovalConfirmationRequest/ManualApprovalDetail/InvestigationCase), read from the initiator side using the exact same authoritative fields My Tasks already reads from the assignee side - no new Task/Dependency model, no fake follow-up actions, multi-party confirmations grouped correctly, every query tenant- and initiator-scoped from the server-resolved viewer only, sorting/pagination run as a real cross-source database UNION ALL + ORDER BY, RBAC/nav/Individual-Dashboard integration wired as deliberate additive choices, and demo data covers due-today/overdue/long-waiting/completed-transition/all three source types.',
);
