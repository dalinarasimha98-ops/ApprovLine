import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { UserSettingsShell } from '@/components/settings/UserSettingsShell';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import {
  getUserSettingsData,
  updateProfile as updateProfileService,
  parseProfileFormFields,
  updateNotificationPreference,
  updateThemePreference,
  revokeUserSession,
  type UpdateThemePreferenceResult,
} from '@/services/userSettings';
import type { ThemePreference } from '@/lib/theme';

export const dynamic = 'force-dynamic';

async function updateProfile(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/settings/profile', tenant.user.role);

  const fields = parseProfileFormFields(formData);
  const result = await updateProfileService({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    clerkUserId: tenant.user.clerkUserId,
    organizationDepartments: tenant.organization.departments,
    ...fields,
  });

  if (!result.ok) {
    redirect(`/settings/profile?profile=error&profileError=${encodeURIComponent(result.error)}`);
  }
  redirect('/settings/profile?profile=success');
}

async function updateNotifications(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/settings/profile', tenant.user.role);

  const emailEnabled = formData.get('emailEnabled') === 'on';
  const returnSectionRaw = String(formData.get('returnSection') ?? '');
  const returnSection = ['profile', 'notifications'].includes(returnSectionRaw) ? returnSectionRaw : 'notifications';
  const result = await updateNotificationPreference({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    emailEnabled,
  });

  if (!result.ok) {
    redirect(`/settings/profile?section=${returnSection}&notifications=error&notificationsError=${encodeURIComponent(result.error)}`);
  }
  redirect(`/settings/profile?section=${returnSection}&notifications=success`);
}

/**
 * Deliberately does NOT redirect, unlike this page's other mutations - the
 * spec requires the theme to change instantly with no Save/refresh step,
 * so the client shell calls this directly and awaits its result rather
 * than submitting a <form>. Identity is still always server-resolved
 * (getDashboardTenant()), never trusted from the client argument.
 */
async function updateTheme(theme: ThemePreference): Promise<UpdateThemePreferenceResult> {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated' || !tenant.organization || !tenant.user) {
    return { ok: false, error: 'Your session could not be verified. Please sign in again.' };
  }
  enforcePageRole('/settings/profile', tenant.user.role);

  return updateThemePreference({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    theme,
  });
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
      organizationDepartments: tenant.organization.departments,
      userId: tenant.user.id,
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
          <div className="rounded-2xl border border-al-warning/30 bg-al-warning/10 p-6">
            <p className="font-black text-al-warning">Your settings couldn&apos;t be loaded.</p>
            <p className="mt-1 text-sm font-semibold text-al-warning/80">Try again in a moment.</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="grid gap-4">
        <PageHeader />
        <UserSettingsShell
          data={data}
          updateProfileAction={updateProfile}
          updateNotificationsAction={updateNotifications}
          updateThemeAction={updateTheme}
          revokeSessionAction={revokeSession}
        />
      </div>
    </DashboardShell>
  );
}

function PageHeader() {
  return (
    <div className="overflow-hidden rounded-2xl border border-al-border bg-al-surface">
      <div className="px-6 py-7">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-al-accent">Account</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-al-text">User Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-al-text-muted">
          Manage your account, security, and personal preferences.
        </p>
      </div>
    </div>
  );
}
