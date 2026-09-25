'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import {
  CircleUserRound,
  Bell,
  ShieldCheck,
  Sliders,
  Link2,
  KeyRound,
  Pencil,
  ExternalLink,
  Monitor,
  ChevronRight,
  Mail,
  MessageSquare,
  Smartphone,
} from 'lucide-react';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { ROLE_LABELS } from '@/lib/rbac';
import type { UserSettingsData } from '@/services/userSettings';

type Section = 'profile' | 'notifications' | 'security' | 'preferences' | 'sources' | 'api';

const NAV_ITEMS: { key: Section; label: string; description: string; icon: typeof Pencil }[] = [
  { key: 'profile', label: 'Profile', description: 'Your personal information', icon: CircleUserRound },
  { key: 'notifications', label: 'Notifications', description: 'Email and in-app preferences', icon: Bell },
  { key: 'security', label: 'Security', description: 'Password, 2FA, and sessions', icon: ShieldCheck },
  { key: 'preferences', label: 'Preferences', description: 'Appearance and workspace', icon: Sliders },
  { key: 'sources', label: 'Connected Sources', description: 'Manage your integrations', icon: Link2 },
  { key: 'api', label: 'API Access', description: 'API keys and gateway tokens', icon: KeyRound },
];

function isSection(value: string | null): value is Section {
  return NAV_ITEMS.some((item) => item.key === value);
}

function Card({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1E2D4A] bg-[#0E1830] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#E8EEFF]">{title}</h2>
          {description ? <p className="mt-1 text-sm font-semibold text-[#6B7FA8]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3 py-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-[#E8EEFF]">{value}</dd>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'rose'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    slate: 'border-[#1E2D4A] bg-[#152040] text-[#A8BAD8]',
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-200">
      {message}
    </div>
  );
}

function SuccessNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300">
      {message}
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatRelative(value: Date) {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

const ACTIVITY_LABELS: Record<string, string> = {
  PROFILE_UPDATED: 'Profile updated',
  SECURITY_SESSION_REVOKED: 'Session revoked',
  NOTIFICATION_PREFERENCES_UPDATED: 'Notification preferences updated',
};

function accountStatus(security: UserSettingsData['security']): { label: string; tone: 'green' | 'amber' | 'rose' } {
  if (!security.status) return { label: 'Unknown', tone: 'amber' };
  if (security.status.banned) return { label: 'Suspended', tone: 'rose' };
  if (security.status.locked) return { label: 'Locked', tone: 'amber' };
  return { label: 'Active', tone: 'green' };
}

/** A checkbox styled as a switch that submits its own form the instant it
 *  changes - real, immediate persistence, no separate Save step, matching
 *  the reference's always-on-looking toggle rows. Unlike Save-gated forms
 *  elsewhere in this page, this needs no dirty-tracking: every change IS
 *  the save. */
function AutoSubmitToggle({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <label className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={pending}
        aria-label={label}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-[#243350] transition peer-checked:bg-violet-600 peer-disabled:opacity-60" />
      <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
    </label>
  );
}

function NotificationsCard({
  settings,
  error,
  action,
  showManageLink,
  onManage,
  showComplianceNote,
  returnSection,
}: {
  settings: UserSettingsData['notifications']['settings'];
  error: string | null;
  action: (formData: FormData) => Promise<void>;
  showManageLink: boolean;
  onManage: () => void;
  showComplianceNote: boolean;
  /** Which section to redirect back to after the toggle saves - this card
   *  renders both on the Profile overview and the dedicated Notifications
   *  section, and a toggle flipped from Profile should land back on
   *  Profile, not jump the viewer into Notifications. */
  returnSection: Section;
}) {
  return (
    <Card
      title="Notification Preferences"
      description="Choose how you want to be notified about important events."
      action={
        showManageLink ? (
          <button type="button" onClick={onManage} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" /> Manage Notifications
          </button>
        ) : null
      }
    >
      {error ? <ErrorNote message={error} /> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <form action={action} className={`flex items-center gap-3 rounded-lg border p-3.5 ${settings.emailEnabled ? 'border-violet-500/40 bg-violet-500/5' : 'border-[#1E2D4A] bg-[#0a1524]'}`}>
          <input type="hidden" name="returnSection" value={returnSection} />
          <Mail className="h-4 w-4 shrink-0 text-[#6B7FA8]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#E8EEFF]">Email Notifications</p>
            <p className="text-xs font-semibold text-[#6B7FA8]">Optional updates via email</p>
          </div>
          <AutoSubmitToggle name="emailEnabled" defaultChecked={settings.emailEnabled} label="Email notifications" />
        </form>
        <div className="flex items-center gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-3.5 opacity-60">
          <MessageSquare className="h-4 w-4 shrink-0 text-[#6B7FA8]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#E8EEFF]">In-App Notifications</p>
            <p className="text-xs font-semibold text-[#6B7FA8]">Not available yet</p>
          </div>
          <span className="h-6 w-11 shrink-0 rounded-full bg-[#243350]" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-3.5 opacity-60">
          <Smartphone className="h-4 w-4 shrink-0 text-[#6B7FA8]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#E8EEFF]">Mobile Notifications</p>
            <p className="text-xs font-semibold text-[#6B7FA8]">Not configured for this workspace</p>
          </div>
          <span className="h-6 w-11 shrink-0 rounded-full bg-[#243350]" aria-hidden="true" />
        </div>
      </div>
      {showComplianceNote ? (
        <p className="mt-4 text-xs font-semibold leading-5 text-[#6B7FA8]">
          This only controls optional email updates. Approval confirmation requests are a compliance requirement and are
          always recorded and always require action, regardless of this setting.
        </p>
      ) : null}
    </Card>
  );
}

function SecuritySummaryCard({
  security,
  sessions,
  onManage,
}: {
  security: UserSettingsData['security'];
  sessions: UserSettingsData['sessions'];
  onManage: () => void;
}) {
  const rows = [
    {
      key: 'password',
      icon: KeyRound,
      label: 'Password',
      value: security.status ? (security.status.passwordEnabled ? 'Password sign-in enabled' : 'Managed by identity provider (SSO)') : 'Unavailable',
    },
    {
      key: '2fa',
      icon: ShieldCheck,
      label: 'Two-Factor Authentication',
      value: security.status ? (security.status.twoFactorEnabled ? 'Enabled' : 'Not enabled') : 'Unavailable',
    },
    {
      key: 'sessions',
      icon: Monitor,
      label: 'Active Sessions',
      value: sessions.error ? 'Unavailable' : `${sessions.list.length} active session${sessions.list.length === 1 ? '' : 's'}`,
    },
  ];
  return (
    <Card
      title="Security Settings"
      description="Manage your account security and access."
      action={
        <button type="button" onClick={onManage} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Manage Security
        </button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {rows.map(({ key, icon: Icon, label, value }) => (
          <button
            key={key}
            type="button"
            onClick={onManage}
            className="flex items-center gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-3.5 text-left transition hover:border-violet-500/40"
          >
            <Icon className="h-4 w-4 shrink-0 text-[#6B7FA8]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#E8EEFF]">{label}</p>
              <p className="truncate text-xs font-semibold text-[#6B7FA8]">{value}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#6B7FA8]" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function PreferencesCard({ organizationName, showManageLink, onManage }: { organizationName: string; showManageLink: boolean; onManage: () => void }) {
  return (
    <Card
      title="Appearance & Preferences"
      description="Customize your ApprovLine experience."
      action={
        showManageLink ? (
          <button type="button" onClick={onManage} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40">
            <Sliders className="h-3.5 w-3.5" aria-hidden="true" /> Manage Preferences
          </button>
        ) : null
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">Theme</p>
          <p className="mt-1 text-sm font-bold text-[#E8EEFF]">Dark</p>
          <p className="mt-1 text-xs font-semibold text-[#6B7FA8]">ApprovLine currently uses the dark workspace theme only.</p>
        </div>
        <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">Language</p>
          <p className="mt-1 text-sm font-bold text-[#E8EEFF]">English (US)</p>
          <p className="mt-1 text-xs font-semibold text-[#6B7FA8]">ApprovLine doesn&apos;t support other languages yet.</p>
        </div>
        <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">Workspace</p>
          <p className="mt-1 truncate text-sm font-bold text-[#E8EEFF]">{organizationName}</p>
          <p className="mt-1 text-xs font-semibold text-[#6B7FA8]">Each account belongs to a single workspace.</p>
        </div>
      </div>
    </Card>
  );
}

export function UserSettingsShell({
  data,
  updateProfileAction,
  updateNotificationsAction,
  revokeSessionAction,
}: {
  data: UserSettingsData;
  updateProfileAction: (formData: FormData) => Promise<void>;
  updateNotificationsAction: (formData: FormData) => Promise<void>;
  revokeSessionAction: (formData: FormData) => Promise<void>;
}) {
  const searchParams = useSearchParams();
  const initialSection = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<Section>(isSection(initialSection) ? initialSection : 'profile');
  const [editOpen, setEditOpen] = useState(false);
  const clerk = useClerk();

  const profileError = searchParams.get('profile') === 'error' ? searchParams.get('profileError') : null;
  const sessionError = searchParams.get('session') === 'error' ? searchParams.get('sessionError') : null;
  const notificationsError = searchParams.get('notifications') === 'error' ? searchParams.get('notificationsError') : null;

  const { profile, security, sessions, connectedSources, notifications, securityActivity } = data;
  const status = accountStatus(security);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Mobile section selector */}
      <div className="lg:hidden">
        <label className="grid gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Section</span>
          <select
            value={activeSection}
            onChange={(event) => setActiveSection(event.target.value as Section)}
            className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-bold text-[#E8EEFF] outline-none focus:border-violet-500/60"
          >
            {NAV_ITEMS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Left nav */}
      <nav className="hidden lg:block">
        <div className="grid gap-1.5 rounded-2xl border border-[#1E2D4A] bg-[#0E1830] p-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                aria-current={isActive}
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  isActive ? 'bg-violet-600/15 ring-1 ring-inset ring-violet-500/40' : 'hover:bg-[#152040]'
                }`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? 'text-violet-400' : 'text-[#6B7FA8]'}`} aria-hidden="true" />
                <span>
                  <span className={`block text-sm font-bold ${isActive ? 'text-violet-300' : 'text-[#E8EEFF]'}`}>{item.label}</span>
                  <span className="block text-xs font-semibold text-[#6B7FA8]">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <div className="grid gap-4">
        {profileError ? <ErrorNote message={profileError} /> : null}
        {searchParams.get('profile') === 'success' ? <SuccessNote message="Profile updated." /> : null}
        {notificationsError ? <ErrorNote message={notificationsError} /> : null}
        {searchParams.get('notifications') === 'success' ? <SuccessNote message="Notification preferences updated." /> : null}

        {activeSection === 'profile' ? (
          <>
            <Card
              title="Profile Information"
              description="Your personal and professional details."
              action={
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit Profile
                </button>
              }
            >
              <div className="flex items-center gap-4">
                {profile.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a single small avatar from Clerk's CDN; not worth widening next.config's image remotePatterns for.
                  <img src={profile.imageUrl} alt="" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-violet-600/20 text-xl font-black text-violet-300">
                    {(profile.name ?? profile.email).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-lg font-black text-[#E8EEFF]">{profile.name ?? 'Unnamed user'}</p>
                  <p className="text-sm font-semibold text-[#6B7FA8]">{profile.email}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    <button
                      type="button"
                      onClick={() => clerk.openUserProfile()}
                      className="inline-flex items-center gap-1 text-xs font-bold text-violet-400 hover:text-violet-300"
                    >
                      Change photo <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Full Name" value={profile.name ?? 'Not set'} />
                <Field label="Job Title" value={profile.jobTitle ?? 'Not set'} />
                <Field label="Email Address" value={profile.email || 'Not available'} />
                <Field label="Phone" value={profile.phone ?? 'Not set'} />
                <Field label="Role" value={ROLE_LABELS[profile.role]} />
                <Field label="Location" value={profile.location ?? 'Not set'} />
                <Field label="Department" value={profile.department ?? 'Not set'} />
                <Field label="Manager" value={profile.managerName ?? 'Not set'} />
                <Field label="Time Zone" value={profile.timezone ?? 'Not set'} />
                <Field label="Workspace" value={profile.organizationName} />
              </dl>
              <p className="mt-3 text-xs font-semibold text-[#6B7FA8]">Member since {formatDate(profile.memberSince)}.</p>
            </Card>

            <NotificationsCard
              settings={notifications.settings}
              error={notifications.error}
              action={updateNotificationsAction}
              showManageLink
              onManage={() => setActiveSection('notifications')}
              showComplianceNote={false}
              returnSection="profile"
            />

            <SecuritySummaryCard security={security} sessions={sessions} onManage={() => setActiveSection('security')} />

            <PreferencesCard organizationName={profile.organizationName} showManageLink onManage={() => setActiveSection('preferences')} />
          </>
        ) : null}

        {activeSection === 'notifications' ? (
          <NotificationsCard
            settings={notifications.settings}
            error={notifications.error}
            action={updateNotificationsAction}
            showManageLink={false}
            onManage={() => {}}
            showComplianceNote
            returnSection="notifications"
          />
        ) : null}

        {activeSection === 'security' ? (
          <div className="grid gap-4">
            {sessionError ? <ErrorNote message={sessionError} /> : null}
            {searchParams.get('session') === 'success' ? <SuccessNote message="Session revoked." /> : null}

            <Card title="Password" description="Managed through your identity provider.">
              {security.status ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusPill tone={security.status.passwordEnabled ? 'green' : 'slate'}>
                    {security.status.passwordEnabled ? 'Password sign-in enabled' : 'Password sign-in not used (SSO only)'}
                  </StatusPill>
                  <button
                    type="button"
                    onClick={() => clerk.openUserProfile()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40"
                  >
                    Manage in account portal <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <ErrorNote message={security.error ?? 'Password status is unavailable.'} />
              )}
            </Card>

            <Card title="Two-Factor Authentication" description="Managed through your identity provider.">
              {security.status ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <StatusPill tone={security.status.twoFactorEnabled ? 'green' : 'amber'}>
                      {security.status.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                    </StatusPill>
                    {security.status.twoFactorEnabled ? (
                      <p className="mt-2 text-xs font-semibold text-[#6B7FA8]">
                        {[
                          security.status.totpEnabled ? 'Authenticator app' : null,
                          security.status.backupCodeEnabled ? 'Backup codes' : null,
                        ].filter(Boolean).join(' · ') || 'A second factor is configured.'}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => clerk.openUserProfile()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40"
                  >
                    Manage in account portal <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <ErrorNote message={security.error ?? 'Two-factor status is unavailable.'} />
              )}
            </Card>

            <Card title="Active Sessions" description="Devices currently signed in to your account.">
              {sessions.error ? (
                <ErrorNote message={sessions.error} />
              ) : sessions.list.length === 0 ? (
                <p className="text-sm font-semibold text-[#6B7FA8]">No active sessions found.</p>
              ) : (
                <div className="grid gap-2">
                  {sessions.list.map((session) => (
                    <div key={session.id} className="flex flex-col gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7FA8]" aria-hidden="true" />
                        <div>
                          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#E8EEFF]">
                            {session.browserName ?? 'Unknown browser'}{session.deviceType ? ` · ${session.deviceType}` : ''}
                            {session.isCurrent ? <StatusPill tone="green">This device</StatusPill> : null}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-[#6B7FA8]">
                            {[session.city, session.country].filter(Boolean).join(', ') || 'Location unavailable'}
                            {session.ipAddress ? ` · ${session.ipAddress}` : ''} · Active {formatRelative(session.lastActiveAt)}
                          </p>
                        </div>
                      </div>
                      {session.isCurrent ? (
                        <span className="text-xs font-bold text-[#6B7FA8]">Current session</span>
                      ) : (
                        <form action={revokeSessionAction}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <FormSubmitButton
                            pendingText="Revoking…"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-xs font-black text-[#E8EEFF] hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-60"
                          >
                            Revoke session
                          </FormSubmitButton>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Recent Security Activity" description="Changes you've made to your own account.">
              {securityActivity.error ? (
                <ErrorNote message={securityActivity.error} />
              ) : securityActivity.list.length === 0 ? (
                <p className="text-sm font-semibold text-[#6B7FA8]">No recent security activity.</p>
              ) : (
                <div className="grid gap-2">
                  {securityActivity.list.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3.5 py-2.5">
                      <span className="text-sm font-semibold text-[#E8EEFF]">{ACTIVITY_LABELS[event.action] ?? event.action}</span>
                      <span className="text-xs font-semibold text-[#6B7FA8]">{formatRelative(event.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        ) : null}

        {activeSection === 'preferences' ? (
          <PreferencesCard organizationName={profile.organizationName} showManageLink={false} onManage={() => {}} />
        ) : null}

        {activeSection === 'sources' ? (
          <Card title="Connected Sources" description="Integrations connected to your organization.">
            {connectedSources.error ? (
              <ErrorNote message={connectedSources.error} />
            ) : connectedSources.list.length === 0 ? (
              <p className="text-sm font-semibold text-[#6B7FA8]">No sources connected yet.</p>
            ) : (
              <div className="grid gap-2">
                {connectedSources.list.map((source) => (
                  <div key={source.key} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span style={{ backgroundColor: source.color }} className="h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
                      <span className="text-sm font-bold text-[#E8EEFF]">{source.label}</span>
                    </div>
                    <StatusPill tone={source.status === 'connected' ? 'green' : 'slate'}>
                      {source.status === 'connected' ? 'Connected' : 'Not connected'}
                    </StatusPill>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs font-semibold leading-5 text-[#6B7FA8]">
              Sources are managed at the organization level.{' '}
              <PendingLink href="/dashboard/settings/integrations" pendingText="Opening…" className="font-bold text-violet-400 hover:text-violet-300">
                Manage integrations →
              </PendingLink>
            </p>
          </Card>
        ) : null}

        {activeSection === 'api' ? (
          <Card title="API Access" description="How ApprovLine's API and Universal Gateway are secured.">
            <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] p-4">
              <p className="text-sm font-bold text-[#E8EEFF]">No personal API credentials are configured for this workspace.</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#6B7FA8]">
                ApprovLine doesn&apos;t issue per-user API keys today. Programmatic access (the Universal Gateway) is secured
                by a single organization-wide credential that your workspace administrator configures at the infrastructure
                level - it isn&apos;t visible or manageable from an individual account, and it is never displayed here.
              </p>
            </div>
          </Card>
        ) : null}
      </div>

      {editOpen ? (
        <EditProfileDrawer
          profile={profile}
          onClose={() => setEditOpen(false)}
          action={updateProfileAction}
        />
      ) : null}
    </div>
  );
}

const TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

function EditProfileDrawer({
  profile,
  onClose,
  action,
}: {
  profile: UserSettingsData['profile'];
  onClose: () => void;
  action: (formData: FormData) => Promise<void>;
}) {
  const titleId = 'edit-profile-title';
  const initial = {
    fullName: profile.name ?? '',
    jobTitle: profile.jobTitle ?? '',
    department: profile.department ?? '',
    phone: profile.phone ?? '',
    location: profile.location ?? '',
    timezone: profile.timezone ?? '',
  };
  const [form, setForm] = useState(initial);
  const isDirty = form.fullName.trim().length > 0 && Object.keys(initial).some((key) => form[key as keyof typeof form] !== initial[key as keyof typeof initial]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <DetailDrawer open onClose={onClose} titleId={titleId} size="sm" className="bg-[#030b18]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1E2D4A] bg-[#0a1524] px-5 py-4">
        <h2 id={titleId} className="text-lg font-black text-[#E8EEFF]">Edit Profile</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#6B7FA8] hover:bg-[#152040] hover:text-[#A8BAD8]">
          ✕
        </button>
      </div>
      <form action={action} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 gap-4 overflow-y-auto p-5">
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Full Name</span>
            <input
              name="fullName"
              value={form.fullName}
              onChange={(event) => set('fullName', event.target.value)}
              placeholder="Your full name"
              className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Job Title</span>
            <input
              name="jobTitle"
              value={form.jobTitle}
              onChange={(event) => set('jobTitle', event.target.value)}
              placeholder="e.g. VP of Finance"
              className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Department</span>
            <select
              name="department"
              value={form.department}
              onChange={(event) => set('department', event.target.value)}
              className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            >
              <option value="">Not set</option>
              {profile.organizationDepartments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            {profile.organizationDepartments.length === 0 ? (
              <span className="text-xs font-semibold text-[#6B7FA8]">Your organization hasn&apos;t configured any departments yet.</span>
            ) : null}
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Phone</span>
            <input
              name="phone"
              type="tel"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              placeholder="Not set"
              className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Location</span>
            <input
              name="location"
              value={form.location}
              onChange={(event) => set('location', event.target.value)}
              placeholder="e.g. New York, NY"
              className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Time Zone</span>
            <select
              name="timezone"
              value={form.timezone}
              onChange={(event) => set('timezone', event.target.value)}
              className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            >
              <option value="">Not set</option>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </label>
          <p className="text-xs font-semibold leading-5 text-[#6B7FA8]">
            Email and profile photo are managed through your account portal. Role, manager, and workspace are managed by
            your organization.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-[#1E2D4A] bg-[#0a1524] px-5 py-4">
          <FormSubmitButton
            pendingText="Saving…"
            disabled={!isDirty}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save changes
          </FormSubmitButton>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-[#1E2D4A] bg-[#152040] px-5 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40"
          >
            Cancel
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}
