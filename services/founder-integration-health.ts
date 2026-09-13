/**
 * Integration Health (/founder/integration-health) — a read-only,
 * cross-customer operational command center answering "are ApprovLine's
 * customer integrations actually working?" Introduces no new integration
 * data model, no new health-scoring engine, and no mutations of its own.
 *
 * ARCHITECTURE AUDIT — what already exists, and what is genuinely
 * authoritative for "is this connection healthy":
 *
 *   - CustomerIntegrationStatus (customerAccountId-scoped) was inspected in
 *     full and found NOT to be the live, operationally-meaningful access/
 *     connection table it might appear to be: every real production write
 *     path (services/founder.ts's provisionCustomer and
 *     updateCustomerIntegrationAccess) only ever sets accessEnabled/
 *     connectionState to ACCESS_ENABLED or NOT_ENABLED — a pure Founder-side
 *     entitlement toggle. The ONLY code path anywhere in this repository
 *     that ever sets it to CONNECTED, or writes lastSyncAt/errorCount, is
 *     services/founderDemoGenerator.ts — synthetic demo-account seed data
 *     (metadata: { demo: true }), never a real customer's actual connection
 *     state. Using this table for Integration Health would mean every real
 *     (non-demo) customer showing as permanently "not connected" regardless
 *     of their actual, working integration — the exact kind of fabricated-
 *     looking-honest-but-wrong signal this page must avoid. NOT used here.
 *   - TenantProviderAccess (organizationId + MarketplaceProvider.slug) IS
 *     the real, currently-wired access-grant table — written by
 *     enableProviderForTenant/disableProviderForTenant
 *     (app/founder/integrations/actions.ts), and already the access source
 *     for the existing Customer Integrations page. Reused verbatim.
 *   - Integration (organizationId + IntegrationProvider enum) IS the real,
 *     currently-wired operational connection record: every real per-provider
 *     connector (services/integrations/{gmail,outlook,jira,teams,zoom,
 *     servicenow}.ts's poll-based sync, and Slack's webhook handler at
 *     app/api/integrations/slack/events/route.ts) writes .status
 *     (CONNECTED/DISCONNECTED/NEEDS_REAUTH/ERROR/SYNCING) and
 *     .metadata.{lastSyncAt|lastEventAt, lastSyncStatus, lastError,
 *     lastErrorAt} on every real sync/event, success or failure. This is
 *     the genuine operational-health source of truth. Reused verbatim —
 *     never re-selecting encryptedTokens/scopes.
 *   - services/founder-customer-integrations.ts ALREADY defines the one
 *     authoritative health rollup this page must not duplicate:
 *     connectionStateForIntegrationStatus() (raw IntegrationStatus -> the
 *     CONNECTED/NOT_CONNECTED/PENDING/FAILED/SYNCING vocabulary) and
 *     computeIntegrationHealth() (-> HEALTHY/ATTENTION/CRITICAL). Both are
 *     imported and reused verbatim (the former was previously
 *     module-private; exporting it was the only change made to that file).
 *     Its own buildCustomerIntegrationDetail() / the getCustomerIntegrationDetail
 *     server action are reused directly for this page's drawer — no second
 *     detail query was written.
 *   - Universal Gateway (the 8th entry in founderIntegrationCatalog) has no
 *     per-customer Integration row at all — it authenticates via a static
 *     API key (lib/gateway-auth.ts), not OAuth, so there is no
 *     "IntegrationProvider" row for it to ever populate. It is deliberately
 *     excluded from this page's per-customer-per-provider grid rather than
 *     forcing a fabricated health value onto it; its own real reliability
 *     signal (gatewayFailures) already lives in
 *     services/founder.ts's buildFounderOperationsCenter(), surfaced by
 *     System Health, which this page cross-links to instead of duplicating.
 *   - A real, severe defect was found and fixed (separately, before this
 *     module) during this audit: the Slack webhook handler left
 *     Integration.status stuck at 'SYNCING' forever after the first
 *     successfully processed event, which — combined with
 *     resolveIntegrationTenant() only matching status: 'CONNECTED' — broke
 *     Slack ingestion entirely after message #1, and would have made every
 *     real Slack integration appear permanently "Attention" here. See
 *     app/api/integrations/slack/events/route.ts's own comment for the fix.
 *
 * WHAT THIS MODULE ADDS (new, but derived — never a second engine):
 *   - Platform-wide KPIs, including "Affected Customers" (a genuinely new
 *     metric neither existing page computes).
 *   - "Integration Attention": a prioritized, filterable, paginated view of
 *     rows with a REAL operational problem (CRITICAL, or ATTENTION that is
 *     NOT merely "access granted but not yet connected" — PENDING is an
 *     onboarding-in-progress state, not an operational health problem, and
 *     CLAUDE.md's own architecture note draws exactly this boundary:
 *     Customer Integrations covers configuration, Integration Health covers
 *     "operational health of already-connected/active integrations").
 *   - "Provider Health Overview": a per-provider rollup across ALL
 *     customers — a cut Customer Integrations' customer-row-oriented table
 *     does not provide.
 *   - "Customer Impact": distinct customers with a real operational
 *     problem, ranked by how many.
 * All four are different aggregate views over the exact same per-row
 * dataset computed once per request.
 */
import { prisma } from '@/lib/prisma';
import type { CustomerPlanTier, IntegrationStatus, Prisma } from '@prisma/client';
import {
  SLUG_TO_INTEGRATION_PROVIDER,
  connectionStateForIntegrationStatus,
  computeIntegrationHealth,
} from '@/services/founder-customer-integrations';
import type {
  CustomerIntegrationAccessState,
  CustomerIntegrationConnectionState,
  CustomerIntegrationHealthState,
} from '@/lib/founder-customer-integrations';

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

const MAPPABLE_SLUGS = Object.keys(SLUG_TO_INTEGRATION_PROVIDER);
const MAPPABLE_ENUMS = Object.values(SLUG_TO_INTEGRATION_PROVIDER);

function slugForProvider(provider: string): string | null {
  const entry = Object.entries(SLUG_TO_INTEGRATION_PROVIDER).find(([, enumValue]) => enumValue === provider);
  return entry ? entry[0] : null;
}

/**
 * A connection state counts as a genuine operational problem for THIS
 * page's Attention/KPI/Customer-Impact surfaces only when it reflects an
 * integration that was reachable and is now not (or is actively erroring) —
 * never merely "not connected yet." PENDING (access enabled, no Integration
 * row) is deliberately excluded: that is Customer Integrations' onboarding
 * concern, not an operational health regression.
 */
function isOperationalProblem(connection: CustomerIntegrationConnectionState): boolean {
  return connection === 'FAILED' || connection === 'NOT_CONNECTED' || connection === 'SYNCING';
}

/**
 * issueTextFor — an honest, specific, human-readable description of what
 * is actually wrong, derived only from real fields (never a fabricated
 * generic string when a specific one is available). Returns null when
 * there is nothing to report (HEALTHY, or PENDING with nothing else known).
 */
export function issueTextFor(
  connection: CustomerIntegrationConnectionState,
  status: IntegrationStatus | null,
  metadata: Record<string, unknown>,
): string | null {
  const lastError = typeof metadata.lastError === 'string' ? metadata.lastError : null;
  switch (connection) {
    case 'FAILED':
      if (lastError) return lastError;
      return status === 'NEEDS_REAUTH' ? 'Requires re-authentication' : 'Connection failure';
    case 'NOT_CONNECTED':
      return 'Disconnected';
    case 'SYNCING':
      return 'Sync in progress';
    case 'PENDING':
      return 'Access granted, not yet connected';
    case 'CONNECTED':
      return null;
  }
}

export type IntegrationHealthRow = {
  organizationId: string;
  customerAccountId: string;
  companyName: string;
  domain: string;
  planTier: CustomerPlanTier;
  providerSlug: string;
  providerDisplayName: string;
  integrationId: string | null;
  access: CustomerIntegrationAccessState;
  connection: CustomerIntegrationConnectionState;
  health: CustomerIntegrationHealthState;
  issue: string | null;
  lastCheckedAt: string | null;
};

export type ProviderHealthSummary = {
  slug: string;
  displayName: string;
  totalCustomers: number;
  healthy: number;
  attention: number;
  critical: number;
};

export type CustomerImpactSummary = {
  organizationId: string;
  customerAccountId: string;
  companyName: string;
  domain: string;
  planTier: CustomerPlanTier;
  issueCount: number;
  worstHealth: CustomerIntegrationHealthState;
  providerSlugs: string[];
};

export type IntegrationHealthKpis = {
  totalConnected: number;
  healthy: number;
  attention: number;
  critical: number;
  affectedCustomers: number;
};

export type IntegrationHealthFilters = {
  query?: string;
  providerSlug?: string;
  healthStatus?: CustomerIntegrationHealthState;
  page?: number;
  take?: number;
};

export type IntegrationHealthPortfolio = {
  kpis: IntegrationHealthKpis;
  attentionRows: IntegrationHealthRow[];
  attentionPage: number;
  attentionTotalPages: number;
  attentionTotalRows: number;
  providerOverview: ProviderHealthSummary[];
  customerImpact: CustomerImpactSummary[];
  providerOptions: Array<{ slug: string; displayName: string }>;
  hasAnyIntegrationData: boolean;
};

function emptyPortfolio(): IntegrationHealthPortfolio {
  return {
    kpis: { totalConnected: 0, healthy: 0, attention: 0, critical: 0, affectedCustomers: 0 },
    attentionRows: [],
    attentionPage: 1,
    attentionTotalPages: 1,
    attentionTotalRows: 0,
    providerOverview: [],
    customerImpact: [],
    providerOptions: [],
    hasAnyIntegrationData: false,
  };
}

/**
 * buildIntegrationHealthPortfolio — the one aggregation function behind
 * /founder/integration-health. Exactly 4 queries, independent of how many
 * customers/integrations exist: (1) every relevant Integration row, (2)
 * every relevant TenantProviderAccess row, (3) the MarketplaceProvider
 * display names for the 7 mappable slugs, (4) CustomerAccount identity for
 * the exact set of organizations that appeared in (1) or (2) — never a
 * per-customer or per-provider query. Filtering/pagination for the
 * Attention list happens in memory over this already-bounded dataset (at
 * most 7 rows per customer, the same bound services/founder-customer-
 * integrations.ts's own portfolio builder relies on) rather than a second
 * round-trip per page.
 */
export async function buildIntegrationHealthPortfolio(filters: IntegrationHealthFilters = {}): Promise<SafeResult<IntegrationHealthPortfolio>> {
  const take = Math.min(Math.max(filters.take ?? 20, 1), 100);
  const page = Math.max(1, filters.page ?? 1);
  const query = filters.query?.trim().toLowerCase() || undefined;

  try {
    const belongsToCustomerAccount: Prisma.OrganizationWhereInput = { customerAccount: { isNot: null } };
    const integrationScope: Prisma.IntegrationWhereInput = { provider: { in: MAPPABLE_ENUMS }, organization: belongsToCustomerAccount };
    const tenantAccessScope: Prisma.TenantProviderAccessWhereInput = { providerSlug: { in: MAPPABLE_SLUGS }, organization: belongsToCustomerAccount };

    const [integrations, tenantAccessRows, providers] = await Promise.all([
      prisma.integration.findMany({
        where: integrationScope,
        // Never select encryptedTokens/scopes — this page must never
        // serialize credential-bearing fields, even indirectly.
        select: { id: true, organizationId: true, provider: true, status: true, metadata: true, updatedAt: true },
      }),
      prisma.tenantProviderAccess.findMany({ where: tenantAccessScope, select: { organizationId: true, providerSlug: true } }),
      prisma.marketplaceProvider.findMany({ where: { slug: { in: MAPPABLE_SLUGS } }, select: { slug: true, displayName: true }, orderBy: { sortOrder: 'asc' } }),
    ]);

    const relevantOrgIds = Array.from(new Set([...integrations.map((i) => i.organizationId), ...tenantAccessRows.map((t) => t.organizationId)]));
    const customers = relevantOrgIds.length
      ? await prisma.customerAccount.findMany({
          where: { organizationId: { in: relevantOrgIds } },
          select: { id: true, organizationId: true, companyName: true, domain: true, planTier: true },
        })
      : [];

    const hasAnyIntegrationData = integrations.length > 0 || tenantAccessRows.length > 0;
    if (!hasAnyIntegrationData) {
      return { migrationRequired: false, data: emptyPortfolio() };
    }

    const providerDisplayName = new Map(providers.map((p) => [p.slug, p.displayName]));
    const customerByOrgId = new Map(customers.map((c) => [c.organizationId, c]));
    const integrationsByOrg = new Map<string, typeof integrations>();
    for (const integration of integrations) {
      const list = integrationsByOrg.get(integration.organizationId) ?? [];
      list.push(integration);
      integrationsByOrg.set(integration.organizationId, list);
    }
    const accessByOrg = new Map<string, Set<string>>();
    for (const row of tenantAccessRows) {
      const set = accessByOrg.get(row.organizationId) ?? new Set<string>();
      set.add(row.providerSlug);
      accessByOrg.set(row.organizationId, set);
    }

    // Build the full, unfiltered per-customer-per-provider row set once —
    // every KPI/overview/impact/attention view below is a different cut of
    // this exact same array, never a re-query.
    const allRows: IntegrationHealthRow[] = [];
    for (const orgId of relevantOrgIds) {
      const customer = customerByOrgId.get(orgId);
      if (!customer) continue; // an org with no CustomerAccount has no company/domain/Customer 360 destination to show
      const orgIntegrations = integrationsByOrg.get(orgId) ?? [];
      const integrationBySlug = new Map(orgIntegrations.map((i) => [slugForProvider(i.provider), i] as const).filter(([slug]) => slug));
      const grantedSlugs = accessByOrg.get(orgId) ?? new Set<string>();
      const relevantSlugs = new Set<string>([...integrationBySlug.keys(), ...grantedSlugs].filter((s): s is string => Boolean(s)));

      for (const slug of relevantSlugs) {
        const integration = integrationBySlug.get(slug);
        const access: CustomerIntegrationAccessState = grantedSlugs.has(slug) ? 'ENABLED' : 'NOT_ENABLED';
        const connection: CustomerIntegrationConnectionState = integration ? connectionStateForIntegrationStatus(integration.status) : 'PENDING';
        const metadata = integration?.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? (integration.metadata as Record<string, unknown>) : {};
        allRows.push({
          organizationId: orgId,
          customerAccountId: customer.id,
          companyName: customer.companyName,
          domain: customer.domain,
          planTier: customer.planTier,
          providerSlug: slug,
          providerDisplayName: providerDisplayName.get(slug) ?? slug,
          integrationId: integration?.id ?? null,
          access,
          connection,
          health: computeIntegrationHealth(connection),
          issue: issueTextFor(connection, integration?.status ?? null, metadata),
          lastCheckedAt: integration?.updatedAt.toISOString() ?? null,
        });
      }
    }

    // --- KPIs ---
    const totalConnected = integrations.length; // matches Customer Integrations' own "Connected Integrations" KPI meaning exactly (total real Integration rows, any status) — deliberately consistent across both pages
    const healthy = allRows.filter((r) => r.health === 'HEALTHY').length;
    const operationalRows = allRows.filter((r) => isOperationalProblem(r.connection));
    const attention = operationalRows.filter((r) => r.health === 'ATTENTION').length;
    const critical = operationalRows.filter((r) => r.health === 'CRITICAL').length;
    const affectedCustomerIds = new Set(operationalRows.map((r) => r.customerAccountId));

    // --- Provider Health Overview (unfiltered, always the full picture) ---
    // PENDING rows (access granted, never connected) are deliberately
    // excluded here — this card reports the health of REAL connections, so
    // "Customers" must always equal healthy + attention + critical exactly.
    // Including access-only customers in the total without a bucket for
    // them would make the columns look like they don't add up.
    const providerOverview: ProviderHealthSummary[] = MAPPABLE_SLUGS.map((slug) => {
      const rowsForProvider = allRows.filter((r) => r.providerSlug === slug && r.connection !== 'PENDING');
      const distinctCustomers = new Set(rowsForProvider.map((r) => r.customerAccountId));
      return {
        slug,
        displayName: providerDisplayName.get(slug) ?? slug,
        totalCustomers: distinctCustomers.size,
        healthy: rowsForProvider.filter((r) => r.health === 'HEALTHY').length,
        attention: rowsForProvider.filter((r) => isOperationalProblem(r.connection) && r.health === 'ATTENTION').length,
        critical: rowsForProvider.filter((r) => isOperationalProblem(r.connection) && r.health === 'CRITICAL').length,
      };
    }).filter((p) => p.totalCustomers > 0);

    // --- Customer Impact (unfiltered, capped, worst-first) ---
    const impactByCustomer = new Map<string, CustomerImpactSummary>();
    for (const row of operationalRows) {
      const existing = impactByCustomer.get(row.customerAccountId);
      if (existing) {
        existing.issueCount += 1;
        if (row.health === 'CRITICAL') existing.worstHealth = 'CRITICAL';
        if (!existing.providerSlugs.includes(row.providerSlug)) existing.providerSlugs.push(row.providerSlug);
      } else {
        impactByCustomer.set(row.customerAccountId, {
          organizationId: row.organizationId,
          customerAccountId: row.customerAccountId,
          companyName: row.companyName,
          domain: row.domain,
          planTier: row.planTier,
          issueCount: 1,
          worstHealth: row.health,
          providerSlugs: [row.providerSlug],
        });
      }
    }
    const customerImpact = Array.from(impactByCustomer.values())
      .sort((a, b) => (b.worstHealth === 'CRITICAL' ? 1 : 0) - (a.worstHealth === 'CRITICAL' ? 1 : 0) || b.issueCount - a.issueCount)
      .slice(0, 10);

    // --- Integration Attention: filtered + paginated ---
    let filteredAttention = operationalRows;
    if (query) {
      filteredAttention = filteredAttention.filter(
        (r) => r.companyName.toLowerCase().includes(query) || r.domain.toLowerCase().includes(query) || r.providerDisplayName.toLowerCase().includes(query) || r.providerSlug.toLowerCase().includes(query),
      );
    }
    if (filters.providerSlug) filteredAttention = filteredAttention.filter((r) => r.providerSlug === filters.providerSlug);
    if (filters.healthStatus) filteredAttention = filteredAttention.filter((r) => r.health === filters.healthStatus);
    filteredAttention = [...filteredAttention].sort((a, b) => {
      const severity = (h: CustomerIntegrationHealthState) => (h === 'CRITICAL' ? 0 : 1);
      const bySeverity = severity(a.health) - severity(b.health);
      if (bySeverity !== 0) return bySeverity;
      return (b.lastCheckedAt ?? '').localeCompare(a.lastCheckedAt ?? '');
    });

    const attentionTotalRows = filteredAttention.length;
    const attentionTotalPages = Math.max(1, Math.ceil(attentionTotalRows / take));
    const clampedPage = Math.min(page, attentionTotalPages);
    const attentionRows = filteredAttention.slice((clampedPage - 1) * take, (clampedPage - 1) * take + take);

    return {
      migrationRequired: false,
      data: {
        kpis: { totalConnected, healthy, attention, critical, affectedCustomers: affectedCustomerIds.size },
        attentionRows,
        attentionPage: clampedPage,
        attentionTotalPages,
        attentionTotalRows,
        providerOverview,
        customerImpact,
        providerOptions: providers,
        hasAnyIntegrationData: true,
      },
    };
  } catch (error) {
    return { migrationRequired: false, safeError: safeError(error), data: emptyPortfolio() };
  }
}
