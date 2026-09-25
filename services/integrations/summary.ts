import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';

/**
 * Integration.provider enum -> MarketplaceProvider.slug bridge. This used
 * to be duplicated as a page-local constant in
 * app/dashboard/settings/integrations/page.tsx; both that page and
 * services/settings.ts (Organization Settings Overview KPI strip) now
 * import this single copy, so "how many integrations are connected" can
 * never disagree between the two surfaces again.
 */
export const PROVIDER_TO_SLUG: Record<string, string> = {
  SLACK: 'slack',
  GMAIL: 'gmail',
  OUTLOOK: 'outlook',
  MICROSOFT_TEAMS: 'microsoft_teams',
  JIRA: 'jira',
  SERVICENOW: 'servicenow',
  ZOOM: 'zoom',
};

/** The isNative:true subset of the Integrations page's STATIC_PROVIDERS
 *  fallback list, used only when the MarketplaceProvider catalog table is
 *  empty (fresh/demo environments) - so the catalog-size count is still
 *  correct rather than reporting 0. */
const STATIC_NATIVE_SLUGS = ['slack', 'gmail', 'outlook', 'microsoft_teams', 'zoom', 'jira', 'servicenow'];

export type IntegrationSummary = {
  /** Real customer integrations in CONNECTED or SYNCING state - matches
   *  the Integrations page's own "Connected" stat pill definition exactly. */
  connectedCount: number;
  /** Size of the native provider catalog (MarketplaceProvider rows with
   *  isNative:true, status AVAILABLE - or the static fallback count when
   *  that table is empty). This is catalog size, not "available to
   *  connect" - see services/settings.ts's SettingsOverview.kpis doc
   *  comment for why those are kept distinct. */
  nativeCatalogSize: number;
};

export async function getIntegrationSummary(organizationId: string): Promise<IntegrationSummary> {
  const [integrations, nativeMarketplaceCount] = await Promise.all([
    prisma.integration.findMany({
      where: tenantScopedWhere({ organizationId }),
      select: { status: true },
    }),
    prisma.marketplaceProvider.count({ where: { isNative: true, status: 'AVAILABLE' } }).catch(() => 0),
  ]);

  const connectedCount = integrations.filter((i) => i.status === 'CONNECTED' || i.status === 'SYNCING').length;
  const nativeCatalogSize = nativeMarketplaceCount > 0 ? nativeMarketplaceCount : STATIC_NATIVE_SLUGS.length;

  return { connectedCount, nativeCatalogSize };
}
