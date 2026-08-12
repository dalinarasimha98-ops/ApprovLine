import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { createDemoDataForOrganization } from '@/lib/demo-data';
import { isPilotMigrationRequired, logPilotActivity } from '@/services/pilot';
import { hasAnyRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(2000);

  if (tenant.status === 'unauthenticated') {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  if (!tenant.organization || !tenant.user) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', tenant.error ?? 'workspace_unavailable');
    return NextResponse.redirect(url);
  }

  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Only workspace admins can generate demo data.' }, { status: 403 });
  }

  try {
    await createDemoDataForOrganization(tenant.organization.id);
    try {
      await logPilotActivity({
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: 'pilot.demo_workspace.generated',
        entityType: 'DemoWorkspace',
        metadata: { demoOnly: true },
      });
    } catch (error) {
      if (!isPilotMigrationRequired(error)) throw error;
    }
    return NextResponse.redirect(new URL('/dashboard/approvals?demo=created', request.url));
  } catch (error) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', error instanceof Error ? error.message : 'demo_seed_failed');
    return NextResponse.redirect(url);
  }
}
