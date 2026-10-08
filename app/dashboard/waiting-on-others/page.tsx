import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { WaitingOnOthersView } from '@/components/dashboard/WaitingOnOthersView';
import { type RawSearchParams } from '@/lib/search-params';
import type { ActionCenterViewer } from '@/services/action-center';

export const dynamic = 'force-dynamic';

export default async function WaitingOnOthersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');

  const rawParams = await searchParams;
  const viewer: ActionCenterViewer = {
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    email: tenant.user.email,
    role: tenant.user.role,
  };

  return <WaitingOnOthersView viewer={viewer} rawParams={rawParams} />;
}
