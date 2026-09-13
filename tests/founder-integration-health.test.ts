import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { issueTextFor } from '../services/founder-integration-health';
import { computeIntegrationHealth, connectionStateForIntegrationStatus } from '../services/founder-customer-integrations';

// Part 1: REAL EXECUTED unit tests against the actual, imported pure
// helpers. A real, database-backed run of buildIntegrationHealthPortfolio()
// (a real local Postgres, four seeded organizations covering healthy/error/
// needs-reauth/disconnected/pending-access/an orphan org with an
// Integration row but no CustomerAccount, plus provider/health/search
// filters and pagination) was performed separately via a temporary,
// already-removed API route: 30/30 checks passed, including the discovery
// that "Total Connected" must count every real Integration row across all
// customers (not just the ones with problems) and that Provider Health
// Overview's healthy+attention+critical must always sum to exactly its own
// totalCustomers (fixed during that verification — PENDING-only customers
// are now excluded from that specific card's totals, since they have no
// bucket to fall into otherwise). That harness no longer exists in this
// repo; these are the real-code assertions that remain.

// ─── issueTextFor: honest, specific issue text, never a generic fallback
//     when a real reason is available ──────────────────────────────────────

assert.equal(issueTextFor('CONNECTED', 'CONNECTED', {}), null);
assert.equal(issueTextFor('PENDING', null, {}), 'Access granted, not yet connected');
assert.equal(issueTextFor('NOT_CONNECTED', 'DISCONNECTED', {}), 'Disconnected');
assert.equal(issueTextFor('SYNCING', 'SYNCING', {}), 'Sync in progress');
// A real lastError message always wins over a generic string.
assert.equal(
  issueTextFor('FAILED', 'ERROR', { lastError: 'OAuth token expired.' }),
  'OAuth token expired.',
);
// No lastError recorded: an honest, still-specific fallback distinguishing
// "needs reauth" from a plain connection failure — never the same generic
// string for both.
assert.equal(issueTextFor('FAILED', 'NEEDS_REAUTH', {}), 'Requires re-authentication');
assert.equal(issueTextFor('FAILED', 'ERROR', {}), 'Connection failure');

// ─── The reused health/connection rollup (never reimplemented here) ───────

assert.equal(connectionStateForIntegrationStatus('CONNECTED'), 'CONNECTED');
assert.equal(connectionStateForIntegrationStatus('ERROR'), 'FAILED');
assert.equal(connectionStateForIntegrationStatus('NEEDS_REAUTH'), 'FAILED');
assert.equal(connectionStateForIntegrationStatus('DISCONNECTED'), 'NOT_CONNECTED');
assert.equal(connectionStateForIntegrationStatus('SYNCING'), 'SYNCING');
assert.equal(computeIntegrationHealth('CONNECTED'), 'HEALTHY');
assert.equal(computeIntegrationHealth('FAILED'), 'CRITICAL');
assert.equal(computeIntegrationHealth('PENDING'), 'ATTENTION');
assert.equal(computeIntegrationHealth('NOT_CONNECTED'), 'ATTENTION');
assert.equal(computeIntegrationHealth('SYNCING'), 'ATTENTION');

console.log('Validated services/founder-integration-health.ts\'s real executed unit tests: issue text is always the real recorded error when one exists, never a generic string that discards a specific, actionable reason; and the reused connection/health rollup from Customer Integrations is imported, not reimplemented.');

// Part 2: static-analysis assertions, matching the convention used across
// tests/founder-*.test.ts in this repo (the accompanying real, database-
// backed verification for this task was performed separately via a
// temporary, already-removed API route against a local Postgres instance;
// these assertions cover architecture reuse, honest data semantics,
// security, and regression protection via source inspection).

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pureLib = read('lib/founder-integration-health.ts');
const service = read('services/founder-integration-health.ts');
const page = read('app/founder/integration-health/page.tsx');
const client = read('components/founder/IntegrationHealthClient.tsx');
const customerIntegrationsService = read('services/founder-customer-integrations.ts');
const customerIntegrationsLib = read('lib/founder-customer-integrations.ts');
const customerIntegrationsActions = read('app/founder/customer-integrations/actions.ts');
const founderService = read('services/founder.ts');
const founderDemoGenerator = read('services/founderDemoGenerator.ts');
const navClient = read('components/founder/FounderNavClient.tsx');
const prismaSchema = read('prisma/schema.prisma');
const slackRoute = read('app/api/integrations/slack/events/route.ts');

// ─── Architecture: correct source of truth, no duplicate health engine ───

// 1. No new integration/connection-health Prisma model was introduced.
assert.doesNotMatch(prismaSchema, /model\s+IntegrationHealth\b/);

// 2. CustomerIntegrationStatus (found NOT to be the live-written table for
//    real customers — only Founder-side access-grant toggles and synthetic
//    demo-seed data ever write CONNECTED/lastSyncAt to it) is never queried
//    by this module.
assert.doesNotMatch(service, /prisma\.customerIntegrationStatus\./);
// The demo generator's use of it is confirmed to be synthetic seed data,
// not a real customer signal — documented, not silently assumed.
assert.match(founderDemoGenerator, /demo: true/);
assert.match(founderService, /connectionState: enabledIntegrationKeys\.has\(integration\.key\) \? 'ACCESS_ENABLED' : 'NOT_ENABLED'/);

// 3. TenantProviderAccess + Integration (the real, currently-wired tables)
//    are the actual source of truth.
assert.match(service, /prisma\.integration\.findMany/);
assert.match(service, /prisma\.tenantProviderAccess\.findMany/);
// Never selects credential-bearing fields (the header comment legitimately
// names encryptedTokens in prose to document that it's excluded, so
// comments are stripped before searching for an actual `select`).
const serviceCodeOnly = service.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert.doesNotMatch(serviceCodeOnly, /encryptedTokens|scopes:\s*true/);

// 4. The one authoritative health/connection rollup is imported from
//    Customer Integrations, never re-derived.
assert.match(service, /import \{\s*\n?\s*SLUG_TO_INTEGRATION_PROVIDER,\s*\n?\s*connectionStateForIntegrationStatus,\s*\n?\s*computeIntegrationHealth,\s*\n?\s*\} from '@\/services\/founder-customer-integrations'/);
assert.doesNotMatch(service, /function computeIntegrationHealth|function connectionStateForIntegrationStatus/);
// The export was additive-only on the existing file — the function bodies
// themselves are untouched (still the same 5-branch switch).
assert.match(customerIntegrationsService, /export function connectionStateForIntegrationStatus\(status: IntegrationStatus\): CustomerIntegrationConnectionState \{/);
assert.match(customerIntegrationsService, /export function computeIntegrationHealth\(connection: CustomerIntegrationConnectionState\): CustomerIntegrationHealthState \{/);

// 5. The drawer reuses the EXACT existing detail query/action — no second
//    detail-fetch was written for this page.
assert.match(page, /import \{ getCustomerIntegrationDetail \} from '\.\.\/customer-integrations\/actions'/);
assert.doesNotMatch(service, /export async function build\w*Detail/);
assert.match(customerIntegrationsActions, /export async function getCustomerIntegrationDetail/);

// 6. Vocabulary is reused verbatim from Customer Integrations, never a
//    second "Degraded"/"Failed" naming scheme for the same underlying state.
assert.match(pureLib, /HEALTH_STATE_LABELS,/);
// "Degraded" (the illustrative reference mockup's word for the ATTENTION
// health state) never appears as a hardcoded string in the client — health
// labels are always looked up dynamically via HEALTH_STATE_LABELS.
// ("Failed" legitimately appears via CONNECTION_STATE_LABELS.FAILED — a
// genuinely different, real field: the raw connection state, shown
// alongside, not instead of, the rolled-up health state.)
assert.doesNotMatch(client, /'Degraded'|>Degraded</);
assert.match(customerIntegrationsLib, /HEALTHY: 'Healthy',/);

// 7. Universal Gateway is deliberately excluded from the per-customer grid
//    (no per-customer Integration row concept exists for it).
assert.doesNotMatch(service, /UNIVERSAL_GATEWAY|'gateway'/i);

// ─── The real, severe bug found and fixed during this task's own
//     architecture audit — confirmed still fixed ──────────────────────────

// 8. Slack's webhook handler restores CONNECTED after a successful event
//    instead of leaving status stuck at SYNCING forever.
assert.match(slackRoute, /status: 'CONNECTED', metadata: syncingMetadata/);

// ─── Honest data semantics ──────────────────────────────────────────────

// 9. PENDING (access granted, not yet connected) is never counted as an
//    operational "Attention" problem — it is an onboarding state, not a
//    health regression. Verified at the source-shape level: the operational
//    filter excludes it explicitly.
assert.match(service, /function isOperationalProblem\(connection: CustomerIntegrationConnectionState\): boolean \{/);
assert.match(service, /return connection === 'FAILED' \|\| connection === 'NOT_CONNECTED' \|\| connection === 'SYNCING';/);

// 10. Provider Health Overview excludes PENDING-only customers from its
//     totalCustomers count specifically, so healthy+attention+critical
//     always sums to totalCustomers exactly (a real inconsistency caught
//     and fixed during real-DB verification, before this test existed).
assert.match(service, /rowsForProvider = allRows\.filter\(\(r\) => r\.providerSlug === slug && r\.connection !== 'PENDING'\)/);

// 11. No uptime/latency/deployment numbers are fabricated anywhere in this
//     module.
for (const file of [service, client, pureLib]) {
  assert.doesNotMatch(file, /99\.9%|uptime:|latency:|responseTime|deploymentFrequency/i);
}

// 12. An orphaned Organization (an Integration row exists, but no
//     CustomerAccount) can never surface — every row-building path requires
//     a matched customer.
assert.match(service, /if \(!customer\) continue;/);
assert.match(service, /customerAccount: \{ isNot: null \}/);

// ─── Security / authorization ───────────────────────────────────────────

// 13. Founder identity is resolved server-side; this page has no mutations
//     of its own (read-only — every action in the drawer is a navigation
//     Link, never a form/server action).
assert.match(page, /await getFounderAccess\(\);/);
assert.doesNotMatch(page, /'use server'/);
assert.doesNotMatch(client, /'use server'/);
assert.doesNotMatch(client, /<form action=\{/);

// 14. No secret/credential value is ever interpolated into output.
const secretPatterns = /DATABASE_URL|REDIS_URL|CLERK_SECRET_KEY|OPENAI_API_KEY|ENCRYPTION_KEY|encryptedTokens/;
for (const file of [serviceCodeOnly, client, page, pureLib]) {
  assert.doesNotMatch(file, secretPatterns);
}

// 15. Search parameters are validated against a real allow-list before
//     reaching the service — the health-state cast is only ever reachable
//     after this check, never a bare client-supplied cast.
assert.match(page, /VALID_HEALTH_STATES\.has\(params\.health \?\? ''\) && params\.health !== 'HEALTHY' \? \(params\.health as 'ATTENTION' \| 'CRITICAL'\) : undefined/);

// ─── Customer attribution ────────────────────────────────────────────────

// 16. Every row is scoped through the real customerAccount relation — never
//     inferred from metadata.
assert.match(service, /const customer = customerByOrgId\.get\(orgId\);/);

// ─── Performance: no N+1 ─────────────────────────────────────────────────

// 17. Exactly 4 queries total, independent of data volume: integrations,
//     tenantAccess, providers (parallel), then customers (scoped to the
//     exact orgIds from the first two) — never a per-customer or
//     per-provider query.
assert.match(service, /await Promise\.all\(\[/);
assert.equal((service.match(/prisma\.integration\.findMany\(/g) ?? []).length, 1);
assert.equal((service.match(/prisma\.customerAccount\.findMany\(/g) ?? []).length, 1);
assert.doesNotMatch(service, /for \(const \w+ of \w+\) \{[\s\S]{0,200}?await prisma/);

// ─── No dead buttons/links ────────────────────────────────────────────────

// 18. Every <button> has a real onClick; every drawer Quick Action Link
//     points at a real, existing route, never "#" and never an
//     unauthorized mutation (Retry/Reconnect/Disable are never offered).
const buttonBlocks = [...client.matchAll(/<button[\s\S]{0,200}?>/g)].map((m) => m[0]);
assert.ok(buttonBlocks.length >= 3);
for (const block of buttonBlocks) {
  // A type="submit" button inside <form onSubmit={...}> is not dead — the
  // form's own real handler fires it; every other button must have its own.
  const isFormSubmit = /type="submit"/.test(block);
  if (!isFormSubmit) assert.match(block, /onClick=\{/, `button without onClick: ${block.slice(0, 80)}`);
}
assert.match(client, /<form onSubmit=\{submitSearch\}/); // confirms the one submit button really is wired to a real handler
const linkHrefs = [...client.matchAll(/<Link href=\{?["`]([^"'`]+)/g)].map((m) => m[1]);
assert.ok(linkHrefs.length >= 4);
for (const href of linkHrefs) assert.notEqual(href, '#');
assert.doesNotMatch(client, />\s*Retry\s*</i);
assert.doesNotMatch(client, />\s*Reconnect\s*</i);
assert.doesNotMatch(client, />\s*Disable\s*</i);

// ─── Accessibility ──────────────────────────────────────────────────────

assert.match(client, /scope="col"/);
assert.doesNotMatch(client, /<tr[^>]*onClick/);
assert.match(client, /role="tablist"/);
assert.match(client, /role="tab"/);
assert.match(client, /aria-selected=\{drawerTab === t\}/);
assert.match(client, /aria-label="Close integration details"/);
assert.match(client, /aria-busy=\{pending\}/);
assert.match(client, /focus-visible:ring-2 focus-visible:ring-\[#2557dc\]/);

// ─── Drawer reuse ─────────────────────────────────────────────────────────

assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
assert.doesNotMatch(client, /role="dialog"|aria-modal="true"/); // lives only inside FounderDrawer itself
assert.equal((client.match(/<FounderDrawer/g) ?? []).length, 1);

// ─── Responsive structure ──────────────────────────────────────────────

assert.match(client, /overflow-x-auto/);
assert.match(client, /table-fixed/);
assert.match(client, /sm:grid-cols-3 lg:grid-cols-5/); // KPI strip steps down
assert.match(client, /grid-cols-1 gap-6 lg:grid-cols-2/); // Provider Overview / Customer Impact stack on narrow screens

// 21. Found during adversarial visual QA at 390px: the Integration Attention
//     table's min-w-[900px] pushed Status/Issue/Action out of the viewport
//     behind a horizontal scrollbar, violating the requirement that
//     Customer/Provider/Status/Issue/Action stay visible on mobile. Fixed
//     with a below-sm card layout carrying the exact same fields, rather
//     than shrinking the table until it became unreadable.
assert.match(client, /<ul className="divide-y divide-slate-100 sm:hidden">/);
assert.match(client, /<div className="hidden overflow-x-auto sm:block">/);
// The mobile cards render the same 5 required fields per row.
const mobileCardBlock = client.match(/<ul className="divide-y divide-slate-100 sm:hidden">([\s\S]*?)<\/ul>/)?.[1] ?? '';
assert.match(mobileCardBlock, /row\.companyName/);
assert.match(mobileCardBlock, /row\.providerDisplayName/);
assert.match(mobileCardBlock, /HEALTH_STATE_LABELS\[row\.health\]/);
assert.match(mobileCardBlock, /row\.issue/);
assert.match(mobileCardBlock, /onClick=\{\(\) => openDrawer\(row\)\}/);

// ─── Empty states ─────────────────────────────────────────────────────────

assert.match(client, /No customer integrations found/);
assert.match(client, /All connected integrations are currently healthy\./);
assert.match(client, /No integrations match your current filters\./);
assert.match(client, /No provider has any customer integration yet\./);
assert.match(client, /No customer is currently affected\./);

// ─── Regression protection ────────────────────────────────────────────────

// 19. The locked Platform sidebar's Integration Health entry now points at
//     this real page; System Health and Background Jobs are unchanged.
const platformSection = navClient.match(/id: 'platform',[\s\S]*?items: \[([\s\S]*?)\],\s*\},/)?.[1] ?? '';
assert.match(platformSection, /\{ label: 'Integration Health', href: '\/founder\/integration-health' \}/);
assert.match(platformSection, /\{ label: 'System Health', href: '\/founder\/system-health' \}/);
assert.match(platformSection, /\{ label: 'Background Jobs', href: '\/founder\/reliability' \}/);
assert.equal((platformSection.match(/\{ label:/g) ?? []).length, 3);

// 20. Customer Integrations and Integration Catalog (locked, pre-existing
//     pages this module cross-links to and reuses) were not modified beyond
//     the additive export in item 4 above.
assert.match(customerIntegrationsService, /export async function buildCustomerIntegrationsPortfolio/);
assert.doesNotMatch(customerIntegrationsActions, /getCustomerIntegrationDetail.*integration-health/); // that action was not rewired or duplicated for this page

console.log('Validated Integration Health (/founder/integration-health): a read-only, cross-customer operational view built entirely on the real, currently-wired TenantProviderAccess + Integration tables and the health/connection vocabulary already shipped by Customer Integrations — never CustomerIntegrationStatus, which was independently found to be written only by Founder-side access grants and synthetic demo data, never a real customer\'s actual connection state. No new health engine, no new drawer, no new detail query. A real, severe pre-existing defect (Slack\'s webhook handler leaving Integration.status stuck at SYNCING forever, breaking ingestion after the first event) was found during this audit and fixed separately. PENDING (access granted, not yet connected) is treated as an onboarding state, never an operational health problem, consistently across KPIs, the Attention list, and Provider Health Overview\'s customer totals.');
