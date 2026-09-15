import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildZoomInstallUrl, signZoomState } from '@/services/integrations/zoom';
import { oauthStateFailureReason } from '@/services/integrations/oauthState';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');

  try {
    const state = signZoomState({
      organizationId: tenant.organization.id,
      userId: tenant.user.id,
    });
    return NextResponse.redirect(buildZoomInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = oauthStateFailureReason(error, 'Zoom OAuth install failed');
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?zoom=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
