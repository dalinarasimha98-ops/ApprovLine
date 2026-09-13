/**
 * Customer Activity (/founder/activity) — pure, client-safe types and
 * display helpers. No DB/framework dependencies (matches lib/founder-
 * billing.ts's and lib/founder-notes.ts's convention).
 *
 * ARCHITECTURE — see services/founder-activity.ts's header for the full
 * audit. In short: FounderAuditLog (customerAccountId-scoped rows) is the
 * only per-discrete-event, timestamped, actor-attributed customer-event
 * source in this codebase. This module builds a read-model taxonomy over
 * its real `action` strings — it does not introduce a second event store,
 * a second audit logger, or a synthetic "activity" concept.
 *
 * Every action string below is one actually written by services/founder.ts
 * or app/founder/*\/actions.ts today (verified by direct source inspection,
 * not assumed). Two things the mockup this module was built from implied
 * are deliberately NOT modeled here, because the real data cannot honestly
 * support them:
 *   - A customer's own self-service action (e.g. a customer connecting
 *     their own integration) — every integration/access-related
 *     FounderAuditLog row is written by a Founder-authorized code path
 *     only; there is no code path where a customer's own action is logged
 *     here.
 *   - "Onboarding stage changed" as a discrete event — the onboarding
 *     stage (services/founder-onboarding.ts) is a *computed* value derived
 *     live from other real timestamps, never itself a persisted event with
 *     its own timestamp/actor. The real milestones that drive it (a user
 *     invited, integration access granted, etc.) already appear here as
 *     their own genuine events.
 */
import type { HealthStatus } from './customer-health';
import { HEALTH_STATUS_LABELS } from './customer-health';

export {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  accountStatusTone,
  fmtDate,
} from './founder-billing';

export type ActivityCategory = 'LIFECYCLE' | 'ADMINISTRATION' | 'COMMERCIAL' | 'INTEGRATIONS' | 'PRODUCT' | 'SUPPORT' | 'OTHER';

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  LIFECYCLE: 'Lifecycle',
  ADMINISTRATION: 'Administration',
  COMMERCIAL: 'Commercial',
  INTEGRATIONS: 'Integrations',
  PRODUCT: 'Product',
  SUPPORT: 'Support',
  OTHER: 'Other',
};

// 'OTHER' is a safety net for any future action string this map hasn't
// been updated for yet — deliberately not offered as an explicit filter
// choice, since it isn't a real curated category a Founder would search
// for; an unmapped event still appears in the unfiltered feed.
export const ACTIVITY_CATEGORY_FILTER_OPTIONS: { value: ActivityCategory | ''; label: string }[] = [
  { value: '', label: 'All categories' },
  { value: 'LIFECYCLE', label: 'Lifecycle' },
  { value: 'ADMINISTRATION', label: 'Administration' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'INTEGRATIONS', label: 'Integrations' },
  { value: 'PRODUCT', label: 'Product' },
  { value: 'SUPPORT', label: 'Support' },
];

export function activityCategoryTone(category: ActivityCategory): 'slate' | 'blue' | 'green' | 'amber' | 'purple' | 'teal' {
  switch (category) {
    case 'LIFECYCLE': return 'blue';
    case 'ADMINISTRATION': return 'slate';
    case 'COMMERCIAL': return 'green';
    case 'INTEGRATIONS': return 'amber';
    case 'PRODUCT': return 'purple';
    case 'SUPPORT': return 'teal';
    default: return 'slate';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function statusChangeLabel(metadata: Record<string, unknown> | null): string {
  const status = String(metadata?.status ?? '').toUpperCase();
  const previous = metadata?.previousStatus ? String(metadata.previousStatus).toUpperCase() : null;
  if (status === 'ACTIVE' && (previous === 'SUSPENDED' || previous === 'CHURNED')) return 'Customer reactivated';
  if (status === 'ACTIVE' && previous === 'TRIAL') return 'Customer activated';
  if (status === 'SUSPENDED') return 'Customer suspended';
  if (status === 'CHURNED') return 'Customer marked churned';
  if (status === 'TRIAL') return 'Account status set to Trial';
  if (status === 'ACTIVE') return 'Account status set to Active';
  // previousStatus is only available on rows written after this module
  // shipped — an older row genuinely cannot support a more specific label,
  // so this falls back to the honest generic phrasing rather than guessing.
  return 'Account status changed';
}

const INTEGRATION_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Integration request received',
  UNDER_REVIEW: 'Integration request under review',
  PLANNED: 'Integration request planned',
  IN_DEVELOPMENT: 'Integration request in development',
  AVAILABLE: 'Integration request made available',
  REJECTED: 'Integration request rejected',
};

function integrationRequestLabel(metadata: Record<string, unknown> | null): string {
  const newStatus = String(metadata?.newStatus ?? '').toUpperCase();
  return INTEGRATION_REQUEST_STATUS_LABELS[newStatus] ?? 'Integration request status changed';
}

type ActivityMeta = {
  category: ActivityCategory;
  /** Stable label used in the event-type filter dropdown and as the default display label. */
  menuLabel: string;
  /** Optional dynamic override for the per-row/per-drawer display label, computed from real metadata. */
  label?: (metadata: Record<string, unknown> | null) => string;
};

// Every key here is an `action` string actually passed to logFounderAction
// somewhere in this repo with a real customerAccountId — verified by
// direct grep against services/founder.ts and app/founder/*/actions.ts,
// not assumed. 'integration.provider.status_changed' is deliberately
// absent: it is catalog-wide (no customerAccountId), so it can never
// appear in this feed's query in the first place.
const ACTIVITY_ACTION_META: Record<string, ActivityMeta> = {
  'customer.provision.started': { category: 'LIFECYCLE', menuLabel: 'Provisioning started' },
  'customer.provisioned': { category: 'LIFECYCLE', menuLabel: 'Customer provisioned' },
  'customer.provision.failed': { category: 'LIFECYCLE', menuLabel: 'Provisioning failed' },
  'customer.deleted': { category: 'LIFECYCLE', menuLabel: 'Customer account deleted' },
  'customer.status.updated': { category: 'LIFECYCLE', menuLabel: 'Account status changed', label: statusChangeLabel },

  CUSTOMER_ACCOUNT_UPDATED: { category: 'ADMINISTRATION', menuLabel: 'Account details updated' },
  'user.invited': { category: 'ADMINISTRATION', menuLabel: 'User invited' },
  'user.invite.resent': { category: 'ADMINISTRATION', menuLabel: 'Invitation resent' },
  'user.suspended': { category: 'ADMINISTRATION', menuLabel: 'User suspended' },
  'user.removed': { category: 'ADMINISTRATION', menuLabel: 'User removed' },
  'user.invite.revoked': { category: 'ADMINISTRATION', menuLabel: 'Invitation revoked' },
  'user.role.changed': { category: 'ADMINISTRATION', menuLabel: 'User role changed' },
  'user.reactivated': { category: 'ADMINISTRATION', menuLabel: 'User reactivated' },

  'customer.seats.updated': { category: 'COMMERCIAL', menuLabel: 'Seat allocation changed' },
  'customer.provision.commercial_configured': { category: 'COMMERCIAL', menuLabel: 'Commercial terms configured' },

  'customer.integration.access_granted': { category: 'INTEGRATIONS', menuLabel: 'Integration access granted' },
  'customer.integration_access.updated': { category: 'INTEGRATIONS', menuLabel: 'Integration access updated' },
  'integration.customer_access.enabled': { category: 'INTEGRATIONS', menuLabel: 'Integration access enabled' },
  'integration.customer_access.disabled': { category: 'INTEGRATIONS', menuLabel: 'Integration access disabled' },
  'integration.sync.triggered': { category: 'INTEGRATIONS', menuLabel: 'Integration sync triggered' },
  'integration.request.status_changed': { category: 'INTEGRATIONS', menuLabel: 'Integration request status changed', label: integrationRequestLabel },

  'customer.feature.configured': { category: 'PRODUCT', menuLabel: 'Feature configuration set' },
  'customer.feature_flag.updated': { category: 'PRODUCT', menuLabel: 'Feature flag updated' },
  'customer.feature_flag.reset': { category: 'PRODUCT', menuLabel: 'Feature flags reset' },

  'customer.note.created': { category: 'SUPPORT', menuLabel: 'Note added' },
  'customer.note.updated': { category: 'SUPPORT', menuLabel: 'Note updated' },
  'customer.note.pinned': { category: 'SUPPORT', menuLabel: 'Note pinned' },
  'customer.note.unpinned': { category: 'SUPPORT', menuLabel: 'Note unpinned' },
  'customer.note.deleted': { category: 'SUPPORT', menuLabel: 'Note deleted' },
};

/**
 * Best-effort, never-crashing fallback for any action string this map
 * hasn't been updated for, and for any metadata key without a friendly
 * label in METADATA_KEY_LABELS. Splits on dots/underscores (action
 * strings like 'user.role.changed') AND camelCase boundaries (metadata
 * keys like 'providerSlug') — found missing during visual QA, when an
 * unmapped key rendered as the unreadable "Providerslug" instead of
 * "Provider Slug".
 */
function humanizeAction(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function activityCategoryFor(action: string): ActivityCategory {
  return ACTIVITY_ACTION_META[action]?.category ?? 'OTHER';
}

/** Reverse lookup used to filter by category server-side (`action: { in: actionsInCategory(category) } }`) without a second copy of the taxonomy. */
export function actionsInCategory(category: ActivityCategory): string[] {
  return Object.entries(ACTIVITY_ACTION_META)
    .filter(([, meta]) => meta.category === category)
    .map(([action]) => action);
}

export function activityLabelFor(action: string, metadata: unknown): string {
  const meta = ACTIVITY_ACTION_META[action];
  if (!meta) return humanizeAction(action);
  const record = asRecord(metadata);
  return meta.label ? meta.label(record) : meta.menuLabel;
}

/**
 * A real, metadata-derived "(ProviderName)"-style suffix for integration
 * events — never fabricated, since it only ever surfaces a value the
 * writer itself already logged (displayName/providerName/providerSlug, or
 * the target id for the one action whose targetId already IS the provider
 * slug). Returns '' when no such value exists rather than guessing one.
 */
export function activityContextSuffix(action: string, metadata: unknown, targetId: string | null): string {
  const record = asRecord(metadata);
  if (action === 'customer.integration.access_granted') {
    const list = Array.isArray(record?.grantedIntegrations) ? (record!.grantedIntegrations as unknown[]) : [];
    if (list.length === 0) return '';
    if (list.length <= 3) return ` (${list.map(String).join(', ')})`;
    return ` (${list.length} integrations)`;
  }
  const provider = record?.displayName ?? record?.providerName ?? (record?.providerSlug ? humanizeAction(String(record.providerSlug)) : null);
  if (provider) return ` (${String(provider)})`;
  if (action === 'customer.integration_access.updated' && targetId) return ` (${humanizeAction(targetId)})`;
  return '';
}

export const ACTIVITY_ACTION_FILTER_OPTIONS: { value: string; label: string }[] = Object.entries(ACTIVITY_ACTION_META)
  .map(([action, meta]) => ({ value: action, label: meta.menuLabel }))
  .sort((a, b) => a.label.localeCompare(b.label));

export type ActivityTimeRange = '7' | '30' | '90' | 'all';

export const ACTIVITY_TIME_RANGE_OPTIONS: { value: ActivityTimeRange; label: string }[] = [
  { value: '30', label: 'Last 30 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

export function activityTimeRangeCutoff(range: ActivityTimeRange): Date | null {
  if (range === 'all') return null;
  const days = Number(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

/** Date + time — the audit trail's own createdAt precision matters here, unlike founder-billing's date-only fmtDate. */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtRelativeTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 0) return fmtDateTime(date); // a clock-skewed future timestamp — show the real value rather than a nonsensical negative duration
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return fmtDateTime(date); // beyond ~30 days an absolute date is more useful than an ever-growing day count
}

export function healthStatusLabel(status: HealthStatus): string {
  return HEALTH_STATUS_LABELS[status];
}

export function healthStatusTone(status: HealthStatus): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'HEALTHY') return 'green';
  if (status === 'NEEDS_ATTENTION') return 'amber';
  if (status === 'AT_RISK' || status === 'CRITICAL') return 'red';
  return 'slate';
}

/** Matches the /founder/audit page's own "TargetType · targetId" convention for the same underlying table. */
export function fmtActivityTarget(targetType: string, targetId: string | null): string {
  return targetId ? `${targetType} · ${targetId}` : targetType;
}

export type SafeMetadataEntry = { label: string; value: string };

const METADATA_KEY_LABELS: Record<string, string> = {
  status: 'Status',
  previousStatus: 'Previous status',
  email: 'Email',
  role: 'Role',
  purchasedSeats: 'Purchased seats',
  activeUsers: 'Active users',
  companyName: 'Company',
  domain: 'Domain',
  accessEnabled: 'Access enabled',
  changedFields: 'Changed fields',
};

// Key-based allow/deny, not a value-content scan (a value-content check
// would false-positive on something as ordinary as a company literally
// named "Token Systems Inc"). No writer found in this codebase ever puts a
// credential under any of these metadata keys today — this is defense in
// depth against a future writer doing so, not a fix for an existing leak.
const SENSITIVE_KEY_PATTERN = /token|secret|password|credential|api[-_]?key|authorization|oauth/i;

/**
 * Never renders raw metadata JSON — only known-safe keys, defensively
 * excluding anything that looks like a credential by name. Used by the
 * Details tab; every activity type in ACTIVITY_ACTION_META today only ever
 * carries plain business facts (status, seats, email, role, company/
 * domain, booleans), so nothing is expected to be filtered out in
 * practice — this exists for the metadata payload this codebase might add
 * tomorrow, not one that exists yet.
 */
export function sanitizeActivityMetadata(metadata: unknown): SafeMetadataEntry[] {
  const record = asRecord(metadata);
  if (!record) return [];
  const entries: SafeMetadataEntry[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (value === null || value === undefined) continue;
    const label = METADATA_KEY_LABELS[key] ?? humanizeAction(key);
    let displayValue: string;
    if (typeof value === 'object') {
      try { displayValue = JSON.stringify(value); } catch { displayValue = String(value); }
    } else {
      displayValue = String(value);
    }
    entries.push({ label, value: displayValue });
  }
  return entries;
}
