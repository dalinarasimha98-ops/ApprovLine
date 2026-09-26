import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getDashboardTenant } from '@/lib/auth';
import { OrganizationDashboardView, str, type RawSearchParams } from '@/components/dashboard/OrganizationDashboardView';
import { getDashboardOverview, resolveDashboardRange, type ActivityGranularity, type DashboardRangeKey } from '@/services/dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const tenant = await getDashboardTenant(5000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');

  const rawParams = await searchParams;
  const organizationId = tenant.organization?.id;
  const role = tenant.user?.role ?? 'VIEWER';

  const range = resolveDashboardRange(str(rawParams, 'range') as DashboardRangeKey | undefined);
  const requestedGranularity = str(rawParams, 'granularity');
  const granularityOverride: ActivityGranularity | undefined =
    requestedGranularity === 'day' || requestedGranularity === 'week' || requestedGranularity === 'month' ? requestedGranularity : undefined;

  if (!organizationId || !tenant.user) {
    return (
      <section className="grid gap-3 text-al-text-secondary">
        <div className="rounded-lg border border-white/[0.09] bg-al-surface-sunken p-8 text-center shadow-[0_12px_36px_rgba(0,0,0,.16)]">
          <h1 className="text-lg font-bold text-al-text">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-al-text-muted">We couldn&apos;t load your organization right now. Try refreshing in a moment.</p>
        </div>
      </section>
    );
  }

  const overview = await getDashboardOverview(
    { organizationId, userId: tenant.user.id, email: tenant.user.email, role },
    range,
    granularityOverride,
  );

  return (
    <OrganizationDashboardView
      overview={overview}
      organizationName={tenant.organization?.name ?? 'your organization'}
      role={role}
      rawParams={rawParams}
    />
  );
}
