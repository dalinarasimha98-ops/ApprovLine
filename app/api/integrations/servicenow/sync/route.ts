import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { syncServiceNowIntegration } from '@/services/integrations/servicenow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const formData = await request.formData().catch(() => null);
  const integrationId = formData?.get('integrationId')?.toString();

  const integration = await prisma.integration.findFirst({
    where: {
      id: integrationId || undefined,
      organizationId: tenant.organization.id,
      provider: 'SERVICENOW',
    },
  });

  // Triggered by a plain HTML form POST ("Sync now" on
  // /dashboard/settings/integrations) - every redirect below needs an
  // explicit 303 (Post/Redirect/Get). A bare NextResponse.redirect()
  // defaults to 307, which makes the browser replay POST against the
  // redirect target - a GET-only page route - and 405.
  if (!integration) {
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?servicenow=error&reason=servicenow_integration_missing', request.url), { status: 303 });
  }

  try {
    await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
    await syncServiceNowIntegration(integration);
    return NextResponse.redirect(new URL('/dashboard/settings/integrations?servicenow=synced', request.url), { status: 303 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ServiceNow sync failed';
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
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?servicenow=error&reason=${encodeURIComponent(reason)}`, request.url), { status: 303 });
  }
}
