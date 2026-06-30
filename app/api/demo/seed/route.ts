import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { createDemoDataForOrganization } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(2000);

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
    await createDemoDataForOrganization(tenant.organization.id);
    return NextResponse.redirect(new URL('/dashboard/approvals?demo=created', request.url));
  } catch (error) {
    const url = new URL('/dashboard?demo=error', request.url);
    url.searchParams.set('reason', error instanceof Error ? error.message : 'demo_seed_failed');
    return NextResponse.redirect(url);
  }
}
