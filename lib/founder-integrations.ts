// Pure, zero-dependency constants for the Founder Integration Catalog —
// split out from services/founder-integrations.ts so the client
// table/drawer component can import them without pulling that module's
// services/founder.ts import (server-only next/cache APIs) into the
// client bundle. Same pattern as lib/founder-features.ts, lib/customer-health.ts,
// lib/onboarding-pipeline.ts, and lib/go-live-readiness.ts.

// MarketplaceProviderStatus — exact existing Prisma enum, no new values.
export const PROVIDER_LIFECYCLE_OPTIONS = ['DRAFT', 'BETA', 'AVAILABLE', 'COMING_SOON', 'DEPRECATED'] as const;
export type ProviderLifecycle = (typeof PROVIDER_LIFECYCLE_OPTIONS)[number];

export const PROVIDER_LIFECYCLE_LABELS: Record<ProviderLifecycle, string> = {
  DRAFT: 'Draft',
  BETA: 'Beta',
  AVAILABLE: 'Available',
  COMING_SOON: 'Coming Soon',
  DEPRECATED: 'Deprecated',
};

// Lifecycle transitions considered "dangerous" — require an explicit
// confirmation dialog before writing, and must never claim customer
// connections are automatically disconnected (they are not).
export const DANGEROUS_LIFECYCLE_TRANSITIONS: ReadonlySet<ProviderLifecycle> = new Set(['DEPRECATED', 'COMING_SOON']);

// Lifecycle states from which Founder-granted customer access
// (TenantProviderAccess) may be extended. No existing business rule
// governs this today (verified by inspecting enableProviderForTenant and
// every other call site before this module existed) — this is the
// safest defensible default made explicit here rather than left implicit:
// AVAILABLE and BETA providers may be granted; DRAFT/COMING_SOON/DEPRECATED
// may not be silently granted.
export const GRANTABLE_LIFECYCLE_STATES: ReadonlySet<ProviderLifecycle> = new Set(['AVAILABLE', 'BETA']);

export function isGrantableLifecycle(status: string): boolean {
  return GRANTABLE_LIFECYCLE_STATES.has(status as ProviderLifecycle);
}

// IntegrationRequestStatus — exact existing Prisma enum, no new values.
export const REQUEST_STATUS_OPTIONS = ['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT', 'AVAILABLE', 'REJECTED'] as const;
export type RequestStatus = (typeof REQUEST_STATUS_OPTIONS)[number];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  PLANNED: 'Planned',
  IN_DEVELOPMENT: 'In Development',
  AVAILABLE: 'Available',
  REJECTED: 'Rejected',
};

// IntegrationRequestPriority — exact existing Prisma enum.
export const REQUEST_PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITY_OPTIONS)[number];

// Customer Availability vs Connection — mandatory distinction. "Available"
// means a TenantProviderAccess row exists (Founder granted it). "Connected"
// means a real customer Integration exists (customer completed OAuth).
// These must never be conflated in the UI.
export type CustomerAvailability = 'AVAILABLE' | 'NOT_AVAILABLE';

export const CUSTOMER_AVAILABILITY_LABELS: Record<CustomerAvailability, string> = {
  AVAILABLE: 'Available',
  NOT_AVAILABLE: 'Not Available',
};

// Connection state as actually knowable from data. UNKNOWN is an honest
// state — not every marketplace provider slug maps to a trackable
// Integration/CustomerIntegrationStatus row (see SLUG_TO_INTEGRATION_PROVIDER
// in services/founder-integrations.ts), so for those providers we must
// never fabricate "Not Connected" — we report that connection state isn't
// tracked for this provider at all.
export type CustomerConnectionState = 'CONNECTED' | 'CONNECTING' | 'FAILED' | 'NOT_CONNECTED' | 'UNKNOWN';

export const CUSTOMER_CONNECTION_LABELS: Record<CustomerConnectionState, string> = {
  CONNECTED: 'Connected',
  CONNECTING: 'Connecting',
  FAILED: 'Failed',
  NOT_CONNECTED: 'Not Connected',
  UNKNOWN: 'Not tracked',
};

export function lifecycleBadgeClass(status: string): string {
  switch (status) {
    case 'AVAILABLE': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'BETA': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'COMING_SOON': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'DEPRECATED': return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'DRAFT': return 'border-slate-200 bg-slate-50 text-slate-400';
    default: return 'border-slate-200 bg-slate-100 text-slate-500';
  }
}

export function requestStatusBadgeClass(status: string): string {
  switch (status) {
    case 'PENDING': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'UNDER_REVIEW': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'PLANNED': return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'IN_DEVELOPMENT': return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'AVAILABLE': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'REJECTED': return 'border-rose-200 bg-rose-50 text-rose-700';
    default: return 'border-slate-200 bg-slate-100 text-slate-500';
  }
}

export function connectionStateBadgeClass(state: CustomerConnectionState): string {
  switch (state) {
    case 'CONNECTED': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'CONNECTING': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'FAILED': return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'NOT_CONNECTED': return 'border-slate-200 bg-slate-50 text-slate-400';
    default: return 'border-slate-200 bg-slate-100 text-slate-400';
  }
}
