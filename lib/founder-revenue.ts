/**
 * Revenue (/founder/revenue) — pure, client-safe types and display helpers.
 * No DB/framework dependencies (matches lib/founder-billing.ts's and
 * lib/founder-seats.ts's convention).
 *
 * Commercial concepts this module deliberately keeps distinct — see
 * CLAUDE.md and the Plans & Billing / Seats & Usage architecture audits,
 * extended here for Revenue specifically:
 *
 *   - ESTIMATED ARR    CustomerAccount.estimatedArrUsd — a Founder-entered
 *                      planning figure captured once at provisioning.
 *                      Nullable. There is no update path for it anywhere
 *                      in this codebase today (see services/founder-revenue.ts's
 *                      header comment) — Revenue never mutates it.
 *   - ACTUAL REVENUE   Does not exist in this codebase. No payment,
 *                      invoice, or collections concept is implemented.
 *   - MRR              Does not exist. Never derive it from ARR/12 here —
 *                      that would fabricate a false precision this
 *                      product does not track.
 *   - REVENUE STATUS   A label describing whether an estimate has been
 *                      recorded, not a payment/billing state. Only two
 *                      honest values exist: Recorded Estimate / No
 *                      Estimate. Never "Paid", "Overdue", "Collected",
 *                      "Renewed", or "At Risk Revenue" — none of those
 *                      concepts have a backing field anywhere.
 *   - PLAN / ACCOUNT STATUS / SEATS — read from the same authoritative
 *     sources as every other Commercial module (lib/plans.ts,
 *     CustomerAccount.status, CustomerSeatAllocation), reused via
 *     lib/founder-billing.ts's own exports below rather than duplicated.
 */
import { fmtEstimatedArr } from './founder-billing';

export {
  PLAN_FILTER_OPTIONS,
  ACCOUNT_STATUS_FILTER_OPTIONS,
  planTone,
  accountStatusTone,
  fmtDate,
  fmtEstimatedArr,
} from './founder-billing';
export type { PlanBucket } from './founder-billing';

export type RevenueCoverage = 'RECORDED' | 'MISSING';

export const REVENUE_COVERAGE_FILTER_OPTIONS: { value: RevenueCoverage | ''; label: string }[] = [
  { value: '', label: 'All revenue coverage' },
  { value: 'RECORDED', label: 'ARR recorded' },
  { value: 'MISSING', label: 'ARR missing' },
];

export type RevenueStatus = 'RECORDED_ESTIMATE' | 'NO_ESTIMATE';

/** Honest, binary: whether a Founder-entered estimate exists. Never a payment state. */
export function revenueStatusFor(estimatedArrUsd: number | null): RevenueStatus {
  return estimatedArrUsd != null ? 'RECORDED_ESTIMATE' : 'NO_ESTIMATE';
}

export function revenueStatusLabel(status: RevenueStatus): string {
  return status === 'RECORDED_ESTIMATE' ? 'Recorded Estimate' : 'No Estimate';
}

export function revenueStatusTone(status: RevenueStatus): 'green' | 'slate' {
  return status === 'RECORDED_ESTIMATE' ? 'green' : 'slate';
}

/**
 * customersWithArr / totalCustomers, as a whole-number percent. null when
 * there are no customer accounts at all — never divide by zero into a
 * fabricated 0% or 100%.
 */
export function arrCoveragePercent(customersWithArr: number, totalCustomers: number): number | null {
  if (totalCustomers <= 0) return null;
  return Math.round((customersWithArr / totalCustomers) * 100);
}

export function fmtCoveragePercent(pct: number | null): string {
  return pct == null ? 'N/A' : `${pct}%`;
}

/**
 * A portfolio-wide (or per-plan) ARR *sum*, not a single customer's field.
 * Deliberately separate from fmtEstimatedArr: "Not set" is correct for one
 * customer's genuinely-unset nullable column, but reusing that same word
 * for an aggregate total reads as "this metric is broken/unconfigured"
 * rather than its real meaning — "zero because nothing has been recorded
 * across every account counted here." Also avoids the "Not set estimated
 * ARR" string-concatenation bug (grammatically broken, and implies a
 * literal field named "Not set estimated ARR").
 */
export function fmtAggregateArrLine(total: number): string {
  return total > 0 ? `${fmtEstimatedArr(total)} estimated ARR` : 'No estimated ARR recorded';
}
