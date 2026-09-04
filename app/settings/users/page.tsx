import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { UsersTeamsShell } from '@/components/users/UsersTeamsShell';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { getUsersTeamsData } from '@/services/users';

export const dynamic = 'force-dynamic';

export default async function UsersTeamsPage() {
  const tenant = await getDashboardTenant(8000);

  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/dashboard');

  enforcePageRole('/settings/users', tenant.user.role);

  const orgId = tenant.organization.id;

  let data;
  try {
    data = await getUsersTeamsData(orgId);
  } catch (err) {
    console.error('[users-teams] data fetch failed', err);
    return (
      <DashboardShell>
        <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-[#07111f] px-6 py-7 text-white">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Users & Teams</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{tenant.organization.name}</h1>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="font-black text-amber-900">Could not load workspace data right now.</p>
          <p className="mt-1 text-sm font-semibold text-amber-700">The database did not respond in time. Please retry in a moment.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      {/* Page header */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#07111f] px-6 py-7 text-white">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Users & Teams</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{tenant.organization.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Manage workspace members, teams, roles, and permissions across your organization.
          </p>
        </div>
      </div>

      <UsersTeamsShell
        data={data}
        orgName={tenant.organization.name}
        currentUserId={tenant.user.id}
        currentUserRole={tenant.user.role}
      />
    </DashboardShell>
  );
}
