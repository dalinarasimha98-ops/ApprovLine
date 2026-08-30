import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/providers
 *
 * Returns the full marketplace provider list for the current tenant, annotated
 * with whether each provider has an active TenantProviderAccess row (for
 * founder-gated providers) and the aggregate request count from other tenants.
 *
 * Provider visibility policy:
 *   - AVAILABLE and BETA providers are always listed.
 *   - COMING_SOON providers are listed (customers can request them).
 *   - DRAFT and DEPRECATED providers are founder-only (filtered here).
 *
 * TenantProviderAccess is informational in the current implementation: the UI
 * uses it to show whether a founder has explicitly enabled a provider for this
 * tenant, but AVAILABLE providers do not require a row to be usable.
 */
export async function GET() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tenant.organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  try {
    const [providers, tenantAccess] = await withTimeout(
      'providers-list',
      Promise.all([
        prisma.marketplaceProvider.findMany({
          where: { status: { in: ['AVAILABLE', 'BETA', 'COMING_SOON'] } },
          orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
        }),
        prisma.tenantProviderAccess.findMany({
          where: { organizationId: tenant.organization.id },
          select: { providerSlug: true, enabledAt: true },
        }),
      ]),
      3000,
    );

    const accessSet = new Set(tenantAccess.map((a) => a.providerSlug));

    const result = providers.map((p) => ({
      slug: p.slug,
      displayName: p.displayName,
      category: p.category,
      description: p.description,
      websiteUrl: p.websiteUrl,
      status: p.status,
      isNative: p.isNative,
      requestCount: p.requestCount,
      capabilities: p.capabilities,
      tenantAccessEnabled: accessSet.has(p.slug),
    }));

    return NextResponse.json({ providers: result });
  } catch (error) {
    console.error('[providers-api] list failed', error);
    return NextResponse.json({ error: 'Failed to load providers' }, { status: 500 });
  }
}
