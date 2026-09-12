// Founder "Customer Integrations" — a read-side operational control plane
// answering "is this customer's connection to a provider actually
// working?", strictly distinct from Integration Catalog
// (services/founder-integrations.ts: "what providers exist / who may use
// them", TenantProviderAccess) and Customer Health
// (services/founder-customer-health.ts: overall account engagement,
// CustomerHealth). This module creates NO new models and NO second health/
// sync/evidence engine: every state is derived directly from the real
// Integration.status field every OAuth callback/sync route already writes
// (services/integrations/{gmail,outlook,jira,teams,zoom,servicenow}.ts,
// app/api/integrations/*/callback|sync/route.ts), the real Event rows
// those same routes log (type: '<provider>.sync.started|completed|error'),
// and the real CanonicalEvidenceEvent rows
// services/evidence/pipeline.ts's captureCanonicalEvidence writes for
// every message services/ingestion/processIncomingMessage.ts ingests.
//
// Architecture note (verified, not assumed): EvidenceProviderConnection /
// EvidenceProviderHealth / EvidenceProcessingFailure (the newer Evidence
// Provider SDK tables) have zero real callers in this codebase —
// registerEvidenceProvider() is invoked only from
// tests/evidence-platform.test.ts, never from any real connector or route.
// Building this page's Sync/Evidence columns on those tables would show
// "Not Available" for every real customer today, which is why Sync/Evidence
// below are derived from Integration/Event/CanonicalEvidenceEvent instead —
// the tables real connector traffic actually populates.
import { prisma } from '@/lib/prisma';
import type { IntegrationStatus, IntegrationProvider, Prisma } from '@prisma/client';
import { SLUG_TO_INTEGRATION_PROVIDER } from '@/services/founder-integrations';
import {
  type CustomerIntegrationAccessState,
  type CustomerIntegrationConnectionState,
  type CustomerIntegrationSyncState,
  type CustomerIntegrationEvidenceState,
  type CustomerIntegrationHealthState,
} from '@/lib/founder-customer-integrations';

export { SLUG_TO_INTEGRATION_PROVIDER };

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

// The only providers with a real Connection/Sync/Evidence signal — see the
// module doc comment. SYNCABLE_SLUGS excludes 'slack': Slack has no polling
// sync route (services/integrations/slack.ts is purely webhook/event
// driven), so it is deliberately excluded from the sync-trigger action but
// still included in access/connection/evidence.
const MAPPABLE_SLUGS = Object.keys(SLUG_TO_INTEGRATION_PROVIDER);
const MAPPABLE_ENUMS = Object.values(SLUG_TO_INTEGRATION_PROVIDER);
const SYNCABLE_SLUGS = new Set(['gmail', 'outlook', 'jira', 'microsoft_teams', 'zoom', 'servicenow']);

export function isSyncableProviderSlug(slug: string): boolean {
  return SYNCABLE_SLUGS.has(slug);
}

function slugForProvider(provider: IntegrationProvider): string | null {
  const entry = Object.entries(SLUG_TO_INTEGRATION_PROVIDER).find(([, enumValue]) => enumValue === provider);
  return entry ? entry[0] : null;
}

/**
 * computeIntegrationHealth — the one, explicit, documented health rollup
 * for this page (Phase 13: reuse an authoritative source or, failing that,
 * a documented rule — never a hidden heuristic). It is a pure function of
 * the real Integration.status enum plus whether access was granted without
 * a connection yet; it does not consider time-based thresholds (e.g. "no
 * sync in 24h") because no existing part of the product defines such a
 * rule.
 */
export function computeIntegrationHealth(connection: CustomerIntegrationConnectionState): CustomerIntegrationHealthState {
  if (connection === 'CONNECTED') return 'HEALTHY';
  if (connection === 'FAILED') return 'CRITICAL';
  return 'ATTENTION'; // NOT_CONNECTED, PENDING, SYNCING
}

function connectionStateForIntegrationStatus(status: IntegrationStatus): CustomerIntegrationConnectionState {
  switch (status) {
    case 'CONNECTED': return 'CONNECTED';
    case 'SYNCING': return 'SYNCING';
    case 'ERROR':
    case 'NEEDS_REAUTH': return 'FAILED';
    case 'DISCONNECTED': return 'NOT_CONNECTED';
  }
}

function syncStateFor(status: IntegrationStatus | null, lastSyncStatus: string | null): CustomerIntegrationSyncState {
  if (!status) return 'NOT_AVAILABLE';
  if (status === 'SYNCING') return 'SYNCING';
  if (status === 'ERROR' || status === 'NEEDS_REAUTH') return 'FAILED';
  if (status === 'CONNECTED') return lastSyncStatus === 'error' ? 'FAILED' : lastSyncStatus === 'ok' ? 'HEALTHY' : 'NOT_AVAILABLE';
  return 'NOT_AVAILABLE'; // DISCONNECTED
}

const FAILED_STATUSES: IntegrationStatus[] = ['ERROR', 'NEEDS_REAUTH'];
const ATTENTION_STATUSES: IntegrationStatus[] = ['DISCONNECTED', 'SYNCING'];

export type CustomerIntegrationRow = {
  organizationId: string;
  customerAccountId: string;
  companyName: string;
  domain: string;
  providerSlug: string;
  providerDisplayName: string;
  integrationId: string | null;
  access: CustomerIntegrationAccessState;
  connection: CustomerIntegrationConnectionState;
  sync: CustomerIntegrationSyncState;
  evidence: CustomerIntegrationEvidenceState;
  health: CustomerIntegrationHealthState;
  lastSyncAt: string | null;
  canTriggerSync: boolean;
};

export type CustomerIntegrationKpis = {
  connectedIntegrations: number;
  healthy: number;
  needsAttention: number;
  failed: number;
  pendingConnections: number;
};

export type CustomerIntegrationsFilters = {
  query?: string;
  providerSlug?: string;
  connectionStatus?: CustomerIntegrationConnectionState;
  healthStatus?: CustomerIntegrationHealthState;
  page?: number;
  take?: number;
};

export type CustomerIntegrationsPortfolio = {
  kpis: CustomerIntegrationKpis;
  rows: CustomerIntegrationRow[];
  page: number;
  totalPages: number;
  totalCustomers: number;
  providerOptions: Array<{ slug: string; displayName: string }>;
};

function emptyPortfolio(): CustomerIntegrationsPortfolio {
  return {
    kpis: { connectedIntegrations: 0, healthy: 0, needsAttention: 0, failed: 0, pendingConnections: 0 },
    rows: [],
    page: 1,
    totalPages: 1,
    totalCustomers: 0,
    providerOptions: [],
  };
}

// Maps a connection/health filter value to the Integration.status set that
// selects it, so both the customer-selection WHERE (for performance, pushed
// to SQL) and the display filtering use exactly one definition.
function statusesForConnectionFilter(state: CustomerIntegrationConnectionState): IntegrationStatus[] | null {
  switch (state) {
    case 'CONNECTED': return ['CONNECTED'];
    case 'SYNCING': return ['SYNCING'];
    case 'FAILED': return FAILED_STATUSES;
    case 'NOT_CONNECTED': return ['DISCONNECTED'];
    case 'PENDING': return null; // no Integration row at all — handled separately
  }
}

/**
 * buildCustomerIntegrationsPortfolio — the one aggregation function behind
 * /founder/customer-integrations. Pagination is by CustomerAccount (the
 * established pattern in services/founder.ts's listFounderCustomers), not
 * by flat row, because TenantProviderAccess/Integration have no single
 * joinable table to paginate a customer×provider UNION efficiently in
 * Prisma — each customer contributes at most 7 rows (MAPPABLE_SLUGS), so a
 * page of `take` customers is bounded regardless of total customer count.
 * Customer selection (search/provider/connection/health filters) is pushed
 * to SQL for real server-side filtering at scale; the exact per-provider
 * rows shown for a matched customer are then narrowed in memory (cheap:
 * at most 7 rows per customer already fetched) so a connection/health
 * filter never shows an unrelated healthy row next to a filtered one.
 */
export async function buildCustomerIntegrationsPortfolio(filters: CustomerIntegrationsFilters = {}): Promise<SafeResult<CustomerIntegrationsPortfolio>> {
  const take = Math.min(Math.max(filters.take ?? 20, 1), 100);
  const page = Math.max(1, filters.page ?? 1);
  const skip = (page - 1) * take;
  const query = filters.query?.trim() || undefined;
  const providerEnum = filters.providerSlug ? SLUG_TO_INTEGRATION_PROVIDER[filters.providerSlug] : undefined;
  const connectionStatuses = filters.connectionStatus ? statusesForConnectionFilter(filters.connectionStatus) : undefined;
  const isPendingFilter = filters.connectionStatus === 'PENDING';
  const isAttentionHealthFilter = filters.healthStatus === 'ATTENTION';
  const isCriticalHealthFilter = filters.healthStatus === 'CRITICAL';
  const isHealthyFilter = filters.healthStatus === 'HEALTHY';

  try {
    const integrationScope: Prisma.IntegrationWhereInput = { provider: { in: MAPPABLE_ENUMS } };
    if (providerEnum) integrationScope.provider = providerEnum;

    const tenantAccessScope: Prisma.TenantProviderAccessWhereInput = { providerSlug: { in: MAPPABLE_SLUGS } };
    if (filters.providerSlug) tenantAccessScope.providerSlug = filters.providerSlug;

    // Customer-selection WHERE: baseline requires the customer to have at
    // least one relevant Integration or TenantProviderAccess row (this page
    // is about customers who have integrations, not the full customer
    // list) — plus search and connection/health/provider narrowing, all
    // pushed to SQL.
    const baselineRelevance: Prisma.CustomerAccountWhereInput = {
      organization: {
        OR: [{ integrations: { some: integrationScope } }, { tenantProviderAccess: { some: tenantAccessScope } }],
      },
    };

    const conditions: Prisma.CustomerAccountWhereInput[] = [baselineRelevance];
    if (query) {
      conditions.push({ OR: [{ companyName: { contains: query, mode: 'insensitive' } }, { domain: { contains: query, mode: 'insensitive' } }] });
    }
    if (connectionStatuses) {
      conditions.push({ organization: { integrations: { some: { ...integrationScope, status: { in: connectionStatuses } } } } });
    } else if (isPendingFilter) {
      conditions.push({
        organization: {
          AND: [{ tenantProviderAccess: { some: tenantAccessScope } }, { integrations: { none: integrationScope } }],
        },
      });
    }
    if (isHealthyFilter) {
      conditions.push({ organization: { integrations: { some: { ...integrationScope, status: 'CONNECTED' } } } });
    } else if (isCriticalHealthFilter) {
      conditions.push({ organization: { integrations: { some: { ...integrationScope, status: { in: FAILED_STATUSES } } } } });
    } else if (isAttentionHealthFilter) {
      conditions.push({
        organization: {
          OR: [
            { integrations: { some: { ...integrationScope, status: { in: ATTENTION_STATUSES } } } },
            { AND: [{ tenantProviderAccess: { some: tenantAccessScope } }, { integrations: { none: integrationScope } }] },
          ],
        },
      });
    }

    const where: Prisma.CustomerAccountWhereInput = conditions.length > 1 ? { AND: conditions } : conditions[0];

    const [customers, totalCustomers, statusGroups, tenantAccessForKpi, integrationOrgPairsForKpi, providers] = await Promise.all([
      prisma.customerAccount.findMany({
        where,
        orderBy: { companyName: 'asc' },
        select: {
          id: true,
          organizationId: true,
          companyName: true,
          domain: true,
          organization: {
            select: {
              integrations: {
                where: integrationScope,
                // Never select encryptedTokens/scopes — this page must
                // never serialize credential-bearing fields to the client.
                select: { id: true, provider: true, status: true, metadata: true },
              },
              tenantProviderAccess: { where: tenantAccessScope, select: { providerSlug: true } },
            },
          },
        },
        skip,
        take,
      }),
      prisma.customerAccount.count({ where }),
      // Portfolio-wide KPIs — independent of the current page/filters,
      // computed once from the same real Integration.status field.
      prisma.integration.groupBy({ by: ['status'], where: { provider: { in: MAPPABLE_ENUMS } }, _count: true }),
      prisma.tenantProviderAccess.findMany({ where: { providerSlug: { in: MAPPABLE_SLUGS } }, select: { organizationId: true, providerSlug: true } }),
      prisma.integration.findMany({ where: { provider: { in: MAPPABLE_ENUMS } }, select: { organizationId: true, provider: true } }),
      prisma.marketplaceProvider.findMany({ where: { slug: { in: MAPPABLE_SLUGS } }, select: { slug: true, displayName: true }, orderBy: { sortOrder: 'asc' } }),
    ]);

    // KPI: pending connections = access granted but no matching Integration.
    const connectedPairKeys = new Set(integrationOrgPairsForKpi.map((i) => `${i.organizationId}:${i.provider}`));
    let pendingConnections = 0;
    for (const access of tenantAccessForKpi) {
      const enumValue = SLUG_TO_INTEGRATION_PROVIDER[access.providerSlug];
      if (enumValue && !connectedPairKeys.has(`${access.organizationId}:${enumValue}`)) pendingConnections += 1;
    }
    const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count]));
    const kpis: CustomerIntegrationKpis = {
      connectedIntegrations: statusGroups.reduce((sum, g) => sum + g._count, 0),
      healthy: statusCounts.get('CONNECTED') ?? 0,
      needsAttention: (statusCounts.get('DISCONNECTED') ?? 0) + (statusCounts.get('SYNCING') ?? 0),
      failed: (statusCounts.get('ERROR') ?? 0) + (statusCounts.get('NEEDS_REAUTH') ?? 0),
      pendingConnections,
    };

    const providerDisplayName = new Map(providers.map((p) => [p.slug, p.displayName]));

    // Row-level CanonicalEvidenceEvent lookup — batched for exactly the
    // organizations on this page, never per-row.
    const pageOrgIds = customers.map((c) => c.organizationId);
    const evidenceCounts = pageOrgIds.length
      ? await prisma.canonicalEvidenceEvent.groupBy({
          by: ['organizationId', 'providerKey'],
          where: { organizationId: { in: pageOrgIds }, providerKey: { in: MAPPABLE_SLUGS } },
          _count: true,
        })
      : [];
    const evidenceCountByKey = new Map(evidenceCounts.map((e) => [`${e.organizationId}:${e.providerKey}`, e._count]));

    const rows: CustomerIntegrationRow[] = [];
    for (const customer of customers) {
      const integrationBySlug = new Map(
        customer.organization.integrations.map((i) => [slugForProvider(i.provider), i] as const).filter(([slug]) => slug),
      );
      const grantedSlugs = new Set(customer.organization.tenantProviderAccess.map((t) => t.providerSlug));
      const relevantSlugs = new Set<string>([...integrationBySlug.keys(), ...grantedSlugs].filter((s): s is string => Boolean(s)));

      for (const slug of relevantSlugs) {
        const integration = integrationBySlug.get(slug);
        const access: CustomerIntegrationAccessState = grantedSlugs.has(slug) ? 'ENABLED' : 'NOT_ENABLED';
        const connection: CustomerIntegrationConnectionState = integration
          ? connectionStateForIntegrationStatus(integration.status)
          : 'PENDING';
        const metadata = integration?.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? (integration.metadata as Record<string, unknown>) : {};
        const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : null;
        const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
        const evidenceCount = evidenceCountByKey.get(`${customer.organizationId}:${slug}`) ?? 0;
        const evidence: CustomerIntegrationEvidenceState = !integration
          ? 'NOT_AVAILABLE'
          : evidenceCount > 0
            ? 'CAPTURING'
            : connection === 'CONNECTED'
              ? 'NOT_INGESTING'
              : 'NO_DATA';

        const row: CustomerIntegrationRow = {
          organizationId: customer.organizationId,
          customerAccountId: customer.id,
          companyName: customer.companyName,
          domain: customer.domain,
          providerSlug: slug,
          providerDisplayName: providerDisplayName.get(slug) ?? slug,
          integrationId: integration?.id ?? null,
          access,
          connection,
          sync: syncStateFor(integration?.status ?? null, lastSyncStatus),
          evidence,
          health: computeIntegrationHealth(connection),
          lastSyncAt,
          canTriggerSync: Boolean(integration) && isSyncableProviderSlug(slug) && integration?.status !== 'SYNCING',
        };

        // In-memory precision pass: when a connection/health/provider
        // filter is active, only keep rows that actually match it — the
        // SQL WHERE above already guarantees every customer on this page
        // has at least one matching row, this just excludes that
        // customer's OTHER, non-matching provider rows from the display.
        if (filters.providerSlug && row.providerSlug !== filters.providerSlug) continue;
        if (filters.connectionStatus && row.connection !== filters.connectionStatus) continue;
        if (filters.healthStatus && row.health !== filters.healthStatus) continue;

        rows.push(row);
      }
    }

    return {
      migrationRequired: false,
      data: {
        kpis,
        rows,
        page,
        totalPages: Math.max(1, Math.ceil(totalCustomers / take)),
        totalCustomers,
        providerOptions: providers,
      },
    };
  } catch (error) {
    return { migrationRequired: false, safeError: safeError(error), data: emptyPortfolio() };
  }
}

export type SyncActivityEntry = {
  id: string;
  type: string;
  occurredAt: string;
  processedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  itemsProcessed: number | null;
};

export type FailureEntry = {
  id: string;
  type: string;
  failedAt: string;
  failureReason: string | null;
};

export type CustomerIntegrationActivityEntry = {
  id: string;
  action: string;
  actorEmail: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  createdAt: string;
};

export type CustomerIntegrationDetail = {
  organizationId: string;
  customerAccountId: string;
  companyName: string;
  domain: string;
  providerSlug: string;
  providerDisplayName: string;
  integrationId: string | null;
  connectedBy: string | null;
  connectedOn: string | null;
  externalAccount: string | null;
  scopes: string[];
  access: CustomerIntegrationAccessState;
  connection: CustomerIntegrationConnectionState;
  sync: CustomerIntegrationSyncState;
  evidence: CustomerIntegrationEvidenceState;
  health: CustomerIntegrationHealthState;
  lastSyncAt: string | null;
  evidenceCapturedCount: number;
  syncActivity: SyncActivityEntry[];
  failures: FailureEntry[];
  activity: CustomerIntegrationActivityEntry[];
};

/**
 * buildCustomerIntegrationDetail — powers the drawer for one
 * (organizationId, providerSlug) pair. Selects only the non-sensitive
 * Integration columns (never encryptedTokens) and reuses the same real
 * Event/CanonicalEvidenceEvent/FounderAuditLog tables as the list view.
 */
export async function buildCustomerIntegrationDetail(organizationId: string, providerSlug: string): Promise<SafeResult<CustomerIntegrationDetail | null>> {
  try {
    const providerEnum = SLUG_TO_INTEGRATION_PROVIDER[providerSlug];
    // Integration's unique key includes externalAccount (nullable, varies
    // per connector), so a direct unique lookup by organization+provider
    // alone isn't reliable — a bounded findFirst (one organization+provider
    // pair, never a scan) is the correct, still-O(1) lookup here.
    const [customer, provider, resolvedIntegration, tenantAccess] = await Promise.all([
      prisma.customerAccount.findUnique({ where: { organizationId }, select: { id: true, companyName: true, domain: true } }),
      prisma.marketplaceProvider.findUnique({ where: { slug: providerSlug }, select: { displayName: true } }),
      providerEnum
        ? prisma.integration.findFirst({
            where: { organizationId, provider: providerEnum },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, status: true, externalAccount: true, scopes: true, metadata: true, createdAt: true, updatedAt: true },
          })
        : Promise.resolve(null),
      prisma.tenantProviderAccess.findUnique({ where: { organizationId_providerSlug: { organizationId, providerSlug } }, select: { enabledAt: true, enabledBy: true } }),
    ]);

    if (!customer) return { migrationRequired: false, data: null };

    const metadata = resolvedIntegration?.metadata && typeof resolvedIntegration.metadata === 'object' && !Array.isArray(resolvedIntegration.metadata) ? (resolvedIntegration.metadata as Record<string, unknown>) : {};
    const lastSyncStatus = typeof metadata.lastSyncStatus === 'string' ? metadata.lastSyncStatus : null;
    const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;
    const connectedBy = typeof metadata.connectedByEmail === 'string' ? metadata.connectedByEmail : typeof metadata.accountEmail === 'string' ? metadata.accountEmail : null;

    const connection: CustomerIntegrationConnectionState = resolvedIntegration
      ? connectionStateForIntegrationStatus(resolvedIntegration.status)
      : 'PENDING';

    const [events, evidenceCount, auditLogs] = await Promise.all([
      resolvedIntegration
        ? prisma.event.findMany({
            where: { integrationId: resolvedIntegration.id },
            orderBy: { createdAt: 'desc' },
            take: 25,
            select: { id: true, type: true, createdAt: true, processedAt: true, failedAt: true, failureReason: true, payload: true },
          })
        : [],
      prisma.canonicalEvidenceEvent.count({ where: { organizationId, providerKey: providerSlug } }),
      // Covers both access-grant/revoke events (targetType TenantProviderAccess,
      // targetId providerSlug — written by enableProviderForTenant/
      // disableProviderForTenant in app/founder/integrations/actions.ts)
      // and sync-trigger events (targetType Integration, targetId the
      // integration id — written by this page's own triggerIntegrationSync)
      // for this exact customer+provider, from the one canonical audit table.
      prisma.founderAuditLog.findMany({
        where: {
          customerAccountId: customer.id,
          OR: [
            { targetType: 'TenantProviderAccess', targetId: providerSlug },
            ...(resolvedIntegration ? [{ targetType: 'Integration', targetId: resolvedIntegration.id }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, action: true, actorEmail: true, metadata: true, createdAt: true },
      }),
    ]);

    const syncActivity: SyncActivityEntry[] = events
      .filter((e) => e.type.includes('.sync.'))
      .map((e) => {
        const payload = e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload) ? (e.payload as Record<string, unknown>) : {};
        const itemsProcessed = typeof payload.queued === 'number' ? payload.queued : typeof payload.threadsProcessed === 'number' ? payload.threadsProcessed : null;
        return {
          id: e.id,
          type: e.type,
          occurredAt: e.createdAt.toISOString(),
          processedAt: e.processedAt?.toISOString() ?? null,
          failedAt: e.failedAt?.toISOString() ?? null,
          failureReason: e.failureReason,
          itemsProcessed,
        };
      });
    const failures: FailureEntry[] = events
      .filter((e) => e.failedAt)
      .map((e) => ({ id: e.id, type: e.type, failedAt: e.failedAt!.toISOString(), failureReason: e.failureReason }));

    const activity: CustomerIntegrationActivityEntry[] = auditLogs.map((log) => {
      const meta = (log.metadata ?? {}) as { providerStatus?: string; previousStatus?: string; newStatus?: string };
      return {
        id: log.id,
        action: log.action,
        actorEmail: log.actorEmail,
        previousStatus: meta.previousStatus ?? null,
        newStatus: meta.newStatus ?? null,
        createdAt: log.createdAt.toISOString(),
      };
    });

    return {
      migrationRequired: false,
      data: {
        organizationId,
        customerAccountId: customer.id,
        companyName: customer.companyName,
        domain: customer.domain,
        providerSlug,
        providerDisplayName: provider?.displayName ?? providerSlug,
        integrationId: resolvedIntegration?.id ?? null,
        connectedBy,
        connectedOn: resolvedIntegration?.createdAt.toISOString() ?? null,
        externalAccount: resolvedIntegration?.externalAccount ?? null,
        scopes: resolvedIntegration?.scopes ?? [],
        access: tenantAccess ? 'ENABLED' : 'NOT_ENABLED',
        connection,
        sync: syncStateFor(resolvedIntegration?.status ?? null, lastSyncStatus),
        evidence: !resolvedIntegration ? 'NOT_AVAILABLE' : evidenceCount > 0 ? 'CAPTURING' : connection === 'CONNECTED' ? 'NOT_INGESTING' : 'NO_DATA',
        health: computeIntegrationHealth(connection),
        lastSyncAt,
        evidenceCapturedCount: evidenceCount,
        syncActivity,
        failures,
        activity,
      },
    };
  } catch (error) {
    return { migrationRequired: false, safeError: safeError(error), data: null };
  }
}
