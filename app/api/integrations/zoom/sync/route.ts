import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { syncZoomIntegration } from '@/services/integrations/zoom';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const formData = await request.formData().catch(() => null);
  const integrationId = formData?.get('integrationId')?.toString();

  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId || undefined,
      organizationId: tenant.organization.id,
      provider: 'ZOOM',
    },
  });

  if (!integration) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?zoom=error&reason=zoom_integration_missing', request.url));
  }

  try {
    await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
    await syncZoomIntegration(integration);
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?zoom=synced', request.url));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Zoom sync failed';
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: reason.toLowerCase().includes('invalid_grant') ? 'NEEDS_REAUTH' : 'ERROR',
        metadata: {
          ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
          lastSyncStatus: 'error',
          lastError: reason,
          lastErrorAt: new Date().toISOString(),
        },
      },
    }).catch(() => null);
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?zoom=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
