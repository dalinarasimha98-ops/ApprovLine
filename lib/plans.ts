/**
 * Authoritative ApprovLine commercial plan catalog — the single source of
 * truth for plan names, published pricing, seat/connected-system limits,
 * and marketing feature copy.
 *
 * Pure data, no framework/DB dependencies (matches lib/seat-enforcement.ts's
 * convention), so it can be imported from anywhere: the public landing page
 * (a Server Component), Founder Console server code, and passed as plain
 * props into client components like ProvisionWizard.
 *
 * Keyed by the existing Prisma CustomerPlanTier enum — no schema change.
 * FREE_TRIAL and GROWTH are legacy/internal states with no public price;
 * they are not part of the two plans ApprovLine currently sells
 * (Business, Enterprise) but remain valid, selectable states for existing
 * and in-flight customers.
 */
import type { CustomerPlanTier } from '@prisma/client';

export type PlanPricing =
  | { type: 'fixed'; amountUsd: number; cadence: 'month' }
  | { type: 'custom' }
  | { type: 'unset' };

export type CommercialPlan = {
  tier: CustomerPlanTier;
  /** Customer/founder-facing name — distinct from the internal enum key. */
  displayName: string;
  pricing: PlanPricing;
  /** Included/allowed seats. null = contract-defined, no fixed cap. */
  seatLimit: number | null;
  /** Included/allowed connected systems. null = contract-defined, no fixed cap. */
  connectedSystemLimit: number | null;
  /** Customer-facing marketing bullets (mirrors the public pricing page). */
  marketingFeatures: string[];
  /**
   * founderFeatures / EntitlementKey keys this plan actually grants today
   * per lib/entitlements.ts's planEntitlements — a verified subset of
   * marketingFeatures with a real technical mapping. Some marketing
   * bullets (e.g. "AI approval classification", "SSO and identity
   * controls", "Enterprise Memory Graph") have no corresponding technical
   * feature ID anywhere in the codebase and are intentionally omitted here
   * rather than fabricated.
   */
  mappedFeatureKeys: string[];
  /** Whether this plan is offered to new customers on the public pricing page. */
  publiclyOffered: boolean;
};

export const commercialPlans: Record<CustomerPlanTier, CommercialPlan> = {
  FREE_TRIAL: {
    tier: 'FREE_TRIAL',
    displayName: 'Free Trial',
    pricing: { type: 'unset' },
    seatLimit: null,
    connectedSystemLimit: null,
    marketingFeatures: [],
    mappedFeatureKeys: ['copilot', 'playbook_ai', 'investigations', 'executive_roi', 'universal_gateway'],
    publiclyOffered: false,
  },
  STARTER: {
    tier: 'STARTER',
    displayName: 'Business',
    pricing: { type: 'fixed', amountUsd: 999, cadence: 'month' },
    seatLimit: 25,
    connectedSystemLimit: 3,
    marketingFeatures: [
      'Up to 25 users',
      '3 connected systems',
      'AI approval classification',
      'Playbook AI compliance checks',
      'Investigation Center',
      'Executive analytics',
      'Searchable approval timeline',
      'Standard support',
    ],
    mappedFeatureKeys: ['executive_roi'],
    publiclyOffered: true,
  },
  GROWTH: {
    tier: 'GROWTH',
    displayName: 'Growth',
    pricing: { type: 'unset' },
    seatLimit: null,
    connectedSystemLimit: null,
    marketingFeatures: [],
    mappedFeatureKeys: ['copilot', 'playbook_ai', 'investigations', 'executive_roi'],
    publiclyOffered: false,
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    displayName: 'Enterprise',
    pricing: { type: 'custom' },
    seatLimit: null,
    connectedSystemLimit: null,
    marketingFeatures: [
      'Enterprise-scale users and systems',
      'Enterprise Memory Graph',
      'Advanced AI Copilot',
      'SSO and identity controls',
      'Custom retention and integrations',
      'Dedicated success and SLA',
      'Flexible deployment options',
      'Annual enterprise agreements',
    ],
    mappedFeatureKeys: ['copilot', 'playbook_ai', 'investigations', 'executive_roi', 'universal_gateway'],
    publiclyOffered: true,
  },
};

/**
 * Founder-facing plan name for a raw planTier string, falling back to a
 * humanized version of the enum key for any value not in the catalog
 * (defensive only — every current CustomerPlanTier value is covered).
 */
export function planDisplayName(tier: string): string {
  return (commercialPlans as Record<string, CommercialPlan>)[tier]?.displayName ?? tier.replace(/_/g, ' ');
}

export function formatPlanPrice(pricing: PlanPricing): string {
  if (pricing.type === 'fixed') return `$${pricing.amountUsd.toLocaleString('en-US')}/${pricing.cadence}`;
  if (pricing.type === 'custom') return 'Custom pricing';
  return 'Not yet on a paid plan';
}

/** Same data as formatPlanPrice, split for two-part price/cadence layouts. */
export function formatPlanPriceParts(pricing: PlanPricing): { price: string; cadence: string } {
  if (pricing.type === 'fixed') return { price: `$${pricing.amountUsd.toLocaleString('en-US')}`, cadence: `/${pricing.cadence}` };
  if (pricing.type === 'custom') return { price: 'Custom', cadence: 'Pricing' };
  return { price: 'Not yet on a paid plan', cadence: '' };
}

/**
 * Founder-entered Estimated ARR sanity ceiling (whole USD) — guards against
 * garbage/overflow input, not a real commercial limit. $100M covers any
 * plausible ApprovLine enterprise contract with wide headroom.
 */
export const MAX_ESTIMATED_ARR_USD = 100_000_000;

/**
 * A starting-point suggestion for the wizard's Estimated ARR field, derived
 * from the plan's own published price — never fabricated separately. Only
 * fixed-price plans (Business) get a suggestion; custom-priced plans
 * (Enterprise) return null so the Founder must type a real value with no
 * pre-filled number to rubber-stamp.
 */
export function suggestedAnnualEstimate(pricing: PlanPricing): number | null {
  if (pricing.type === 'fixed' && pricing.cadence === 'month') return pricing.amountUsd * 12;
  return null;
}
