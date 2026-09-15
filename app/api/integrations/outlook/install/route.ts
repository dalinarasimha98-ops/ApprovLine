import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildOutlookInstallUrl, signOutlookState } from '@/services/integrations/outlook';
import { oauthStateFailureReason } from '@/services/integrations/oauthState';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');

  try {
    const state = signOutlookState({
      organizationId: tenant.organization.id,
      userId: tenant.user.id,
    });
    return NextResponse.redirect(buildOutlookInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = oauthStateFailureReason(error, 'Outlook OAuth install failed');
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?outlook=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
