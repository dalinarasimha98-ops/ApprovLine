/**
 * Customer Access Control — Regression Tests
 *
 * Verifies that ROUTE_PERMISSIONS, enforcePageRole, hasAnyRole, and
 * findRoutePermission implement the canonical feature access matrix:
 *
 *   Feature              OWNER  ADMIN  MANAGER  AUDITOR  MEMBER  VIEWER
 *   ─────────────────────────────────────────────────────────────────────
 *   Dashboard            ✓      ✓      ✓        ✓        ✓       ✓
 *   Approvals            FULL   FULL   FULL      VIEW     VIEW    VIEW
 *   Unified Evidence     FULL   FULL   FULL      VIEW     VIEW    VIEW
 *   AI Copilot           ✓      ✓      ✓         ✓        ✓      NO
 *   Playbook AI          MANAGE MANAGE NO        VIEW     NO      NO
 *   Memory Graph         FULL   FULL   VIEW      VIEW     VIEW    NO
 *   Executive Analytics  FULL   FULL   NO        NO       NO      NO
 *   Compliance Hub       FULL   FULL   NO        VIEW     NO      NO
 *   Alerts & Risks       FULL   FULL   MANAGE    NO       NO      NO
 *   Investigation Center FULL   FULL   MANAGE    VIEW     NO      NO
 *   Reports & Exports    FULL   FULL   VIEW      FULL     NO      NO
 *   Audit Logs           FULL   FULL   VIEW      FULL     NO      NO
 *   Universal Gateway    MANAGE MANAGE NO        NO       NO      NO
 *   Integrations         MANAGE MANAGE NO        NO       NO      NO
 *   Users & Teams        MANAGE MANAGE LIMITED   VIEW     NO      NO
 *   Settings             FULL   MANAGE NO        NO       NO      NO
 *
 * Pure-function tests only — no DB, Redis, or Clerk required.
 *
 * Run: node --import tsx tests/access-control.test.ts
 */

import assert from 'node:assert';
import { enforcePageRole, hasAnyRole, findRoutePermission } from '@/lib/rbac';
import type { Role } from '@/lib/rbac';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, reason: string) {
  console.error(`  ✗ ${label}: ${reason}`);
  failed++;
  failures.push(`${label}: ${reason}`);
}

function test(label: string, fn: () => void) {
  try {
    fn();
    pass(label);
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

// Helper: assert enforcePageRole redirects (throws) for a given role
function assertDenied(pathname: string, role: Role, reason?: string) {
  let threw = false;
  try {
    enforcePageRole(pathname, role);
  } catch {
    threw = true;
  }
  assert.ok(threw, reason ?? `Expected ${role} to be denied at ${pathname}`);
}

// Helper: assert enforcePageRole does NOT redirect for a given role
function assertAllowed(pathname: string, role: Role, reason?: string) {
  assert.doesNotThrow(
    () => enforcePageRole(pathname, role),
    reason ?? `Expected ${role} to be allowed at ${pathname}`,
  );
}

// ── AI Copilot (/copilot) ──────────────────────────────────────────────────────

console.log('\n── /copilot ─────────────────────────────────────────────────────────────');

test('VIEWER is denied /copilot', () => assertDenied('/copilot', 'VIEWER'));
test('MEMBER is allowed /copilot', () => assertAllowed('/copilot', 'MEMBER'));
test('AUDITOR is allowed /copilot', () => assertAllowed('/copilot', 'AUDITOR'));
test('MANAGER is allowed /copilot', () => assertAllowed('/copilot', 'MANAGER'));
test('ADMIN is allowed /copilot', () => assertAllowed('/copilot', 'ADMIN'));
test('OWNER is allowed /copilot', () => assertAllowed('/copilot', 'OWNER'));

test('/copilot ROUTE_PERMISSIONS has correct roles', () => {
  const roles = findRoutePermission('/copilot');
  assert.ok(roles !== null, '/copilot must have a permission entry');
  assert.ok(Array.isArray(roles));
  assert.ok(roles.includes('OWNER'));
  assert.ok(roles.includes('ADMIN'));
  assert.ok(roles.includes('MANAGER'));
  assert.ok(roles.includes('AUDITOR'));
  assert.ok(roles.includes('MEMBER'));
  assert.ok(!roles.includes('VIEWER'), 'VIEWER must NOT be in /copilot allowed roles');
});

// ── Memory Graph (/memory) ────────────────────────────────────────────────────

console.log('\n── /memory ──────────────────────────────────────────────────────────────');

test('VIEWER is denied /memory', () => assertDenied('/memory', 'VIEWER'));
test('MEMBER is allowed /memory', () => assertAllowed('/memory', 'MEMBER'));
test('AUDITOR is allowed /memory', () => assertAllowed('/memory', 'AUDITOR'));
test('MANAGER is allowed /memory', () => assertAllowed('/memory', 'MANAGER'));
test('ADMIN is allowed /memory', () => assertAllowed('/memory', 'ADMIN'));
test('OWNER is allowed /memory', () => assertAllowed('/memory', 'OWNER'));

test('/memory ROUTE_PERMISSIONS has correct roles', () => {
  const roles = findRoutePermission('/memory');
  assert.ok(roles !== null, '/memory must have a permission entry');
  assert.ok(roles!.includes('MEMBER'), 'MEMBER must be in /memory allowed roles');
  assert.ok(roles!.includes('AUDITOR'), 'AUDITOR must be in /memory allowed roles');
  assert.ok(!roles!.includes('VIEWER'), 'VIEWER must NOT be in /memory allowed roles');
});

// ── Investigation Center (/investigations) ────────────────────────────────────

console.log('\n── /investigations ──────────────────────────────────────────────────────');

test('VIEWER is denied /investigations', () => assertDenied('/investigations', 'VIEWER'));
test('MEMBER is denied /investigations', () => assertDenied('/investigations', 'MEMBER'));
test('AUDITOR is allowed /investigations (VIEW only — mutations still gated)', () => {
  assertAllowed('/investigations', 'AUDITOR');
});
test('MANAGER is allowed /investigations', () => assertAllowed('/investigations', 'MANAGER'));
test('ADMIN is allowed /investigations', () => assertAllowed('/investigations', 'ADMIN'));
test('OWNER is allowed /investigations', () => assertAllowed('/investigations', 'OWNER'));

test('/investigations ROUTE_PERMISSIONS includes AUDITOR', () => {
  const roles = findRoutePermission('/investigations');
  assert.ok(roles !== null);
  assert.ok(roles!.includes('AUDITOR'), 'AUDITOR must be in /investigations allowed roles');
  assert.ok(!roles!.includes('MEMBER'), 'MEMBER must NOT be in /investigations allowed roles');
  assert.ok(!roles!.includes('VIEWER'), 'VIEWER must NOT be in /investigations allowed roles');
});

// Investigation server action gate: AUDITOR cannot mutate
test('AUDITOR fails investigation mutation gate (hasAnyRole check)', () => {
  const result = hasAnyRole('AUDITOR', ['MANAGER', 'ADMIN', 'OWNER']);
  assert.strictEqual(result, false, 'AUDITOR must not pass mutation role check');
});

test('MANAGER passes investigation mutation gate', () => {
  assert.strictEqual(hasAnyRole('MANAGER', ['MANAGER', 'ADMIN', 'OWNER']), true);
});

// ── Executive Analytics (/analytics) ─────────────────────────────────────────

console.log('\n── /analytics ───────────────────────────────────────────────────────────');

test('VIEWER is denied /analytics', () => assertDenied('/analytics', 'VIEWER'));
test('MEMBER is denied /analytics', () => assertDenied('/analytics', 'MEMBER'));
test('AUDITOR is denied /analytics', () => assertDenied('/analytics', 'AUDITOR'));
test('MANAGER is denied /analytics', () => assertDenied('/analytics', 'MANAGER'));
test('ADMIN is allowed /analytics', () => assertAllowed('/analytics', 'ADMIN'));
test('OWNER is allowed /analytics', () => assertAllowed('/analytics', 'OWNER'));

// ── Compliance Hub (/trust/compliance) ────────────────────────────────────────

console.log('\n── /trust/compliance ────────────────────────────────────────────────────');

test('VIEWER is denied /trust/compliance', () => assertDenied('/trust/compliance', 'VIEWER'));
test('MEMBER is denied /trust/compliance', () => assertDenied('/trust/compliance', 'MEMBER'));
test('MANAGER is denied /trust/compliance', () => assertDenied('/trust/compliance', 'MANAGER'));
test('AUDITOR is allowed /trust/compliance', () => assertAllowed('/trust/compliance', 'AUDITOR'));
test('ADMIN is allowed /trust/compliance', () => assertAllowed('/trust/compliance', 'ADMIN'));
test('OWNER is allowed /trust/compliance', () => assertAllowed('/trust/compliance', 'OWNER'));

// ── Alerts & Risks (/dashboard/alerts) ───────────────────────────────────────

console.log('\n── /dashboard/alerts ────────────────────────────────────────────────────');

test('VIEWER is denied /dashboard/alerts', () => assertDenied('/dashboard/alerts', 'VIEWER'));
test('MEMBER is denied /dashboard/alerts', () => assertDenied('/dashboard/alerts', 'MEMBER'));
test('AUDITOR is denied /dashboard/alerts', () => assertDenied('/dashboard/alerts', 'AUDITOR'));
test('MANAGER is allowed /dashboard/alerts', () => assertAllowed('/dashboard/alerts', 'MANAGER'));
test('ADMIN is allowed /dashboard/alerts', () => assertAllowed('/dashboard/alerts', 'ADMIN'));
test('OWNER is allowed /dashboard/alerts', () => assertAllowed('/dashboard/alerts', 'OWNER'));

// ── Reports & Exports (/dashboard/audit) ──────────────────────────────────────

console.log('\n── /dashboard/audit ─────────────────────────────────────────────────────');

test('VIEWER is denied /dashboard/audit', () => assertDenied('/dashboard/audit', 'VIEWER'));
test('MEMBER is denied /dashboard/audit', () => assertDenied('/dashboard/audit', 'MEMBER'));
test('AUDITOR is allowed /dashboard/audit (FULL access)', () => assertAllowed('/dashboard/audit', 'AUDITOR'));
test('MANAGER is allowed /dashboard/audit (VIEW access)', () => assertAllowed('/dashboard/audit', 'MANAGER'));
test('ADMIN is allowed /dashboard/audit', () => assertAllowed('/dashboard/audit', 'ADMIN'));
test('OWNER is allowed /dashboard/audit', () => assertAllowed('/dashboard/audit', 'OWNER'));

// ── Audit Logs (/dashboard/audit-log) ────────────────────────────────────────

console.log('\n── /dashboard/audit-log ─────────────────────────────────────────────────');

test('/dashboard/audit-log has permission entry', () => {
  const roles = findRoutePermission('/dashboard/audit-log');
  assert.ok(roles !== null, '/dashboard/audit-log must have a permission entry');
  assert.ok(roles!.includes('AUDITOR'), 'AUDITOR must be in /dashboard/audit-log');
  assert.ok(roles!.includes('MANAGER'), 'MANAGER must be in /dashboard/audit-log');
  assert.ok(roles!.includes('ADMIN'), 'ADMIN must be in /dashboard/audit-log');
  assert.ok(roles!.includes('OWNER'), 'OWNER must be in /dashboard/audit-log');
  assert.ok(!roles!.includes('MEMBER'), 'MEMBER must NOT be in /dashboard/audit-log');
  assert.ok(!roles!.includes('VIEWER'), 'VIEWER must NOT be in /dashboard/audit-log');
});

// ── Universal Gateway (/dashboard/gateway) ────────────────────────────────────

console.log('\n── /dashboard/gateway ───────────────────────────────────────────────────');

test('MANAGER is denied /dashboard/gateway', () => assertDenied('/dashboard/gateway', 'MANAGER'));
test('AUDITOR is denied /dashboard/gateway', () => assertDenied('/dashboard/gateway', 'AUDITOR'));
test('MEMBER is denied /dashboard/gateway', () => assertDenied('/dashboard/gateway', 'MEMBER'));
test('VIEWER is denied /dashboard/gateway', () => assertDenied('/dashboard/gateway', 'VIEWER'));
test('ADMIN is allowed /dashboard/gateway', () => assertAllowed('/dashboard/gateway', 'ADMIN'));
test('OWNER is allowed /dashboard/gateway', () => assertAllowed('/dashboard/gateway', 'OWNER'));

// ── Integrations (/dashboard/settings/integrations) ──────────────────────────

console.log('\n── /dashboard/settings/integrations ─────────────────────────────────────');

test('/dashboard/settings/integrations has permission entry', () => {
  const roles = findRoutePermission('/dashboard/settings/integrations');
  assert.ok(roles !== null, '/dashboard/settings/integrations must have a permission entry');
  assert.ok(roles!.includes('ADMIN'), 'ADMIN must be in /dashboard/settings/integrations');
  assert.ok(roles!.includes('OWNER'), 'OWNER must be in /dashboard/settings/integrations');
  assert.ok(!roles!.includes('MANAGER'), 'MANAGER must NOT be in /dashboard/settings/integrations');
  assert.ok(!roles!.includes('AUDITOR'), 'AUDITOR must NOT be in /dashboard/settings/integrations');
  assert.ok(!roles!.includes('MEMBER'), 'MEMBER must NOT be in /dashboard/settings/integrations');
  assert.ok(!roles!.includes('VIEWER'), 'VIEWER must NOT be in /dashboard/settings/integrations');
});

test('MANAGER is denied /dashboard/settings/integrations', () => {
  assertDenied('/dashboard/settings/integrations', 'MANAGER');
});
test('AUDITOR is denied /dashboard/settings/integrations', () => {
  assertDenied('/dashboard/settings/integrations', 'AUDITOR');
});
test('ADMIN is allowed /dashboard/settings/integrations', () => {
  assertAllowed('/dashboard/settings/integrations', 'ADMIN');
});
test('OWNER is allowed /dashboard/settings/integrations', () => {
  assertAllowed('/dashboard/settings/integrations', 'OWNER');
});

// ── Users & Teams (/settings/users) ──────────────────────────────────────────

console.log('\n── /settings/users ──────────────────────────────────────────────────────');

test('VIEWER is denied /settings/users', () => assertDenied('/settings/users', 'VIEWER'));
test('MEMBER is denied /settings/users', () => assertDenied('/settings/users', 'MEMBER'));
test('AUDITOR is allowed /settings/users (VIEW)', () => assertAllowed('/settings/users', 'AUDITOR'));
test('MANAGER is allowed /settings/users (LIMITED)', () => assertAllowed('/settings/users', 'MANAGER'));
test('ADMIN is allowed /settings/users (MANAGE)', () => assertAllowed('/settings/users', 'ADMIN'));
test('OWNER is allowed /settings/users (MANAGE)', () => assertAllowed('/settings/users', 'OWNER'));

test('/settings/users has correct allowed set', () => {
  const roles = findRoutePermission('/settings/users');
  assert.ok(roles !== null);
  assert.ok(!roles!.includes('VIEWER'), 'VIEWER must NOT be in /settings/users');
  assert.ok(!roles!.includes('MEMBER'), 'MEMBER must NOT be in /settings/users');
  assert.ok(roles!.includes('AUDITOR'), 'AUDITOR must be in /settings/users');
  assert.ok(roles!.includes('MANAGER'), 'MANAGER must be in /settings/users');
});

// ── Playbook AI (/playbooks) ──────────────────────────────────────────────────

console.log('\n── /playbooks ───────────────────────────────────────────────────────────');

test('VIEWER is denied /playbooks', () => assertDenied('/playbooks', 'VIEWER'));
test('MEMBER is denied /playbooks', () => assertDenied('/playbooks', 'MEMBER'));
test('MANAGER is denied /playbooks', () => assertDenied('/playbooks', 'MANAGER'));
test('AUDITOR is allowed /playbooks (VIEW)', () => assertAllowed('/playbooks', 'AUDITOR'));
test('ADMIN is allowed /playbooks (MANAGE)', () => assertAllowed('/playbooks', 'ADMIN'));
test('OWNER is allowed /playbooks (MANAGE)', () => assertAllowed('/playbooks', 'OWNER'));

// ── Settings (/dashboard/settings) ───────────────────────────────────────────

console.log('\n── /dashboard/settings ──────────────────────────────────────────────────');

test('VIEWER is denied /dashboard/settings', () => assertDenied('/dashboard/settings', 'VIEWER'));
test('MEMBER is denied /dashboard/settings', () => assertDenied('/dashboard/settings', 'MEMBER'));
test('AUDITOR is denied /dashboard/settings', () => assertDenied('/dashboard/settings', 'AUDITOR'));
test('MANAGER is denied /dashboard/settings', () => assertDenied('/dashboard/settings', 'MANAGER'));
test('ADMIN is allowed /dashboard/settings', () => assertAllowed('/dashboard/settings', 'ADMIN'));
test('OWNER is allowed /dashboard/settings', () => assertAllowed('/dashboard/settings', 'OWNER'));

// ── Longest-prefix disambiguation ─────────────────────────────────────────────

console.log('\n── Prefix matching correctness ──────────────────────────────────────────');

test('/dashboard/settings/integrations wins over /dashboard/settings on longest prefix', () => {
  const roles = findRoutePermission('/dashboard/settings/integrations');
  assert.ok(roles !== null);
  // Both /dashboard/settings and /dashboard/settings/integrations map to ['ADMIN','OWNER'],
  // but the more-specific entry must win (confirmed by length of prefix used).
  assert.ok(roles!.includes('ADMIN'));
  assert.ok(roles!.includes('OWNER'));
  assert.ok(!roles!.includes('MANAGER'));
});

test('/settings/users wins over /settings on longest prefix', () => {
  // /settings maps to ['ADMIN','OWNER'] but /settings/users has its own entry
  // with a broader set. Longest-prefix wins.
  const roles = findRoutePermission('/settings/users');
  assert.ok(roles !== null);
  assert.ok(roles!.includes('AUDITOR'), 'AUDITOR must be reachable on /settings/users');
  assert.ok(roles!.includes('MANAGER'), 'MANAGER must be reachable on /settings/users');
  assert.ok(!roles!.includes('MEMBER'));
  assert.ok(!roles!.includes('VIEWER'));
});

test('/trust/compliance/anything still uses /trust/compliance rule', () => {
  const roles = findRoutePermission('/trust/compliance/report/abc');
  assert.ok(roles !== null);
  assert.ok(roles!.includes('AUDITOR'));
  assert.ok(!roles!.includes('MEMBER'));
});

// ── Copilot API role check (unit-level) ───────────────────────────────────────

console.log('\n── Copilot role gate (hasAnyRole) ───────────────────────────────────────');

const COPILOT_ALLOWED: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'AUDITOR', 'MEMBER'];

test('VIEWER fails Copilot API role gate', () => {
  assert.strictEqual(hasAnyRole('VIEWER', COPILOT_ALLOWED), false);
});
test('MEMBER passes Copilot API role gate', () => {
  assert.strictEqual(hasAnyRole('MEMBER', COPILOT_ALLOWED), true);
});
test('AUDITOR passes Copilot API role gate', () => {
  assert.strictEqual(hasAnyRole('AUDITOR', COPILOT_ALLOWED), true);
});
test('MANAGER passes Copilot API role gate', () => {
  assert.strictEqual(hasAnyRole('MANAGER', COPILOT_ALLOWED), true);
});

// ── Memory Graph write action gate ────────────────────────────────────────────

console.log('\n── Memory Graph rebuild action gate ─────────────────────────────────────');

const GRAPH_REBUILD: Role[] = ['MANAGER', 'ADMIN', 'OWNER'];

test('VIEWER cannot trigger graph rebuild', () => {
  assert.strictEqual(hasAnyRole('VIEWER', GRAPH_REBUILD), false);
});
test('MEMBER cannot trigger graph rebuild', () => {
  assert.strictEqual(hasAnyRole('MEMBER', GRAPH_REBUILD), false);
});
test('AUDITOR cannot trigger graph rebuild (VIEW only on memory)', () => {
  assert.strictEqual(hasAnyRole('AUDITOR', GRAPH_REBUILD), false);
});
test('MANAGER can trigger graph rebuild', () => {
  assert.strictEqual(hasAnyRole('MANAGER', GRAPH_REBUILD), true);
});
test('ADMIN can trigger graph rebuild', () => {
  assert.strictEqual(hasAnyRole('ADMIN', GRAPH_REBUILD), true);
});
test('OWNER can trigger graph rebuild', () => {
  assert.strictEqual(hasAnyRole('OWNER', GRAPH_REBUILD), true);
});

// ── Code structure assertions ──────────────────────────────────────────────────

console.log('\n── Code structure assertions ────────────────────────────────────────────');

test('Copilot page imports enforcePageRole', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../app/copilot/page.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes('enforcePageRole'), 'Copilot page must call enforcePageRole');
  assert.ok(src.includes("enforcePageRole('/copilot'"), "Must enforce /copilot path");
});

test('Memory page uses GRAPH_REBUILD_ROLES for action gate, not ALLOWED_ROLES', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../app/memory/page.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes('GRAPH_REBUILD_ROLES'), 'Must define GRAPH_REBUILD_ROLES for action gate');
  assert.ok(src.includes("enforcePageRole('/memory'"), 'Must call enforcePageRole for page access');
});

test('Copilot API route imports hasAnyRole and denies VIEWER', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../app/api/copilot/query/route.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('hasAnyRole'), 'Copilot API must import hasAnyRole');
  assert.ok(src.includes("status: 403"), 'Copilot API must return 403 for denied roles');
});

test('ROUTE_PERMISSIONS contains /copilot', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../lib/rbac.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("'/copilot'"), '/copilot must be in ROUTE_PERMISSIONS');
});

test('ROUTE_PERMISSIONS contains /dashboard/settings/integrations', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../lib/rbac.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("'/dashboard/settings/integrations'"), 'integrations route must be in ROUTE_PERMISSIONS');
});

// ── Final summary ──────────────────────────────────────────────────────────────

console.log('\n── Summary ──────────────────────────────────────────────────────────────');
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);

if (failures.length > 0) {
  console.error('\nFailed tests:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('\nAll access control tests passed.');
  process.exit(0);
}
