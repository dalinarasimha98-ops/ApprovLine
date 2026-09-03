import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { getSettingsOverview } from '@/services/settings';
import { SettingsShell } from '@/components/settings/SettingsShell';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.user || !tenant.organization) redirect('/dashboard');
  enforcePageRole('/dashboard/settings', tenant.user.role);

  let data;
  try {
    data = await getSettingsOverview(tenant.organization.id);
  } catch {
    return (
      <div className="grid gap-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-[#07111f] px-6 py-7 text-white">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Workspace Configuration</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Settings</h1>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="font-black text-amber-900">Could not load settings right now.</p>
          <p className="mt-1 text-sm font-semibold text-amber-700">The database did not respond in time. Please retry in a moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Page header — dark card matching the Users & Teams / Playbooks pattern */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#07111f] px-6 py-7 text-white">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Workspace Configuration</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{data.organization.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Manage your organization, security, workflows, integrations and ApprovLine configuration.
          </p>
        </div>
      </div>

      <SettingsShell data={data} />
    </div>
  );
}
