import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildGmailInstallUrl, signGmailState } from '@/services/integrations/gmail';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const state = signGmailState({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
  });
  try {
    return NextResponse.redirect(buildGmailInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Gmail OAuth install failed';
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?gmail=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
