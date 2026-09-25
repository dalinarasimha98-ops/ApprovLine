/**
 * Organization Settings (/dashboard/settings) — regression tests.
 *
 * Personal account settings live at /settings/profile (see
 * tests/user-settings.test.ts); this file covers the separate,
 * organization-wide administration surface: services/settings.ts,
 * components/settings/SettingsShell.tsx, and the organization-update API
 * route. These tests verify:
 *  - the organization PATCH route is tenant/RBAC-scoped and never trusts a
 *    client-supplied organizationId;
 *  - the real Billing & Plan / Seats & Usage data added this pass is
 *    tenant-scoped, honestly null when the org has no CustomerAccount yet
 *    (not a fabricated default), and never substitutes
 *    CustomerHealth.activeUsers for CustomerSeatAllocation.usedSeats;
 *  - CustomerAccount.estimatedArrUsd (a founder-internal planning figure
 *    per its own schema doc comment) is never surfaced to the customer as
 *    "their" ARR;
 *  - no secrets/credentials are ever selected or rendered;
 *  - every "Manage X" action links to a real, existing route rather than a
 *    placeholder.
 *
 * Static-source checks (no DB/Clerk required). Run: node --import tsx tests/organization-settings.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:organization-settings'], 'node --import tsx tests/organization-settings.test.ts');

const service = read('services/settings.ts');
const shell = read('components/settings/SettingsShell.tsx');
const page = read('app/dashboard/settings/page.tsx');
const apiRoute = read('app/api/settings/organization/route.ts');

// --- RBAC / tenant scoping on the mutation route ----------------------------

assert.match(apiRoute, /const tenant = await getDashboardTenant\(/, 'the organization PATCH route must resolve identity server-side');
assert.match(apiRoute, /hasAnyRole\(tenant\.user\.role, \['ADMIN', 'OWNER'\]\)/, 'only ADMIN/OWNER may update organization settings');
assert.match(apiRoute, /where: \{ id: organizationId \}/, 'the update must be scoped by the server-resolved organizationId');
assert.doesNotMatch(apiRoute, /req\.json\(\)[\s\S]{0,200}organizationId/, 'organizationId must never be read from the request body');
assert.match(apiRoute, /await writeAuditLog\(/, 'organization updates must be audited');

// --- Page-level RBAC gate ----------------------------------------------------

assert.match(page, /enforcePageRole\('\/dashboard\/settings', tenant\.user\.role\)/, 'the settings page must enforce role server-side, not just hide the link');

// --- Real billing/seat data, tenant-scoped, honestly nullable ---------------

assert.match(service, /prisma\.customerAccount\.findUnique\(\{\s*where: \{ organizationId \}/, 'billing data must be scoped by the caller-supplied organizationId, not a client-trusted value');
assert.match(service, /billing: customerAccount\s*\?/, 'billing must be null (not a fabricated default) when the organization has no CustomerAccount yet');
assert.match(service, /purchasedSeats: customerAccount\.seatAllocation\?\.purchasedSeats \?\? 0/, 'seat numbers must come from the real CustomerSeatAllocation relation');

// Must never substitute CustomerHealth.activeUsers for actual seat usage -
// no query against that model may exist at all in this file.
assert.doesNotMatch(service, /prisma\.customerHealth/, 'services/settings.ts must never query CustomerHealth as a stand-in for seat usage - they are different, non-equivalent metrics');

// Must never surface the founder-internal ARR planning figure to the customer -
// the Prisma select clause that reads CustomerAccount must not include it.
const selectClauseMatch = service.match(/prisma\.customerAccount\.findUnique\(\{[\s\S]{0,300}?\.catch\(\(\) => null\),/);
assert.ok(selectClauseMatch, 'expected to find the customerAccount select clause');
assert.doesNotMatch(selectClauseMatch![0], /estimatedArrUsd/, 'estimatedArrUsd is a founder-internal planning estimate per its own schema doc comment - the select clause must never fetch it for customer display');
assert.doesNotMatch(shell, /estimatedArrUsd|Estimated ARR|\bARR\b|\bMRR\b/, 'the customer-facing Billing tab must never display or compute an ARR/MRR figure');

// Utilization must be derived from the real numbers, never a separately fabricated figure.
assert.match(shell, /Math\.round\(\(billing\.usedSeats \/ billing\.purchasedSeats\) \* 100\)/, 'utilization must be computed from the real usedSeats/purchasedSeats, not a separate invented value');

// Honest empty state when unprovisioned.
assert.match(shell, /has not yet been provisioned with a plan/, 'must show an honest empty state, not a fabricated plan, when no CustomerAccount exists');

// --- No secrets ever selected or rendered ------------------------------------

for (const forbidden of ['encryptedTokens', 'encryptedCredentials', 'clientSecret', 'secretKey', 'apiKey', 'refreshToken']) {
  assert.ok(!service.includes(forbidden), `services/settings.ts must never select or return "${forbidden}"`);
  assert.ok(!shell.includes(forbidden), `SettingsShell.tsx must never render "${forbidden}"`);
}

// --- "Manage X" links point to real, existing routes -------------------------

const linkedRoutes = ['/settings/users', '/settings/identity', '/playbooks', '/evidence', '/dashboard/settings/integrations', '/dashboard/gateway', '/dashboard/audit-log', '/dashboard/alerts', '/health', '/trust', '/trust/compliance', '/memory'];
for (const route of linkedRoutes) {
  assert.match(shell, new RegExp(`href="${route.replace(/\//g, '\\/')}"`), `SettingsShell must link to the real ${route} route`);
}
// Every one of those routes must actually exist as a page in the repo (not a future/placeholder route).
const routeToFile: Record<string, string> = {
  '/settings/users': 'app/settings/users/page.tsx',
  '/settings/identity': 'app/settings/identity/page.tsx',
  '/playbooks': 'app/playbooks/page.tsx',
  '/evidence': 'app/evidence/page.tsx',
  '/dashboard/settings/integrations': 'app/dashboard/settings/integrations/page.tsx',
  '/dashboard/gateway': 'app/dashboard/gateway/page.tsx',
  '/dashboard/audit-log': 'app/dashboard/audit-log/page.tsx',
  '/dashboard/alerts': 'app/dashboard/alerts/page.tsx',
  '/health': 'app/health/page.tsx',
  '/trust': 'app/trust/page.tsx',
  '/trust/compliance': 'app/trust/compliance/page.tsx',
  '/memory': 'app/memory/page.tsx',
};
for (const [route, file] of Object.entries(routeToFile)) {
  assert.ok(existsSync(`${root}/${file}`), `linked route ${route} must correspond to a real page (${file}) - no dead navigation`);
}

// --- Design tokens, not hardcoded colors -------------------------------------

assert.doesNotMatch(shell, /bg-blue-600|text-blue-600|divide-slate-\d|hover:bg-al-info\/100/, 'SettingsShell must use the canonical al-* token system, not hardcoded blue/slate values or the malformed hover:bg-al-info/100 pairing');

console.log('Validated Organization Settings: tenant/RBAC-scoped organization update route with a real audit trail, tenant-scoped and honestly-nullable Billing & Plan / Seats & Usage data (CustomerAccount + CustomerSeatAllocation, never CustomerHealth.activeUsers, never the founder-internal estimatedArrUsd), no secrets rendered, every "Manage X" link resolving to a real existing route, and canonical design-token usage.');
