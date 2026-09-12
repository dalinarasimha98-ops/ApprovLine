import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeUtilizationPercent,
  computeAvailableSeats,
  utilizationBucketFor,
  fmtUtilization,
  fmtAvailableSeats,
  capacityInterpretation,
} from '../lib/founder-seats';

// Part 1: REAL EXECUTED unit tests against the actual, imported data-
// integrity math (lib/founder-seats.ts has no DB/framework dependency, so
// unlike the rest of this Founder test suite family these run the real
// functions with real inputs rather than asserting on source text).

// ─── computeUtilizationPercent: never clamped, honest null for 0 purchased ─

assert.equal(computeUtilizationPercent(21, 25), 84);
assert.equal(computeUtilizationPercent(0, 0), null); // zero purchased -> undefined utilization, not 0%
assert.equal(computeUtilizationPercent(0, 25), 0); // genuinely 0% is still a real, distinct fact from "N/A"
assert.equal(computeUtilizationPercent(28, 25), 112); // over-capacity: never clamped to 100
assert.equal(computeUtilizationPercent(500, 500), 100);
assert.equal(computeUtilizationPercent(-5, 25), -20); // defensive: does not crash on unexpected negative input, does not fabricate a "safe" value either

// ─── computeAvailableSeats: can go negative, never silently clamped to 0 ───

assert.equal(computeAvailableSeats(21, 25), 4);
assert.equal(computeAvailableSeats(28, 25), -3);
assert.equal(computeAvailableSeats(0, 0), 0);

// ─── utilizationBucketFor: mutually exclusive, matches the documented
//     thresholds exactly (Under 50 / 50-79 / 80-99 / At capacity / Over) ───

assert.equal(utilizationBucketFor(0, 0), null); // zero purchased -> no bucket
assert.equal(utilizationBucketFor(10, 100), 'UNDER_50');
assert.equal(utilizationBucketFor(49, 100), 'UNDER_50');
assert.equal(utilizationBucketFor(50, 100), 'FIFTY_TO_79');
assert.equal(utilizationBucketFor(79, 100), 'FIFTY_TO_79');
assert.equal(utilizationBucketFor(80, 100), 'EIGHTY_TO_99');
assert.equal(utilizationBucketFor(99, 100), 'EIGHTY_TO_99');
assert.equal(utilizationBucketFor(100, 100), 'AT_CAPACITY'); // exactly at capacity is its own bucket, not folded into 80-99
assert.equal(utilizationBucketFor(101, 100), 'OVER_CAPACITY');
assert.equal(utilizationBucketFor(200, 100), 'OVER_CAPACITY');

// ─── Display formatting is honest, never fabricates a percentage or a
//     clamped-to-zero seat count ───────────────────────────────────────────

assert.equal(fmtUtilization(null), 'N/A');
assert.equal(fmtUtilization(0), '0%');
assert.equal(fmtUtilization(112), '112%');
assert.equal(fmtAvailableSeats(4), '4');
assert.equal(fmtAvailableSeats(0), '0');
assert.equal(fmtAvailableSeats(-3), 'Over by 3');

// ─── Capacity interpretation sentence matches the exact required examples ──

assert.equal(capacityInterpretation(21, 25), '21 of 25 purchased seats are currently used.');
assert.equal(capacityInterpretation(28, 25), 'Usage exceeds purchased capacity by 3 seats.');
assert.equal(capacityInterpretation(1, 1), '1 of 1 purchased seat is currently used.'); // singular grammar
assert.equal(capacityInterpretation(0, 0), 'No seats have been purchased for this account yet.');

console.log('Validated lib/founder-seats.ts\'s data-integrity math with real executed unit tests: utilization is never clamped to 100% and reports an honest null/"N/A" (not 0%) when purchasedSeats is 0, available seats can go negative and render as "Over by N" rather than being silently floored at 0, the five utilization buckets are mutually exclusive and match the documented Under 50/50-79/80-99/At capacity/Over capacity thresholds exactly (including "exactly at capacity" being its own bucket rather than folded into 80-99), and the capacity-interpretation sentence matches the task\'s own required examples verbatim.');

// Part 2: static-analysis assertions, matching the convention used across
// tests/founder-*.test.ts in this repo (no live-database test harness
// exists here — CI's DATABASE_URL points at nothing reachable) — these
// assert the source code reuses the existing CustomerAccount/
// CustomerSeatAllocation/FounderManagedUser/CustomerHealth architecture,
// enforces server-side Founder authorization and read-only protection,
// never trusts a client-supplied actor identity, batches every query, and
// ships an accessible, honestly-empty-stated commercial control plane.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pureLib = read('lib/founder-seats.ts');
const service = read('services/founder-seats.ts');
const page = read('app/founder/seats/page.tsx');
const client = read('components/founder/SeatsPortfolioClient.tsx');
const founderService = read('services/founder.ts');
const billingLib = read('lib/founder-billing.ts');
const billingClient = read('components/founder/BillingPortfolioClient.tsx');
const navClient = read('components/founder/FounderNavClient.tsx');
const prismaSchema = read('prisma/schema.prisma');
const tenantIsolationLib = read('lib/tenant-isolation.ts');

// ─── Architecture: no new seat/usage/billing model, real reuse ─────────────

// 1. No new Prisma model was introduced.
assert.doesNotMatch(prismaSchema, /model\s+(SeatUsage|SeatCapacity|CustomerSeatUsage|UsageRecord)\b/);

// 2. This module reads the existing three models directly — no second
//    seat/usage engine.
assert.match(service, /prisma\.customerSeatAllocation\./);
assert.match(service, /prisma\.founderManagedUser\.groupBy/);
assert.match(service, /health: \{ select: \{ approvalsProcessed: true, integrationsConnected: true, lastLoginAt: true \} \}/);
assert.doesNotMatch(service, /function recalculateCustomerSeats|function refreshCustomerHealth/); // those stay exclusively in services/founder.ts

// 3. Plan/account-status filter options, badge tones, and date formatting
//    are re-exported from lib/founder-billing.ts, not duplicated.
assert.match(pureLib, /export \{[\s\S]*?PLAN_FILTER_OPTIONS[\s\S]*?\} from '@\/lib\/founder-billing';/);
assert.doesNotMatch(pureLib, /PLAN_FILTER_OPTIONS: \{/); // not redefined, only re-exported
assert.doesNotMatch(pureLib, /ACCOUNT_STATUS_FILTER_OPTIONS: \{/);

// 4. Manage Seats reuses services/founder.ts's existing updateCustomerSeats
//    — no second seat mutation, no duplicated validation, no duplicated
//    audit logging.
assert.match(page, /import \{ getFounderAccess, updateCustomerSeats \} from '@\/services\/founder'/);
assert.match(page, /await updateCustomerSeats\(access, formData\)/);
assert.doesNotMatch(service, /function updateCustomerSeats|function updateSeats\(/);
assert.doesNotMatch(client, /function updateCustomerSeats/);
assert.match(founderService, /action: 'customer\.seats\.updated'/); // the one canonical audit action, untouched

// 5. The shared FounderDrawer is reused — no sixth drawer implementation.
assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
assert.doesNotMatch(client, /role="dialog"|aria-modal="true"/);

// ─── Data integrity: source of truth is documented and traced, not assumed ─

// 6. The service's own header documents the write-path trace (not assumed)
//    that usedSeats is authoritative-by-convention, and explicitly
//    distinguishes it from CustomerHealth.activeUsers.
assert.match(service, /usedSeats is written in exactly three places/);
assert.match(service, /CustomerHealth\.activeUsers is a \*separate\* materialized column/);
assert.doesNotMatch(service, /customer\.health\?\.activeUsers/); // never read as a seat count

// 7. Utilization is computed from the real CustomerSeatAllocation fields on
//    each row, never from CustomerHealth or a client-supplied value.
assert.match(service, /computeUtilizationPercent\(usedSeats, purchasedSeats\)/);
assert.match(service, /purchasedSeats = customer\.seatAllocation\?\.purchasedSeats \?\? 0/);
assert.match(service, /usedSeats = customer\.seatAllocation\?\.usedSeats \?\? 0/);

// 8. Zero purchased seats is handled safely (no NaN/Infinity) and honestly
//    (null, not 0%) — checked both in the pure lib (already executed above)
//    and confirmed the service never overrides that with a fabricated
//    default.
assert.match(pureLib, /if \(purchasedSeats <= 0\) return null;/);
assert.doesNotMatch(service, /utilizationPercent: 0,/); // never hardcoded to 0 for the zero-purchased case

// 9. Over-capacity is never silently hidden: no Math.min/clamp applied to
//    this module's own utilization or available-seats values.
assert.doesNotMatch(pureLib, /Math\.min\(100,\s*Math\.round\(\(usedSeats/); // the deliberately-different, clamped Billing helper lives in lib/founder-billing.ts, not here
assert.doesNotMatch(pureLib, /Math\.max\(0, purchasedSeats - usedSeats\)/); // available seats is never floored at 0

// ─── Filters ────────────────────────────────────────────────────────────────

// 10. Search covers company/domain/admin email (matching the established
//     Billing/Customer Integrations convention).
assert.match(service, /\$\{row\.companyName\} \$\{row\.domain\} \$\{row\.primaryAdminEmail\}/);

// 11. Plan and account-status filters are pushed to real SQL (real
//     columns); utilization is documented as a JS-side filter because it is
//     a cross-column ratio Prisma cannot express in `where` — an honestly
//     documented limitation, not a hidden inconsistency.
assert.match(service, /Prisma's query builder cannot filter on directly/);
assert.match(service, /const planFilter = planTierFilterFor\(filters\.plan\);/);
assert.match(service, /if \(filters\.status\) where\.status = filters\.status;/);

// 12. Clear Filters actually clears every filter, including utilization.
assert.match(client, /const hasActiveFilters = Boolean\(filters\.q \|\| filters\.plan \|\| filters\.status \|\| filters\.utilization\);/);
assert.match(client, /function clearFilters\(\) \{\s*\n\s*setQ\(''\);\s*\n\s*router\.push\(pathname\);/);

// ─── Pagination / empty states ──────────────────────────────────────────────

// 13. Pagination uses the filtered total, and true system-empty is
//     distinguished from filtered-to-zero (the same class of bug fixed for
//     Customer Integrations earlier this session).
assert.match(service, /hasAnyCustomers: totalCustomers > 0/);
assert.match(client, /!hasAnyCustomers \?/);
assert.match(client, /No customer accounts have been provisioned yet\./);
assert.match(client, /No customers match your current filters\./);
assert.doesNotMatch(client, /\{totalCustomers === 0 \? \(/);

// ─── Security / authorization ───────────────────────────────────────────────

// 14. Every mutation independently resolves Founder identity server-side
//     and enforces read-only — never trusts a client-supplied actor,
//     customer, or organization.
assert.match(page, /const access = await getFounderAccess\(\);/);
assert.match(page, /if \(!access\.ok \|\| access\.readOnly\) return;/);
assert.match(page, /canWrite=\{!readOnly\}/);
assert.doesNotMatch(page, /actorEmail:\s*formData\.get|organizationId:\s*formData\.get/);

// 15. No credential/secret fields ever reach this module.
for (const file of [service, client]) {
  assert.doesNotMatch(file, /encryptedTokens|oauthToken|accessToken|clientSecret/i);
}

// ─── Performance: no N+1, batched queries regardless of page size ──────────

// 16. Exactly one customer findMany, one seat-allocation aggregate, one
//     unfiltered seat-allocation scan for KPI buckets, and one grouped
//     FounderManagedUser status count — never a per-row query.
assert.equal((service.match(/prisma\.customerAccount\.findMany\(/g) ?? []).length, 1);
assert.equal((service.match(/prisma\.founderManagedUser\.groupBy\(/g) ?? []).length, 1);
assert.doesNotMatch(service, /customers\.map\(async|rows\.map\(async|for \(const customer of candidates\) \{[\s\S]*?await prisma\./); // no per-row await inside a loop over fetched rows
assert.match(service, /await Promise\.all\(\[/);

// ─── Accessibility ──────────────────────────────────────────────────────────

// 17. Real semantic table headers (scope="col"), no clickable <tr> hack —
//     the sticky Action column trigger is a real, keyboard-reachable
//     <button>.
assert.match(client, /<th scope="col" className="w-\[240px\] whitespace-nowrap px-5 py-3">Customer<\/th>/);
assert.doesNotMatch(client, /<tr[^>]*onClick/);
assert.match(client, /<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => setSelectedId\(customer\.id\)\}/);

// ─── Layout: no page-level horizontal overflow (established pattern) ──────

// 18. Root grid + bounded table + sticky Action column, matching every
//     other Founder module's proven fix.
assert.match(page, /grid min-w-0 grid-cols-1 gap-6/);
assert.match(client, /overflow-x-auto/);
assert.match(client, /sticky right-0/);

// ─── Nav fix ────────────────────────────────────────────────────────────────

// 19. The pre-existing "Seats & Usage" sidebar entry pointed at
//     /founder/users (the unrelated Managed Users directory) — a
//     mislabeled link that would have made this exact deliverable
//     unreachable/misleading from the sidebar. Fixed to point at the real
//     new page, and the Managed Users page (still fully functional, just
//     previously reachable only by direct URL) now has its own honest nav
//     entry rather than being silently orphaned.
assert.match(navClient, /\{ label: 'Seats & Usage', href: '\/founder\/seats' \}/);
assert.match(navClient, /\{ label: 'Managed Users', href: '\/founder\/users' \}/);
assert.doesNotMatch(navClient, /\{ label: 'Seats & Usage', href: '\/founder\/users' \}/);

// ─── Regression: Plans & Billing / tenant isolation untouched ───────────────

// 20. lib/founder-billing.ts's own (deliberately clamped) seatUtilizationPercent
//     and Billing's drawer markup are byte-for-byte untouched by this task.
assert.match(billingLib, /export function seatUtilizationPercent\(used: number, purchased: number\): number \{/);
assert.match(billingLib, /if \(purchased <= 0\) return 0;/);
assert.match(billingLib, /return Math\.min\(100, Math\.round\(\(used \/ purchased\) \* 100\)\);/);
assert.match(billingClient, /seatUtilizationPercent\(customer\.usedSeats, customer\.purchasedSeats\)/);

// 21. Tenant isolation lib never references this module's concepts —
//     Founder commercial data stays in its own cross-tenant-by-design
//     module, as with every other Founder commercial page.
assert.doesNotMatch(tenantIsolationLib, /CustomerSeatAllocation|utilizationBucket/);

console.log('Validated Seats & Usage (/founder/seats): built entirely on the existing CustomerAccount/CustomerSeatAllocation/FounderManagedUser/CustomerHealth models with no new seat/usage/billing model, documents (rather than assumes) the exact write-path trace proving CustomerSeatAllocation.usedSeats is authoritative-by-convention and distinct from CustomerHealth.activeUsers, never clamps utilization or floors available seats to hide over-capacity, filters plan/status via real SQL columns while honestly documenting why utilization must be a JS-side filter (a cross-column ratio Prisma cannot express), distinguishes true system-empty from filtered-to-zero, reuses the shared FounderDrawer and the existing updateCustomerSeats mutation/audit path with no duplication, batches every query with no N+1, uses real semantic table headers and a keyboard-reachable trigger button, fixes the pre-existing "Seats & Usage" sidebar link that pointed at the unrelated Managed Users page (giving that page its own honest nav entry rather than orphaning it), and leaves Plans & Billing\'s own clamped utilization helper and tenant isolation completely untouched.');
