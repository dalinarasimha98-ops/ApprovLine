import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildTeamsInstallUrl, signTeamsState } from '@/services/integrations/teams';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const state = signTeamsState({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
  });

  try {
    return NextResponse.redirect(buildTeamsInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Microsoft Teams OAuth install failed';
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?teams=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
