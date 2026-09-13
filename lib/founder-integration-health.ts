/**
 * Integration Health (/founder/integration-health) — pure, client-safe
 * types and display helpers. No DB/framework dependencies.
 *
 * ARCHITECTURE — see services/founder-integration-health.ts's header for
 * the full audit. In short: this module introduces no new health
 * vocabulary. It reuses, verbatim, the HEALTHY/ATTENTION/CRITICAL and
 * CONNECTED/NOT_CONNECTED/PENDING/FAILED/SYNCING states already
 * established and shipped by Customer Integrations
 * (lib/founder-customer-integrations.ts) — the same real Integration.status
 * field, interpreted by the same computeIntegrationHealth() rule.
 *
 * Where this module's own vocabulary differs from the labels shown in an
 * illustrative reference mockup ("Degraded"/"Failed"): those are
 * deliberately NOT used here. A Founder who moves between Customer
 * Integrations and Integration Health should never see the same
 * underlying state called two different things on two different pages.
 */
import type { CustomerPlanTier } from '@prisma/client';

export {
  type CustomerIntegrationAccessState,
  type CustomerIntegrationConnectionState,
  type CustomerIntegrationHealthState,
  ACCESS_STATE_LABELS,
  CONNECTION_STATE_LABELS,
  HEALTH_STATE_LABELS,
  accessBadgeClass,
  connectionBadgeClass,
  healthBadgeClass,
  HEALTH_STATUS_FILTER_OPTIONS,
} from './founder-customer-integrations';

export { fmtDateTime, fmtRelativeTime } from './founder-activity';

// CustomerAccount.planTier has no existing display-label map anywhere in
// the codebase (lib/founder-billing.ts only buckets it into
// BUSINESS/ENTERPRISE/TRIAL_LEGACY for a different purpose) — a plain,
// literal label lookup, not a second classification scheme.
export const PLAN_TIER_LABELS: Record<CustomerPlanTier, string> = {
  FREE_TRIAL: 'Free Trial',
  STARTER: 'Starter',
  GROWTH: 'Growth',
  ENTERPRISE: 'Enterprise',
};
