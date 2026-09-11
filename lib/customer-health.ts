/**
 * Pure, zero-dependency Customer Health display constants — matches
 * lib/plans.ts's convention so it can be imported from both server code
 * (services/founder-customer-health.ts) and client components
 * (components/founder/CustomerHealthClient.tsx) without pulling in
 * services/founder.ts's server-only APIs (next/cache's revalidateTag,
 * next/server's after) into the client bundle.
 *
 * The authoritative status values themselves come from the Prisma
 * CustomerHealthStatus enum / CustomerHealth.status — this file only maps
 * those values to a display label, exactly like lib/plans.ts's
 * planDisplayName does for CustomerPlanTier.
 */
export type HealthStatus = 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL';

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  HEALTHY: 'Healthy',
  NEEDS_ATTENTION: 'Needs Attention',
  AT_RISK: 'At Risk',
  CRITICAL: 'Critical',
};
