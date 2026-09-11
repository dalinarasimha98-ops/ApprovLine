// Founder Integration Catalog — read-side aggregation over the existing
// MarketplaceProvider / TenantProviderAccess / IntegrationRequest / Integration
// architecture. This module creates NO new provider catalog, NO new access
// model, and NO new audit system: it reads the one authoritative provider
// registry (MarketplaceProvider, seeded by prisma/seeds/integration-providers.ts),
// the one authoritative customer-availability table (TenantProviderAccess),
// the one authoritative request queue (IntegrationRequest), and — only for
// the 7 marketplace slugs that map 1:1 to the IntegrationProvider enum — the
// one authoritative connected-account table (Integration), to report an
// honest "Unknown"/not-tracked connection state everywhere else rather than
// fabricate one. Mutations continue to live in
// app/founder/integrations/actions.ts (the existing, now-hardened, service
// for provider lifecycle / customer access / request status changes) and
// services/founder.ts's logFounderAction (the one canonical audit writer).
import { prisma } from '@/lib/prisma';
import type { IntegrationProvider } from '@prisma/client';
import {
  type CustomerAvailability,
  type CustomerConnectionState,
} from '@/lib/founder-integrations';

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingMarketplaceStorage(error: unknown) {
  const message = safeError(error);
  return message.includes('does not exist') || message.includes('MarketplaceProvider') || message.includes('TenantProviderAccess') || message.includes('IntegrationRequest');
}

// The only marketplace slugs with a real, trackable connected-account
// counterpart today — verified against the IntegrationProvider enum in
// prisma/schema.prisma and the slugs seeded by prisma/seeds/integration-providers.ts.
// Every other marketplace provider (github, salesforce, sap, webhook, csv,
// etc.) has no Integration/CustomerIntegrationStatus row anywhere, so their
// connection state is genuinely unknown — never fabricated as "Not Connected".
export const SLUG_TO_INTEGRATION_PROVIDER: Record<string, IntegrationProvider> = {
  slack: 'SLACK',
  gmail: 'GMAIL',
  outlook: 'OUTLOOK',
  microsoft_teams: 'MICROSOFT_TEAMS',
  jira: 'JIRA',
  servicenow: 'SERVICENOW',
  zoom: 'ZOOM',
};

export type CustomerAccessRow = {
  organizationId: string;
  customerAccountId: string | null;
  companyName: string;
  domain: string | null;
  availability: CustomerAvailability;
  enabledAt: string | null;
  enabledBy: string | null;
  connectionState: CustomerConnectionState;
};

export type ProviderRequestRow = {
  id: string;
  organizationId: string;
  companyName: string;
  priority: string;
  status: string;
  createdAt: string;
};

export type ProviderActivityEntry = {
  id: string;
  action: string;
  actorEmail: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  companyName: string | null;
  createdAt: string;
};

export type ProviderCatalogRow = {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  description: string;
  websiteUrl: string | null;
  status: string;
  isNative: boolean;
  capabilities: string[];
  requestCount: number;
  customerAccessCount: number;
  connectionTracked: boolean;
  customerAccess: CustomerAccessRow[];
  requests: ProviderRequestRow[];
  activity: ProviderActivityEntry[];
};

export type IntegrationRequestRow = {
  id: string;
  organizationId: string;
  companyName: string;
  requestedByUserId: string | null;
  providerSlug: string | null;
  providerName: string;
  providerWebsite: string | null;
  category: string | null;
  reason: string;
  evidenceType: string | null;
  userCount: number | null;
  priority: string;
  status: string;
  founderNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDirectoryEntry = {
  customerAccountId: string;
  organizationId: string;
  companyName: string;
  domain: string;
};

export type IntegrationCatalogPortfolio = {
  totalProviders: number;
  availableCount: number;
  nativeCount: number;
  betaCount: number;
  requestCount: number;
  customersWithAccessCount: number;
  providers: ProviderCatalogRow[];
  requests: IntegrationRequestRow[];
  customers: CustomerDirectoryEntry[];
};

function emptyPortfolio(): IntegrationCatalogPortfolio {
  return {
    totalProviders: 0,
    availableCount: 0,
    nativeCount: 0,
    betaCount: 0,
    requestCount: 0,
    customersWithAccessCount: 0,
    providers: [],
    requests: [],
    customers: [],
  };
}

function extractCapabilities(capabilities: unknown): string[] {
  if (!capabilities || typeof capabilities !== 'object') return [];
  if (Array.isArray(capabilities)) return capabilities.filter((c): c is string => typeof c === 'string');
  // Seed data shapes capabilities as an object of booleans/labels (e.g.
  // { evidenceIngestion: true, oauth: true }) — surface the true keys as
  // human-readable capability tags rather than inventing a schema.
  return Object.entries(capabilities as Record<string, unknown>)
    .filter(([, value]) => value === true || (typeof value === 'string' && value.length > 0))
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim());
}

/**
 * buildIntegrationCatalogPortfolio — batched, N+1-free aggregation for the
 * whole /founder/integrations page. Every cross-provider or cross-customer
 * number below comes from one of a fixed set of findMany/groupBy calls, never
 * a per-provider or per-customer query.
 */
export async function buildIntegrationCatalogPortfolio(): Promise<SafeResult<IntegrationCatalogPortfolio>> {
  try {
    const [providers, tenantAccess, requests, customers, mappableIntegrations, providerAuditLogs] = await Promise.all([
      prisma.marketplaceProvider.findMany({ orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }] }),
      prisma.tenantProviderAccess.findMany({
        select: { organizationId: true, providerSlug: true, enabledAt: true, enabledBy: true },
      }),
      prisma.integrationRequest.findMany({
        orderBy: [{ createdAt: 'desc' }],
        take: 500,
        include: { organization: { select: { name: true } } },
      }),
      // Only the fields needed to map CustomerAccount <-> Organization and
      // display a company name — never a full Integration/credential record.
      prisma.customerAccount.findMany({
        select: { id: true, organizationId: true, companyName: true, domain: true },
      }),
      // Bounded to the 7 marketplace slugs that actually map to a real
      // IntegrationProvider enum value — never one query per provider.
      prisma.integration.findMany({
        where: { provider: { in: Object.values(SLUG_TO_INTEGRATION_PROVIDER) } },
        select: { organizationId: true, provider: true, status: true },
      }),
      // Founder audit trail for provider lifecycle changes only — bounded,
      // reused from the single canonical FounderAuditLog table.
      prisma.founderAuditLog.findMany({
        where: { action: 'integration.provider.status_changed' },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);

    const customerByOrgId = new Map(customers.map((c) => [c.organizationId, c]));

    const accessByProviderSlug = new Map<string, typeof tenantAccess>();
    for (const row of tenantAccess) {
      const list = accessByProviderSlug.get(row.providerSlug);
      if (list) list.push(row);
      else accessByProviderSlug.set(row.providerSlug, [row]);
    }

    const requestsByProviderSlug = new Map<string, typeof requests>();
    const requestRows: IntegrationRequestRow[] = requests.map((r) => {
      if (r.providerSlug) {
        const list = requestsByProviderSlug.get(r.providerSlug);
        if (list) list.push(r);
        else requestsByProviderSlug.set(r.providerSlug, [r]);
      }
      return {
        id: r.id,
        organizationId: r.organizationId,
        companyName: customerByOrgId.get(r.organizationId)?.companyName ?? r.organization.name,
        requestedByUserId: r.requestedByUserId,
        providerSlug: r.providerSlug,
        providerName: r.providerName,
        providerWebsite: r.providerWebsite,
        category: r.category,
        reason: r.reason,
        evidenceType: r.evidenceType,
        userCount: r.userCount,
        priority: r.priority,
        status: r.status,
        founderNotes: r.founderNotes,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    // Connection state per (organizationId, IntegrationProvider) — one map
    // built from the single bounded Integration query above.
    const connectionByOrgAndProvider = new Map<string, string>();
    for (const integ of mappableIntegrations) {
      connectionByOrgAndProvider.set(`${integ.organizationId}:${integ.provider}`, integ.status);
    }

    function connectionStateFor(providerSlug: string, organizationId: string): CustomerConnectionState {
      const integrationProvider = SLUG_TO_INTEGRATION_PROVIDER[providerSlug];
      if (!integrationProvider) return 'UNKNOWN';
      const status = connectionByOrgAndProvider.get(`${organizationId}:${integrationProvider}`);
      if (!status) return 'NOT_CONNECTED';
      switch (status) {
        case 'CONNECTED': return 'CONNECTED';
        case 'SYNCING': return 'CONNECTING';
        case 'NEEDS_REAUTH':
        case 'ERROR': return 'FAILED';
        case 'DISCONNECTED': return 'NOT_CONNECTED';
        default: return 'UNKNOWN';
      }
    }

    const auditByProviderSlug = new Map<string, ProviderActivityEntry[]>();
    for (const log of providerAuditLogs) {
      const metadata = (log.metadata ?? {}) as { providerSlug?: string; previousStatus?: string; newStatus?: string; companyName?: string };
      const slug = metadata.providerSlug ?? log.targetId ?? '';
      if (!slug) continue;
      const entry: ProviderActivityEntry = {
        id: log.id,
        action: log.action,
        actorEmail: log.actorEmail,
        previousStatus: metadata.previousStatus ?? null,
        newStatus: metadata.newStatus ?? null,
        companyName: metadata.companyName ?? null,
        createdAt: log.createdAt.toISOString(),
      };
      const list = auditByProviderSlug.get(slug);
      if (list) list.push(entry);
      else auditByProviderSlug.set(slug, [entry]);
    }

    let customersWithAccessCount = 0;
    const orgsWithAnyAccess = new Set(tenantAccess.map((a) => a.organizationId));
    customersWithAccessCount = orgsWithAnyAccess.size;

    const providerRows: ProviderCatalogRow[] = providers.map((provider) => {
      const accessRows = accessByProviderSlug.get(provider.slug) ?? [];
      const connectionTracked = provider.slug in SLUG_TO_INTEGRATION_PROVIDER;
      const customerAccess: CustomerAccessRow[] = accessRows.map((row) => {
        const customer = customerByOrgId.get(row.organizationId);
        return {
          organizationId: row.organizationId,
          customerAccountId: customer?.id ?? null,
          companyName: customer?.companyName ?? row.organizationId,
          domain: customer?.domain ?? null,
          availability: 'AVAILABLE',
          enabledAt: row.enabledAt.toISOString(),
          enabledBy: row.enabledBy,
          connectionState: connectionStateFor(provider.slug, row.organizationId),
        };
      });

      const providerRequests = (requestsByProviderSlug.get(provider.slug) ?? []).map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        companyName: customerByOrgId.get(r.organizationId)?.companyName ?? r.organization.name,
        priority: r.priority,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        id: provider.id,
        slug: provider.slug,
        displayName: provider.displayName,
        category: provider.category,
        description: provider.description,
        websiteUrl: provider.websiteUrl,
        status: provider.status,
        isNative: provider.isNative,
        capabilities: extractCapabilities(provider.capabilities),
        requestCount: provider.requestCount,
        customerAccessCount: accessRows.length,
        connectionTracked,
        customerAccess,
        requests: providerRequests,
        activity: (auditByProviderSlug.get(provider.slug) ?? []).slice(0, 20),
      };
    });

    return {
      migrationRequired: false,
      data: {
        totalProviders: providers.length,
        availableCount: providers.filter((p) => p.status === 'AVAILABLE').length,
        nativeCount: providers.filter((p) => p.isNative).length,
        betaCount: providers.filter((p) => p.status === 'BETA').length,
        requestCount: requests.length,
        customersWithAccessCount,
        providers: providerRows,
        requests: requestRows,
        customers: customers.map((c) => ({ customerAccountId: c.id, organizationId: c.organizationId, companyName: c.companyName, domain: c.domain })),
      },
    };
  } catch (error) {
    return { migrationRequired: missingMarketplaceStorage(error), safeError: safeError(error), data: emptyPortfolio() };
  }
}

export function customerAccountIdForOrganization(customers: CustomerDirectoryEntry[], organizationId: string): string | null {
  return customers.find((c) => c.organizationId === organizationId)?.customerAccountId ?? null;
}
