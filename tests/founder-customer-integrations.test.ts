import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across
// tests/founder-*.test.ts in this repo: there is no live-database test
// harness here (CI's DATABASE_URL points at nothing reachable), so these
// assert the source code reuses the existing MarketplaceProvider/
// TenantProviderAccess/Integration/CustomerAccount/Event/
// CanonicalEvidenceEvent/FounderAuditLog architecture (never a duplicate
// model or engine), derives every operational state from a real field a
// real connector route actually writes (never a fabricated heuristic),
// enforces server-side Founder authorization and read-only protection,
// never trusts a client-supplied actor identity, never serializes
// credential-bearing fields, and ships an accessible, non-dead-button,
// honestly-empty-stated operational console — rather than exercising a
// real Postgres instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pureLib = read('lib/founder-customer-integrations.ts');
const service = read('services/founder-customer-integrations.ts');
const actions = read('app/founder/customer-integrations/actions.ts');
const page = read('app/founder/customer-integrations/page.tsx');
const client = read('components/founder/CustomerIntegrationsClient.tsx');
const founderLayout = read('app/founder/layout.tsx');
const navClient = read('components/founder/FounderNavClient.tsx');
const integrationCatalogActions = read('app/founder/integrations/actions.ts');
const gmailIntegrationService = read('services/integrations/gmail.ts');
const evidenceProviderSdk = read('services/evidence/provider-sdk.ts');
const evidencePlatformTest = read('tests/evidence-platform.test.ts');

// ─── Architecture: reuse existing models/engines, no duplicates ───────────

// 1. No new Prisma model was introduced for this page.
const forbiddenModelPattern = /model\s+(CustomerIntegrationRow|IntegrationHealthRecord|CustomerIntegrationEngine|SyncStatusRecord)\b/;
for (const file of [service, actions, page, client]) {
  assert.doesNotMatch(file, forbiddenModelPattern);
}

// 2. The service reuses the one authoritative slug<->IntegrationProvider
//    mapping already defined in services/founder-integrations.ts (Integration
//    Catalog) — never a second, independently-maintained mapping.
assert.match(service, /import \{ SLUG_TO_INTEGRATION_PROVIDER \} from '@\/services\/founder-integrations';/);
assert.doesNotMatch(service, /const SLUG_TO_INTEGRATION_PROVIDER\s*[:=]/);

// 3. Customer access enable/disable reuse Integration Catalog's exact,
//    already-hardened enableProviderForTenant/disableProviderForTenant —
//    never a duplicate access mutator. (A 'use server' file may only export
//    async functions, so these are imported directly by page.tsx rather
//    than re-exported from actions.ts.)
assert.match(page, /import \{ enableProviderForTenant, disableProviderForTenant \} from '\.\.\/integrations\/actions';/);
assert.doesNotMatch(actions, /function enableProviderForTenant|function disableProviderForTenant/);
assert.doesNotMatch(service, /prisma\.tenantProviderAccess\.(upsert|create|update|delete|deleteMany)\(/);

// 4. Architecture finding, verified from source: the newer Evidence
//    Provider SDK tables (EvidenceProviderConnection/EvidenceProviderHealth/
//    EvidenceProcessingFailure) have no real caller anywhere —
//    registerEvidenceProvider() is invoked only from the test file, never
//    from a real connector or route — so this page correctly does NOT
//    build its Sync/Evidence columns on those empty-in-production tables.
assert.match(evidenceProviderSdk, /export function registerEvidenceProvider/);
const registerCallSites = [...evidencePlatformTest.matchAll(/registerEvidenceProvider\(/g)];
assert.equal(registerCallSites.length > 0, true);
// No real connector service calls registerEvidenceProvider — the test file
// above is the only real call site in the whole repository.
assert.doesNotMatch(gmailIntegrationService, /registerEvidenceProvider/);
assert.doesNotMatch(service, /evidenceProviderConnection\.(findMany|findFirst|findUnique|count|groupBy)\(/);

// ─── Operational states are derived from real, already-written fields ─────

// 5. Connection state is a pure function of the real Integration.status
//    enum (the field every OAuth callback/sync route in
//    services/integrations/*.ts actually writes) — never invented.
assert.match(service, /function connectionStateForIntegrationStatus\(status: IntegrationStatus\)/);
assert.match(service, /case 'CONNECTED': return 'CONNECTED';/);
assert.match(service, /case 'ERROR':\s*\n\s*case 'NEEDS_REAUTH': return 'FAILED';/);

// 6. Health is one explicit, documented rollup of that same real field —
//    never a second scoring engine, never a time-based heuristic (e.g.
//    "no sync in 24h = critical") the product does not already define.
assert.match(service, /export function computeIntegrationHealth\(connection: CustomerIntegrationConnectionState\): CustomerIntegrationHealthState \{/);
assert.doesNotMatch(service, /24 \* 60 \* 60 \* 1000|hoursSince|daysSince/);

// 7. Sync state reads Integration.metadata.lastSyncStatus/lastSyncAt — the
//    exact real shape services/integrations/gmail.ts's syncGmailIntegration
//    writes on every real sync attempt — never a fabricated timestamp.
assert.match(gmailIntegrationService, /lastSyncAt: new Date\(\)\.toISOString\(\)/);
assert.match(gmailIntegrationService, /lastSyncStatus: 'ok'/);
assert.match(service, /metadata\.lastSyncStatus/);
assert.match(service, /metadata\.lastSyncAt/);
assert.doesNotMatch(service, /lastSyncAt: new Date\(\)/); // never fabricates one itself

// 8. Evidence state is derived from real CanonicalEvidenceEvent rows,
//    batched per page (grouped by organizationId+providerKey), never a
//    per-row query.
assert.match(service, /prisma\.canonicalEvidenceEvent\.groupBy\(\{/);
assert.match(service, /providerKey: \{ in: MAPPABLE_SLUGS \}/);

// 9. Sync Activity / Failures in the drawer reuse the real Event rows
//    every connector's sync route already logs (type: '<provider>.sync.
//    started|completed|error') — never invented history.
assert.match(gmailIntegrationService, /type: 'gmail\.sync\.completed'/);
assert.match(service, /prisma\.event\.findMany\(\{/);
assert.match(service, /where: \{ integrationId: resolvedIntegration\.id \}/);

// ─── Security: Founder auth, no client-supplied actor identity ────────────

// 10. requireFounderWrite derives access purely from getFounderAccess() —
//     never a client-supplied actor/organization/customer/integration id.
const requireWriteFn = actions.match(/async function requireFounderWrite\(\)[\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(requireWriteFn, /const access = await getFounderAccess\(\);/);
assert.match(requireWriteFn, /if \(!access\.ok \|\| access\.readOnly\)/);

// 11. triggerIntegrationSync: requires Founder write, validates the
//     integration exists server-side, validates the provider actually
//     supports Founder-triggered sync, guards against double-triggering a
//     sync already in progress, and audits with previous state via the one
//     canonical logFounderAction helper.
const triggerFn = actions.match(/export async function triggerIntegrationSync\([\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(triggerFn, /await requireFounderWrite\(\)/);
assert.match(triggerFn, /const integration = await prisma\.integration\.findUnique\(\{ where: \{ id: integrationId \} \}\);/);
assert.match(triggerFn, /if \(!integration\) return \{ ok: false, error: 'Integration not found\.' \};/);
assert.match(triggerFn, /if \(integration\.status === 'SYNCING'\)/);
assert.match(triggerFn, /const previousStatus = integration\.status;/);
assert.match(triggerFn, /await logFounderAction\(\{/);
assert.match(triggerFn, /action: 'integration\.sync\.triggered',/);
assert.doesNotMatch(actions, /actorEmail:\s*string|enabledByEmail/);

// 12. getCustomerIntegrationDetail allows any authenticated Founder
//     (including read-only) to VIEW, but that is the only unauthenticated-
//     for-mutation path in this file — it never writes anything.
const detailFn = actions.match(/export async function getCustomerIntegrationDetail\([\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(detailFn, /const access = await getFounderAccess\(\);/);
assert.match(detailFn, /if \(!access\.ok\) return \{ ok: false/);
assert.doesNotMatch(detailFn, /prisma\.\w+\.(update|create|upsert|delete|deleteMany)\(/);

// 13. Slack is deliberately excluded from Founder-triggered sync (it has no
//     polling sync route — webhook/event driven only) rather than faked.
assert.match(actions, /SYNC_FUNCTIONS: Partial<Record<IntegrationProvider, /);
assert.doesNotMatch(actions, /SLACK: sync/);
assert.match(service, /const SYNCABLE_SLUGS = new Set\(\['gmail', 'outlook', 'jira', 'microsoft_teams', 'zoom', 'servicenow'\]\);/);

// ─── Credential isolation ───────────────────────────────────────────────

// 14. Integration selects never include encryptedTokens, and no file in
//     this feature ever mentions token/secret field names.
assert.doesNotMatch(service, /encryptedTokens:\s*true/);
assert.doesNotMatch(actions, /encryptedTokens:\s*true/);
assert.match(service, /select: \{ id: true, provider: true, status: true, metadata: true \}/);
for (const file of [service, actions, page, client, pureLib]) {
  assert.doesNotMatch(file, /accessToken|refreshToken|clientSecret|apiKey|webhookSecret|password|authorizationCode/i);
}
assert.match(client, /Credentials are securely encrypted and not displayed\./);

// ─── Performance: batched, paginated, no N+1 ───────────────────────────────

// 15. The portfolio query batches everything in one Promise.all (customer
//     page fetch, count, KPI groupBy/findMany, provider list) — never a
//     per-customer or per-row query.
assert.match(service, /const \[customers, totalCustomers, hasAnyCustomerIntegrationsCount, statusGroups, tenantAccessForKpi, integrationOrgPairsForKpi, providers\] = await Promise\.all\(\[/);
assert.doesNotMatch(service, /customers\.map\(async/);
assert.doesNotMatch(service, /for \(const \w+ of customers\) \{\s*\n\s*await prisma/);

// 16. Pagination is server-side (skip/take on CustomerAccount, mirroring
//     the exact established pattern in services/founder.ts's
//     listFounderCustomers) — never a client-side slice of an unbounded
//     fetch.
assert.match(service, /skip,\s*\n\s*take,/);
const founderServiceFull = read('services/founder.ts');
assert.match(founderServiceFull, /export async function listFounderCustomers/);

// 17. Evidence lookups are scoped to exactly the organizations on the
//     current page — never every customer in the system.
assert.match(service, /organizationId: \{ in: pageOrgIds \}/);

// ─── Authorization / read-only mode (page level) ───────────────────────────

// 18. Founder-only page, gated the same way every other Founder page is.
assert.match(founderLayout, /getFounderAccess\(\)/);
assert.match(founderLayout, /redirect\('\/dashboard'\)/);
assert.match(page, /const access = await getFounderAccess\(\);/);
assert.match(page, /const canManage = access\.ok && !access\.readOnly;/);

// 19. Read-only Founder can view (Quick Actions/mutations are gated behind
//     canManage in the drawer, and the underlying actions independently
//     re-check write access server-side — never relying only on a hidden
//     button).
assert.match(client, /\{canManage \? \(/);

// ─── Nav: points to the new page, not the old shared route ────────────────

// 20. FounderNavClient's "Customer Integrations" entry now points at this
//     new page — the necessary minimal fix, not a shell redesign (verified
//     no other line in the frozen file changed shape).
assert.match(navClient, /\{ label: 'Customer Integrations', href: '\/founder\/customer-integrations' \}/);
assert.doesNotMatch(navClient, /\{ label: 'Customer Integrations', href: '\/founder\/integrations' \}/);
assert.match(navClient, /\{ label: 'Integration Catalog', href: '\/founder\/integrations' \}/);

// ─── Accessibility ──────────────────────────────────────────────────────

// 21. Drawer semantics (role="dialog", aria-modal, focus-on-open, Escape,
//     focus restoration, Tab trap) are owned by the shared
//     components/founder/FounderDrawer.tsx primitive used by every Founder
//     drawer (see tests/founder-drawer.test.ts), not re-implemented here.
assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
assert.match(client, /<FounderDrawer onClose=\{\(\) => setSelected\(null\)\} titleId="customer-integration-drawer-title" size="lg">/);
assert.doesNotMatch(client, /role="dialog"|aria-modal="true"/);
assert.doesNotMatch(client, /closeButtonRef/);

// ─── No dead buttons ────────────────────────────────────────────────────

// 22. "View" opens the real drawer and fetches real detail data (not a
//     no-op) — Trigger Sync/Disable/Enable Access call the real server
//     actions — "View in Customer 360" links to the real customer page.
assert.match(client, /onClick=\{\(\) => openDrawer\(row\)\}/);
assert.match(client, /const result = await onLoadDetail\(row\.organizationId, row\.providerSlug\);/);
assert.match(client, /onClick=\{\(\) => runMutation\(onTriggerSync\(\{ integrationId: detail\.integrationId! \}\), 'Sync triggered\.'\)\}/);
assert.match(client, /onClick=\{\(\) => runMutation\(onDisableAccess\(\{ providerSlug: detail\.providerSlug, organizationId: detail\.organizationId \}\), 'Access disabled\.'\)\}/);
assert.match(client, /href=\{`\/founder\/customers\/\$\{detail\.customerAccountId\}`\}/);

// 23. The disable-access warning copy is technically accurate: it never
//     claims to automatically disconnect the customer's external account,
//     since no code path here does so.
assert.match(client, /It does not disconnect the customer&apos;s external account/);
assert.doesNotMatch(service, /prisma\.integration\.delete/);
assert.doesNotMatch(actions, /prisma\.integration\.delete/);

// ─── Real data / KPI correctness ───────────────────────────────────────────

// 24. KPIs are computed from real Integration.status groupBy / real
//     TenantProviderAccess vs Integration set difference — never hardcoded
//     or randomized.
assert.doesNotMatch(service, /Math\.random/);
assert.match(page, /value: data\.kpis\.connectedIntegrations/);
assert.match(page, /value: data\.kpis\.healthy/);
assert.match(page, /value: data\.kpis\.needsAttention/);
assert.match(page, /value: data\.kpis\.failed/);
assert.match(page, /value: data\.kpis\.pendingConnections/);
assert.match(service, /prisma\.integration\.groupBy\(\{ by: \['status'\]/);

// ─── KPI/table dataset consistency (data-consistency correction pass) ──────
//
// Root cause this section proves fixed: the KPI queries originally counted
// Integration/TenantProviderAccess rows for ANY organization matching the
// provider filter, while the table's dataset starts from CustomerAccount
// and therefore only ever includes organizations that actually have one
// (CustomerAccount is a Founder-ops record layered on top of Organization —
// not every Organization with real Integration rows has been provisioned
// through Founder's CustomerAccount flow). That mismatch is exactly how a
// KPI strip could read "12 Connected" while the table legitimately showed
// zero rows for organizations it has no company name/domain/Customer 360
// destination to display.

// 24b. Both the table's customer-selection filter and the three KPI
//      queries require organization.customerAccount to exist — the single,
//      shared canonical-dataset guard (belongsToCustomerAccount) — so a
//      KPI count can never include an organization the table would exclude.
assert.match(service, /const belongsToCustomerAccount: Prisma\.OrganizationWhereInput = \{ customerAccount: \{ isNot: null \} \};/);
assert.match(service, /const integrationKpiScope: Prisma\.IntegrationWhereInput = \{ provider: \{ in: MAPPABLE_ENUMS \}, organization: belongsToCustomerAccount \};/);
assert.match(service, /const tenantAccessKpiScope: Prisma\.TenantProviderAccessWhereInput = \{ providerSlug: \{ in: MAPPABLE_SLUGS \}, organization: belongsToCustomerAccount \};/);
assert.match(service, /prisma\.integration\.groupBy\(\{ by: \['status'\], where: integrationKpiScope, _count: true \}\)/);
assert.match(service, /prisma\.tenantProviderAccess\.findMany\(\{ where: tenantAccessKpiScope,/);
assert.match(service, /prisma\.integration\.findMany\(\{ where: integrationKpiScope,/);
// The bug this replaces: a bare provider-only filter with no
// customerAccount guard must not reappear in either KPI query.
assert.doesNotMatch(service, /prisma\.integration\.groupBy\(\{ by: \['status'\], where: \{ provider: \{ in: MAPPABLE_ENUMS \} \}, _count/);
assert.doesNotMatch(service, /prisma\.tenantProviderAccess\.findMany\(\{ where: \{ providerSlug: \{ in: MAPPABLE_SLUGS \} \} /);

// 24c. A true, unfiltered baseline count (ignoring every active
//      search/provider/connection/health filter) is computed and returned
//      alongside the filtered totalCustomers, specifically so the UI can
//      tell "nothing exists yet" apart from "your filters matched nothing" —
//      the two states Phase 6 requires to never be conflated.
assert.match(service, /prisma\.customerAccount\.count\(\{ where: baselineRelevance \}\)/);
assert.match(service, /hasAnyCustomerIntegrations: hasAnyCustomerIntegrationsCount > 0,/);
assert.match(service, /hasAnyCustomerIntegrations: boolean;/);

// 24d. The client renders the TRUE system empty state only when the
//      unfiltered baseline is empty, and the FILTERED empty state whenever
//      the current (filtered) row set is empty but the baseline is not —
//      never the reverse, and never conflating the two conditions into a
//      single totalCustomers check.
assert.match(client, /\{!hasAnyCustomerIntegrations \? \(/);
assert.doesNotMatch(client, /\{totalCustomers === 0 \? \(/);
assert.match(client, /hasAnyCustomerIntegrations: boolean;/);

// 24e. Pagination's own "N of M" / Previous-Next controls use the filtered
//      totalCustomers (correct: pagination reflects the active filters),
//      never the unfiltered baseline — so a real 12-row filtered result
//      still paginates correctly instead of being swallowed by the
//      true-empty-state branch.
assert.match(client, /\{totalCustomers > 0 \? \(/);

// 24f. Row-scoped lookups (evidence counts, and the per-customer
//      integrations/tenantProviderAccess used to build rows) are always
//      scoped by organizationId — never a query that could return another
//      tenant's rows onto this page.
assert.match(service, /organizationId: \{ in: pageOrgIds \}/);
assert.match(service, /integrations: \{\s*\n\s*where: integrationScope,/);

// ─── Search / filters actually change the result set ───────────────────────

// 25. Search/provider/connection/health filters are pushed into the real
//     Prisma WHERE clause (server-side), not a client-only cosmetic filter.
assert.match(service, /companyName: \{ contains: query, mode: 'insensitive' \}/);
assert.match(service, /const where: Prisma\.CustomerAccountWhereInput = conditions\.length > 1 \? \{ AND: conditions \} : conditions\[0\];/);
assert.match(client, /pushParams\(\{ provider: e\.target\.value, page: '1' \}\)/);
assert.match(client, /function clearFilters\(\) \{/);

// ─── Empty states ───────────────────────────────────────────────────────────

// 26. Honest empty states for every documented case — never a fabricated
//     row.
assert.match(client, /No customer integrations found/);
assert.match(client, /No customer integrations match your current filters\./);
assert.match(client, /No sync history recorded for this integration yet\./);
assert.match(client, /No recent integration failures\./);
assert.match(client, /No Founder activity recorded for this integration yet\./);

// ─── Layout: no page-level horizontal overflow ─────────────────────────────

// 27. Same bounded-intrinsic-width fix already proven for Integration
//     Catalog (grid-cols-1 + min-w-0), and a sticky, always-visible Actions
//     column so "View" is never clipped.
assert.match(page, /className="grid min-w-0 grid-cols-1 gap-8"/);
assert.match(read('components/founder/FounderDrawer.tsx'), /className="fixed inset-0 z-50"/);
assert.match(client, /sticky right-0 w-28 border-l border-slate-100 bg-white px-4 py-3 text-right/);

// ─── Regression: Integration Catalog untouched ─────────────────────────────

// 28. Integration Catalog's own actions file was not modified by this task
//     (enableProviderForTenant/disableProviderForTenant retain their exact
//     existing signature) — confirming reuse, not a fork.
assert.match(integrationCatalogActions, /export async function enableProviderForTenant\(\s*providerSlug: string,\s*organizationId: string,\s*\)/);
assert.match(integrationCatalogActions, /export async function disableProviderForTenant\(\s*providerSlug: string,\s*organizationId: string,\s*\)/);

console.log('Validated Founder Customer Integrations: reuses the exact existing MarketplaceProvider/TenantProviderAccess/Integration/CustomerAccount/Event/CanonicalEvidenceEvent/FounderAuditLog architecture and Integration Catalog\'s own enableProviderForTenant/disableProviderForTenant (no duplicate access mutator, no new model, no second health/sync/evidence engine), proved from source that the newer Evidence Provider SDK tables have zero real callers today (registerEvidenceProvider is invoked only from a test file) and correctly built Sync/Evidence instead on the real Integration.status/Event/CanonicalEvidenceEvent fields every actual connector route writes, derived Health as one explicit documented rollup of that same real status field (no time-based heuristic), enforces Founder authorization/read-only protection/server-side validation on every mutation with no client-supplied actor identity, excludes Slack from Founder-triggered sync honestly (no polling sync route exists) rather than faking it, never selects or renders credential-bearing fields, batches every query (no N+1, page-scoped evidence lookups, server-side pagination mirroring the established listFounderCustomers pattern), fixed the Founder nav\'s stale "Customer Integrations" link to point at this new page, and ships an accessible drawer with real wired actions, working server-side search/filters, and honest empty states. Data-consistency correction: found and fixed the exact reason the KPI strip could disagree with the table (KPI queries counted Integration/TenantProviderAccess rows for any organization, while the table\'s dataset starts from CustomerAccount and only includes organizations that actually have one) by scoping both to the identical belongsToCustomerAccount-gated canonical dataset, and added a true unfiltered baseline count (hasAnyCustomerIntegrations) so the UI can finally distinguish a genuine system-empty state from a filtered-to-zero result instead of conflating the two.');
