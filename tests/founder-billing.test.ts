import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across
// tests/founder-*.test.ts in this repo: there is no live-database test
// harness here (CI's DATABASE_URL points at nothing reachable), so these
// assert the source code reads the real CustomerAccount/CustomerSeatAllocation
// commercial records (never a fabricated or duplicate calculation), keeps
// PLAN / ACCOUNT STATUS / SEATS / ESTIMATED ARR / PIPELINE ARR conceptually
// distinct, enforces server-side Founder authorization and read-only
// protection, never trusts a client-supplied actor identity, introduces no
// payment-provider or Subscription-model functionality, and ships an
// accessible, honestly-empty-stated commercial control plane — rather than
// exercising a real Postgres instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pureLib = read('lib/founder-billing.ts');
const service = read('services/founder-billing.ts');
const page = read('app/founder/billing/page.tsx');
const client = read('components/founder/BillingPortfolioClient.tsx');
const founderService = read('services/founder.ts');
const customer360Page = read('app/founder/customers/[id]/page.tsx');
const customersTableClient = read('components/founder/CustomersTableClient.tsx');
const founderHomePage = read('app/founder/page.tsx');
const prismaSchema = read('prisma/schema.prisma');
const tenantIsolationLib = read('lib/tenant-isolation.ts');

// ─── 1-2. Customer 360 Est. ARR uses estimatedArrUsd, never calcArr ────────

// 1. Customer 360 reads the real Founder-entered field directly.
assert.match(customer360Page, /const estimatedArr = customer\.estimatedArrUsd;/);
assert.match(customer360Page, /estimatedArrUsd != null \? fmtMoney\(estimatedArrUsd\) : 'Not set'/);

// 2. calcArr (the fabricated plan×seat substitute previously shown under
//    "Est. ARR") no longer exists anywhere in Customer 360.
assert.doesNotMatch(customer360Page, /function calcArr/);
assert.doesNotMatch(customer360Page, /calcArr\(/);

// ─── 3-4. Plans & Billing Estimated ARR uses estimatedArrUsd; null → "Not set" ─

// 3. The page and its table both read the real field via the shared helper.
assert.match(page, /import \{ fmtEstimatedArr \} from '@\/lib\/founder-billing'/);
assert.match(page, /fmtEstimatedArr\(data\.kpis\.estimatedArrTotal \|\| null\)/);
assert.match(client, /fmtEstimatedArr\(customer\.estimatedArrUsd\)/);
assert.match(client, /fmtEstimatedArr\(selected\.estimatedArrUsd\)/);

// 4. Null estimatedArrUsd renders "Not set" — never $0, never a formula.
assert.match(pureLib, /if \(estimatedArrUsd == null\) return 'Not set';/);
assert.doesNotMatch(pureLib, /estimatedArrUsd \?\? 0/);

// ─── 5. No calcArr/arrFromPlanTier/arrForPlan feeds the Est. ARR figure ────
for (const file of [page, client, service, pureLib]) {
  assert.doesNotMatch(file, /calcArr\(|arrFromPlanTier\(|arrForPlan\(/);
}

// ─── 6. Enterprise pricing is never fabricated; Business comes from lib/plans.ts ─
const plansModule = read('lib/plans.ts');
assert.match(plansModule, /pricing: \{ type: 'custom' \}/); // ENTERPRISE
assert.match(plansModule, /pricing: \{ type: 'fixed', amountUsd: 999, cadence: 'month' \}/); // STARTER/Business
assert.doesNotMatch(client, /amountUsd: 999|\$999/); // no second hardcoded price
assert.doesNotMatch(page, /amountUsd: 999|\$999/);

// ─── 7. Plan display name comes from lib/plans.ts, not a second mapping ───
assert.match(client, /import \{ commercialPlans, planDisplayName \} from '@\/lib\/plans'/);
assert.doesNotMatch(client, /customer\.planTier\.replace/);

// ─── 8. Seat data comes from CustomerSeatAllocation, no second seat model ──
assert.match(service, /prisma\.customerSeatAllocation\.aggregate/);
assert.match(service, /seatAllocation: true/);
assert.doesNotMatch(service, /model\s+\w*SeatAllocation\w*(?!\s*\{)/); // no duplicate schema definition referenced here
assert.doesNotMatch(prismaSchema, /model CustomerSeatAllocation2|model BillingSeatAllocation/);

// ─── 9. No duplicate seat mutation — Plans & Billing reuses updateCustomerSeats ─
assert.match(page, /import \{ getFounderAccess, updateCustomerSeats \} from '@\/services\/founder'/);
assert.match(page, /await updateCustomerSeats\(access, formData\)/);
assert.doesNotMatch(service, /function updateCustomerSeats|function updateSeats\(/);
assert.doesNotMatch(client, /function updateCustomerSeats/);

// ─── 10. No payment-provider integration introduced ────────────────────────
// (service.ts's own doc comment mentions "stripeCustomerId"/
// "stripeSubscriptionId" only to document that the dead Subscription model
// is not used — that is not a payment-provider call site.)
for (const file of [pureLib, page, client]) {
  assert.doesNotMatch(file, /stripe|razorpay/i);
}
assert.doesNotMatch(service, /import .*stripe|require\(['"]stripe['"]\)|new Stripe\(/i);

// ─── 11. No Subscription rows created; dead schema documented, not activated ─
assert.doesNotMatch(service, /prisma\.subscription\.create\(|prisma\.subscription\.update\(|prisma\.subscription\.upsert\(/);
assert.doesNotMatch(page, /prisma\.subscription/);
assert.match(service, /does not read, write, or build on Subscription/);

// ─── 12. No fake payment status / MRR anywhere in the rendered UI ──────────
// (lib/founder-billing.ts's own doc comment names these terms only to say
// they don't exist here — that is documentation, not a UI label.)
for (const file of [page, client]) {
  assert.doesNotMatch(file, /Payment Status|Invoice Status|\bMRR\b|Renewal Date/i);
}

// ─── 13. Account Status is labeled honestly — never "Billing"/"Payment" ────
assert.match(client, /Account Status/);
assert.doesNotMatch(client, /Billing Status|Payment Status|Subscription Status/i);

// ─── 14. Founder authorization / read-only enforcement on the seat mutation ─
assert.match(page, /const access = await getFounderAccess\(\);/);
assert.match(page, /if \(!access\.ok \|\| access\.readOnly\) return;/);
assert.match(page, /canWrite=\{!readOnly\}/);
assert.match(client, /canWrite \?/);

// ─── 15. No client-supplied actor identity — updateCustomerSeats derives
//     actor server-side from the authenticated Founder access object. ─────
assert.doesNotMatch(page, /actorEmail:\s*formData\.get/);
assert.match(founderService, /export async function updateCustomerSeats\(access: Extract<FounderAccess, \{ ok: true \}>, formData: FormData\)/);

// ─── 16. Founder-only route — customers cannot reach commercial data here ──
// (Enforcement itself lives in getFounderAccess()/middleware, already
// covered by tests/rbac and tests/tenant-isolation; this only confirms
// Plans & Billing did not add a second, weaker gate.)
assert.match(page, /getFounderAccess/);
assert.doesNotMatch(page, /clerkOrgId|organizationId.{0,20}headers\(/);

// ─── 17. Tenant isolation untouched — commercial fields never appear there ─
assert.doesNotMatch(tenantIsolationLib, /estimatedArrUsd|CustomerSeatAllocation/);

// ─── 18. Commercial mutations are audited via the one canonical helper ─────
assert.match(founderService, /action: 'customer\.seats\.updated'/);
assert.doesNotMatch(service, /logFounderAction|FounderAuditLog/); // no second audit path added here

// ─── 19. Server-side pagination — no unbounded findMany ────────────────────
assert.match(service, /const TAKE = 20;/);
assert.match(service, /skip,\s*\n\s*take: TAKE,/);
assert.doesNotMatch(service, /findMany\(\{\s*orderBy[^}]*\}\)(?!.*skip)/s);

// ─── 20. Filtered-empty vs true-empty states are distinguished ────────────
assert.match(service, /hasAnyCustomers: totalCustomers > 0/);
assert.match(client, /!hasAnyCustomers \?/);
assert.match(client, /No customer accounts yet/);
assert.match(client, /No customers match your current filters\./);
assert.doesNotMatch(client, /\{totalCustomers === 0 \? \(/);

// ─── KPI dataset consistency: KPIs and table share the same CustomerAccount
//     population (unlike the pre-fix Customer Integrations bug) — the plan
//     groupBy, the Active count, and the table's `where` filter all query
//     CustomerAccount directly, so there is no cross-model population
//     mismatch possible here. Business/Enterprise/Trial-Legacy counts are
//     derived from one groupBy rather than three separate count() calls
//     (a redundant-query fix made during the final polish pass — the
//     groupBy already carried this data). ──────────
assert.match(service, /prisma\.customerAccount\.groupBy\(\{ by: \['planTier'\], _count: \{ _all: true \} \}\)/);
assert.match(service, /countForTier\('STARTER'\)/);
assert.match(service, /countForTier\('ENTERPRISE'\)/);
assert.doesNotMatch(service, /prisma\.customerAccount\.count\(\{ where: \{ planTier:/); // no redundant per-tier count query
assert.match(service, /prisma\.customerAccount\.count\(\{ where: \{ status: 'ACTIVE' \} \}\)/);

// ─── Estimated ARR aggregation ignores null, never substitutes a formula ───
assert.match(service, /prisma\.customerAccount\.aggregate\(\{ _sum: \{ estimatedArrUsd: true \} \}\)/);

// ─── Credential/secret fields never selected into this UI ─────────────────
for (const file of [service, client]) {
  assert.doesNotMatch(file, /encryptedTokens/);
}

// ─── Accessibility: dialog semantics + Escape-to-close on the drawer ───────
assert.match(client, /role="dialog"/);
assert.match(client, /aria-modal="true"/);
assert.match(client, /aria-labelledby="billing-drawer-title"/);
assert.match(client, /e\.key === 'Escape'/);
assert.match(client, /closeButtonRef\.current\?\.focus\(\)/);

// ─── No page-level horizontal overflow (established grid-cols-1 + min-w-0
//     fix, proven for Integration Catalog / Customer Integrations) ────────
assert.match(page, /grid min-w-0 grid-cols-1 gap-6/);
assert.match(client, /overflow-x-auto/);
assert.match(client, /sticky right-0/);

// ─── Final polish pass: KPI strip stacks 2-per-row on mobile (matching
//     Founder Overview's established convention) rather than 1-per-row ────
assert.match(page, /grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6/);

// ─── Final polish pass: Trial/Legacy is visually de-emphasized in Plan
//     Distribution, not presented as a normal commercial plan alongside
//     Business/Enterprise ──────────────────────────────────────────────
assert.match(page, /isLegacy = bucket\.bucket === 'TRIAL_LEGACY'/);
assert.match(page, /border-dashed border-slate-200/);

// ─── Seat-limit mismatch is surfaced, never silently enforced/blocked ──────
assert.match(pureLib, /export function seatLimitWarning/);
{
  // updateCustomerSeats itself is unchanged by this task — no new hard
  // block was added inside it (provisionFounderCustomer's own, pre-existing
  // plan.seatLimit validation is a separate function and is untouched).
  const updateSeatsBody = founderService.match(/export async function updateCustomerSeats\([\s\S]*?\n\}/)?.[0] ?? '';
  assert.notEqual(updateSeatsBody, '', 'updateCustomerSeats not found');
  assert.doesNotMatch(updateSeatsBody, /seatLimit/);
}
assert.match(client, /seatLimitWarning\(/);

// ─── Plan/Pipeline ARR label collision cleanup (Phase 23/24) ───────────────
// The plan/seat-based pipeline heuristic (arrFromPlanTier) is never shown
// under an "Est. ARR"/"Estimated ARR" label anywhere it appears alongside
// the real Founder-entered figure.
assert.doesNotMatch(customersTableClient, /label: 'Est\. ARR'/);
assert.match(customersTableClient, /label: 'Pipeline ARR'/);
assert.doesNotMatch(founderHomePage, /label="Est\. ARR"/);
assert.match(founderHomePage, /label="Pipeline ARR"/);
assert.match(founderService, /Never render\s*\n \* this value under an "Est\. ARR" \/ "Estimated ARR" label/);

console.log('Validated Plans & Billing: Customer 360 and Plans & Billing both read the real Founder-entered CustomerAccount.estimatedArrUsd (never calcArr/arrFromPlanTier/arrForPlan) with an honest "Not set" empty state, seats are sourced exclusively from CustomerSeatAllocation with no duplicate seat model or mutation, no payment provider/Subscription/MRR/payment-status functionality was introduced, Account Status is never mislabeled as billing/payment status, every mutation reuses the existing Founder-authorized updateCustomerSeats with server-derived actor identity and the canonical audit log, pagination is server-side and bounded, true-empty and filtered-empty states are distinguished, the drawer is an accessible dialog with Escape-to-close, no page-level horizontal overflow was introduced, seat-limit mismatches are surfaced non-destructively, and the pre-existing plan/seat-based "Pipeline ARR" pipeline heuristic can no longer be confused with the real Estimated ARR figure anywhere it appears.');
