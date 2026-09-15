import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildJiraInstallUrl, signJiraState } from '@/services/integrations/jira';
import { oauthStateFailureReason } from '@/services/integrations/oauthState';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');

  try {
    const state = signJiraState({
      organizationId: tenant.organization.id,
      userId: tenant.user.id,
    });
    return NextResponse.redirect(buildJiraInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = oauthStateFailureReason(error, 'Jira OAuth install failed');
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?jira=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
