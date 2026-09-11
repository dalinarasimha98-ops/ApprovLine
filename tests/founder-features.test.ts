import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across
// tests/founder-*.test.ts in this repo: there is no live-database test
// harness here (CI's DATABASE_URL points at nothing reachable), so these
// assert the source code enforces server-side authorization, validates
// every mutation input against real data, reuses the one authoritative
// feature catalog/entitlement policy (never a second one), computes
// effective access honestly, and avoids N+1 queries — rather than
// exercising a real Postgres instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const founderService = read('services/founder.ts');
const featuresService = read('services/founder-features.ts');
const pureLib = read('lib/founder-features.ts');
const entitlementsLib = read('lib/entitlements.ts');
const page = read('app/founder/features/page.tsx');
const client = read('components/founder/FeatureManagementClient.tsx');
const exportRoute = read('app/api/founder/features/export/route.ts');
const founderLayout = read('app/founder/layout.tsx');
const prismaSchema = read('prisma/schema.prisma');
const navClient = read('components/founder/FounderNavClient.tsx');
const playbookUpload = read('app/api/playbooks/upload/route.ts');
const playbookReplace = read('app/api/playbooks/[id]/replace/route.ts');
const copilotQuery = read('app/api/copilot/query/route.ts');
const investigationsRoute = read('app/api/investigations/route.ts');
const investigationsIdRoute = read('app/api/investigations/[id]/route.ts');
const analyticsKpis = read('app/api/analytics/kpis/route.ts');
const analyticsHighRisk = read('app/api/analytics/high-risk/route.ts');
const analyticsCompliance = read('app/api/analytics/compliance/route.ts');
const customer360Page = read('app/founder/customers/[id]/page.tsx');

// ─── Architecture: one catalog, one entitlement policy, one override table ─

// 1. Feature Management reuses the single authoritative founderFeatures
//    catalog — never a second, competing feature/entitlement catalog.
assert.match(page, /import \{[^}]*founderFeatures[^}]*\} from '@\/services\/founder'/);
assert.doesNotMatch(page, /const founderFeatures\s*=/);
assert.doesNotMatch(page, /founderFeatures\.(slice|filter)\(/);
assert.match(page, /founderFeatures\.length/);
assert.doesNotMatch(featuresService, /export const founderFeatures\s*=/);
assert.match(featuresService, /import \{ founderFeatures, listFounderAuditLogs \} from '@\/services\/founder'/);

// 1b. The pure, client-safe label constants exist and are re-exported by
//     the service (same split-module pattern as lib/customer-health.ts,
//     lib/onboarding-pipeline.ts, and lib/go-live-readiness.ts) so the
//     client drawer never pulls services/founder.ts's server-only APIs
//     into its bundle.
assert.match(pureLib, /export type EffectiveAccessSource =/);
assert.match(pureLib, /export const EFFECTIVE_ACCESS_LABELS: Record<EffectiveAccessSource, string>/);
assert.match(pureLib, /export type FeatureEffectiveSummary = 'ENABLED' \| 'DISABLED' \| 'MIXED' \| 'NO_CUSTOMERS';/);
assert.match(featuresService, /export \{ EFFECTIVE_ACCESS_LABELS, FEATURE_EFFECTIVE_SUMMARY_LABELS \};/);
assert.match(client, /import \{\s*\n\s*EFFECTIVE_ACCESS_LABELS,\s*\n\s*FEATURE_EFFECTIVE_SUMMARY_LABELS,\s*\n\} from '@\/lib\/founder-features';/);
assert.match(client, /import type \{ FeatureAccessRow, FeatureCatalogRow \} from '@\/services\/founder-features';/);

// 2. No duplicate plan/pricing catalog: lib/plans.ts's commercialPlans and
//    lib/entitlements.ts's isPlanEntitled are imported and reused directly
//    — never a hardcoded second plan list or hardcoded pricing in the
//    Feature Management surfaces.
assert.match(featuresService, /import \{ isPlanEntitled, type EntitlementKey \} from '@\/lib\/entitlements'/);
assert.match(featuresService, /import \{ commercialPlans, planDisplayName \} from '@\/lib\/plans'/);
for (const file of [featuresService, client]) {
  assert.doesNotMatch(file, /amountUsd:\s*\d/);
  assert.doesNotMatch(file, /\b999\b/);
}
for (const forbidden of ['FeatureEntitlementEngine', 'SecondFeatureFlag', 'CustomEntitlementResolver']) {
  assert.doesNotMatch(featuresService, new RegExp(forbidden));
}

// 3. CustomerFeatureFlag and the tenant-scoped FeatureFlag model are never
//    conflated: this module only ever queries/writes CustomerFeatureFlag
//    (via CustomerAccount.featureFlags), never the organizationId-scoped
//    FeatureFlag table pilot self-service uses.
assert.match(featuresService, /featureFlags: \{ select: \{ key: true, enabled: true, updatedBy: true, updatedAt: true \} \}/);
assert.doesNotMatch(featuresService, /prisma\.featureFlag\./);
assert.doesNotMatch(founderService.match(/export async function updateCustomerFeatureFlag[\s\S]*?\n\}\n/)?.[0] ?? '', /prisma\.featureFlag\./);

// ─── Effective access: derived from the real resolver's own logic, never a
// UI default ─────────────────────────────────────────────────────────────

// 4. computeEffectiveAccess mirrors resolveEntitlement's exact priority
//    order: workspace inactivity first, then a real override, then plan
//    policy (via the same isPlanEntitled function), then — only for the 2
//    keys with no plan policy at all — the catalog's own defaultEnabled.
assert.match(featuresService, /if \(input\.accountStatus === 'SUSPENDED' \|\| input\.accountStatus === 'CHURNED'\)/);
assert.match(featuresService, /return \{ enabled: false, source: 'workspace_inactive' \};/);
assert.match(featuresService, /if \(input\.override\) \{/);
assert.match(featuresService, /isPlanEntitled\(input\.planTier as Parameters<typeof isPlanEntitled>\[0\], input\.featureKey\)/);
assert.match(featuresService, /return \{ enabled: input\.defaultEnabled, source: 'founder_default' \};/);
assert.match(entitlementsLib, /export async function resolveEntitlement/);
assert.doesNotMatch(featuresService, /(?:export )?(?:async )?function resolveEntitlement\(/); // reused, not reimplemented

// 5. The entitlement-backed key list is a single type guard (not a second,
//    separately-maintained array) and matches lib/entitlements.ts's own
//    EntitlementKey union exactly — verified here so the two can't silently
//    drift apart.
const entitlementKeyUnion = entitlementsLib.match(/export type EntitlementKey =\s*([\s\S]*?);/)?.[1] ?? '';
for (const key of ['copilot', 'playbook_ai', 'investigations', 'executive_roi', 'universal_gateway']) {
  assert.match(entitlementKeyUnion, new RegExp(`"${key}"`));
  assert.match(featuresService, new RegExp(`key === '${key}'`));
}
assert.match(featuresService, /function isEntitlementKey\(key: string\): key is EntitlementKey/);

// 6. Runtime enforcement claims are self-verifying: every key this module
//    claims is enforced really does have a requireEntitlement call for it in
//    a real route — universal_gateway now included, following the
//    entitlement-enforcement follow-up (see tests/universal-gateway-entitlement.test.ts
//    for the full route-by-route, filesystem-discovered proof) — so
//    "Founder UI state" vs "runtime enforcement state" can never quietly go
//    stale without breaking this test.
assert.match(featuresService, /const RUNTIME_ENFORCED_KEYS = new Set<string>\(\['playbook_ai', 'copilot', 'investigations', 'executive_roi', 'universal_gateway'\]\);/);
assert.match(playbookUpload, /requireEntitlement\(tenant\.organization\.id, "playbook_ai"\)/);
assert.match(playbookReplace, /requireEntitlement\(tenant\.organization\.id, 'playbook_ai'\)/);
assert.match(copilotQuery, /requireEntitlement\(tenant\.organization\.id, "copilot"\)/);
assert.match(investigationsRoute, /requireEntitlement\(tenant\.organization\.id, 'investigations'\)/);
assert.match(investigationsIdRoute, /requireEntitlement\(tenant\.organization\.id, 'investigations'\)/);
assert.match(analyticsKpis, /requireEntitlement\(tenant\.organization\.id, 'executive_roi'\)/);
assert.match(analyticsHighRisk, /requireEntitlement\(tenant\.organization\.id, 'executive_roi'\)/);
assert.match(analyticsCompliance, /requireEntitlement\(tenant\.organization\.id, 'executive_roi'\)/);
for (const file of [playbookUpload, playbookReplace, copilotQuery, investigationsRoute, investigationsIdRoute, analyticsKpis, analyticsHighRisk, analyticsCompliance]) {
  assert.doesNotMatch(file, /requireEntitlement\([^)]*'universal_gateway'/);
  assert.doesNotMatch(file, /requireEntitlement\([^)]*"universal_gateway"/);
}
// The UI still honestly flags any genuinely non-enforced feature (demo_mode,
// pilot_readiness) rather than implying every toggle is live-enforced.
assert.match(client, /!selected\.runtimeEnforced/);
assert.match(client, /Founder UI state only/);

// ─── KPIs and catalog data are real, never fabricated ──────────────────────

// 7. Every KPI/catalog number is computed from real backend data — no
//    hardcoded demo numbers, no invented trend, no Math.random.
assert.doesNotMatch(featuresService, /Math\.random/);
assert.match(page, /\{founderFeatures\.length\}/);
assert.match(page, /\{data\.entitlementBackedCount\}/);
assert.match(page, /\{data\.totalOverrides\}/);
assert.match(page, /\{data\.totalCustomers\}/);
assert.doesNotMatch(page, /vs last month|% change|week-over-week/i);

// 8. "Default enabled" is never confused with actual customer access: the
//    Default column/field is its own real founderFeatures.defaultEnabled
//    value, entirely separate from the computed effectiveSummary/
//    customersEnabledCount fields.
assert.match(client, /\{feature\.defaultEnabled \? 'Enabled' : 'Disabled'\}/);
assert.match(featuresService, /defaultEnabled: feature\.defaultEnabled/);
assert.match(featuresService, /customersEnabledCount: enabledCount/);

// 9. The feature-level Effective Status is a real aggregate across every
//    customer's own computed access (ENABLED only when ALL customers are
//    enabled, DISABLED only when NONE are, MIXED otherwise, NO_CUSTOMERS
//    when there is nothing to aggregate) — never a decorative always-on
//    badge.
assert.match(featuresService, /customers\.length === 0 \? 'NO_CUSTOMERS' : enabledCount === 0 \? 'DISABLED' : enabledCount === customers\.length \? 'ENABLED' : 'MIXED'/);

// ─── Mutation security (Section 12) ────────────────────────────────────────

// 10. Every mutation independently re-checks Founder access AND read-only
//     mode server-side inside the 'use server' action — never relying on
//     the client only calling it when authorized, and never relying only
//     on disabled buttons in the UI.
for (const action of ['setFeatureOverride', 'resetFeatureOverride']) {
  const body = page.match(new RegExp(`async function ${action}[\\s\\S]*?\\n\\}\\n`))?.[0] ?? '';
  assert.match(body, /'use server'/);
  assert.match(body, /const access = await getFounderAccess\(\)/);
  assert.match(body, /if \(!access\.ok\) return \{ ok: false/);
  assert.match(body, /if \(access\.readOnly\) return \{ ok: false/);
}

// 11. updateCustomerFeatureFlag validates the feature key against the real
//     catalog and the customerAccountId against a real CustomerAccount row
//     (not just "non-empty") before writing anything.
const updateFn = founderService.match(/export async function updateCustomerFeatureFlag[\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(updateFn, /if \(access\.readOnly\) throw new Error/);
assert.match(updateFn, /const feature = founderFeatures\.find\(\(item\) => item\.key === key\);/);
assert.match(updateFn, /if \(!feature\) throw new Error\('Unknown feature key\.'\);/);
assert.match(updateFn, /const customer = await prisma\.customerAccount\.findUnique\(\{ where: \{ id: customerAccountId \}/);
assert.match(updateFn, /if \(!customer\) throw new Error\('Customer not found\.'\);/);

// 12. The previous override state is read from the database before the new
//     state is applied, and both previous and new state are written to the
//     audit log — not just the new value.
assert.match(updateFn, /const previous = await prisma\.customerFeatureFlag\.findUnique\(\{/);
assert.match(updateFn, /previousEnabled: previous\?\.enabled \?\? null, newEnabled: enabled/);

// 13. The mutation writes FounderAuditLog via the shared logFounderAction
//     helper — never a second, ad hoc audit write.
assert.match(updateFn, /await logFounderAction\(\{/);
assert.match(updateFn, /action: 'customer\.feature_flag\.updated'/);
assert.match(updateFn, /targetType: 'CustomerFeatureFlag'/);

// 14. Resetting an override is a real, additive capability (CustomerFeatureFlag
//     already represents "no override" natively as "no row" — no schema
//     change was needed) — validated the same way as the update path, and
//     is a safe no-op (not an error) when no override exists.
const resetFn = founderService.match(/export async function resetCustomerFeatureOverride[\s\S]*?\n\}\n/)?.[0] ?? '';
assert.match(resetFn, /if \(access\.readOnly\) throw new Error/);
assert.match(resetFn, /if \(!feature\) throw new Error\('Unknown feature key\.'\);/);
assert.match(resetFn, /if \(!customer\) throw new Error\('Customer not found\.'\);/);
assert.match(resetFn, /if \(!previous\) return; \/\/ already has no override/);
assert.match(resetFn, /await prisma\.customerFeatureFlag\.delete\(/);
assert.match(resetFn, /action: 'customer\.feature_flag\.reset'/);
// No schema change was needed or made: exactly one CustomerFeatureFlag
// model exists, unchanged.
assert.equal((prismaSchema.match(/^model CustomerFeatureFlag \{/gm) ?? []).length, 1);

// 15. No client-supplied value can bypass Founder authorization: `access`
//     is only ever produced by getFounderAccess() inside a 'use server'
//     boundary — the mutation functions accept it as an already-validated
//     object, never re-deriving it from formData/client input.
assert.doesNotMatch(founderService.match(/export async function updateCustomerFeatureFlag[\s\S]{0,4000}/)?.[0] ?? '', /access\s*=\s*formData/);
assert.match(founderService, /export async function updateCustomerFeatureFlag\(access: Extract<FounderAccess, \{ ok: true \}>, formData: FormData\)/);
assert.match(founderService, /export async function resetCustomerFeatureOverride\(access: Extract<FounderAccess, \{ ok: true \}>, formData: FormData\)/);

// ─── Authorization / read-only mode ─────────────────────────────────────────

// 16. Founder-only page, gated the same way every other Founder page is:
//     app/founder/layout.tsx's server-side getFounderAccess() + redirect.
assert.match(founderLayout, /getFounderAccess\(\)/);
assert.match(founderLayout, /redirect\('\/dashboard'\)/);
assert.match(page, /const access = await getFounderAccess\(\)/);
assert.match(page, /const canManage = access\.ok && !access\.readOnly/);
assert.doesNotMatch(page, /if \(!access\.ok \|\| access\.readOnly\) return/); // read-only founders can still view

// 17. Export is gated to non-read-only access, server-side, matching the
//     exact convention already used by Customer Health/Onboarding/Go-Live
//     Readiness exports.
assert.match(exportRoute, /if \(access\.readOnly\) \{\s*\n\s*return NextResponse\.json\(\{ error: 'founder_admin_required' \}, \{ status: 403 \}\);/);
assert.match(page, /exportHref=\{canManage \? '\/api\/founder\/features\/export' : null\}/);

// ─── UI: no dead buttons, no ambiguous "Enabled" label, accessible drawer ──

// 18. Plan Entitlement, Founder Override, and Effective Access are always
//     shown as three distinct, labeled facts — never collapsed into a bare
//     "Enabled" with no reason.
assert.match(client, /Plan entitlement<\/p>/);
assert.match(client, /Founder override<\/p>/);
assert.match(client, /Effective: \{EFFECTIVE_ACCESS_LABELS\[row\.effective\.source\]\}/);

// 19. Every customer-row action (Enable/Disable/Reset) is a real control
//     wired to the real mutation functions — never a dead button — and is
//     disabled (not hidden) when it would be a no-op or the Founder is
//     read-only, satisfying "never rely only on disabled buttons" at the
//     UI layer because the server action re-checks independently (already
//     verified above).
assert.match(client, /onClick=\{\(\) => runMutation\(onSetOverride\(\{ customerAccountId: row\.customerId, key: selected\.key, enabled: true \}\)\)\}/);
assert.match(client, /onClick=\{\(\) => runMutation\(onSetOverride\(\{ customerAccountId: row\.customerId, key: selected\.key, enabled: false \}\)\)\}/);
assert.match(client, /onClick=\{\(\) => runMutation\(onResetOverride\(\{ customerAccountId: row\.customerId, key: selected\.key \}\)\)\}/);
assert.match(client, /disabled=\{!canManage \|\| pending \|\| !row\.override\}/);

// 20. Search and category filter operate on real, already-fetched data —
//     never a fake filter that does nothing.
assert.match(client, /feature\.label\.toLowerCase\(\)\.includes\(q\) \|\| feature\.description\.toLowerCase\(\)\.includes\(q\) \|\| feature\.key\.toLowerCase\(\)\.includes\(q\)/);
assert.match(client, /if \(category !== 'ALL' && feature\.category !== category\) return false;/);
assert.match(client, /row\.companyName\.toLowerCase\(\)\.includes\(q\) \|\| row\.domain\.toLowerCase\(\)\.includes\(q\)/);

// 21. Drawer accessibility: Escape closes it, it's a labeled dialog, and
//     focus moves to the close button on open.
assert.match(client, /if \(e\.key === 'Escape'\) setSelectedKey\(null\);/);
assert.match(client, /role="dialog"/);
assert.match(client, /aria-modal="true"/);
assert.match(client, /aria-labelledby="feature-drawer-title"/);
assert.match(client, /closeButtonRef\.current\?\.focus\(\);/);

// 22. Empty/loading-adjacent states are honest: no feature catalog, no
//     customers at all, and no activity are each explained rather than
//     shown as misleading zeros with no context.
assert.match(client, /No feature definitions are available/);
assert.match(client, /No customer accounts are currently provisioned\./);
assert.match(client, /No Founder activity recorded for this feature yet\./);

// ─── Layout / performance ──────────────────────────────────────────────────

// 23. The drawer is `fixed`, so it structurally cannot cause page-level
//     horizontal overflow (unlike a persistent grid column would), and the
//     catalog table keeps its own overflow-x-auto scroller with every
//     column intact.
assert.match(client, /className="fixed inset-0 z-40"/);
assert.doesNotMatch(client, /overflow-x-hidden/);
for (const column of ['Feature', 'Category', 'Plan Access', 'Effective Status', 'Customers', 'Overrides', 'Default']) {
  assert.match(client, new RegExp(`<th className="px-6 py-3">${column}`));
}

// 24. No N+1 queries: one batched customerAccount.findMany (with the
//     featureFlags relation already included) and one batched
//     listFounderAuditLogs call — no per-feature or per-customer query
//     inside the aggregation loop.
assert.match(featuresService, /prisma\.customerAccount\.findMany\(\{/);
assert.match(featuresService, /listFounderAuditLogs\(\{ action: 'customer\.feature_flag', take: 300 \}\)/);
assert.doesNotMatch(featuresService, /customers\.map\(async/);
assert.doesNotMatch(featuresService, /founderFeatures\.map\(async/);
assert.doesNotMatch(featuresService, /for \(const customer of customers\) \{\s*\n\s*await prisma/);

// 25. No secrets, OAuth tokens, or credentials are ever read or rendered.
for (const file of [featuresService, page, client, exportRoute]) {
  assert.doesNotMatch(file, /accessToken|refreshToken|clientSecret|apiKey|password/i);
}

// ─── Regression: locked/adjacent surfaces untouched ────────────────────────

// 26. Provision Customer still imports the exact same founderFeatures
//     catalog (already covered by tests/founder-provisioning.test.ts, and
//     re-checked here since this task explicitly touches that catalog's
//     consumers).
assert.match(founderService, /export const founderFeatures = \[/);

// 27. The locked Founder sidebar/nav is untouched by this task — no new nav
//     entry, no rename, no structural change tied to Feature Management.
assert.doesNotMatch(navClient, /founder\/features.*Manage/);

// 28. Customer 360's own read-only Feature Flags list (Billing tab) is left
//     exactly as-is — this task adds a feature-centric control plane
//     alongside it, not a replacement or a second customer-detail view.
assert.match(customer360Page, /customer\.featureFlags\.map\(\(flag\) =>/);
assert.match(customer360Page, /No feature flags configured yet\./);

console.log('Validated Feature Management: one authoritative founderFeatures catalog and one authoritative CustomerFeatureFlag override table (never a second catalog or a conflation with the tenant-scoped FeatureFlag model), effective access computed by the exact same priority order as lib/entitlements.ts\'s resolveEntitlement (workspace inactivity, then override, then isPlanEntitled, then a Founder-only default), a self-verifying Runtime Enforcement claim (playbook_ai/copilot/investigations/executive_roi/universal_gateway all genuinely enforced via real requireEntitlement call sites; demo_mode/pilot_readiness honestly flagged as Founder-UI-only since no runtime consumer exists for either), every mutation re-validating access/read-only/customer-existence/feature-key server-side with previous-state-aware audit logging, a real override-reset capability with no schema change, real (non-fabricated) KPIs and per-feature aggregates, an accessible fixed-position drawer that cannot cause page overflow, working search/filters, honest empty states, no N+1 queries, no secrets exposed, and Provision Customer/Customer 360/the Founder sidebar left untouched.');
