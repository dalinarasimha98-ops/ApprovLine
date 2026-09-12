/**
 * Plans & Billing (/founder/billing) — pure, client-safe types and display
 * helpers. No DB/framework dependencies (matches lib/plans.ts's and
 * lib/seat-enforcement.ts's convention).
 *
 * Commercial concepts this module deliberately keeps distinct — see
 * CLAUDE.md and the Plans & Billing architecture audit:
 *   - PLAN            CustomerAccount.planTier, displayed via lib/plans.ts.
 *   - ACCOUNT STATUS   CustomerAccount.status (TRIAL/ACTIVE/SUSPENDED/
 *                      CHURNED) — never "Billing Status" or "Payment
 *                      Status"; no such concept exists in this codebase.
 *   - SEATS            CustomerSeatAllocation (purchased/allocated/used) —
 *                      the only seat source of truth.
 *   - ESTIMATED ARR    CustomerAccount.estimatedArrUsd — a Founder-entered
 *                      figure captured at provisioning. Nullable; render
 *                      "Not set" rather than a fabricated number when null.
 *                      This is NOT actual/recognized revenue, NOT MRR, and
 *                      NOT the plan/seat-based "Pipeline ARR" heuristic
 *                      (services/founder.ts's arrFromPlanTier /
 *                      services/founder-pilots.ts's arrForPlan).
 * There is no payment provider, invoice, MRR, or subscription-billing
 * concept implemented anywhere in ApprovLine today (the Prisma
 * `Subscription` model is unused dead schema — see services/founder-billing.ts).
 */
import type { CustomerAccountStatus, CustomerPlanTier } from '@prisma/client';

export type PlanBucket = 'BUSINESS' | 'ENTERPRISE' | 'TRIAL_LEGACY';

export function planBucketForTier(planTier: CustomerPlanTier | string): PlanBucket {
  if (planTier === 'STARTER') return 'BUSINESS';
  if (planTier === 'ENTERPRISE') return 'ENTERPRISE';
  return 'TRIAL_LEGACY';
}

export const PLAN_FILTER_OPTIONS: { value: PlanBucket | ''; label: string }[] = [
  { value: '', label: 'All plans' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'ENTERPRISE', label: 'Enterprise' },
  { value: 'TRIAL_LEGACY', label: 'Trial / Legacy' },
];

export const ACCOUNT_STATUS_FILTER_OPTIONS: { value: CustomerAccountStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'TRIAL', label: 'Trial' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'CHURNED', label: 'Churned' },
];

export function planTone(tier: string): 'green' | 'blue' | 'amber' | 'slate' {
  if (tier === 'ENTERPRISE') return 'green';
  if (tier === 'GROWTH') return 'blue';
  if (tier === 'STARTER') return 'amber';
  return 'slate';
}

export function accountStatusTone(status: string): 'green' | 'blue' | 'amber' | 'red' | 'slate' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'TRIAL') return 'blue';
  if (status === 'SUSPENDED') return 'red';
  return 'slate';
}

/**
 * customer.estimatedArrUsd is Founder-entered and nullable. Never pass a
 * calculated substitute here — render the real field or "Not set".
 */
export function fmtEstimatedArr(estimatedArrUsd: number | null): string {
  if (estimatedArrUsd == null) return 'Not set';
  if (estimatedArrUsd >= 1_000_000) return `$${(estimatedArrUsd / 1_000_000).toFixed(1)}M`;
  if (estimatedArrUsd >= 1_000) return `$${(estimatedArrUsd / 1_000).toFixed(0)}K`;
  return `$${estimatedArrUsd.toLocaleString()}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function seatUtilizationPercent(used: number, purchased: number): number {
  if (purchased <= 0) return 0;
  return Math.min(100, Math.round((used / purchased) * 100));
}

/**
 * Non-blocking mismatch surface only — see Plans & Billing audit Phase 7.
 * Business's published seatLimit (lib/plans.ts) is not enforced as a hard
 * cap in updateCustomerSeats() today (Enterprise is contract-defined with
 * no fixed limit, and existing Business customers may already sit above 25
 * from before any limit existed). Rather than silently changing customer
 * state or introducing a new enforcement path, this only flags the mismatch
 * for Founder visibility.
 */
export function seatLimitWarning(planTier: string, purchasedSeats: number, seatLimit: number | null): string | null {
  if (seatLimit == null) return null;
  if (purchasedSeats > seatLimit) return `Above standard ${planTier === 'STARTER' ? 'Business' : planTier} plan limit (${seatLimit})`;
  return null;
}
