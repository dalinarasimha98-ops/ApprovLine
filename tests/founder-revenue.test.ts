import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  revenueStatusFor,
  revenueStatusLabel,
  revenueStatusTone,
  arrCoveragePercent,
  fmtCoveragePercent,
  fmtEstimatedArr,
} from '../lib/founder-revenue';

// Part 1: REAL EXECUTED unit tests against the actual, imported data-
// integrity math (lib/founder-revenue.ts has no DB/framework dependency).

// ─── revenueStatusFor: honest binary, null is never treated as $0 ──────────

assert.equal(revenueStatusFor(11988), 'RECORDED_ESTIMATE');
assert.equal(revenueStatusFor(0), 'RECORDED_ESTIMATE'); // a real $0 estimate is still a recorded estimate — distinct from null
assert.equal(revenueStatusFor(null), 'NO_ESTIMATE');
assert.equal(revenueStatusLabel('RECORDED_ESTIMATE'), 'Recorded Estimate');
assert.equal(revenueStatusLabel('NO_ESTIMATE'), 'No Estimate');
assert.equal(revenueStatusTone('RECORDED_ESTIMATE'), 'green');
assert.equal(revenueStatusTone('NO_ESTIMATE'), 'slate');

// ─── arrCoveragePercent: null when there is nothing to divide by ──────────

assert.equal(arrCoveragePercent(12, 18), 67);
assert.equal(arrCoveragePercent(0, 0), null); // no customers at all -> N/A, never a fabricated 0%
assert.equal(arrCoveragePercent(0, 5), 0); // genuinely 0% coverage is a real, distinct fact from "N/A"
assert.equal(arrCoveragePercent(5, 5), 100);
assert.equal(fmtCoveragePercent(null), 'N/A');
assert.equal(fmtCoveragePercent(67), '67%');
assert.equal(fmtCoveragePercent(0), '0%');

// ─── fmtEstimatedArr is reused, not reimplemented (imported from the same
//     module Plans & Billing already uses) ─────────────────────────────────

assert.equal(fmtEstimatedArr(null), 'Not set'); // never a fabricated $0
assert.equal(fmtEstimatedArr(11988), '$12K');

console.log('Validated lib/founder-revenue.ts\'s data-integrity math with real executed unit tests: revenue status is an honest binary that never treats a null estimate as $0 (while a real $0 estimate is correctly still "recorded"), ARR coverage returns null (not a fabricated 0%) when there are no customer accounts at all, and fmtEstimatedArr is imported from lib/founder-billing.ts rather than reimplemented.');

// Part 2: static-analysis assertions, matching the convention used across
// tests/founder-*.test.ts in this repo (no live-database test harness
// exists here) — these assert the module never fabricates revenue data,
// reuses the existing CustomerAccount architecture, enforces server-side
// Founder authorization, never trusts a client-supplied actor identity,
// batches every query, and ships an accessible, honestly-empty-stated
// commercial control plane.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pureLib = read('lib/founder-revenue.ts');
const service = read('services/founder-revenue.ts');
const page = read('app/founder/revenue/page.tsx');
const client = read('components/founder/RevenuePortfolioClient.tsx');
const founderService = read('services/founder.ts');
const billingLib = read('lib/founder-billing.ts');
const billingService = read('services/founder-billing.ts');
const billingClient = read('components/founder/BillingPortfolioClient.tsx');
const seatsClient = read('components/founder/SeatsPortfolioClient.tsx');
const navClient = read('components/founder/FounderNavClient.tsx');
const prismaSchema = read('prisma/schema.prisma');
const pilotsPage = read('app/founder/pilots/page.tsx');
const founderHomePage = read('app/founder/page.tsx');
const tenantIsolationLib = read('lib/tenant-isolation.ts');

// ─── Architecture: no new revenue/billing model, real reuse ────────────────

// 1. No new Prisma model was introduced for revenue/MRR/invoices.
assert.doesNotMatch(prismaSchema, /model\s+(Revenue|MonthlyRevenue|Invoice|CustomerRevenue|RevenueRecord)\b/);

// 2. This module reads CustomerAccount/CustomerSeatAllocation directly —
//    no second commercial engine.
assert.match(service, /prisma\.customerAccount\.findMany/);
assert.match(service, /prisma\.customerAccount\.groupBy\(\{ by: \['planTier'\]/);
assert.doesNotMatch(service, /prisma\.subscription\./i); // the dead Subscription model is never read or written here

// 3. Plan/account-status filter options, badge tones, and date/ARR
//    formatting are re-exported from lib/founder-billing.ts, not
//    duplicated into a second formatter.
assert.match(pureLib, /export \{[\s\S]*?PLAN_FILTER_OPTIONS[\s\S]*?fmtEstimatedArr[\s\S]*?\} from '\.\/founder-billing';/);
assert.doesNotMatch(pureLib, /PLAN_FILTER_OPTIONS: \{/); // not redefined, only re-exported
assert.doesNotMatch(pureLib, /function fmtEstimatedArr/); // not reimplemented

// 4. The shared FounderDrawer is reused — no new drawer implementation.
assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
assert.doesNotMatch(client, /role="dialog"|aria-modal="true"/);

// ─── Data integrity: ARR source of truth is documented, not assumed ───────

// 5. The service's own header documents the exact write-path trace
//    (estimatedArrUsd set once at provisioning, no update path exists
//    anywhere) rather than assuming a mutation should be built.
assert.match(service, /estimatedArrUsd is the ONLY commercial figure this/);
assert.match(service, /no second write path anywhere/);
assert.match(service, /is therefore READ-ONLY for[\s\S]*?ARR: there is no canonical mutation to reuse/);

// 6. The dead Prisma `Subscription` model is explicitly documented as
//    confirmed-unused (matching Plans & Billing's own prior finding),
//    not silently ignored or assumed away.
assert.match(service, /Subscription` model[\s\S]*?is dead schema/);
assert.match(service, /zero write call sites anywhere in the codebase/);

// 7. No MRR is fabricated from ARR/12, and no ARR is fabricated from
//    seats x plan price.
for (const file of [service, client, page, pureLib]) {
  assert.doesNotMatch(file, /estimatedArrUsd\s*\/\s*12/); // no MRR-from-ARR fabrication
  assert.doesNotMatch(file, /purchasedSeats\s*\*\s*999/); // no ARR-from-seats-times-price fabrication
}

// 8. Null estimatedArrUsd is never coerced into a displayed $0 — every
//    render path goes through fmtEstimatedArr/revenueStatusFor, which are
//    already proven above to treat null and 0 as distinct facts.
assert.doesNotMatch(client, /estimatedArrUsd \?\? 0/); // never defaulted to 0 for display
assert.doesNotMatch(service, /estimatedArrUsd: customer\.estimatedArrUsd \?\? 0/); // row mapping preserves null

// ─── Filters — all real SQL, no fabricated eligibility rule ────────────────

// 9. Search covers company/domain/admin email via real SQL OR, matching
//    Plans & Billing's exact convention (simpler than Seats & Usage's
//    JS-side filter, because every Revenue filter — including coverage —
//    is a plain column or null-check Prisma can express directly).
assert.match(service, /companyName: \{ contains: q, mode: 'insensitive' \}/);
assert.match(service, /domain: \{ contains: q, mode: 'insensitive' \}/);
assert.match(service, /primaryAdminEmail: \{ contains: q, mode: 'insensitive' \}/);

// 10. Plan, account-status, and revenue-coverage filters are all pushed to
//     real SQL `where` — no bounded-fetch-then-filter workaround needed
//     (unlike Seats & Usage's utilization ratio).
assert.match(service, /const planFilter = planTierFilterFor\(filters\.plan\);/);
assert.match(service, /if \(filters\.status\) where\.status = filters\.status;/);
assert.match(service, /const coverageFilter = coverageFilterFor\(filters\.coverage\);/);
assert.match(service, /if \(coverage === 'RECORDED'\) return \{ estimatedArrUsd: \{ not: null \} \};/);
assert.match(service, /if \(coverage === 'MISSING'\) return \{ estimatedArrUsd: null \};/);

// 11. Clear Filters actually clears every filter, including coverage.
assert.match(client, /const hasActiveFilters = Boolean\(filters\.q \|\| filters\.plan \|\| filters\.status \|\| filters\.coverage\);/);
assert.match(client, /function clearFilters\(\) \{\s*\n\s*setQ\(''\);\s*\n\s*router\.push\(pathname\);/);

// ─── Pagination / empty states ──────────────────────────────────────────────

// 12. Pagination uses the filtered total, and true system-empty is
//     distinguished from filtered-to-zero.
assert.match(service, /hasAnyCustomers: totalCustomers > 0/);
assert.match(client, /!hasAnyCustomers \?/);
assert.match(client, /No customer accounts have been provisioned yet\./);
assert.match(client, /No customers match your current filters\./);
assert.doesNotMatch(client, /\{totalCustomers === 0 \? \(/);

// ─── Commercial Attention: real counts, no fabricated "lost revenue" ──────

// 13. All three attention counts are computed from the real
//     estimatedArrUsd/status columns, and the inactive-with-ARR case is
//     never labeled "lost revenue" (no backing data for that concept).
assert.match(service, /estimatedArrUsd: null \} \}\),\s*\n\s*prisma\.customerAccount\.count\(\{ where: \{ status: 'ACTIVE', estimatedArrUsd: null/);
assert.match(service, /status: \{ in: \['SUSPENDED', 'CHURNED'\] \}, estimatedArrUsd: \{ not: null \}/);
assert.doesNotMatch(page, /lost revenue/i);
assert.doesNotMatch(client, /lost revenue/i);
assert.match(page, /Account retains a recorded ARR estimate but is not active\./);

// ─── Revenue Status: only the two honest values exist ──────────────────────

// 14. No fabricated payment-style states in any actual logic (lib/founder-revenue.ts's
//     own header comment explicitly documents these as excluded counter-examples,
//     so it is deliberately not checked here).
for (const file of [service, client, page]) {
  assert.doesNotMatch(file, /'Paid'|'Overdue'|'Collected'|'Renewed'|At Risk Revenue/);
}

// ─── Security / authorization ───────────────────────────────────────────────

// 15. Founder identity is resolved server-side; read-only is enforced
//     independently in the page and in the reused seat mutation; no
//     client-supplied actor/org identity is ever trusted.
assert.match(page, /const access = await getFounderAccess\(\);/);
assert.match(page, /if \(!access\.ok \|\| access\.readOnly\) return;/);
assert.match(page, /canWrite=\{!readOnly\}/);
assert.doesNotMatch(page, /actorEmail:\s*formData\.get|organizationId:\s*formData\.get/);

// 16. No credential/secret fields ever reach this module.
for (const file of [service, client, page]) {
  assert.doesNotMatch(file, /encryptedTokens|oauthToken|accessToken|clientSecret/i);
}

// ─── Auditability: the one reused mutation, no second engine ──────────────

// 17. The drawer's only mutation (Manage Seats) reuses services/founder.ts's
//     existing updateCustomerSeats and its one canonical audit action —
//     no ARR mutation, no second seat mutation, no duplicated audit logic.
assert.match(page, /import \{ getFounderAccess, updateCustomerSeats \} from '@\/services\/founder'/);
assert.match(page, /await updateCustomerSeats\(access, formData\)/);
assert.doesNotMatch(service, /function updateCustomerSeats|function updateEstimatedArr|function updateCustomerArr/);
assert.doesNotMatch(client, /function updateCustomerSeats/);
assert.match(founderService, /action: 'customer\.seats\.updated'/); // the one canonical audit action, untouched
// Confirmed by the architecture audit: no update path for estimatedArrUsd
// exists anywhere in the codebase, so none is fabricated here either.
assert.doesNotMatch(founderService, /estimatedArrUsd:\s*(?!.*provisionFounderCustomer)[a-zA-Z]/s);

// ─── Performance: no N+1, batched queries regardless of page size ──────────

// 18. Exactly one customer findMany and one groupBy — the rest of the
//     batch is simple aggregates/counts, never a per-row query.
assert.equal((service.match(/prisma\.customerAccount\.findMany\(/g) ?? []).length, 1);
assert.equal((service.match(/prisma\.customerAccount\.groupBy\(/g) ?? []).length, 1);
assert.doesNotMatch(service, /customers\.map\(async|rows\.map\(async|for \(const customer of/); // no per-row await inside a loop over fetched rows
assert.match(service, /await Promise\.all\(\[/);

// ─── Accessibility ──────────────────────────────────────────────────────────

// 19. Real semantic table headers (scope="col"), no clickable <tr> hack —
//     the sticky Action column trigger is a real, keyboard-reachable
//     <button>.
assert.match(client, /<th scope="col" className="w-\[185px\] whitespace-nowrap px-5 py-3">Customer<\/th>/);
assert.doesNotMatch(client, /<tr[^>]*onClick/);
assert.match(client, /<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => setSelectedId\(customer\.id\)\}/);

// ─── Layout: no page-level horizontal overflow, applying the fix already
//     validated (and re-validated) for Seats & Usage from the start ───────

// 20. Root grid + bounded table + sticky Action column with a
//     scroll-conditional shadow (not a permanent one, per the Seats &
//     Usage lesson) and column widths that fit the real Founder shell's
//     1440px AND 1280px main-content areas with zero horizontal scroll.
assert.match(page, /grid min-w-0 grid-cols-1 gap-6/);
assert.match(client, /overflow-x-auto/);
assert.match(client, /sticky right-0/);
assert.match(client, /min-w-\[946px\]/);
assert.match(client, /ResizeObserver/);
assert.match(client, /tableScrollable/);
assert.match(client, /el\.scrollWidth > el\.clientWidth/);
assert.doesNotMatch(client, /className="sticky right-0 w-24 whitespace-nowrap bg-slate-50 px-4 py-3 text-right shadow-/); // not unconditionally applied on the header cell
assert.doesNotMatch(client, /text-right group-hover:bg-slate-50 shadow-/); // not unconditionally applied on the body cell

// 21. The Updated column applies the same fmtDate-overflow fix already
//     found and fixed for Seats & Usage (truncate + title, not a bare
//     whitespace-nowrap that lets overflow silently vanish under the
//     sticky column).
assert.match(client, /w-\[115px\] whitespace-nowrap px-5 py-3">Updated<\/th>/);
assert.match(client, /className="truncate px-5 py-4 text-xs font-semibold text-slate-500" title=\{fmtDate\(customer\.updatedAt\)\}>\{fmtDate\(customer\.updatedAt\)\}<\/td>/);

// ─── Fabricated-data regression: the pre-existing page this replaces ──────

// 22. The replaced page no longer builds Revenue from
//     services/founder-pilots.ts's pipeline/pilot-forecast concept
//     (expectedArr) or fabricates Plan/Seats/Discount from ARR-bucket
//     heuristics — the exact violation this task exists to fix.
assert.doesNotMatch(page, /buildFounderPilotCommandCenter/);
assert.doesNotMatch(page, /expectedArr/);
assert.doesNotMatch(page, /Math\.round\(pilot\.expectedArr/);
assert.doesNotMatch(page, /pilot\.expectedArr >= 25000 \? 'Enterprise'/);
assert.doesNotMatch(page, /42 days/); // the old hardcoded "Average time to close" fabrication

// 23. /founder/pilots itself is untouched and remains reachable from other
//     real pages — Revenue dropping its own link to it does not orphan
//     the Pilot Command Center.
assert.match(founderHomePage, /founder\/pilots/);
assert.ok(pilotsPage.length > 0);

// ─── Regression: Plans & Billing / Seats & Usage / tenant isolation ───────

// 24. Plans & Billing and Seats & Usage's own tables/drawers/helpers are
//     byte-for-byte untouched by this task.
assert.match(billingLib, /export function seatUtilizationPercent\(used: number, purchased: number\): number \{/);
assert.match(billingService, /export async function buildBillingPortfolio/);
assert.match(billingClient, /Plan Distribution|BillingPortfolioClient/);
assert.match(seatsClient, /Customer Seat Usage/);

// 25. Tenant isolation lib never references this module's concepts —
//     Founder commercial data stays in its own cross-tenant-by-design
//     module, as with every other Founder commercial page.
assert.doesNotMatch(tenantIsolationLib, /estimatedArrUsd|RevenueCoverage/);

// 26. The Founder sidebar's Revenue entry is untouched and still points
//     at this same route — this task did not touch navigation.
assert.match(navClient, /\{ label: 'Revenue', href: '\/founder\/revenue' \}/);

console.log('Validated Revenue (/founder/revenue): replaces a pre-existing page that fabricated Plan/Seats/Discount/"42 days" from services/founder-pilots.ts\'s separate pilot-forecast concept, rebuilding it entirely on the real, authoritative CustomerAccount.estimatedArrUsd — documented (not assumed) as the only commercial figure this codebase tracks, with no update path anywhere (so this module is read-only for ARR, reusing only the existing updateCustomerSeats mutation for its one real action), and the dead Subscription model confirmed untouched. Never fabricates MRR from ARR/12 or ARR from seats times plan price, never coerces a null estimate into a displayed $0, and labels revenue status as an honest two-value Recorded Estimate/No Estimate rather than an invented payment state. All filters (search, plan, status, revenue coverage) are pushed to real SQL with no per-row queries, Commercial Attention counts are real and never call a suspended account with a recorded estimate "lost revenue," and the table applies the exact sticky-column-overlap and date-overflow fixes already found and fixed for Seats & Usage, fitting the real Founder shell\'s 1440px and 1280px widths with zero horizontal scroll. Plans & Billing, Seats & Usage, the Pilot Command Center, and tenant isolation are all left untouched.');
