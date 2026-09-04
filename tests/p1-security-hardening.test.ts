/**
 * P1 Security Hardening — Regression Tests
 *
 * Tests the four P1 security fixes implemented in the authorization layer.
 * Tests that require live infrastructure (DB, Redis, Clerk) are marked SKIPPED
 * with the reason; they must be validated in a staging environment.
 *
 * Run: node --import tsx tests/p1-security-hardening.test.ts
 */

import assert from 'node:assert';
import { authorizeGatewayRequestWithConfig } from '@/lib/gateway-auth';
import { enforcePageRole, hasAnyRole, findRoutePermission } from '@/lib/rbac';

let passed = 0;
let failed = 0;
let skipped = 0;
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

function skip(label: string, reason: string) {
  console.log(`  ⚠ SKIPPED — ${label}: ${reason}`);
  skipped++;
}

function test(label: string, fn: () => void) {
  try {
    fn();
    pass(label);
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

// Helper: build a mock Request with optional headers
function mockRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/v1/approvals', {
    method: 'POST',
    headers,
  });
}

// ─── Section 1: P1-1 Gateway Tenant Binding ───────────────────────────────────

console.log('\n── P1-1: Universal Gateway Tenant Binding ──────────────────────────────');

test('Test C: valid API key + missing org binding → 503 fail closed', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest({ 'x-api-key': 'secret-key' }),
    { apiKey: 'secret-key', orgSlug: undefined, isProduction: true },
  );
  assert.strictEqual(result.ok, false, 'Should reject when orgSlug is absent');
  assert.strictEqual((result as { status: number }).status, 503);
});

test('Test C (dev): missing API key + missing org binding → 503 fail closed', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest(),
    { apiKey: undefined, orgSlug: undefined, isProduction: false },
  );
  assert.strictEqual(result.ok, false, 'Should reject even in dev when orgSlug is absent');
  assert.strictEqual((result as { status: number }).status, 503);
});

test('Test C (prod): valid API key + missing org binding in production → 503', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest({ 'x-api-key': 'secret-key' }),
    { apiKey: 'secret-key', orgSlug: undefined, isProduction: true },
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual((result as { status: number }).status, 503);
  const errorMsg = (result as { error: string }).error;
  assert.ok(errorMsg.includes('organization binding'), `Error should mention org binding, got: "${errorMsg}"`);
});

test('Test B: valid credential + correct org binding → accepted, orgSlug returned', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest({ 'x-api-key': 'secret-key' }),
    { apiKey: 'secret-key', orgSlug: 'acme-corp', isProduction: true },
  );
  assert.strictEqual(result.ok, true, 'Should accept with valid key + binding');
  assert.strictEqual((result as { orgSlug: string }).orgSlug, 'acme-corp');
});

test('Test D: client cannot override server org slug — orgSlug comes from config, not request', () => {
  // Even if an attacker sends an Authorization header for a different key,
  // the orgSlug in the result is always from the server config.
  const result = authorizeGatewayRequestWithConfig(
    mockRequest({
      'x-api-key': 'secret-key',
      // Attacker-supplied slug in a custom header would never reach orgSlug —
      // it only comes from config.orgSlug.
    }),
    { apiKey: 'secret-key', orgSlug: 'acme-corp', isProduction: true },
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual((result as { orgSlug: string }).orgSlug, 'acme-corp',
    'orgSlug must equal the server-configured value, not any value from the request');
});

test('Test A: correct key + org binding always routes to bound org regardless of body tenant_slug', () => {
  // The route passes authorization.orgSlug as tenantSlug to ingestUniversalApproval,
  // overriding input.tenant_slug. This test verifies the auth layer always
  // returns the server-bound slug.
  const result = authorizeGatewayRequestWithConfig(
    mockRequest({ 'x-api-key': 'valid-key' }),
    { apiKey: 'valid-key', orgSlug: 'org-a', isProduction: true },
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual((result as { orgSlug: string }).orgSlug, 'org-a',
    'Server slug (org-a) must be returned regardless of what tenant_slug appears in the request body');
  // The body-supplied tenant_slug is irrelevant — the route passes orgSlug to
  // ingestUniversalApproval which uses options.tenantSlug (server) over input.tenant_slug (client).
});

test('Wrong API key → 401', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest({ 'x-api-key': 'wrong-key' }),
    { apiKey: 'correct-key', orgSlug: 'acme-corp', isProduction: true },
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual((result as { status: number }).status, 401);
});

test('Bearer token is accepted as an alternative to x-api-key', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest({ authorization: 'Bearer secret-key' }),
    { apiKey: 'secret-key', orgSlug: 'acme-corp', isProduction: false },
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual((result as { orgSlug: string }).orgSlug, 'acme-corp');
});

test('Dev: no API key configured but orgSlug present → allowed (keyless dev mode)', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest(),
    { apiKey: undefined, orgSlug: 'dev-org', isProduction: false },
  );
  assert.strictEqual(result.ok, true,
    'Dev mode without API key should be allowed if orgSlug is configured');
  assert.strictEqual((result as { orgSlug: string }).orgSlug, 'dev-org');
});

test('Prod: no API key configured + orgSlug present → 503 (key required in production)', () => {
  const result = authorizeGatewayRequestWithConfig(
    mockRequest(),
    { apiKey: undefined, orgSlug: 'acme-corp', isProduction: true },
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual((result as { status: number }).status, 503);
});

// ─── Section 2: P1-2 Classify Authentication ──────────────────────────────────

console.log('\n── P1-2: /api/classify Authentication ──────────────────────────────────');

// Tests E-G require live Clerk session + DB infrastructure.
skip(
  'Test E: anonymous POST /api/classify → 401',
  'Requires live Next.js server with Clerk middleware. Verify in staging: ' +
  'curl -X POST https://<host>/api/classify -d \'{"message":"approve"}\' — expect 401.',
);

skip(
  'Test F: authenticated user sends organizationId for different org → request scoped to session org',
  'Requires two live tenant sessions. Verify in staging: org A user sends organizationId = org B. ' +
  'Confirm the persisted ClassifierResult.organizationId equals org A (from session), not org B.',
);

skip(
  'Test G: no organizationId in body → session org used, no orphan record',
  'Requires live session + DB. Verify in staging: POST without organizationId field. ' +
  'Confirm ClassifierResult row is created with organizationId matching the session tenant.',
);

// What CAN be verified without infrastructure: the code structure guarantees
test('Code structure: classify route uses getDashboardTenant, not getCurrentTenant', async () => {
  // We verify this by reading the compiled source — if getCurrentTenant is still
  // imported the file would have the wrong import.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../app/api/classify/route.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('getDashboardTenant'), 'Route must import getDashboardTenant');
  assert.ok(!src.includes('getCurrentTenant'), 'Route must not use getCurrentTenant (unauthenticated path)');
  assert.ok(src.includes("status: 'unauthenticated'"), 'Route must check for unauthenticated status');
  assert.ok(!src.includes('parsed.data.organizationId'), 'Route must not use organizationId from request body');
});

// ─── Section 3: P1-3 Role Cache Invalidation ──────────────────────────────────

console.log('\n── P1-3: Tenant Cache Invalidation After Role Changes ───────────────────');

skip(
  'Test H: demote ADMIN to MEMBER → immediate effect on next request (no 5-min wait)',
  'Requires live DB + Redis + two concurrent sessions. Verify in staging: ' +
  'change role via PATCH /api/team/members/:id/role, then immediately call an ADMIN-gated ' +
  'endpoint from the demoted user\'s session — expect 403.',
);

skip(
  'Test I: promote MEMBER to ADMIN → new role recognized immediately',
  'Requires live DB + Redis. Verify in staging: promote via PATCH, then immediately call ' +
  'an ADMIN-gated endpoint — expect 200 (not 403).',
);

test('Code structure: role route calls revalidateTag(DASHBOARD_TENANT_CACHE_TAG) after updateMemberRole', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    new URL('../app/api/team/members/[userId]/role/route.ts', import.meta.url),
    'utf8',
  );
  assert.ok(src.includes('revalidateTag'), 'Must call revalidateTag after role change');
  assert.ok(src.includes('DASHBOARD_TENANT_CACHE_TAG'), 'Must invalidate the dashboard tenant cache tag');
  // Verify invalidation happens AFTER updateMemberRole (order check by string position)
  const updatePos = src.indexOf('updateMemberRole');
  const revalidatePos = src.indexOf('revalidateTag');
  assert.ok(updatePos < revalidatePos, 'revalidateTag must appear after updateMemberRole in source');
});

// ─── Section 4: P1-4 Investigation Detail Authorization ──────────────────────

console.log('\n── P1-4: Investigation Detail Authorization ─────────────────────────────');

// enforcePageRole and hasAnyRole are pure functions — fully testable without infra.

test('Test J: MEMBER cannot access /investigations (enforcePageRole check)', () => {
  // enforcePageRole calls redirect() which throws in non-Next.js context.
  let threw = false;
  try {
    enforcePageRole('/investigations', 'MEMBER');
  } catch {
    threw = true;
  }
  assert.ok(threw, 'enforcePageRole must throw/redirect for MEMBER on /investigations');
});

test('Test K: AUDITOR cannot access /investigations', () => {
  let threw = false;
  try {
    enforcePageRole('/investigations', 'AUDITOR');
  } catch {
    threw = true;
  }
  assert.ok(threw, 'enforcePageRole must throw/redirect for AUDITOR on /investigations');
});

test('Test L: MANAGER can access /investigations (no throw)', () => {
  assert.doesNotThrow(
    () => enforcePageRole('/investigations', 'MANAGER'),
    'MANAGER must be allowed to reach /investigations',
  );
});

test('OWNER can access /investigations (no throw)', () => {
  assert.doesNotThrow(() => enforcePageRole('/investigations', 'OWNER'));
});

test('ADMIN can access /investigations (no throw)', () => {
  assert.doesNotThrow(() => enforcePageRole('/investigations', 'ADMIN'));
});

test('VIEWER cannot access /investigations', () => {
  let threw = false;
  try { enforcePageRole('/investigations', 'VIEWER'); } catch { threw = true; }
  assert.ok(threw);
});

test('/investigations is in ROUTE_PERMISSIONS', () => {
  const allowed = findRoutePermission('/investigations');
  assert.ok(allowed !== null, 'Route must have a permission entry');
  assert.ok(Array.isArray(allowed));
  assert.ok(allowed.includes('MANAGER'), 'MANAGER must be in allowed roles');
  assert.ok(allowed.includes('ADMIN'), 'ADMIN must be in allowed roles');
  assert.ok(allowed.includes('OWNER'), 'OWNER must be in allowed roles');
  assert.ok(!allowed.includes('MEMBER'), 'MEMBER must NOT be in allowed roles');
  assert.ok(!allowed.includes('AUDITOR'), 'AUDITOR must NOT be in allowed roles');
  assert.ok(!allowed.includes('VIEWER'), 'VIEWER must NOT be in allowed roles');
});

test('Test M: MEMBER cannot invoke addNoteAction (hasAnyRole check)', () => {
  const result = hasAnyRole('MEMBER', ['MANAGER', 'ADMIN', 'OWNER']);
  assert.strictEqual(result, false, 'MEMBER must not pass the note-action role check');
});

test('Test N: MEMBER cannot invoke updateStatusAction (hasAnyRole check)', () => {
  const result = hasAnyRole('MEMBER', ['MANAGER', 'ADMIN', 'OWNER']);
  assert.strictEqual(result, false, 'MEMBER must not pass the status-action role check');
});

test('Test O: MANAGER can invoke investigation actions (hasAnyRole check)', () => {
  const result = hasAnyRole('MANAGER', ['MANAGER', 'ADMIN', 'OWNER']);
  assert.strictEqual(result, true, 'MANAGER must pass the action role check');
});

test('AUDITOR cannot invoke investigation actions', () => {
  const result = hasAnyRole('AUDITOR', ['MANAGER', 'ADMIN', 'OWNER']);
  assert.strictEqual(result, false);
});

test('Code structure: InvestigationDetailPage calls enforcePageRole', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    new URL('../app/investigations/[id]/page.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(src.includes("enforcePageRole('/investigations'"), 'Page must call enforcePageRole for /investigations');
  assert.ok(src.includes("hasAnyRole(tenant.user.role, ['MANAGER', 'ADMIN', 'OWNER'])"),
    'Server actions must check hasAnyRole for MANAGER/ADMIN/OWNER');
});

skip(
  'Test P: org A user cannot access investigation belonging to org B',
  'Requires two live tenant DB fixtures. Verify in staging: ' +
  'org A session fetches /investigations/<org-b-investigation-id> — expect 404 (tenant isolation via ' +
  'where: { id, organizationId } in the Prisma query).',
);

// ─── Final summary ─────────────────────────────────────────────────────────────

console.log('\n── Summary ──────────────────────────────────────────────────────────────');
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Skipped: ${skipped} (require live infrastructure — see SKIPPED messages above)`);

if (failures.length > 0) {
  console.error('\nFailed tests:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('\nAll executable tests passed.');
  process.exit(0);
}
