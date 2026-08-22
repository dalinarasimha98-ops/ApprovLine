import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { resetDemoDataForOrganization } from '@/lib/demo-data';
import { isPilotMigrationRequired, logPilotActivity } from '@/services/pilot';
import { hasAnyRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Triggered by a plain HTML form ("Reset Demo Data" on /dashboard/settings) -
// see app/api/demo/seed/route.ts's comment for why every response here must
// be a 303 redirect, never a bare NextResponse.redirect() (defaults to 307,
// which 405s a GET-only page target) or JSON (renders as the whole page on
// a full-page POST navigation).
export async function POST(request: Request) {
  const tenant = await getDashboardTenant(3000);

  if (tenant.status === 'unauthenticated') {
    return NextResponse.redirect(new URL('/sign-in', request.url), { status: 303 });
  }

  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    return NextResponse.redirect(new URL('/onboarding', request.url), { status: 303 });
  }

  if (!tenant.organization || !tenant.user) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', tenant.error ?? 'workspace_unavailable');
    return NextResponse.redirect(url, { status: 303 });
  }

  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    const url = new URL('/dashboard/settings?demo=error', request.url);
    url.searchParams.set('reason', 'forbidden');
    return NextResponse.redirect(url, { status: 303 });
  }

  try {
    await resetDemoDataForOrganization(tenant.organization.id);
    try {
      await logPilotActivity({
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: 'pilot.demo_workspace.reset',
        entityType: 'DemoWorkspace',
        metadata: { demoOnly: true, realDataPreserved: true },
      });
    } catch (error) {
      if (!isPilotMigrationRequired(error)) throw error;
    }
    return NextResponse.redirect(new URL('/dashboard?demo=reset', request.url), { status: 303 });
  } catch (error) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', error instanceof Error ? error.message : 'demo_reset_failed');
    return NextResponse.redirect(url, { status: 303 });
  }
}
