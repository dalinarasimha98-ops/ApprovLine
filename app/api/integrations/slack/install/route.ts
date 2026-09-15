import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildSlackInstallUrl, signSlackState } from '@/services/integrations/slack';
import { oauthStateFailureReason } from '@/services/integrations/oauthState';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  try {
    const state = signSlackState({
      organizationId: tenant.organization.id,
      userId: tenant.user.id,
    });
    return NextResponse.redirect(buildSlackInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = oauthStateFailureReason(error, 'Slack OAuth install failed');
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?slack=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
