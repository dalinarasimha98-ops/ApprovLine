import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { createDemoDataForOrganization } from '@/lib/demo-data';
import { isPilotMigrationRequired, logPilotActivity } from '@/services/pilot';
import { hasAnyRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Triggered by a plain HTML form ("Generate demo data" on
// /dashboard/approvals) - a full-page navigation, not fetch. Every response
// here must be a redirect with an explicit 303 (Post/Redirect/Get): a bare
// NextResponse.redirect() defaults to 307, which requires the browser to
// replay the same method (POST) against the redirect target, and every
// target below is a GET-only page route - a 307 here 405s. Returning JSON
// (as the role-check branch used to) has the same underlying problem in a
// different form: a full-page POST navigation would render that raw JSON
// as the whole page instead of a usable error state.
export async function POST(request: Request) {
  const tenant = await getDashboardTenant(2000);

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
    const url = new URL('/dashboard/approvals?demo=error', request.url);
    url.searchParams.set('reason', 'forbidden');
    return NextResponse.redirect(url, { status: 303 });
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
    return NextResponse.redirect(new URL('/dashboard/approvals?demo=created', request.url), { status: 303 });
  } catch (error) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', error instanceof Error ? error.message : 'demo_seed_failed');
    return NextResponse.redirect(url, { status: 303 });
  }
}
