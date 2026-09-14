/**
 * Founder Audit Logs (/founder/audit) — pure, client-safe types and display
 * helpers. No DB/framework dependencies (matches lib/founder-activity.ts's
 * and lib/founder-system-health.ts's convention).
 *
 * ARCHITECTURE — see services/founder-audit-logs.ts's header for the full
 * audit. In short: this module builds on top of lib/founder-activity.ts's
 * already-shipped, already-tested action taxonomy (ACTIVITY_ACTION_META,
 * activityCategoryFor/activityLabelFor/actionsInCategory) rather than
 * re-deriving a second one — every customer-scoped action this page shows
 * uses that exact same categorization. lib/founder-activity.ts is
 * deliberately NOT modified: it is a locked module whose own taxonomy is
 * correctly scoped to actions that carry a real customerAccountId, and
 * widening it to also cover the 3 genuinely platform-wide actions below
 * would blur that documented scope for no benefit to Customer Activity
 * itself. Those 3 actions are instead layered on here, additively, via
 * PLATFORM_ONLY_ACTION_META — verified by direct grep against every real
 * `logFounderAction`/`prisma.founderAuditLog.create` call site in the
 * repository (services/founder.ts, services/founderDemoGenerator.ts,
 * app/founder/integrations/actions.ts, app/founder/customer-integrations/
 * actions.ts) to be the only actions NOT already covered by
 * ACTIVITY_ACTION_META.
 */
import {
  type ActivityCategory,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_CATEGORY_FILTER_OPTIONS,
  activityCategoryTone,
  activityCategoryFor,
  actionsInCategory,
  activityLabelFor,
  ACTIVITY_ACTION_FILTER_OPTIONS,
} from './founder-activity';

export { sanitizeActivityMetadata, fmtDateTime, fmtRelativeTime, type SafeMetadataEntry } from './founder-activity';

export type AuditCategory = ActivityCategory | 'PLATFORM';

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  ...ACTIVITY_CATEGORY_LABELS,
  PLATFORM: 'Platform',
};

export const AUDIT_CATEGORY_FILTER_OPTIONS: { value: AuditCategory | ''; label: string }[] = [
  ...ACTIVITY_CATEGORY_FILTER_OPTIONS,
  { value: 'PLATFORM', label: 'Platform' },
];

export function auditCategoryTone(category: AuditCategory): 'slate' | 'blue' | 'green' | 'amber' | 'purple' | 'teal' {
  if (category === 'PLATFORM') return 'slate';
  return activityCategoryTone(category);
}

// Every key here is a real `action` string written today via a
// prisma.founderAuditLog.create() call that has NO customerAccountId in
// practice (a genuinely platform-wide/catalog-wide event, or a founder-only
// demo-workspace operation) — verified by direct source inspection, not
// assumed. Deliberately excluded from lib/founder-activity.ts's own
// taxonomy for exactly that reason (see that file's header comment).
const PLATFORM_ONLY_ACTION_META: Record<string, { menuLabel: string }> = {
  'integration.provider.status_changed': { menuLabel: 'Provider status changed' },
  FOUNDER_DEMO_WORKSPACE_GENERATED: { menuLabel: 'Demo workspace generated' },
  FOUNDER_DEMO_WORKSPACE_DELETED: { menuLabel: 'Demo workspace deleted' },
};

export function auditCategoryFor(action: string): AuditCategory {
  if (action in PLATFORM_ONLY_ACTION_META) return 'PLATFORM';
  return activityCategoryFor(action);
}

export function auditLabelFor(action: string, metadata: unknown): string {
  const platform = PLATFORM_ONLY_ACTION_META[action];
  if (platform) return platform.menuLabel;
  return activityLabelFor(action, metadata);
}

export function auditActionsInCategory(category: AuditCategory): string[] {
  if (category === 'PLATFORM') return Object.keys(PLATFORM_ONLY_ACTION_META);
  return actionsInCategory(category);
}

export const AUDIT_ACTION_FILTER_OPTIONS: { value: string; label: string }[] = [
  ...ACTIVITY_ACTION_FILTER_OPTIONS,
  ...Object.entries(PLATFORM_ONLY_ACTION_META).map(([action, meta]) => ({ value: action, label: meta.menuLabel })),
].sort((a, b) => a.label.localeCompare(b.label));

// The server-side allow-list every `action` query parameter is validated
// against before it ever reaches a Prisma query — an unrecognized action
// string is silently ignored (never thrown, never passed through raw).
export const KNOWN_AUDIT_ACTIONS = new Set(AUDIT_ACTION_FILTER_OPTIONS.map((o) => o.value));

export type AuditDateRange = 'today' | '7' | '30' | '90' | 'all';

export const AUDIT_DATE_RANGE_OPTIONS: { value: AuditDateRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const KNOWN_AUDIT_DATE_RANGES = new Set(AUDIT_DATE_RANGE_OPTIONS.map((o) => o.value));

export function isKnownAuditDateRange(value: string | undefined): value is AuditDateRange {
  return !!value && KNOWN_AUDIT_DATE_RANGES.has(value as AuditDateRange);
}

export function auditDateRangeCutoff(range: AuditDateRange): Date | null {
  if (range === 'all') return null;
  if (range === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }
  const days = Number(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

/** Real actor identity if one was recorded — never a raw internal user id, never a blank/undefined string. */
export function actorDisplayName(actorEmail: string | null | undefined): string {
  const trimmed = actorEmail?.trim();
  return trimmed ? trimmed : 'System';
}

function isOpaqueId(value: string | null | undefined): value is string {
  // cuid2 (this schema's default @id) is a distinctive, never-hand-authored
  // shape — mirrors lib/founder-activity.ts's own OPAQUE_ID_PATTERN
  // heuristic (duplicated here as a single-line regex rather than exported,
  // since exporting a private implementation detail across an otherwise
  // unrelated module boundary isn't worth it for one line).
  return !!value && /^c[a-z0-9]{20,}$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// Readable labels for every real targetType this page's own inventory
// found (see services/founder-audit-logs.ts's header for the full list of
// verified logFounderAction call sites). Unknown/future target types fall
// back to a light camelCase-splitting humanizer rather than a raw string.
const TARGET_TYPE_LABELS: Record<string, string> = {
  CustomerAccount: 'Customer Account',
  FounderManagedUser: 'User',
  CustomerSeatAllocation: 'Seat Allocation',
  CustomerFeatureFlag: 'Feature Flag',
  CustomerIntegrationStatus: 'Integration Access',
  CustomerNote: 'Note',
  Organization: 'Organization',
  MarketplaceProvider: 'Provider',
  IntegrationRequest: 'Integration Request',
  TenantProviderAccess: 'Integration Access',
  Integration: 'Integration',
};

function humanizeTargetType(targetType: string): string {
  if (TARGET_TYPE_LABELS[targetType]) return TARGET_TYPE_LABELS[targetType];
  return targetType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export type AuditTargetInput = {
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  customer: { companyName: string; domain: string } | null;
};

export type ResolvedAuditTarget = { primary: string; rawId: string | null };

/**
 * The one authoritative target-display helper for this page. Never
 * performs a query of its own — every value it resolves comes from data
 * already fetched by the row's own single, joined FounderAuditLog query
 * (the row's own metadata, or its already-included customerAccount
 * relation). Never shows a raw opaque id as the primary label; a genuinely
 * unresolvable target shows only its humanized type, with the internal id
 * (when one exists) surfaced separately by the caller as "Internal
 * Reference" in the Details view.
 */
export function resolveAuditTarget(input: AuditTargetInput): ResolvedAuditTarget {
  const { targetType, targetId, customer } = input;
  const metadata = asRecord(input.metadata);
  const typeLabel = humanizeTargetType(targetType);

  const readable = (() => {
    switch (targetType) {
      case 'FounderManagedUser':
        return typeof metadata?.email === 'string' && metadata.email ? metadata.email : customer?.domain ?? null;
      case 'MarketplaceProvider':
        return typeof metadata?.displayName === 'string' && metadata.displayName ? metadata.displayName : !isOpaqueId(targetId) ? targetId : null;
      case 'TenantProviderAccess':
        return typeof metadata?.displayName === 'string' && metadata.displayName ? metadata.displayName : !isOpaqueId(targetId) ? targetId : null;
      case 'IntegrationRequest':
        return typeof metadata?.providerName === 'string' && metadata.providerName ? metadata.providerName : customer?.domain ?? null;
      case 'Integration':
        return typeof metadata?.providerSlug === 'string' && metadata.providerSlug ? metadata.providerSlug : customer?.domain ?? null;
      case 'CustomerFeatureFlag':
      case 'CustomerIntegrationStatus':
        return !isOpaqueId(targetId) ? targetId : customer?.domain ?? null;
      case 'CustomerAccount':
      case 'Organization':
      case 'CustomerSeatAllocation':
        return customer?.domain ?? null;
      default:
        return customer?.domain ?? (!isOpaqueId(targetId) ? targetId : null);
    }
  })();

  return {
    primary: readable ? `${typeLabel} · ${readable}` : typeLabel,
    rawId: targetId,
  };
}

/** Truncates a metadata value for compact table/drawer display — never fabricates, only shortens. */
export function truncateValue(value: string, max = 140): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
