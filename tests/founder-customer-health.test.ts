import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across tests/founder-*.test.ts
// in this repo: there is no live-database test harness here (CI's DATABASE_URL
// points at nothing reachable), so these assert the source code reuses the
// authoritative health engine, derives signals from real data, enforces
// authorization, and avoids N+1 queries/fabricated data — rather than
// exercising a real Postgres instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const service = read('services/founder-customer-health.ts');
const pureLib = read('lib/customer-health.ts');
const page = read('app/founder/customer-health/page.tsx');
const client = read('components/founder/CustomerHealthClient.tsx');
const exportRoute = read('app/api/founder/customer-health/export/route.ts');
const oldHealthPage = read('app/founder/health/page.tsx');
const navClient = read('components/founder/FounderNavClient.tsx');
const founderService = read('services/founder.ts');
const founderLayout = read('app/founder/layout.tsx');
const homePage = read('app/founder/page.tsx');
const revenuePage = read('app/founder/revenue/page.tsx');

// 1. Founder authorization: every /founder/* route (this page included) is
//    gated server-side by app/founder/layout.tsx's getFounderAccess() +
//    redirect — never trusting client-provided identity. The page itself
//    also calls getFounderAccess() (to compute the read-only export gate),
//    reusing the same authoritative function rather than a second check.
assert.match(founderLayout, /getFounderAccess\(\)/);
assert.match(founderLayout, /redirect\('\/dashboard'\)/);
assert.match(page, /import \{ getFounderAccess \} from '@\/services\/founder'/);
assert.match(page, /const access = await getFounderAccess\(\)/);

// 2. Health status/score come from the authoritative CustomerHealth record
//    (customer.health?.status / customer.health?.score) — never
//    recalculated in this module.
assert.match(service, /customer\.health\?\.status/);
assert.match(service, /customer\.health\?\.score/);
assert.match(service, /This module deliberately computes NO health score of its own/);

// 3. No duplicate health scoring engine: this module never redefines the
//    score->status thresholds (80\/60\/35, services/founder.ts's
//    healthStatusForScore) or a component-weighted score calculator
//    (calculateHealthScore) — it only reads the authoritative fields and
//    reuses the existing onboarding-stage function.
assert.doesNotMatch(service, /function healthStatusForScore/);
assert.doesNotMatch(service, /function calculateHealthScore/);
assert.doesNotMatch(service, /score >= 80/);
assert.match(service, /import \{ deriveProvisioningOnboardingStage \} from '@\/services\/founder'/);
assert.doesNotMatch(service, /function deriveProvisioningOnboardingStage/);

// 4-7. Healthy / Needs Attention / At Risk / Critical counts are tallied
//      directly from each customer's authoritative healthStatus, and the
//      page renders all four from that same counts object — never a
//      hardcoded number.
assert.match(service, /counts\[healthStatus\] \+= 1/);
assert.match(pureLib, /HEALTHY: 'Healthy'/);
assert.match(pureLib, /NEEDS_ATTENTION: 'Needs Attention'/);
assert.match(pureLib, /AT_RISK: 'At Risk'/);
assert.match(pureLib, /CRITICAL: 'Critical'/);
assert.match(page, /data\.counts\[status\]/);
assert.match(page, /Object\.keys\(HEALTH_STATUS_LABELS\) as HealthStatus\[\]/);

// 8. Founder Attention is built by filtering the real, fetched customer
//    rows — never a separate hardcoded example list.
assert.match(service, /rows\s*\n\s*\.filter\(\(row\) => row\.healthStatus !== 'HEALTHY'\)/);
assert.doesNotMatch(service, /attention: \[\s*\{/);

// 9. Primary reasons are derived from real, already-tracked signals only:
//    real activity timestamps, real integration connection state, the
//    existing onboarding-stage function, real seat counts, and real
//    approval counts — never Math.random or a fabricated placeholder.
assert.match(service, /lastActivityDays/);
assert.match(service, /integrationErrors/);
assert.match(service, /onboardingStage/);
assert.match(service, /adoptionPercent/);
assert.match(service, /approvalsProcessed/);
assert.doesNotMatch(service, /Math\.random/);

// 10. No fake reasons: the example company names from the task's own
//     "presentation only" mockup never appear as literal source text (they
//     were illustrative examples, not real data to hardcode), and every
//     signal that can't be confidently established falls back to the
//     honest "Health requires review" rather than inventing an explanation.
for (const fakeName of ['Acme Corporation', 'Globex', 'Initech', 'Umbrella Corp', 'Soylent']) {
  assert.doesNotMatch(service, new RegExp(fakeName));
  assert.doesNotMatch(client, new RegExp(fakeName));
}
assert.match(service, /Health requires review/);

// 11. Customer Health links into the existing Customer 360 route
//     (/founder/customers/[id]) rather than a second customer detail
//     system — both the Founder Attention rows and the All Customers rows
//     resolve through the same customer360Href/Open Customer 360 links.
assert.match(client, /customer360Href\(id: string, tab\?: string\)/);
assert.match(client, /`\/founder\/customers\/\$\{id\}`/);
assert.match(client, /Open Customer 360/);
assert.doesNotMatch(client, /\/founder\/customer-health\/customers\//);

// 12. Last Activity comes from real recorded activity (AuditLog.createdAt,
//     grouped per organization) — never CustomerAccount.updatedAt, which
//     only reflects a record edit, not real customer usage.
assert.match(service, /prisma\.auditLog\.groupBy\(\{ by: \['organizationId'\], _max: \{ createdAt: true \} \}\)/);
assert.doesNotMatch(service, /lastActivityAt.*customer\.updatedAt/);
assert.doesNotMatch(client, /customer\.updatedAt/);

// 13. Tenant isolation: each customer's last-activity lookup is keyed by
//     that specific customer's own organizationId (a per-org map), never a
//     single shared/global aggregate that could leak one tenant's activity
//     onto another tenant's row.
assert.match(service, /lastActivityMap\.get\(customer\.organizationId\)/);
assert.match(service, /const lastActivityMap = new Map\(lastActivityByOrg\.map\(\(row\) => \[row\.organizationId, row\._max\.createdAt\]\)\)/);

// 14. Empty states are honest, not fabricated warning cards: "no customers
//     at all" offers the real Provision Customer link, and "everything is
//     healthy" says so plainly instead of inventing something to warn about.
assert.match(client, /No customers provisioned yet/);
assert.match(client, /Provision Customer/);
assert.match(client, /All customers are healthy/);
assert.match(client, /No customers currently require Founder attention\./);

// 15. The All Customers table renders the exact operational columns
//     requested (Customer, Health, Adoption, Integrations, Approvals,
//     Onboarding, Last Activity), sourced from one batched query — no
//     per-customer N+1 query anywhere in the service.
for (const column of ['Customer', 'Health', 'Adoption', 'Integrations', 'Approvals', 'Onboarding', 'Last Activity']) {
  assert.match(client, new RegExp(`<th className="px-6 py-3">${column}`));
}
assert.match(service, /prisma\.customerAccount\.findMany\(\{/);
assert.doesNotMatch(service, /customers\.map\(async/); // mapping is synchronous — no per-row query inside it
assert.doesNotMatch(service, /for \(const customer of customers\) \{\s*\n\s*await prisma/);

// 16. Selecting a customer (Founder Attention row, All Customers row, or a
//     quick link) navigates to/selects the real customer — detail
//     navigation is wired to genuine ids, not placeholder hrefs.
assert.match(client, /setSelectedId\(row\.id\)/);
assert.match(client, /const selected = rows\.find\(\(row\) => row\.id === selectedId\)/);

// 17. Read-only Founder access (SUPPORT_ADMIN) can still view the full
//     page — nothing here blocks rendering for a read-only role — but the
//     Export action (the only "write-adjacent" surface, since it uses the
//     platform's export-download mechanism) is gated off in the UI and
//     enforced again server-side in the export route, matching the exact
//     access.readOnly convention already used by the pilots export route.
assert.match(page, /const canExport = access\.ok && !access\.readOnly/);
assert.doesNotMatch(page, /if \(!access\.ok \|\| access\.readOnly\) return/); // must not block the whole page for read-only founders
assert.match(exportRoute, /if \(access\.readOnly\) \{\s*\n\s*return NextResponse\.json\(\{ error: 'founder_admin_required' \}, \{ status: 403 \}\);/);

// 18. No secrets, OAuth tokens, or credentials are ever read or rendered by
//     this module — Customer Health only ever touches health/onboarding/
//     integration-status metadata, never token fields.
for (const file of [service, page, client, exportRoute]) {
  assert.doesNotMatch(file, /accessToken|refreshToken|clientSecret|apiKey|password/i);
}

// ─── Route consolidation: exactly one Customer Health page ─────────────────

// 19. The old /founder/health route is preserved (never deleted, per
//     "never remove existing functionality") but now redirects to the new
//     canonical page, so there is exactly one authoritative Customer
//     Health UI rather than two independently-maintained views of the same
//     data.
assert.match(oldHealthPage, /redirect\('\/founder\/customer-health'\)/);

// 20. Every internal nav/link that used to point at /founder/health now
//     points at the canonical /founder/customer-health route.
assert.doesNotMatch(navClient, /href: '\/founder\/health'/);
assert.match(navClient, /href: '\/founder\/customer-health'/);
assert.doesNotMatch(homePage, /'\/founder\/health'/);
assert.doesNotMatch(revenuePage, /'\/founder\/health'/);

// 21. The onboarding stage shown is the real, existing 5-stage pipeline
//     function (services/founder.ts's deriveProvisioningOnboardingStage) —
//     not a fabricated percentage. No onboarding-progress percentage
//     number is computed anywhere in this module (see Final Report: this
//     was intentionally not shown, since no per-step-weighted progress
//     calculation exists in the app).
assert.doesNotMatch(service, /onboardingPercent/i);
assert.match(founderService, /export function deriveProvisioningOnboardingStage/);

// 22. Integration error detection reuses the exact same connection-state
//     definition services/founder.ts's buildFounderOperationsCenter already
//     uses for its platform-wide integration-failure count — not a second,
//     differently-defined threshold (e.g. errorCount).
assert.match(service, /connectionState === 'ERROR' \|\| i\.connectionState === 'NEEDS_REAUTH'/);
assert.match(founderService, /connectionState: \{ in: \['ERROR', 'NEEDS_REAUTH'\] \}/);

console.log('Validated the Customer Health command center: authoritative CustomerHealth status/score reused with no second scoring engine, real-signal-derived (not fabricated) primary reasons with an honest fallback, batched no-N+1 queries, real AuditLog-based Last Activity (not updatedAt), per-organization tenant-scoped activity lookups, honest empty states, Customer 360 reuse for detail navigation, read-only-safe viewing with export gated to admins, no secrets exposed, and the old /founder/health route consolidated into this one canonical page.');

// ─── Layout regression: wide tables must never force the page to overflow
// horizontally underneath the fixed Founder sidebar ──────────────────────
//
// Bug: Tailwind's built-in grid-cols-N utilities already wrap each track in
// minmax(0, 1fr), but a custom arbitrary grid-template value (grid-cols-[...])
// is used exactly as written — a bare `1fr` track has no such safeguard, so
// a grid item's default "automatic minimum size" (based on its content,
// here the min-w-[820px]/min-w-[960px] tables) can force the whole track —
// and the page — wider than the viewport. Since the Founder sidebar is
// `fixed`, that horizontal overflow makes page content appear to slide out
// from underneath it once the page scrolls right.

// 23. The two-column grid's flexible track is written as minmax(0, 1fr),
//     not a bare 1fr, so it can actually shrink to the viewport instead of
//     growing to fit the wide tables inside it.
assert.match(client, /xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
assert.doesNotMatch(client, /xl:grid-cols-\[1fr_360px\]/);

// 24. The grid item holding the wide, horizontally-scrollable tables has an
//     explicit min-w-0, overriding the browser's default content-based
//     automatic minimum size for grid items.
assert.match(client, /<div className="min-w-0 space-y-6">/);

console.log('Validated the Customer Health layout: the two-column grid track is minmax(0, 1fr) and its table-holding grid item has min-w-0, so wide tables scroll internally instead of forcing the whole page to overflow horizontally underneath the fixed Founder sidebar.');
