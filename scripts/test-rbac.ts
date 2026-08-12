import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROLE_HIERARCHY,
  ROUTE_PERMISSIONS,
  findRoutePermission,
  hasAnyRole,
  hasMinimumRole,
  type Role,
} from '../lib/rbac';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// --- ROLE_HIERARCHY / hasMinimumRole / hasAnyRole ---------------------------

assert.deepEqual(
  Object.keys(ROLE_HIERARCHY).sort(),
  ['ADMIN', 'AUDITOR', 'MANAGER', 'MEMBER', 'OWNER', 'VIEWER'].sort(),
);
assert.ok(ROLE_HIERARCHY.OWNER > ROLE_HIERARCHY.ADMIN, 'OWNER must outrank ADMIN');
assert.ok(ROLE_HIERARCHY.ADMIN > ROLE_HIERARCHY.MANAGER, 'ADMIN must outrank MANAGER');
assert.ok(ROLE_HIERARCHY.MANAGER > ROLE_HIERARCHY.MEMBER, 'MANAGER must outrank MEMBER');
assert.ok(ROLE_HIERARCHY.MEMBER > ROLE_HIERARCHY.AUDITOR, 'MEMBER must outrank AUDITOR');
assert.ok(ROLE_HIERARCHY.AUDITOR > ROLE_HIERARCHY.VIEWER, 'AUDITOR must outrank VIEWER');

assert.equal(hasMinimumRole('OWNER', 'ADMIN'), true);
assert.equal(hasMinimumRole('ADMIN', 'ADMIN'), true);
assert.equal(hasMinimumRole('MANAGER', 'ADMIN'), false);
assert.equal(hasMinimumRole('VIEWER', 'MEMBER'), false);

assert.equal(hasAnyRole('ADMIN', ['ADMIN', 'OWNER']), true);
assert.equal(hasAnyRole('AUDITOR', ['ADMIN', 'OWNER']), false);
assert.equal(hasAnyRole('AUDITOR', []), false);

// --- Route access matrix (Step 10 scenarios) --------------------------------

function canReach(role: Role, pathname: string) {
  const allowed = findRoutePermission(pathname);
  return !allowed || hasAnyRole(role, allowed);
}

// MEMBER cannot access /analytics
assert.equal(canReach('MEMBER', '/analytics'), false);
// MEMBER cannot access /trust/compliance
assert.equal(canReach('MEMBER', '/trust/compliance'), false);
// AUDITOR can access /trust/compliance
assert.equal(canReach('AUDITOR', '/trust/compliance'), true);
// AUDITOR cannot change settings (not in the /settings allow-list)
assert.equal(canReach('AUDITOR', '/settings'), false);
assert.equal(canReach('AUDITOR', '/dashboard/settings'), false);
// MANAGER can reach /investigations (proxy for "can act on approvals" - the
// actual approve/reject gate is canManageManualApprovals(), checked below)
assert.equal(canReach('MANAGER', '/investigations'), true);
// MANAGER cannot access executive analytics
assert.equal(canReach('MANAGER', '/analytics'), false);
// ADMIN can access everything in ROUTE_PERMISSIONS
for (const [route, roles] of Object.entries(ROUTE_PERMISSIONS)) {
  assert.ok(hasAnyRole('ADMIN', roles), `ADMIN should be allowed on ${route}`);
  assert.ok(hasAnyRole('OWNER', roles), `OWNER should be allowed on ${route}`);
}
// /founder is deliberately absent from ROUTE_PERMISSIONS - it is gated by
// Clerk identity (FOUNDER_USER_ID / FOUNDER_EMAIL) in lib/founder-identity.ts
// and services/founder.ts's getFounderAccess(), never by Role. No tenant
// role - including ADMIN/OWNER - should ever appear in a founder allow-list.
assert.equal(ROUTE_PERMISSIONS['/founder'], undefined);
assert.equal(findRoutePermission('/founder'), null);

// --- Manual-approval write gate (canManageManualApprovals) ------------------

const manualApprovals = read('services/manual-approvals.ts');
assert.match(manualApprovals, /export function canManageManualApprovals/);
assert.match(manualApprovals, /hasAnyRole\(role, \['OWNER', 'ADMIN', 'MANAGER'\]\)/);

// --- Regression guard: sensitive pages must call enforcePageRole -----------

const roleGatedPages: Record<string, string> = {
  '/analytics': 'app/analytics/page.tsx',
  '/trust/compliance': 'app/trust/compliance/page.tsx',
  '/investigations': 'app/investigations/page.tsx',
  '/memory': 'app/memory/page.tsx',
  '/dashboard/alerts': 'app/dashboard/alerts/page.tsx',
  '/dashboard/settings': 'app/dashboard/settings/page.tsx',
  '/settings': 'app/settings/identity/page.tsx',
  '/playbooks': 'app/playbooks/page.tsx',
  '/dashboard/gateway': 'app/dashboard/gateway/page.tsx',
};

for (const [route, file] of Object.entries(roleGatedPages)) {
  const source = read(file);
  assert.match(source, /enforcePageRole/, `${file} should call enforcePageRole()`);
  assert.match(
    source,
    new RegExp(`enforcePageRole\\(\\s*['"]${route.replace(/\//g, '\\/')}['"]`),
    `${file} should gate on route ${route}`,
  );
}

// --- Regression guard: privilege-escalation-sensitive routes/services ------

const authSource = read('lib/auth.ts');
assert.match(authSource, /existingMemberCount === 0 \? 'OWNER' : 'MEMBER'/, 'getCurrentTenant() must only grant OWNER to an org\'s first user, MEMBER otherwise');
assert.doesNotMatch(authSource, /role:\s*'ADMIN',?\s*\n\s*\}\);/, 'no path should hardcode role: ADMIN on user creation');

const teamService = read('services/team.ts');
assert.match(teamService, /hasAnyRole\(actorRole, \['OWNER', 'ADMIN'\]\)/, 'only OWNER/ADMIN may change member roles');
assert.match(teamService, /ROLE_HIERARCHY\[newRole\] > ROLE_HIERARCHY\[actorRole\]/, 'a caller must never be able to assign a role above their own');
assert.match(teamService, /ownerCount <= 1/, 'the last OWNER in an org must never be demotable');

const onboardingApi = read('app/api/onboarding/route.ts');
assert.doesNotMatch(onboardingApi, /role !== 'ADMIN'/, 'onboarding API must not lock out OWNER (the first user of a new org)');

const onboardingPage = read('app/onboarding/page.tsx');
assert.doesNotMatch(onboardingPage, /role !== 'ADMIN'/, 'onboarding wizard must not lock out OWNER (the first user of a new org)');

console.log('Validated RBAC role hierarchy, route access matrix, manual-approval write gate, page-level enforcement wiring, and privilege-escalation guards.');
