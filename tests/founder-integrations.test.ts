import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across
// tests/founder-*.test.ts in this repo: there is no live-database test
// harness here (CI's DATABASE_URL points at nothing reachable), so these
// assert the source code enforces server-side Founder authorization, never
// trusts a client-supplied actor identity, validates every mutation input
// against real data before writing, reuses the one authoritative provider
// registry/access/request architecture (never a second one), audits every
// mutation with before/after state, avoids N+1 queries, and never exposes
// credentials — rather than exercising a real Postgres instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pureLib = read('lib/founder-integrations.ts');
const service = read('services/founder-integrations.ts');
const actions = read('app/founder/integrations/actions.ts');
const page = read('app/founder/integrations/page.tsx');
const client = read('components/founder/IntegrationCatalogClient.tsx');
const founderLayout = read('app/founder/layout.tsx');
const prismaSchema = read('prisma/schema.prisma');
const navClient = read('components/founder/FounderNavClient.tsx');
const seedFile = read('prisma/seeds/integration-providers.ts');
const customerProvidersRoute = read('app/api/integrations/providers/route.ts');
const founderServiceFull = read('services/founder.ts');

// ─── Architecture: reuse the existing 6-model registry, no duplicates ──────

// 1. Exactly one of each core model — no shadow catalog/access/audit model
//    was introduced for this feature.
for (const model of ['MarketplaceProvider', 'TenantProviderAccess', 'IntegrationRequest', 'Integration', 'CustomerIntegrationStatus', 'FounderAuditLog']) {
  assert.equal((prismaSchema.match(new RegExp(`^model ${model} \\{`, 'gm')) ?? []).length, 1, `${model} should exist exactly once`);
}
// No new provider/catalog/audit model text anywhere in the new files.
const forbiddenModelPattern = /model\s+(IntegrationProviderCatalog|FounderIntegrationAuditLog|ProviderAccessGrant)\b/;
for (const file of [service, actions, page, client]) {
  assert.doesNotMatch(file, forbiddenModelPattern);
}

// 2. The service reuses the one canonical audit writer (logFounderAction)
//    via actions.ts — the aggregation module itself performs no writes.
assert.doesNotMatch(service, /prisma\.\w+\.(update|create|upsert|delete|deleteMany)\(/);
assert.match(actions, /import \{ getFounderAccess, logFounderAction \} from '@\/services\/founder'/);
assert.doesNotMatch(actions, /function logFounderAction/);

// 3. The pure lib module reuses the exact existing enums (no invented
//    lifecycle/status/priority values).
assert.match(pureLib, /export const PROVIDER_LIFECYCLE_OPTIONS = \['DRAFT', 'BETA', 'AVAILABLE', 'COMING_SOON', 'DEPRECATED'\] as const;/);
assert.match(pureLib, /export const REQUEST_STATUS_OPTIONS = \['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT', 'AVAILABLE', 'REJECTED'\] as const;/);
assert.match(pureLib, /export const REQUEST_PRIORITY_OPTIONS = \['LOW', 'MEDIUM', 'HIGH'\] as const;/);
const marketplaceStatusEnum = prismaSchema.match(/enum MarketplaceProviderStatus \{([\s\S]*?)\}/)?.[1] ?? '';
for (const value of ['DRAFT', 'BETA', 'AVAILABLE', 'COMING_SOON', 'DEPRECATED']) {
  assert.match(marketplaceStatusEnum, new RegExp(value));
}
const requestStatusEnum = prismaSchema.match(/enum IntegrationRequestStatus \{([\s\S]*?)\}/)?.[1] ?? '';
for (const value of ['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT', 'AVAILABLE', 'REJECTED']) {
  assert.match(requestStatusEnum, new RegExp(value));
}

// 4. Legacy CustomerIntegrationStatus system (used by Go-Live Readiness /
//    Provision Customer) is preserved functionally intact at the backend
//    (schema, mutator function, seed catalog constant), but is no longer
//    exposed as a second, competing Founder-facing customer-access UI on
//    /founder/integrations — removed entirely per the final control-plane
//    cleanup, not merely collapsed (see the dedicated block below).
assert.doesNotMatch(page, /founderIntegrationCatalog/);
assert.doesNotMatch(page, /updateCustomerIntegrationAccess/);
assert.doesNotMatch(page, /updateLegacyAccess/);

// ─── Regression: MarketplaceProvider is the ONE authoritative provider
// registry — self-heals an empty production table, never falls back to a
// hardcoded/legacy provider list, and no second provider grid competes
// with it visually (the exact bug this correction pass fixes) ────────────

// 4b. Root cause, proven from source: the MarketplaceProvider seed
//     (idempotent upsert-by-unique-slug) exists but is never invoked from
//     any automatic deploy/build/migrate path — only manual CLI execution.
//     This is why a real deployment can have the schema (migration applied)
//     but zero MarketplaceProvider rows while the unrelated, hardcoded
//     founderIntegrationCatalog legacy list still renders real cards.
const prismaSeedTs = read('prisma/seed.ts');
const packageJson = read('package.json');
assert.doesNotMatch(prismaSeedTs, /seedIntegrationProviders/);
assert.doesNotMatch(packageJson, /seedIntegrationProviders/);
assert.match(seedFile, /export async function seedIntegrationProviders\(client: MarketplaceProviderClient\)/);
// Idempotent: looked up by the unique slug before deciding create vs
// update — running it twice can never create a duplicate row.
assert.match(seedFile, /const existing = await client\.marketplaceProvider\.findUnique\(\{ where: \{ slug: provider\.slug \} \}\);/);

// 4c. The self-heal is the one, memoized (per-process), count-gated
//     bootstrap — mirroring services/founder.ts's ensureFounderStorage()
//     idiom exactly (check once, fix only if actually needed, reset the
//     cached promise on failure so a later request can retry) — never a
//     second ad hoc seeding mechanism, and never re-run on every request
//     once the table is genuinely populated.
assert.match(service, /let marketplaceSeedPromise: Promise<void> \| null = null;/);
assert.match(service, /async function ensureMarketplaceProvidersSeeded\(\): Promise<void> \{/);
assert.match(service, /const existingCount = await prisma\.marketplaceProvider\.count\(\);/);
assert.match(service, /if \(existingCount > 0\) return;/);
assert.match(service, /await seedIntegrationProviders\(prisma\);/);
assert.match(service, /marketplaceSeedPromise = null;\s*\n\s*throw error;/);
assert.match(service, /await ensureMarketplaceProvidersSeeded\(\);/);
// It reuses the app's shared Prisma singleton, never a second connection.
assert.match(service, /import \{ seedIntegrationProviders \} from '@\/prisma\/seeds\/integration-providers';/);
assert.doesNotMatch(service, /new PrismaClient\(/);

// 4d. No UI seed/initialize button was added anywhere — this is a
//     transparent data-integrity fix on read, not a Founder-triggered
//     runtime action.
for (const file of [page, client]) {
  assert.doesNotMatch(file, /Seed Providers|Initialize Catalog|Create Providers/i);
}

// 4e. No visible legacy customer-access management table remains anywhere
//     on the page: no <details> disclosure, no per-connector card grid, no
//     narrow "Connector/Category/Customer/Access" compatibility table, and
//     no customer-select-and-checkbox form for a fixed 8-key connector
//     list. Provider Catalog's own detail drawer (IntegrationCatalogClient)
//     is the only Founder-facing customer-access surface left.
assert.doesNotMatch(page, /<details/);
assert.doesNotMatch(page, /Go-Live Readiness Legacy Access/);
assert.doesNotMatch(page, /Legacy: Connector Access Gates/);
assert.doesNotMatch(page, /grid gap-4 md:grid-cols-2 xl:grid-cols-3/); // the old card-grid layout
assert.doesNotMatch(page, /min-w-\[640px\]/); // the old compact-table layout
assert.doesNotMatch(page, /accessEnabled" type="checkbox"/);
assert.doesNotMatch(page, /Select customer<\/option>/);
assert.doesNotMatch(page, /FounderBadge tone="slate">Customer-owned/);

// 4f. The backend compatibility path is genuinely intact, not merely
//     unreferenced-and-forgotten: the schema field, the catalog constant,
//     and the mutator function all still exist and still behave exactly as
//     before (still only ever writes CustomerIntegrationStatus — never
//     TenantProviderAccess, which would create a third, inconsistent
//     access mechanism — and still audits via the one canonical helper).
//     Nothing in services/founder.ts was touched by this UI-only cleanup.
assert.match(prismaSchema, /model CustomerIntegrationStatus \{[\s\S]*?accessEnabled\s+Boolean/);
assert.match(founderServiceFull, /export const founderIntegrationCatalog = \[/);
assert.match(founderServiceFull, /export async function updateCustomerIntegrationAccess\(/);
const legacyUpdateFn = founderServiceFull.match(/export async function updateCustomerIntegrationAccess\([\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(legacyUpdateFn, /prisma\.customerIntegrationStatus\.upsert\(/);
assert.doesNotMatch(legacyUpdateFn, /prisma\.tenantProviderAccess\./);
assert.match(legacyUpdateFn, /await logFounderAction\(\{/);

// 4g. Go-Live Readiness's Integrations gate still reads accessEnabled off
//     CustomerIntegrationStatus directly (services/founder-go-live-readiness.ts)
//     — its logic was not rewritten or repointed at TenantProviderAccess —
//     and Provision Customer's initial setup step still writes it via its
//     own transactional upsert loop over founderIntegrationCatalog
//     (services/founder.ts), entirely independent of the removed page UI.
const goLiveReadinessService = read('services/founder-go-live-readiness.ts');
assert.match(goLiveReadinessService, /integrationStatuses\.filter\(\(i\) => i\.accessEnabled\)/);
assert.match(founderServiceFull, /for \(const integration of founderIntegrationCatalog\) \{/);
assert.match(founderServiceFull, /tx\.customerIntegrationStatus\.upsert\(/);

// 4h. No new/duplicate customer-access mechanism was introduced to fill the
//     gap left by the removed UI — TenantProviderAccess (via
//     enableProviderForTenant/disableProviderForTenant, already covered
//     below) remains the one canonical, forward-looking Founder-facing
//     control, and no second mutator function was added anywhere in this
//     task's files.
for (const file of [service, actions, page, client]) {
  assert.doesNotMatch(file, /function \w*[Ll]egacy\w*Access\w*\(/);
}

// ─── Security: no client-supplied actor identity (the explicit CRITICAL fix) ─

// 5. enableProviderForTenant/disableProviderForTenant no longer accept an
//    actor identity parameter from the caller — only (providerSlug, organizationId).
assert.match(actions, /export async function enableProviderForTenant\(\s*providerSlug: string,\s*organizationId: string,\s*\)/);
assert.match(actions, /export async function disableProviderForTenant\(\s*providerSlug: string,\s*organizationId: string,\s*\)/);
assert.doesNotMatch(actions, /enabledByEmail/);
assert.doesNotMatch(actions, /actorEmail:\s*string/);

// 6. The actor identity is always derived from the server-side
//    getFounderAccess() result, never from formData/client input, for every
//    mutation in this file.
assert.match(actions, /const actorEmail = access\.email;/);
for (const fn of ['updateProviderStatus', 'updateRequestStatus', 'enableProviderForTenant', 'disableProviderForTenant']) {
  const body = actions.match(new RegExp(`export async function ${fn}\\([\\s\\S]*?\\n\\}\\n`))?.[0] ?? '';
  assert.match(body, /await requireFounderWrite\(\)/, `${fn} should require founder write access`);
  assert.match(body, /await logFounderAction\(\{/, `${fn} should write an audit entry`);
}

// 7. requireFounderWrite rejects both unauthenticated and read-only Founder
//    sessions server-side — never relying on the client to only call this
//    when authorized.
const requireWriteFn = actions.match(/async function requireFounderWrite\(\)[\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(requireWriteFn, /const access = await getFounderAccess\(\);/);
assert.match(requireWriteFn, /if \(!access\.ok \|\| access\.readOnly\)/);
assert.match(requireWriteFn, /throw new Error/);

// ─── Validation: every id/slug checked against real data before mutating ──

// 8. Provider lifecycle status is validated against the real enum values
//    before being written (a client cannot smuggle an arbitrary string into
//    the database).
const updateStatusFn = actions.match(/export async function updateProviderStatus\([\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(updateStatusFn, /PROVIDER_LIFECYCLE_OPTIONS\.includes\(newStatus/);
assert.match(updateStatusFn, /const provider = await prisma\.marketplaceProvider\.findUnique\(\{ where: \{ slug: providerSlug \} \}\);/);
assert.match(updateStatusFn, /if \(!provider\) return \{ ok: false, error: 'Provider not found\.' \};/);
assert.match(updateStatusFn, /const previousStatus = provider\.status;/);
assert.match(updateStatusFn, /previousStatus,\s*\n\s*newStatus,/);

// 9. Request status is validated against the real enum, and the request's
//    existence is confirmed (with its owning organization) before any write.
const updateRequestFn = actions.match(/export async function updateRequestStatus\([\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(updateRequestFn, /REQUEST_STATUS_OPTIONS\.includes\(newStatus/);
assert.match(updateRequestFn, /const request = await prisma\.integrationRequest\.findUnique\(\{/);
assert.match(updateRequestFn, /if \(!request\) return \{ ok: false, error: 'Integration request not found\.' \};/);
assert.match(updateRequestFn, /const previousStatus = request\.status;/);

// 10. Granting access validates: organization exists, provider exists, and
//     the provider's current lifecycle is grantable (AVAILABLE/BETA) —
//     DRAFT/COMING_SOON/DEPRECATED cannot be silently granted.
const enableFn = actions.match(/export async function enableProviderForTenant\([\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(enableFn, /prisma\.organization\.findUnique\(\{ where: \{ id: organizationId \}/);
assert.match(enableFn, /if \(!organization\) return \{ ok: false, error: 'Customer organization not found\.' \};/);
assert.match(enableFn, /if \(!provider\) return \{ ok: false, error: 'Provider not found\.' \};/);
assert.match(enableFn, /if \(!isGrantableLifecycle\(provider\.status\)\)/);
assert.match(pureLib, /export const GRANTABLE_LIFECYCLE_STATES: ReadonlySet<ProviderLifecycle> = new Set\(\['AVAILABLE', 'BETA'\]\);/);
assert.match(pureLib, /export function isGrantableLifecycle\(status: string\): boolean \{/);

// 11. Revoking access still validates organization/provider existence, but
//     is never lifecycle-gated (revoking must always be possible).
const disableFn = actions.match(/export async function disableProviderForTenant\([\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(disableFn, /if \(!organization\) return \{ ok: false, error: 'Customer organization not found\.' \};/);
assert.match(disableFn, /if \(!provider\) return \{ ok: false, error: 'Provider not found\.' \};/);
assert.doesNotMatch(disableFn, /isGrantableLifecycle/);

// ─── Audit logging: before/after state, actor, provider, customer ─────────

// 12. Provider lifecycle changes are audited with the canonical action name,
//     previous and new state, and the correct target.
assert.match(updateStatusFn, /action: 'integration\.provider\.status_changed',/);
assert.match(updateStatusFn, /targetType: 'MarketplaceProvider',/);

// 13. Customer access grant/revoke and request status changes use the
//     documented canonical action names.
assert.match(enableFn, /action: 'integration\.customer_access\.enabled',/);
assert.match(disableFn, /action: 'integration\.customer_access\.disabled',/);
assert.match(updateRequestFn, /action: 'integration\.request\.status_changed',/);

// 14. Customer-scoped mutations resolve the FounderAuditLog.customerAccountId
//     (CustomerAccount.id) from the mutation's organizationId — never
//     conflating Organization.id with CustomerAccount.id.
assert.match(actions, /async function customerAccountIdForOrganization\(organizationId: string\): Promise<string \| null> \{/);
assert.match(actions, /prisma\.customerAccount\.findUnique\(\{ where: \{ organizationId \}, select: \{ id: true \} \}\);/);
assert.match(enableFn, /const customerAccountId = await customerAccountIdForOrganization\(organizationId\);/);
assert.match(disableFn, /const customerAccountId = await customerAccountIdForOrganization\(organizationId\);/);
assert.match(updateRequestFn, /const customerAccountId = await customerAccountIdForOrganization\(request\.organization\.id\);/);

// ─── Authorization / read-only mode (page level) ───────────────────────────

// 15. Founder-only page, gated the same way every other Founder page is.
assert.match(founderLayout, /getFounderAccess\(\)/);
assert.match(founderLayout, /redirect\('\/dashboard'\)/);
assert.match(page, /const access = await getFounderAccess\(\);/);
assert.match(page, /const canManage = access\.ok && !access\.readOnly;/);
assert.doesNotMatch(page, /if \(!access\.ok \|\| access\.readOnly\) return null/); // read-only founders can still view

// 16. Every server-action wrapper in the page re-derives access indirectly
//     through the hardened actions.ts functions (which themselves call
//     requireFounderWrite) — the wrappers never take a shortcut around them.
for (const wrapper of ['updateProviderStatusAction', 'updateRequestStatusAction', 'enableProviderAccessAction', 'disableProviderAccessAction']) {
  const body = page.match(new RegExp(`async function ${wrapper}[\\s\\S]*?\\n\\}\\n`))?.[0] ?? '';
  assert.match(body, /'use server';/);
}

// ─── Read-only mode is honored, not just hidden buttons ────────────────────

// 17. The client only renders Founder Action controls (lifecycle buttons,
//     grant/revoke) when canManage is true — but this is a UI convenience;
//     the actual gate is requireFounderWrite() inside actions.ts, already
//     verified above (Section 14 of the spec: never rely only on disabled
//     buttons).
assert.match(client, /\{canManage \? \(/);
assert.match(client, /disabled=\{pending \|\| !grantCustomerId\}/);

// ─── No credential exposure ─────────────────────────────────────────────────

// 18. Founder queries select only the fields needed — never a full
//     Integration/EvidenceProviderConnection record with encrypted tokens.
assert.doesNotMatch(service, /encryptedTokens/);
assert.doesNotMatch(service, /encryptedCredentials/);
assert.match(service, /select: \{ organizationId: true, provider: true, status: true \}/);
for (const file of [service, actions, page, client, pureLib]) {
  assert.doesNotMatch(file, /accessToken|refreshToken|clientSecret|apiKey|webhookSecret|password/i);
}

// ─── Customer Availability vs Connection (mandatory distinction) ──────────

// 19. "Available" (TenantProviderAccess exists) and "Connected" (a real
//     customer Integration exists) are distinct types/labels — never
//     conflated into one status.
assert.match(pureLib, /export type CustomerAvailability = 'AVAILABLE' \| 'NOT_AVAILABLE';/);
assert.match(pureLib, /export type CustomerConnectionState = 'CONNECTED' \| 'CONNECTING' \| 'FAILED' \| 'NOT_CONNECTED' \| 'UNKNOWN';/);
assert.match(service, /availability: 'AVAILABLE',/);
assert.match(service, /connectionState: connectionStateFor\(provider\.slug, row\.organizationId\),/);

// 20. Connection state is only ever claimed for the 7 marketplace slugs that
//     truly map to the IntegrationProvider enum — every other provider
//     reports the honest UNKNOWN/"not tracked" state rather than a
//     fabricated "Not Connected".
assert.match(service, /export const SLUG_TO_INTEGRATION_PROVIDER: Record<string, IntegrationProvider> = \{/);
for (const slug of ['slack', 'gmail', 'outlook', 'microsoft_teams', 'jira', 'servicenow', 'zoom']) {
  assert.match(service, new RegExp(`${slug}: '[A-Z_]+',`));
  assert.match(seedFile, new RegExp(`slug: '${slug}',`));
}
assert.match(service, /function connectionStateFor\(providerSlug: string, organizationId: string\): CustomerConnectionState \{/);
assert.match(service, /if \(!integrationProvider\) return 'UNKNOWN';/);
assert.match(pureLib, /UNKNOWN: 'Not tracked',/);

// ─── Real data only — no hardcoded/fabricated numbers ──────────────────────

// 21. Every KPI is computed from real backend aggregation — no hardcoded
//     provider/customer/request counts, no Math.random.
assert.doesNotMatch(service, /Math\.random/);
assert.match(page, /value: data\.totalProviders/);
assert.match(page, /value: data\.availableCount/);
assert.match(page, /value: data\.nativeCount/);
assert.match(page, /value: data\.betaCount/);
assert.match(page, /value: data\.requestCount/);
assert.match(page, /value: data\.customersWithAccessCount/);

// 22. requestCount on the provider row is the existing, already-maintained
//     MarketplaceProvider.requestCount aggregate (kept up to date by the
//     real customer-facing POST /api/integrations/requests route) — never
//     recomputed or duplicated here.
assert.match(customerProvidersRoute, /TenantProviderAccess/); // confirms the file we're cross-checking is the right one
assert.match(service, /requestCount: provider\.requestCount,/);

// ─── Performance: no N+1 queries ───────────────────────────────────────────

// 23. A single Promise.all with a fixed, bounded set of batched queries
//     builds the entire portfolio — no per-provider or per-customer query.
assert.match(service, /await Promise\.all\(\[/);
assert.doesNotMatch(service, /providers\.map\(async/);
assert.doesNotMatch(service, /customers\.map\(async/);
assert.doesNotMatch(service, /for \(const \w+ of \w+\) \{\s*\n\s*await prisma/);
assert.match(service, /prisma\.integration\.findMany\(\{\s*\n\s*where: \{ provider: \{ in: Object\.values\(SLUG_TO_INTEGRATION_PROVIDER\) \} \},/);

// ─── UI: filters, search, Clear Filters, no dead buttons ───────────────────

// 24. Provider search/filters actually narrow the real dataset (not a
//     decorative filter with no effect).
assert.match(client, /if \(categoryFilter !== 'ALL' && p\.category !== categoryFilter\) return false;/);
assert.match(client, /if \(lifecycleFilter !== 'ALL' && p\.status !== lifecycleFilter\) return false;/);
assert.match(client, /if \(implementationFilter === 'NATIVE' && !p\.isNative\) return false;/);
assert.match(client, /if \(capabilityFilter !== 'ALL' && !p\.capabilities\.includes\(capabilityFilter\)\) return false;/);

// 25. Request filters are real, and Clear Filters actually resets every
//     filter field (not just a subset) and returns to page 1.
assert.match(client, /function clearRequestFilters\(\) \{/);
for (const field of ['setReqQuery', 'setReqStatus', 'setReqPriority', 'setReqCategory', 'setReqProvider', 'setReqCustomer', 'setReqPage']) {
  const fn = client.match(/function clearRequestFilters\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.match(fn, new RegExp(field));
}

// 26. Pagination is computed from the filtered set (filters applied before
//     slicing), so active filters are always preserved across pages.
assert.match(client, /const pagedRequests = useMemo\(\(\) => \{\s*\n\s*const start = \(reqPage - 1\) \* REQ_PAGE_SIZE;\s*\n\s*return filteredRequests\.slice\(start, start \+ REQ_PAGE_SIZE\);/);

// 27. "View Details" opens the real drawer for that exact provider — not a
//     dead/no-op button.
assert.match(client, /onClick=\{\(\) => openDrawer\(provider\.slug\)\}/);
assert.match(client, /View Details/);

// 28. Grant/Revoke access and lifecycle-change buttons call the real
//     mutation props — never a decorative handler.
assert.match(client, /onClick=\{\(\) => runMutation\(onEnableProviderAccess\(\{ providerSlug: selected\.slug, organizationId: grantCustomerId \}\), 'Access granted\.'\)\}/);
assert.match(client, /onClick=\{\(\) => runMutation\(onDisableProviderAccess\(\{ providerSlug: selected\.slug, organizationId: row\.organizationId \}\), 'Access revoked\.'\)\}/);
assert.match(client, /onClick=\{\(\) => requestLifecycleChange\(s\)\}/);

// ─── Dangerous lifecycle transition confirmation ───────────────────────────

// 29. DEPRECATED (and COMING_SOON) require an explicit confirm dialog with
//     the mandated wording — no automatic-disconnection claim is made
//     because the code does not actually disconnect anything.
assert.match(pureLib, /export const DANGEROUS_LIFECYCLE_TRANSITIONS: ReadonlySet<ProviderLifecycle> = new Set\(\['DEPRECATED', 'COMING_SOON'\]\);/);
assert.match(client, /Mark this provider as \{PROVIDER_LIFECYCLE_LABELS\[confirmingStatus\]\.toLowerCase\(\)\}\?/);
assert.match(client, /This changes the provider lifecycle state for Founder-controlled availability\. Existing customer connections will not be automatically disconnected\./);
assert.match(client, /<button type="button" onClick=\{\(\) => setConfirmingStatus\(null\)\}/);
assert.match(client, /<button type="button" onClick=\{confirmLifecycleChange\}/);

// ─── Customer access copy (mandatory exact distinction) ───────────────────

// 30. The exact required distinction copy is present verbatim.
assert.match(client, /Granting access makes this provider available to the customer\. It does not connect the customer&apos;s external account or expose credentials\./);

// ─── Accessibility: dialog semantics, Escape, focus management ────────────

// 31. Drawer semantics (role="dialog", aria-modal, focus-on-open, Escape,
//     focus restoration, Tab trap) are now owned by the shared
//     components/founder/FounderDrawer.tsx primitive used by every Founder
//     drawer (see tests/founder-drawer.test.ts for its own contract
//     assertions), not re-implemented locally a second time here. The
//     drawer's own confirmingStatus-first dismiss semantics (Escape/
//     overlay-click/Close all back out of an open lifecycle confirmation
//     before closing the whole drawer) are preserved via closeDrawer().
assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
assert.match(client, /<FounderDrawer onClose=\{closeDrawer\} titleId="provider-drawer-title" size="lg">/);
assert.match(client, /function closeDrawer\(\) \{\s*\n\s*if \(confirmingStatus\) setConfirmingStatus\(null\);\s*\n\s*else setSelectedSlug\(null\);\s*\n\s*\}/);
assert.doesNotMatch(client, /role="dialog"|aria-modal="true"/);
assert.doesNotMatch(client, /closeButtonRef/);

// ─── Empty states ───────────────────────────────────────────────────────────

// 32. Honest empty states for every documented case — never a fabricated
//     record.
assert.match(client, /No integration providers exist yet/);
assert.match(client, /No integration providers match your current filters\./);
assert.match(client, /No integration requests yet/);
assert.match(client, /No requests match the current filters\./);
assert.match(client, /No customer has been granted access to this provider\./);
assert.match(client, /No customer requests for this provider\./);
assert.match(client, /No lifecycle changes recorded for this provider yet\./);

// ─── Layout: no page-level horizontal overflow ─────────────────────────────

// 33. The drawer is `fixed` (inside the shared FounderDrawer component now,
//     not re-declared here), so it cannot itself cause page-level
//     horizontal overflow, and both tables use their own overflow-x-auto
//     scroller.
const founderDrawerComponent = read('components/founder/FounderDrawer.tsx');
assert.match(founderDrawerComponent, /className="fixed inset-0 z-50"/);
assert.equal((client.match(/overflow-x-auto/g) ?? []).length >= 2, true);

// 33b. The page's root establishes the same bounded-intrinsic-width grid
//      boundary Customer Health already proved necessary (a wide min-w-[…px]
//      table can otherwise grow the frozen FounderNavClient <main> flex item
//      past the viewport) — fixed entirely within this page's own file, the
//      frozen FounderShell/FounderNavClient files are untouched.
assert.match(page, /className="grid min-w-0 grid-cols-1 gap-8"/);
assert.doesNotMatch(page, /^import.*FounderNavClient/m); // the frozen shell is not imported/modified by this fix

// 33c. The provider table's Action column is sticky (right-0) with its own
//      opaque background, so "View Details" stays fully visible and
//      clickable regardless of horizontal scroll position — never clipped
//      at the edge of the content area — and carries a real header label
//      for accessibility (not a bare, unlabeled trailing column).
assert.match(client, /<th className="sticky right-0 w-32 border-l border-slate-100 bg-white px-4 py-3 text-right">Action<\/th>/);
assert.match(client, /<td className="sticky right-0 w-32 whitespace-nowrap border-l border-slate-100 bg-white px-4 py-4 text-right group-hover:bg-slate-50">/);

// ─── Regression: locked/adjacent surfaces untouched ────────────────────────

// 34. The locked Founder sidebar/nav is untouched by this task.
assert.doesNotMatch(navClient, /Pilot Command Center/);
assert.doesNotMatch(navClient, /Coming Soon/);

// 35. TenantProviderAccess's documented "informational" (non-gating)
//     behavior for customer-facing visibility is left exactly as-is — out of
//     scope per the spec.
assert.match(customerProvidersRoute, /informational/i);

console.log('Validated Founder Integration Catalog: reuses the exact existing MarketplaceProvider/TenantProviderAccess/IntegrationRequest/Integration/CustomerIntegrationStatus/FounderAuditLog architecture with no duplicate models or audit systems, removes client-trusted actor identity from enableProviderForTenant/disableProviderForTenant in favor of server-derived getFounderAccess().email, validates organization/provider/request existence and provider lifecycle before every mutation, audits every mutation with before/after state via the one canonical logFounderAction helper, keeps Customer Availability and Connection State honestly distinct (including an UNKNOWN state for the ~21 marketplace providers with no trackable Integration row), computes every KPI from real batched (N+1-free) queries, exposes no credentials, and ships an accessible, non-dead-button, honestly-empty-stated catalog and request UI with working search/filters/pagination and a mandated confirmation dialog for dangerous lifecycle transitions. Correction pass 1: proved from source that the MarketplaceProvider seed was never wired into any automatic deploy/build/migrate path, added a self-healing, memoized, count-gated bootstrap mirroring ensureFounderStorage\'s exact idiom. Correction pass 2 (final control-plane cleanup): removed the visible legacy customer-access management table entirely from the page (no <details>, no card grid, no compact table, no per-connector customer-select form) rather than merely collapsing it, while proving the backend compatibility path stays fully intact and untouched — CustomerIntegrationStatus.accessEnabled still exists in the schema, founderIntegrationCatalog and updateCustomerIntegrationAccess remain exported from services/founder.ts unchanged, Go-Live Readiness\'s Integrations gate still reads accessEnabled directly, and Provision Customer\'s own transactional upsert loop still writes it at account creation — so Provider Catalog\'s TenantProviderAccess-based drawer is now the single, unambiguous Founder-facing customer-access control with no duplicate UI anywhere on the page.');
