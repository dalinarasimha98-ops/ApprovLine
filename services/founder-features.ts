// Feature Management — the Founder control plane over customer-level
// feature access. This module computes NO second feature/entitlement
// system: it reads the one authoritative catalog (services/founder.ts's
// founderFeatures), the one authoritative plan-entitlement policy
// (lib/entitlements.ts's isPlanEntitled, lib/plans.ts's commercialPlans),
// and the one authoritative per-customer override table
// (CustomerFeatureFlag) — the exact same three sources
// lib/entitlements.ts's resolveEntitlement() already combines at runtime
// for the 4-5 keys it enforces. See computeEffectiveAccess's doc comment
// for the precise parity/generalization rule, and RUNTIME_ENFORCED_KEYS for
// which keys that runtime enforcement actually covers today.
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { founderFeatures, listFounderAuditLogs } from '@/services/founder';
import { isPlanEntitled, type EntitlementKey } from '@/lib/entitlements';
import { commercialPlans, planDisplayName } from '@/lib/plans';
import {
  EFFECTIVE_ACCESS_LABELS,
  FEATURE_EFFECTIVE_SUMMARY_LABELS,
  type EffectiveAccessSource,
  type FeatureEffectiveSummary,
} from '@/lib/founder-features';

export { EFFECTIVE_ACCESS_LABELS, FEATURE_EFFECTIVE_SUMMARY_LABELS };
export type { EffectiveAccessSource, FeatureEffectiveSummary };

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown) {
  const message = safeError(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerFeatureFlag');
}

// The single canonical list of founderFeatures keys that also have a real
// plan-tier policy in lib/entitlements.ts's EntitlementKey/planEntitlements.
// demo_mode and pilot_readiness are intentionally excluded — there is no
// plan policy for them anywhere, so they are always "Founder controlled"
// rather than plan-gated (see computeEffectiveAccess). Kept as a type guard
// (not a duplicated array) so a call to isPlanEntitled is always type-safe.
function isEntitlementKey(key: string): key is EntitlementKey {
  return key === 'copilot' || key === 'playbook_ai' || key === 'investigations' || key === 'executive_roi' || key === 'universal_gateway';
}

// Verified by inspecting every requireEntitlement()/resolveEntitlement()
// call site in the repository as of this module's authoring:
//   playbook_ai      -> app/api/playbooks/upload/route.ts, app/api/playbooks/[id]/replace/route.ts
//   copilot          -> app/api/copilot/query/route.ts
//   investigations   -> app/api/investigations/route.ts, app/api/investigations/[id]/route.ts
//   executive_roi    -> app/api/analytics/kpis/route.ts, app/api/analytics/high-risk/route.ts, app/api/analytics/compliance/route.ts
// universal_gateway has a real plan policy (isPlanEntitled supports it) but
// NO route calls requireEntitlement/resolveEntitlement for it — the
// Universal Gateway ingestion routes (app/api/v1/*) do not check it. A
// Founder toggle for universal_gateway therefore has NO runtime effect yet.
// demo_mode and pilot_readiness aren't even in EntitlementKey, so they have
// no enforcement path at all — the "Founder-controlled default" catalog
// state is purely informational until something calls resolveEntitlement
// for them or checks CustomerFeatureFlag directly.
// This is reported honestly in the Feature Management UI and the
// implementation report rather than claimed as enforced. See tests/founder-features.test.ts
// for a self-verifying regression check of this exact claim.
const RUNTIME_ENFORCED_KEYS = new Set<string>(['playbook_ai', 'copilot', 'investigations', 'executive_roi']);

export function isRuntimeEnforced(key: string): boolean {
  return RUNTIME_ENFORCED_KEYS.has(key);
}

// The two commercial, publicly-offered plans (lib/plans.ts's own
// `publiclyOffered` flag) — FREE_TRIAL/GROWTH are legacy/internal states
// with no public price and are not shown in the Plan Entitlement matrix,
// matching lib/plans.ts's own documented distinction.
const COMMERCIAL_TIERS = Object.values(commercialPlans)
  .filter((plan) => plan.publiclyOffered)
  .map((plan) => plan.tier);

export type PlanEntitlementRow = { tier: string; displayName: string; included: boolean | null };

export type EffectiveAccess = { enabled: boolean; source: EffectiveAccessSource };

export type FeatureAccessRow = {
  customerId: string;
  companyName: string;
  domain: string;
  planTier: string;
  accountStatus: string;
  // Static plan policy fact — independent of account status/override. null
  // means this feature has no plan policy at all (Founder-controlled key).
  planIncluded: boolean | null;
  // The real CustomerFeatureFlag row, if one exists — the Founder override.
  override: { enabled: boolean; updatedBy: string | null; updatedAt: string } | null;
  // The actual runtime decision (see computeEffectiveAccess).
  effective: EffectiveAccess;
};

export type FeatureAuditEntry = {
  id: string;
  action: string;
  actorEmail: string | null;
  companyName: string | null;
  previousEnabled: boolean | null;
  newEnabled: boolean | null;
  createdAt: string;
};

export type FeatureCatalogRow = {
  key: string;
  label: string;
  category: string;
  description: string;
  defaultEnabled: boolean;
  isEntitlementBacked: boolean;
  runtimeEnforced: boolean;
  planAccessLabel: string;
  planMatrix: PlanEntitlementRow[];
  customersEnabledCount: number;
  overridesCount: number;
  effectiveSummary: FeatureEffectiveSummary;
  customerAccess: FeatureAccessRow[];
  activity: FeatureAuditEntry[];
};

export type FeatureManagementPortfolio = {
  totalFeatures: number;
  entitlementBackedCount: number;
  totalOverrides: number;
  totalCustomers: number;
  features: FeatureCatalogRow[];
};

function emptyPortfolio(): FeatureManagementPortfolio {
  return { totalFeatures: founderFeatures.length, entitlementBackedCount: 0, totalOverrides: 0, totalCustomers: 0, features: [] };
}

/**
 * The exact decision resolveEntitlement() makes at runtime for the 5
 * entitlement-backed keys, generalized for the 2 Founder-only keys it
 * doesn't support, in the same fixed priority order:
 *
 *   1. A SUSPENDED/CHURNED account is denied regardless of plan or
 *      override — matches resolveEntitlement's "workspace_inactive" branch.
 *   2. A real CustomerFeatureFlag override, if one exists, wins over plan
 *      policy either way — matches resolveEntitlement's explicitFlag branch.
 *   3. Otherwise, for the 5 entitlement-backed keys: isPlanEntitled(plan,
 *      key) — the exact same pure function resolveEntitlement calls.
 *   4. Otherwise (demo_mode/pilot_readiness — no plan policy exists at
 *      all): the catalog's own defaultEnabled value. resolveEntitlement
 *      cannot even be called for these two keys (they aren't valid
 *      EntitlementKey values), so this is the only honest fallback — never
 *      a fabricated plan inclusion.
 */
export function computeEffectiveAccess(input: {
  accountStatus: string;
  planTier: string;
  featureKey: string;
  defaultEnabled: boolean;
  override: { enabled: boolean } | null;
}): EffectiveAccess {
  if (input.accountStatus === 'SUSPENDED' || input.accountStatus === 'CHURNED') {
    return { enabled: false, source: 'workspace_inactive' };
  }
  if (input.override) {
    return { enabled: input.override.enabled, source: input.override.enabled ? 'override_enabled' : 'override_disabled' };
  }
  if (isEntitlementKey(input.featureKey)) {
    const included = isPlanEntitled(input.planTier as Parameters<typeof isPlanEntitled>[0], input.featureKey);
    return { enabled: included, source: included ? 'plan_included' : 'plan_not_included' };
  }
  return { enabled: input.defaultEnabled, source: 'founder_default' };
}

function planAccessLabel(key: string): { label: string; matrix: PlanEntitlementRow[] } {
  if (!isEntitlementKey(key)) {
    return {
      label: 'Founder controlled',
      matrix: COMMERCIAL_TIERS.map((tier) => ({ tier, displayName: planDisplayName(tier), included: null })),
    };
  }
  const matrix = COMMERCIAL_TIERS.map((tier) => ({ tier, displayName: planDisplayName(tier), included: isPlanEntitled(tier, key) }));
  const includedTiers = matrix.filter((row) => row.included).map((row) => row.displayName);
  const label = includedTiers.length === 0 ? 'Not included' : includedTiers.join(' + ');
  return { label, matrix };
}

export async function buildFeatureManagementPortfolio(): Promise<SafeResult<FeatureManagementPortfolio>> {
  try {
    // One batched query for every customer and every one of their real
    // Founder overrides (via the featureFlags relation) — no per-feature,
    // per-customer query anywhere below.
    const customers = await prisma.customerAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        companyName: true,
        domain: true,
        planTier: true,
        status: true,
        featureFlags: { select: { key: true, enabled: true, updatedBy: true, updatedAt: true } },
      },
    });

    // One more batched query for every feature-flag audit entry (covers
    // both the update and reset actions via the shared prefix) — filtered
    // per feature in-memory below rather than re-querying per drawer open.
    const auditResult = await listFounderAuditLogs({ action: 'customer.feature_flag', take: 300 });
    const auditByFeatureKey = new Map<string, FeatureAuditEntry[]>();
    for (const log of auditResult.data) {
      const metadata = (log as unknown as { metadata?: { key?: string; companyName?: string; previousEnabled?: boolean | null; newEnabled?: boolean | null } }).metadata;
      const key = metadata?.key ?? log.targetId ?? '';
      if (!key) continue;
      const entry: FeatureAuditEntry = {
        id: log.id,
        action: log.action,
        actorEmail: log.actorEmail,
        companyName: metadata?.companyName ?? null,
        previousEnabled: metadata?.previousEnabled ?? null,
        newEnabled: metadata?.newEnabled ?? null,
        createdAt: log.createdAt.toISOString(),
      };
      const existing = auditByFeatureKey.get(key);
      if (existing) existing.push(entry);
      else auditByFeatureKey.set(key, [entry]);
    }

    let totalOverrides = 0;
    const features: FeatureCatalogRow[] = founderFeatures.map((feature) => {
      const { label: planAccessLabelText, matrix } = planAccessLabel(feature.key);
      let enabledCount = 0;
      let overridesForFeature = 0;

      const customerAccess: FeatureAccessRow[] = customers.map((customer) => {
        const overrideRow = customer.featureFlags.find((flag) => flag.key === feature.key) ?? null;
        if (overrideRow) overridesForFeature += 1;
        const planIncluded = isEntitlementKey(feature.key) ? isPlanEntitled(customer.planTier, feature.key) : null;
        const effective = computeEffectiveAccess({
          accountStatus: customer.status,
          planTier: customer.planTier,
          featureKey: feature.key,
          defaultEnabled: feature.defaultEnabled,
          override: overrideRow ? { enabled: overrideRow.enabled } : null,
        });
        if (effective.enabled) enabledCount += 1;

        return {
          customerId: customer.id,
          companyName: customer.companyName,
          domain: customer.domain,
          planTier: customer.planTier,
          accountStatus: customer.status,
          planIncluded,
          override: overrideRow ? { enabled: overrideRow.enabled, updatedBy: overrideRow.updatedBy, updatedAt: overrideRow.updatedAt.toISOString() } : null,
          effective,
        };
      });

      totalOverrides += overridesForFeature;
      const effectiveSummary: FeatureEffectiveSummary =
        customers.length === 0 ? 'NO_CUSTOMERS' : enabledCount === 0 ? 'DISABLED' : enabledCount === customers.length ? 'ENABLED' : 'MIXED';

      return {
        key: feature.key,
        label: feature.label,
        category: feature.category,
        description: feature.description,
        defaultEnabled: feature.defaultEnabled,
        isEntitlementBacked: isEntitlementKey(feature.key),
        runtimeEnforced: isRuntimeEnforced(feature.key),
        planAccessLabel: planAccessLabelText,
        planMatrix: matrix,
        customersEnabledCount: enabledCount,
        overridesCount: overridesForFeature,
        effectiveSummary,
        customerAccess,
        activity: (auditByFeatureKey.get(feature.key) ?? []).slice(0, 20),
      };
    });

    return {
      migrationRequired: false,
      data: {
        totalFeatures: founderFeatures.length,
        entitlementBackedCount: founderFeatures.filter((f) => isEntitlementKey(f.key)).length,
        totalOverrides,
        totalCustomers: customers.length,
        features,
      },
    };
  } catch (error) {
    return { migrationRequired: missingFounderStorage(error), safeError: safeError(error), data: emptyPortfolio() };
  }
}

export function featureManagementCsv(features: FeatureCatalogRow[]): string {
  const header = ['Feature', 'Category', 'Plan Access', 'Effective Status', 'Customers Enabled', 'Overrides', 'Default', 'Runtime Enforced'];
  const lines = features.map((feature) =>
    [
      feature.label,
      feature.category,
      feature.planAccessLabel,
      FEATURE_EFFECTIVE_SUMMARY_LABELS[feature.effectiveSummary],
      feature.customersEnabledCount,
      feature.overridesCount,
      feature.defaultEnabled ? 'Enabled' : 'Disabled',
      feature.runtimeEnforced ? 'Yes' : 'No',
    ].map(csvCell).join(','),
  );
  return [header.map(csvCell).join(','), ...lines].join('\n');
}
