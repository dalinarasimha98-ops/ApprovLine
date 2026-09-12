// Pure, zero-dependency constants for the Founder "Customer Integrations"
// operational control plane — split out from
// services/founder-customer-integrations.ts so the client table/drawer
// component can import them without pulling that module's server-only
// imports into the client bundle. Same pattern as lib/founder-integrations.ts,
// lib/founder-features.ts, lib/customer-health.ts, etc.
//
// This page answers "is the customer's connection to a provider actually
// working?" — a strictly different question from Integration Catalog's
// "what providers exist and which customers may use them?" (TenantProviderAccess)
// or Customer Health's "is this account engaged/healthy overall?"
// (CustomerHealth). Every state below is derived from the one authoritative
// field it documents — never a second, invented scoring engine.

// ACCESS — TenantProviderAccess existence. "Enabled" means the provider is
// available to the customer; it does NOT mean they have connected it.
export type CustomerIntegrationAccessState = 'ENABLED' | 'NOT_ENABLED';

export const ACCESS_STATE_LABELS: Record<CustomerIntegrationAccessState, string> = {
  ENABLED: 'Enabled',
  NOT_ENABLED: 'Not Enabled',
};

// CONNECTION — derived directly from the real Integration.status enum
// (CONNECTED/DISCONNECTED/NEEDS_REAUTH/ERROR/SYNCING), the one field every
// real OAuth callback/sync route in services/integrations/*.ts actually
// writes. PENDING means access is enabled but no Integration row exists
// yet (the customer has not completed OAuth) — an honest, real state, not
// a guess.
export type CustomerIntegrationConnectionState = 'CONNECTED' | 'NOT_CONNECTED' | 'PENDING' | 'FAILED' | 'SYNCING';

export const CONNECTION_STATE_LABELS: Record<CustomerIntegrationConnectionState, string> = {
  CONNECTED: 'Connected',
  NOT_CONNECTED: 'Not Connected',
  PENDING: 'Pending',
  FAILED: 'Failed',
  SYNCING: 'Syncing',
};

// SYNC — derived from the same Integration row's status and its
// metadata.lastSyncStatus (written by every real sync route on success/
// failure — see services/integrations/gmail.ts's syncGmailIntegration for
// the canonical shape). NOT_AVAILABLE covers both "no Integration" and
// "connected but has never completed a sync attempt" — never a fabricated
// "Healthy" before a sync has actually happened.
export type CustomerIntegrationSyncState = 'HEALTHY' | 'SYNCING' | 'FAILED' | 'NOT_AVAILABLE';

export const SYNC_STATE_LABELS: Record<CustomerIntegrationSyncState, string> = {
  HEALTHY: 'Healthy',
  SYNCING: 'Syncing',
  FAILED: 'Failed',
  NOT_AVAILABLE: 'Not Available',
};

// EVIDENCE — derived from real CanonicalEvidenceEvent rows (the same table
// services/evidence/pipeline.ts's captureCanonicalEvidence writes for every
// real message ingested via services/ingestion/processIncomingMessage.ts).
// NOT_AVAILABLE means there is no Integration at all (nothing to ingest
// from); NO_DATA means a real connection exists but has never produced a
// captured event; CAPTURING/NOT_INGESTING both mean a connection exists —
// the difference is whether it has produced an event recently.
export type CustomerIntegrationEvidenceState = 'CAPTURING' | 'NOT_INGESTING' | 'NO_DATA' | 'NOT_AVAILABLE';

export const EVIDENCE_STATE_LABELS: Record<CustomerIntegrationEvidenceState, string> = {
  CAPTURING: 'Capturing',
  NOT_INGESTING: 'Not Ingesting',
  NO_DATA: 'No Data',
  NOT_AVAILABLE: 'Not Available',
};

// HEALTH — an explicit, documented rollup of the real Integration.status
// field only (never a second scoring engine, never a time-based heuristic
// like "no sync in 24h = critical" that the product does not already
// define): CONNECTED -> Healthy; DISCONNECTED/SYNCING, or access granted
// with no Integration yet (Pending) -> Attention; ERROR/NEEDS_REAUTH ->
// Critical. See computeIntegrationHealth in services/founder-customer-integrations.ts.
export type CustomerIntegrationHealthState = 'HEALTHY' | 'ATTENTION' | 'CRITICAL';

export const HEALTH_STATE_LABELS: Record<CustomerIntegrationHealthState, string> = {
  HEALTHY: 'Healthy',
  ATTENTION: 'Attention',
  CRITICAL: 'Critical',
};

export function accessBadgeClass(state: CustomerIntegrationAccessState): string {
  return state === 'ENABLED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500';
}

export function connectionBadgeClass(state: CustomerIntegrationConnectionState): string {
  switch (state) {
    case 'CONNECTED': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'SYNCING': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'PENDING': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'FAILED': return 'border-rose-200 bg-rose-50 text-rose-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-500';
  }
}

export function syncBadgeClass(state: CustomerIntegrationSyncState): string {
  switch (state) {
    case 'HEALTHY': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'SYNCING': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'FAILED': return 'border-rose-200 bg-rose-50 text-rose-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-500';
  }
}

export function evidenceBadgeClass(state: CustomerIntegrationEvidenceState): string {
  switch (state) {
    case 'CAPTURING': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'NOT_INGESTING': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'NO_DATA': return 'border-slate-200 bg-slate-50 text-slate-500';
    default: return 'border-slate-200 bg-slate-50 text-slate-400';
  }
}

export function healthBadgeClass(state: CustomerIntegrationHealthState): string {
  switch (state) {
    case 'HEALTHY': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'ATTENTION': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'CRITICAL': return 'border-rose-200 bg-rose-50 text-rose-700';
  }
}

// The 7 marketplace slugs that map 1:1 to a real IntegrationProvider enum
// value and therefore have real Connection/Sync/Evidence signals at all —
// re-exported from services/founder-integrations.ts's SLUG_TO_INTEGRATION_PROVIDER
// (the single authoritative mapping) rather than redefined here, since this
// file must stay import-safe for the client bundle and that module pulls in
// @/lib/prisma. See services/founder-customer-integrations.ts for the
// re-export.
export const CONNECTION_STATUS_FILTER_OPTIONS = ['CONNECTED', 'NOT_CONNECTED', 'PENDING', 'FAILED', 'SYNCING'] as const;
export const HEALTH_STATUS_FILTER_OPTIONS = ['HEALTHY', 'ATTENTION', 'CRITICAL'] as const;
