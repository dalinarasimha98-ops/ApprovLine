import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { UserSettingsShell } from '@/components/settings/UserSettingsShell';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { getUserSettingsData, updateProfileName, revokeUserSession } from '@/services/userSettings';

export const dynamic = 'force-dynamic';

async function updateProfile(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/settings/profile', tenant.user.role);

  const fullName = String(formData.get('fullName') ?? '');
  const result = await updateProfileName({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    clerkUserId: tenant.user.clerkUserId,
    fullName,
  });

  if (!result.ok) {
    redirect(`/settings/profile?profile=error&profileError=${encodeURIComponent(result.error)}`);
  }
  redirect('/settings/profile?profile=success');
}

async function revokeSession(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/settings/profile', tenant.user.role);

  const sessionId = String(formData.get('sessionId') ?? '');
  const result = await revokeUserSession({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    clerkUserId: tenant.user.clerkUserId,
    sessionId,
  });

  if (!result.ok) {
    redirect(`/settings/profile?section=security&session=error&sessionError=${encodeURIComponent(result.error)}`);
  }
  redirect('/settings/profile?section=security&session=success');
}

export default async function UserSettingsPage() {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/dashboard');
  enforcePageRole('/settings/profile', tenant.user.role);

  const session = await auth();

  let data;
  try {
    data = await getUserSettingsData({
      organizationId: tenant.organization.id,
      organizationName: tenant.organization.name,
      organizationSlug: tenant.organization.slug,
      clerkUserId: tenant.user.clerkUserId,
      role: tenant.user.role,
      name: tenant.user.name,
      createdAt: tenant.user.createdAt,
      currentSessionId: session.sessionId ?? null,
    });
  } catch (error) {
    console.error('[user-settings] page load failed', error);
    return (
      <DashboardShell>
        <div className="grid gap-4">
          <PageHeader />
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
            <p className="font-black text-amber-200">Your settings couldn&apos;t be loaded.</p>
            <p className="mt-1 text-sm font-semibold text-amber-200/80">Try again in a moment.</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="grid gap-4">
        <PageHeader />
        <UserSettingsShell data={data} updateProfileAction={updateProfile} revokeSessionAction={revokeSession} />
      </div>
    </DashboardShell>
  );
}

function PageHeader() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#1E2D4A] bg-[#0E1830]">
      <div className="px-6 py-7">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-400">Account</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#E8EEFF]">User Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7FA8]">
          Manage your account, security, and personal preferences.
        </p>
      </div>
    </div>
  );
}
