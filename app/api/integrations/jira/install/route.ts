import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildJiraInstallUrl, signJiraState } from '@/services/integrations/jira';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const state = signJiraState({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
  });

  try {
    return NextResponse.redirect(buildJiraInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Jira OAuth install failed';
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?jira=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
