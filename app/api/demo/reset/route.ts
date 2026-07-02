import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { resetDemoDataForOrganization } from '@/lib/demo-data';
import { isPilotMigrationRequired, logPilotActivity } from '@/services/pilot';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(3000);

  if (tenant.status === 'unauthenticated') {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  if (!tenant.organization) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', tenant.error ?? 'workspace_unavailable');
    return NextResponse.redirect(url);
  }

  try {
    await resetDemoDataForOrganization(tenant.organization.id);
    try {
      await logPilotActivity({
        organizationId: tenant.organization.id,
        actorUserId: tenant.user?.id,
        action: 'pilot.demo_workspace.reset',
        entityType: 'DemoWorkspace',
        metadata: { demoOnly: true, realDataPreserved: true },
      });
    } catch (error) {
      if (!isPilotMigrationRequired(error)) throw error;
    }
    return NextResponse.redirect(new URL('/dashboard?demo=reset', request.url));
  } catch (error) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', error instanceof Error ? error.message : 'demo_reset_failed');
    return NextResponse.redirect(url);
  }
}
