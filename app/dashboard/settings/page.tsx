import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { getSettingsOverview } from '@/services/settings';
import { SettingsShell } from '@/components/settings/SettingsShell';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Settings } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.user || !tenant.organization) redirect('/dashboard');
  enforcePageRole('/dashboard/settings', tenant.user.role);

  const data = await getSettingsOverview(tenant.organization.id).catch(() => null);
  if (!data) redirect('/dashboard');

  return (
    <DashboardShell>
      <div className="flex min-h-screen flex-col bg-[#07111f]">
        {/* Page header */}
        <div className="border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20">
              <Settings className="h-4 w-4 text-blue-300" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Settings</h1>
              <p className="text-xs text-slate-500">{data.organization.name} · Workspace configuration</p>
            </div>
          </div>
        </div>

        {/* Shell */}
        <div className="flex-1 px-6 py-6">
          <SettingsShell data={data} />
        </div>
      </div>
    </DashboardShell>
  );
}
