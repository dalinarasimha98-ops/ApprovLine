// Pure, zero-dependency constants for Feature Management — split out from
// services/founder-features.ts so the client drawer/table component can
// import them without pulling that module's services/founder.ts import
// (server-only next/cache/next/server APIs) into the client bundle. Same
// pattern as lib/customer-health.ts, lib/onboarding-pipeline.ts, and
// lib/go-live-readiness.ts.

// Why a customer ends up at a given effective enabled/disabled state — the
// exact same decision the runtime resolver (lib/entitlements.ts's
// resolveEntitlement) makes for the 5 keys it supports, generalized for the
// 2 Founder-only keys it doesn't (see services/founder-features.ts's
// computeEffectiveAccess doc comment for the precise rule).
export type EffectiveAccessSource =
  | 'workspace_inactive'
  | 'override_enabled'
  | 'override_disabled'
  | 'plan_included'
  | 'plan_not_included'
  | 'founder_default';

export const EFFECTIVE_ACCESS_LABELS: Record<EffectiveAccessSource, string> = {
  workspace_inactive: 'Workspace inactive',
  override_enabled: 'Enabled by Founder override',
  override_disabled: 'Disabled by Founder override',
  plan_included: 'Included by plan',
  plan_not_included: 'Not included in plan',
  founder_default: 'Founder-controlled default',
};

// A feature-level aggregate across the whole customer portfolio — real,
// computed from every customer's own effective access, never a decorative
// always-on badge. NO_CUSTOMERS is distinct from DISABLED: there is nothing
// to report on yet, not a real "off" state.
export type FeatureEffectiveSummary = 'ENABLED' | 'DISABLED' | 'MIXED' | 'NO_CUSTOMERS';

export const FEATURE_EFFECTIVE_SUMMARY_LABELS: Record<FeatureEffectiveSummary, string> = {
  ENABLED: 'Enabled',
  DISABLED: 'Disabled',
  MIXED: 'Mixed',
  NO_CUSTOMERS: 'No customers',
};
