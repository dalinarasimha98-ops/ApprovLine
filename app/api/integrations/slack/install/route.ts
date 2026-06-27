import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { buildSlackInstallUrl, signSlackState } from '@/services/integrations/slack';

export async function GET(request: NextRequest) {
  const tenant = await requireRole('ADMIN');
  const state = signSlackState({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
  });
  return NextResponse.redirect(buildSlackInstallUrl({ requestUrl: request.url, state }));
}
