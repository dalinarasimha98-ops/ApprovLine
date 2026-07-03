import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { requireRole } from '@/lib/auth';
import { buildServiceNowInstallUrl, normalizeServiceNowInstanceUrl, signServiceNowState } from '@/services/integrations/servicenow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');

  try {
    const instanceUrl = normalizeServiceNowInstanceUrl(request.nextUrl.searchParams.get('instance') ?? env.SERVICENOW_INSTANCE_URL);
    const state = signServiceNowState({
      organizationId: tenant.organization.id,
      userId: tenant.user.id,
      instanceUrl,
    });
    return NextResponse.redirect(buildServiceNowInstallUrl({ requestUrl: request.url, state, instanceUrl }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'ServiceNow OAuth install failed';
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?servicenow=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
