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

// --- KPI strip: every count is a real tenant-scoped aggregate, no invented ---
// -- denominators (Overview screenshot rebuild) -------------------------------

assert.match(service, /export async function fetchSettingsOverview/, 'the uncached overview fetcher must be exported so it can be exercised directly by tests/scripts without Next.js unstable_cache');

for (const query of [
  /prisma\.evidenceProviderConnection\.count\(\{ where: tenantScopedWhere\(scope\) \}\)/,
  /prisma\.evidenceProviderConnection\.count\(\{ where: tenantScopedWhere\(scope, \{ status: \{ in: \['CONNECTED', 'SYNCING'\] \} \}\) \}\)/,
  /prisma\.approvalRecord\.count\(\{ where: tenantScopedWhere\(scope, \{ createdAt: \{ gte: startOfMonth \} \}\) \}\)/,
  /prisma\.complianceFramework\.findMany\(\{\s*where: tenantScopedWhere\(scope\)/,
  /prisma\.playbookDocument\.count\(\{ where: tenantScopedWhere\(scope, \{ status: 'READY' \}\)/,
]) {
  assert.match(service, query, `expected a real tenant-scoped query matching ${query}`);
}

// --- Integration counts: one shared service, not two competing computations --

const integrationSummaryService = read('services/integrations/summary.ts');
const integrationsPage = read('app/dashboard/settings/integrations/page.tsx');

assert.match(integrationSummaryService, /export async function getIntegrationSummary/, 'expected a single exported integration-summary function');
assert.match(integrationSummaryService, /prisma\.marketplaceProvider\.count\(\{ where: \{ isNative: true, status: 'AVAILABLE' \} \}\)/, 'catalog size must come from a real MarketplaceProvider count');
assert.match(integrationSummaryService, /i\.status === 'CONNECTED' \|\| i\.status === 'SYNCING'/, 'connected count must match the Integrations page\'s own definition (CONNECTED or SYNCING)');
assert.match(service, /import \{ getIntegrationSummary \} from '@\/services\/integrations\/summary'/, 'Organization Settings Overview must call the shared integration summary, not compute its own count');
assert.match(integrationsPage, /import \{ PROVIDER_TO_SLUG, getIntegrationSummary \} from '@\/services\/integrations\/summary'/, 'the real Integrations page must import the same shared PROVIDER_TO_SLUG/getIntegrationSummary, not keep a second local copy');
assert.doesNotMatch(integrationsPage, /^const PROVIDER_TO_SLUG/m, 'the Integrations page must not redefine its own PROVIDER_TO_SLUG after the shared extraction');
// MarketplaceProvider is a shared, non-tenant catalog table (no organizationId
// column) - it must never be filtered by tenantScopedWhere, which would be a
// type/architecture error, not a safety improvement.
assert.doesNotMatch(integrationSummaryService, /marketplaceProvider\.count\(\{ where: tenantScopedWhere/, 'MarketplaceProvider has no organizationId column - it must be queried as a global catalog, not tenant-scoped');

// jsonArray must be reused from services/users.ts, never re-implemented.
assert.match(service, /import \{ jsonArray, type PendingInvite \} from '@\/services\/users'/, 'pending-invite parsing must reuse services/users.ts\'s jsonArray(), not a second implementation');
assert.doesNotMatch(service, /function jsonArray/, 'services/settings.ts must not define its own copy of jsonArray');

// Monthly Usage / Approval Usage must never invent a plan-limit denominator -
// there is no monthly-approval limit field anywhere in lib/plans.ts.
assert.match(shell, /No plan limit configured/, 'Monthly Usage / Approval Usage must show an honest "no plan limit configured" state, not a fabricated denominator');
assert.doesNotMatch(shell, /742|1,250|1250/, 'the screenshot\'s sample numbers must never be hardcoded into the real component');

// --- Compliance Frameworks: real data, not a certification claim -------------

assert.match(shell, /data\.complianceFrameworks\.map/, 'Security & Compliance must render real per-org ComplianceFramework rows, not a static SOC2/GDPR list');
assert.match(shell, /not a claim of third-party certification/, 'enabling a framework in-app must be clearly labeled as configuration, never as an actual certification claim');
assert.doesNotMatch(service, /prisma\.complianceFramework\.findMany\(\{\s*where: \{[^t]/, 'the compliance framework query must be tenant-scoped via tenantScopedWhere, never a bare organizationId filter that could be bypassed');

// --- Branding: real, persisted logo/color/domain, not decorative placeholders

const logoRoute = read('app/api/settings/organization/logo/route.ts');
const domainRoute = read('app/api/settings/organization/domain/route.ts');
const colorContrastLib = read('lib/color-contrast.ts');

// Logo upload: real content validation via sharp (never trusts declared
// MIME type alone), tenant-scoped storage path, RBAC-gated, audited.
assert.match(logoRoute, /hasAnyRole\(tenant\.user\.role, \['ADMIN', 'OWNER'\]\)/, 'logo upload must be RBAC-gated the same as other organization mutations');
assert.match(logoRoute, /sharp\(inputBuffer/, 'logo upload must decode/re-encode through sharp to prove real image content, not trust the declared Content-Type');
assert.match(logoRoute, /org-logos\/\$\{organizationId\}\//, 'logo storage path must be tenant-scoped by the server-resolved organizationId');
assert.doesNotMatch(logoRoute, /\.svg|image\/svg/, 'SVG must never be an accepted logo format - it can carry embedded scripts/XXE');
assert.match(logoRoute, /await writeAuditLog/, 'logo changes must be audited');

// Brand color: real WCAG contrast validation server-side, shared math with
// the theme system's own token tests (no separate approximation).
assert.match(colorContrastLib, /export function contrastRatio/, 'expected the shared contrast-ratio implementation');
const orgRouteForColor = read('app/api/settings/organization/route.ts');
assert.match(orgRouteForColor, /contrastRatio\(rgb, \[255, 255, 255\]\)/, 'brand color must be validated against real contrast math before being persisted, not just a hex-format regex');
assert.match(orgRouteForColor, /AA_NORMAL_TEXT_CONTRAST/, 'brand color contrast check must use the same AA threshold as the theme token tests');

// Custom domain: real DNS TXT verification (Node's dns module), never a
// fake "verified" state.
assert.match(domainRoute, /import \{ .*resolveTxt.* \} from 'node:dns\/promises'/, 'domain verification must perform a real DNS lookup');
assert.match(domainRoute, /records\.some\(\(chunks\) => chunks\.join\(''\)\.trim\(\) === expected\)/, 'a domain is only marked VERIFIED after the DNS TXT record is actually found to match the generated token');
assert.doesNotMatch(domainRoute, /customDomainStatus: 'VERIFIED'[\s\S]{0,200}randomBytes/, 'must never mark a domain VERIFIED without a real DNS check in between');

// The Overview card wires all three to their real endpoints, not static text.
assert.match(shell, /fetch\('\/api\/settings\/organization\/logo'/, 'Branding UI must call the real logo upload endpoint');
assert.match(shell, /fetch\('\/api\/settings\/organization\/domain'/, 'Branding UI must call the real domain endpoint');
assert.match(shell, /input type="color"/, 'brand color must be a real color input, not a decorative swatch');

// --- Edit Organization Information drawer: real accessible dialog ------------

assert.match(shell, /function EditOrganizationDrawer/, 'Organization Information must be editable via a real drawer component, not just an inline dirty-state form');
assert.match(shell, /<DetailDrawer open onClose=\{onClose\} titleId=\{titleId\}/, 'the edit drawer must reuse the shared accessible DetailDrawer primitive (focus trap, Escape, aria-labelledby), not a second hand-rolled overlay');
assert.match(shell, /import \{ DetailDrawer \} from '@\/components\/dashboard\/DetailDrawer'/, 'must import the existing DetailDrawer rather than reimplementing dialog accessibility');

// primaryAdminName/primaryAdminEmail must now be patchable via the same
// validated route (Primary Contact / Contact Email in Organization Information).
assert.match(apiRoute, /primaryAdminName: z\.string\(\)\.max\(200\)\.optional\(\)\.nullable\(\)/, 'primaryAdminName must be Zod-validated like every other field');
assert.match(apiRoute, /primaryAdminEmail: z\.string\(\)[\s\S]{0,80}\.email\(\)/, 'primaryAdminEmail must be validated as a real email, not accepted as arbitrary text');

// --- Top navigation matches the approved Organization Settings IA -----------

for (const label of ['Overview', 'Users & Teams', 'Integrations', 'Approval Settings', 'Security & Compliance', 'Billing & Plan', 'Usage & Limits', 'Audit & Logs']) {
  assert.match(shell, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `top Settings navigation must include "${label}"`);
}

// Usage & Limits must reuse the exact same billing.* seat fields as Billing &
// Plan - not a second usage-calculation engine.
const usageTabMatch = shell.match(/function UsageLimitsTab[\s\S]{0,3000}?\n}/);
assert.ok(usageTabMatch, 'expected to find UsageLimitsTab');
assert.match(usageTabMatch![0], /billing\.purchasedSeats/, 'Usage & Limits must read the same billing.purchasedSeats field Billing & Plan uses');
assert.doesNotMatch(usageTabMatch![0], /prisma\./, 'Usage & Limits must not run its own Prisma queries - it is a client component reading the already-fetched SettingsOverview, same as every other tab');

// --- Data consistency: every tab reads the same single-fetch SettingsOverview
// -- object - none may run its own Prisma query for a number another tab ----
// -- already shows, which is structurally what prevents "Overview says 12,
// -- Integrations says 11" style disagreements. ------------------------------

for (const tabName of ['OverviewTab', 'ApprovalSettingsTab', 'SecurityTab', 'IntegrationsTab', 'UsersTab', 'BillingTab', 'UsageLimitsTab', 'AuditTab']) {
  const tabMatch = shell.match(new RegExp(`function ${tabName}\\([\\s\\S]{0,10000}?\\n}\\n`));
  assert.ok(tabMatch, `expected to find ${tabName}`);
  assert.doesNotMatch(tabMatch![0], /await prisma\.|from '@\/lib\/prisma'/, `${tabName} must render only from its SettingsOverview prop, never run its own database query (that would let it drift from the other tabs)`);
}

// Approval Settings' workflow count must be the exact same field Overview's
// KPI strip and quick-link card use - not a re-derived value.
const approvalTabMatch = shell.match(/function ApprovalSettingsTab\([\s\S]{0,10000}?\n}\n/);
assert.ok(approvalTabMatch, 'expected to find ApprovalSettingsTab');
assert.match(approvalTabMatch![0], /data\.kpis\.workflowsTotal/, 'Approval Settings must display the same kpis.workflowsTotal Overview shows, not a separately computed workflow count');

// Security & Compliance's enabled-framework count must be derived from the
// same data.complianceFrameworks array Overview's quick-link card filters,
// not a second query.
const securityTabMatch = shell.match(/function SecurityTab\([\s\S]{0,10000}?\n}\n/);
assert.ok(securityTabMatch, 'expected to find SecurityTab');
assert.match(securityTabMatch![0], /data\.complianceFrameworks\.map/, 'Security & Compliance must render the same data.complianceFrameworks array Overview summarizes');

// Billing's "Not provisioned" state and Usage & Limits' honest empty state
// must both key off the exact same nullable data.billing - one can never
// show a real plan while the other claims unprovisioned.
assert.match(shell, /No active plan\/seat allocation has been configured for this workspace\./, 'Billing must state the real reason it is unprovisioned, not a bare label');
assert.match(usageTabMatch![0], /has not yet been provisioned with a plan/, 'Usage & Limits must show the same honest unprovisioned state as Billing when data.billing is null');

console.log('Validated Organization Settings: tenant/RBAC-scoped organization update route with a real audit trail, tenant-scoped and honestly-nullable Billing & Plan / Seats & Usage data (CustomerAccount + CustomerSeatAllocation, never CustomerHealth.activeUsers, never the founder-internal estimatedArrUsd), the rebuilt Overview KPI strip and Compliance Frameworks section backed by real tenant-scoped aggregates with no invented denominators, an accessible Edit Organization Information drawer reusing DetailDrawer, real persisted Branding (sharp-validated logo upload, WCAG-contrast-checked brand color, DNS-verified custom domain) and a single shared Integration summary service eliminating the Overview/Integrations count disagreement, no secrets rendered, every "Manage X" link resolving to a real existing route, and canonical design-token usage.');
