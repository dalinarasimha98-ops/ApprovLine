import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildOutlookInstallUrl, signOutlookState } from '@/services/integrations/outlook';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const state = signOutlookState({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
  });

  try {
    return NextResponse.redirect(buildOutlookInstallUrl({ requestUrl: request.url, state }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Outlook OAuth install failed';
    return NextResponse.redirect(new URL(`/dashboard/settings/integrations?outlook=error&reason=${encodeURIComponent(reason)}`, request.url));
  }
}
