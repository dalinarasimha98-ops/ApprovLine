/**
 * Seats & Usage (/founder/seats) — pure, client-safe types and display
 * helpers. No DB/framework dependencies (matches lib/founder-billing.ts's
 * and lib/plans.ts's convention).
 *
 * Reuses lib/founder-billing.ts directly for everything this module shares
 * with Plans & Billing (plan bucketing/filter options, account-status
 * filter options, plan/account-status badge tones, date formatting) rather
 * than duplicating it — see the re-exports below.
 *
 * Source-of-truth audit (see services/founder-seats.ts for the full write-
 * path trace): CustomerSeatAllocation.{purchasedSeats,allocatedSeats,
 * usedSeats} are the only seat numbers this module reads. `usedSeats` is a
 * write-through cache of a live COUNT(FounderManagedUser WHERE status =
 * 'ACTIVE'), refreshed synchronously by every user-status-changing mutation
 * (services/founder.ts's recalculateCustomerSeats/updateCustomerSeats/
 * updateCustomerAccountDetails) — authoritative for every code path that
 * exists today, but not a live aggregate, so a hypothetical future write
 * path that changes FounderManagedUser.status without also calling one of
 * those functions would desync it. `allocatedSeats` is set identically to
 * `purchasedSeats` by every current write path — the two are never
 * observed to differ in this codebase today, even though the schema keeps
 * them as separate columns.
 */
export {
  type PlanBucket,
  planBucketForTier,
  PLAN_FILTER_OPTIONS,
  ACCOUNT_STATUS_FILTER_OPTIONS,
  planTone,
  accountStatusTone,
  fmtDate,
} from '@/lib/founder-billing';

export type UtilizationBucket = 'UNDER_50' | 'FIFTY_TO_79' | 'EIGHTY_TO_99' | 'AT_CAPACITY' | 'OVER_CAPACITY';

export const UTILIZATION_FILTER_OPTIONS: { value: UtilizationBucket | ''; label: string }[] = [
  { value: '', label: 'All utilization' },
  { value: 'UNDER_50', label: 'Under 50%' },
  { value: 'FIFTY_TO_79', label: '50–79%' },
  { value: 'EIGHTY_TO_99', label: '80–99%' },
  { value: 'AT_CAPACITY', label: 'At capacity (100%)' },
  { value: 'OVER_CAPACITY', label: 'Over capacity' },
];

/**
 * Deliberately distinct from lib/founder-billing.ts's seatUtilizationPercent,
 * which clamps to [0,100] because it feeds a progress-bar CSS width in
 * Plans & Billing (a display context where an unbounded value would just
 * overflow the bar) and returns 0 for purchasedSeats<=0. This module needs
 * the opposite: the raw, uncapped truth (a customer at 112% is a real
 * capacity-pressure signal, not something to hide by rounding down to
 * 100%), and an explicit `null` — not 0% — when purchasedSeats is 0, since
 * "0% utilized" and "utilization is undefined because nothing was
 * purchased" are different facts.
 */
export function computeUtilizationPercent(usedSeats: number, purchasedSeats: number): number | null {
  if (purchasedSeats <= 0) return null;
  return Math.round((usedSeats / purchasedSeats) * 100);
}

export function utilizationBucketFor(usedSeats: number, purchasedSeats: number): UtilizationBucket | null {
  const pct = computeUtilizationPercent(usedSeats, purchasedSeats);
  if (pct == null) return null;
  if (usedSeats > purchasedSeats) return 'OVER_CAPACITY';
  if (usedSeats === purchasedSeats) return 'AT_CAPACITY';
  if (pct >= 80) return 'EIGHTY_TO_99';
  if (pct >= 50) return 'FIFTY_TO_79';
  return 'UNDER_50';
}

export function utilizationTone(bucket: UtilizationBucket | null): 'green' | 'amber' | 'red' | 'slate' {
  if (bucket === 'OVER_CAPACITY') return 'red';
  if (bucket === 'AT_CAPACITY' || bucket === 'EIGHTY_TO_99') return 'amber';
  if (bucket === 'UNDER_50' || bucket === 'FIFTY_TO_79') return 'green';
  return 'slate';
}

export function fmtUtilization(pct: number | null): string {
  return pct == null ? 'N/A' : `${pct}%`;
}

/**
 * Available seats can be negative when usedSeats > purchasedSeats — that is
 * the honest signal for over-capacity, never silently clamped to 0.
 */
export function computeAvailableSeats(usedSeats: number, purchasedSeats: number): number {
  return purchasedSeats - usedSeats;
}

export function fmtAvailableSeats(availableSeats: number): string {
  return availableSeats < 0 ? `Over by ${Math.abs(availableSeats)}` : String(availableSeats);
}

export function capacityInterpretation(usedSeats: number, purchasedSeats: number): string {
  if (purchasedSeats <= 0) return 'No seats have been purchased for this account yet.';
  if (usedSeats > purchasedSeats) {
    return `Usage exceeds purchased capacity by ${usedSeats - purchasedSeats} seat${usedSeats - purchasedSeats === 1 ? '' : 's'}.`;
  }
  return `${usedSeats} of ${purchasedSeats} purchased seat${purchasedSeats === 1 ? '' : 's'} ${usedSeats === 1 ? 'is' : 'are'} currently used.`;
}

