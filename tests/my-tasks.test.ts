import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MY_TASK_TYPE_LABELS, INVESTIGATION_STATUS_LABELS, isInvestigationOpen } from '../lib/my-tasks';

// NOTE: this suite deliberately never imports services/myTasks.ts at module
// scope (it has a Prisma dependency) — matching tests/my-approvals.test.ts's
// established convention: there is no live-database test harness in this
// environment. Part 1 covers pure lib/my-tasks.ts unit tests with real
// inputs; Part 2 is static-analysis of the already-written service/page/
// component source. Real-Postgres verification (cross-table sort/pagination
// correctness, tenant isolation) is reported separately in the task's final
// report, not re-asserted here.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// Part 1: REAL EXECUTED unit tests against the actual, imported pure logic.

// ─── isInvestigationOpen: only RESOLVED/CLOSED are terminal — OPEN/
//     IN_PROGRESS/ESCALATED are all still open work ────────────────────────

assert.equal(isInvestigationOpen('OPEN'), true);
assert.equal(isInvestigationOpen('IN_PROGRESS'), true);
assert.equal(isInvestigationOpen('ESCALATED'), true);
assert.equal(isInvestigationOpen('RESOLVED'), false);
assert.equal(isInvestigationOpen('CLOSED'), false);

// ─── Labels cover every real enum value — never a silent fallback ─────────

assert.deepEqual(Object.keys(MY_TASK_TYPE_LABELS).sort(), ['CONFIRMATION', 'INVESTIGATION', 'VERIFICATION']);
assert.deepEqual(
  Object.keys(INVESTIGATION_STATUS_LABELS).sort(),
  ['CLOSED', 'ESCALATED', 'IN_PROGRESS', 'OPEN', 'RESOLVED'],
);
assert.equal(INVESTIGATION_STATUS_LABELS.IN_PROGRESS, 'In Progress');

console.log('Part 1 passed: isInvestigationOpen/MY_TASK_TYPE_LABELS/INVESTIGATION_STATUS_LABELS behave correctly against real inputs.');

// Part 2: static-analysis of the already-written service/page/component source.

const myTasksLib = read('lib/my-tasks.ts');
const myTasksService = read('services/myTasks.ts');
const myTasksView = read('components/dashboard/MyTasksView.tsx');
const myTasksTable = read('components/dashboard/MyTasksTable.tsx');
const myTaskCards = read('components/dashboard/MyTaskCards.tsx');
const tasksPage = read('app/dashboard/tasks/page.tsx');
const navigation = read('components/dashboard/DashboardNavigation.tsx');
const rbac = read('lib/rbac.ts');
const dashboardService = read('services/dashboard.ts');
const demoSeed = read('lib/individual-dashboard-demo.ts');
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

// ─── Reuse, not a second engine: pure module stays DB-independent,
//     Investigation visibility reuses the EXACT existing role list ────────

assert.doesNotMatch(myTasksLib, /from '@prisma\/client'$/m, 'the pure module may only import the InvestigationStatus TYPE, never a Prisma client dependency');
assert.match(myTasksService, /import \{ hasAnyRole \} from '@\/lib\/rbac'/);
assert.match(myTasksService, /ROUTE_PERMISSIONS\['\/investigations'\]/, 'investigation-type task visibility must reuse the exact role list the real /investigations route already uses, never a second permission concept');
assert.doesNotMatch(myTasksService, /prisma\.(playbookDocument|approvalEvidenceAssociation)\./, 'evidence-review and playbook-upload attribution were confirmed NOT to be genuine per-user-assigned task types and must never be queried as one');

// ─── Tenant isolation: every query starts from the server-resolved
//     organizationId, never a client-supplied value ────────────────────────

assert.match(myTasksService, /organizationId: viewer\.organizationId/);
assert.doesNotMatch(myTasksService, /organizationId:\s*filters\.organizationId/, 'organizationId must come from the server-resolved viewer, never request filters');
assert.match(tasksPage, /organizationId: tenant\.organization\.id/);

// ─── No fabricated due dates: only CONFIRMATION tasks have a real due-date
//     field anywhere in this schema ────────────────────────────────────────

assert.match(myTasksService, /NULL::timestamp AS due_at/, 'VERIFICATION/INVESTIGATION branches must hardcode a null due date rather than inventing one');
assert.doesNotMatch(myTasksService, /ic\."dateRangeEnd"/, 'InvestigationCase.dateRangeEnd describes the investigation\'s own scope period, not a deadline, and must never be queried as a due date');

// ─── No fabricated task types: only the three real, per-user-assignable
//     record types this schema actually supports ───────────────────────────

assert.match(myTasksLib, /export type MyTaskType = 'CONFIRMATION' \| 'VERIFICATION' \| 'INVESTIGATION'/);

// ─── Server-side cross-table sorting/pagination: a real database ORDER BY
//     across the FULL matching set spanning two source tables, never a
//     bounded in-memory sort ────────────────────────────────────────────────

assert.match(myTasksService, /\$queryRaw/, 'sorting must be computed by a real database query');
assert.match(myTasksService, /Prisma\.sql`/, 'raw SQL must be built via Prisma\'s parameterized tagged template, never string concatenation');
assert.match(myTasksService, /Prisma\.join\(branches, ' UNION ALL '\)/, 'the cross-table union must be built via parameterized Prisma.join, never string concatenation');
assert.doesNotMatch(myTasksService, /\$queryRawUnsafe/, 'must never use the unsafe/non-parameterized raw query variant');
assert.match(myTasksService, /WHERE ar\.id IN \(\$\{Prisma\.join\(confirmationIds\)\}\)/, 'the CONFIRMATION branch must be constrained to the already-tenant-scoped id allowlist from phase 1');
assert.match(myTasksService, /WHERE ar\.id IN \(\$\{Prisma\.join\(verificationIds\)\}\)/, 'the VERIFICATION branch must be constrained to the already-tenant-scoped id allowlist from phase 1');
assert.match(myTasksService, /WHERE ic\.id IN \(\$\{Prisma\.join\(investigationIds\)\}\)/, 'the INVESTIGATION branch must be constrained to the already-tenant-scoped id allowlist from phase 1');
assert.match(myTasksService, /LIMIT \$\{pageSize\} OFFSET \$\{offset\}/, 'pagination must happen at the database level');
assert.doesNotMatch(myTasksService, /MAX_SORTABLE_ROWS|\.slice\(0,\s*300\)/, 'there must be no bounded-fetch-then-JS-sort shortcut anywhere in this file');

// ─── Awaiting Response KPI vs row status: both must derive from the exact
//     same real-request-exists-and-is-not-expired condition
//     components/approvals/ManualApprovalPanel.tsx's myPendingConfirmation
//     uses to decide whether the Confirm/Correct/Reject buttons render at
//     all — so a row ever labeled "Awaiting Response" is always one whose
//     destination page genuinely has a working confirm action, and the KPI
//     count always equals the number of rows that can show that label ───

assert.match(myTasksService, /decision: 'PENDING', approverEmail: \{ equals: email, mode: 'insensitive' \}, expiresAt: \{ gt: now \} \}/, 'the Awaiting Response KPI must exclude expired PENDING requests, matching ManualApprovalPanel\'s own myPendingConfirmation gate (expiresAt > now)');
assert.match(myTasksService, /statusLabel = 'Awaiting Response'/);
assert.match(myTasksService, /statusLabel = 'Overdue'/);
assert.match(myTasksService, /statusLabel = 'Needs Confirmation'/);
assert.match(myTasksService, /actionLabel = 'Complete Confirmation'/);
assert.match(myTasksService, /actionLabel = 'View Approval'/, 'a confirmation row with no genuine working confirm button (no request sent, or expired) must offer View Approval, never a misleading Complete Confirmation');
assert.match(myTasksTable, /case 'Overdue':/);
assert.match(myTaskCards, /case 'Overdue':/);

// ─── Audit reuse: only real, pre-existing audit action strings ────────────

assert.match(dashboardService, /'investigation\.status_changed',/, 'the real pre-existing investigation.status_changed audit action must be allowlisted');
assert.doesNotMatch(myTasksService, /TASK_COMPLETED|TASK_CREATED|APPROVAL_TASK_/, 'no fabricated task-specific audit action may be invented');

// ─── No new generic Task model / no new task API: every row opens the
//     real, already-existing canonical workflow ───────────────────────────

assert.match(myTasksService, /detailHref: `\/approvals\/\$\{r\.id\}`/);
assert.match(myTasksService, /detailHref: `\/investigations\/\$\{inv\.id\}`/);
assert.doesNotMatch(tasksPage + myTasksView + myTasksTable + myTaskCards, /api\/tasks/, 'no PATCH /api/tasks/:id/complete or similar fabricated task API may be introduced');

// ─── RBAC: a deliberate, visible policy choice (mirrors '/dashboard/me'
//     and '/settings/profile'), never a silent unmapped gap ───────────────

assert.match(rbac, /'\/dashboard\/tasks': ALL_ROLES,/);

// ─── Nav: a distinct "My Tasks" entry exists, never a reskin of an
//     existing item ─────────────────────────────────────────────────────────

assert.match(navigation, /label: 'My Tasks'/);
assert.match(navigation, /href: '\/dashboard\/tasks'/);
assert.match(navigation, /label: 'My Approvals', icon: ListChecks/, 'the existing My Approvals nav item must be left exactly as it was');

// ─── Desktop table / mobile cards: a dedicated new component (task rows
//     span two source tables, so ApprovalTable is correctly NOT reused),
//     toggled by the same CSS-breakpoint convention as My Approvals ───────

assert.match(myTasksView, /<MyTasksTable tasks=\{rows\} \/>/);
assert.match(myTasksView, /<MyTaskCards tasks=\{rows\} \/>/);
assert.match(myTasksTable, /lg:block/, 'desktop table must only render at/above the lg breakpoint');
assert.match(myTaskCards, /lg:hidden/, 'cards must only render below the lg breakpoint, matching the table\'s hidden lg:block');
assert.doesNotMatch(read('components/dashboard/ApprovalTable.tsx'), /MyTasksTable|MyTaskCards/, 'the shared ApprovalTable must never import or know about the My Tasks-specific components');

// ─── Honest empty states: no fabricated counts ─────────────────────────────

assert.match(myTasksView, /All caught up/);
assert.match(myTasksView, /No matches/);
assert.match(myTasksView, /Nothing completed yet/);

// ─── Demo data: real investigation-type coverage, including a genuinely
//     unassigned case (proving assignment, not creation, controls
//     visibility) ───────────────────────────────────────────────────────────

assert.match(demoSeed, /JOHN_INVESTIGATIONS/);
assert.match(demoSeed, /assignee: null/, 'at least one investigation must be genuinely unassigned to prove it never appears in anyone\'s My Tasks');
assert.match(demoSeed, /status: 'RESOLVED'/);
assert.match(demoSeed, /tx\.investigationCase\.create/);

// ─── Completed KPI: explicit all-time-vs-range semantics, never a vague
//     caption ────────────────────────────────────────────────────────────

assert.match(myTasksView, /'all-time'/, 'Completed must explicitly say all-time when no range is set');
assert.doesNotMatch(myTasksView, /'in selected range'/, 'the old vague caption must be replaced by the actual formatted date bounds');

// ─── 390px KPI grid: 2 columns at every width, never a single stacked
//     column ─────────────────────────────────────────────────────────────

assert.match(myTasksView, /grid-cols-2 gap-2\.5/, 'the KPI strip must use a 2-column base grid, not grid-cols-1, so the 6 tiles stay compact and readable at 390px');

// ─── Filter controls: explicit, enumerated values — never a freeform text
//     input a viewer has to guess the valid values for ──────────────────

assert.match(myTasksView, /<option value="">All risk levels<\/option>/, 'risk level must be a select with an explicit default option, not a freeform text input');
assert.doesNotMatch(myTasksView, /name="riskLevel"\s*\n\s*defaultValue=\{filters\.riskLevel \?\? ''\}\s*\n\s*placeholder="Risk level"/, 'the old freeform riskLevel text input must be gone');
assert.match(myTasksView, /focus-visible:ring-2 focus-visible:ring-al-accent/, 'the status toggle and filters disclosure must have a visible keyboard focus state');

// ─── Mobile typography: task titles never shrink below a readable minimum
//     on the dedicated card presentation ────────────────────────────────

assert.match(myTaskCards, /text-base font-black leading-snug/, 'card titles must not be smaller than text-base');

// ─── Test + script wiring ───────────────────────────────────────────────────

assert.equal(pkg.scripts['test:my-tasks'], 'node --import tsx tests/my-tasks.test.ts');
assert.match(myTasksView, /getMyTasksOverview/);
assert.match(myTasksView, /getMyTasksCompletedCount/);

console.log(
  'Part 2 passed: My Tasks is a projection over the three real existing task sources (no second task engine), scopes every query from the server-resolved tenant (no client-supplied organizationId), never fabricates a due date for VERIFICATION/INVESTIGATION tasks, sorts/paginates the full cross-table matching set at the database level (no bounded JS sort), reuses real audit actions and the real /investigations RBAC role list, opens only real canonical detail workflows (no fabricated task API), and adds a distinct nav entry + RBAC policy alongside (not instead of) the existing items.',
);
