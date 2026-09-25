'use client';

import { useEffect, useState } from 'react';
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
  Moon,
  Sun,
  Check,
} from 'lucide-react';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { useTheme } from '@/components/system/ThemeProvider';
import { ROLE_LABELS } from '@/lib/rbac';
import type { UserSettingsData, UpdateThemePreferenceResult } from '@/services/userSettings';
import type { ThemePreference } from '@/lib/theme';

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
    <div className="rounded-2xl border border-al-border bg-al-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-al-text">{title}</h2>
          {description ? <p className="mt-1 text-sm font-semibold text-al-text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** A compact label/value row rather than an individually bordered card -
 *  ten of those (the full Profile Information field set) made the section
 *  read as very tall. Two FieldColumns side by side, each a single bordered
 *  list with a hairline between rows, reproduce the same information at a
 *  fraction of the vertical footprint without going spreadsheet-dense
 *  (rows keep generous line-height and a clear label/value split). */
function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-al-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-semibold text-al-text">{value}</dd>
    </div>
  );
}

function FieldColumn({ fields }: { fields: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-al-border rounded-lg border border-al-border bg-al-surface-sunken px-3.5">
      {fields.map((field) => (
        <FieldRow key={field.label} label={field.label} value={field.value} />
      ))}
    </dl>
  );
}

function StatusPill({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'rose'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: 'border-al-success/30 bg-al-success/10 text-al-success',
    amber: 'border-al-warning/30 bg-al-warning/10 text-al-warning',
    rose: 'border-al-danger/30 bg-al-danger/10 text-al-danger',
    slate: 'border-al-border bg-al-surface-elevated text-al-text-secondary',
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-al-warning/30 bg-al-warning/10 p-3 text-sm font-semibold text-al-warning">
      {message}
    </div>
  );
}

/** A compact, self-dismissing confirmation rather than a full-width block
 *  that stays on screen indefinitely (these render from a URL query param
 *  set by a redirect-based server action, which otherwise persists until
 *  the viewer navigates away). Fades out on its own after a few seconds -
 *  errors (ErrorNote) intentionally stay put until addressed; only success
 *  needs to get out of the way. */
function SuccessNote({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-al-success/30 bg-al-success/10 px-3 py-1 text-xs font-bold text-al-success" role="status">
      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {message}
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
  THEME_PREFERENCE_UPDATED: 'Appearance preference updated',
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
      <span className="h-6 w-11 rounded-full bg-al-border-strong transition peer-checked:bg-al-accent peer-disabled:opacity-60" />
      <span className="absolute left-1 h-4 w-4 rounded-full bg-al-surface transition peer-checked:translate-x-5" />
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
          <button type="button" onClick={onManage} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-al-border bg-al-surface-elevated px-4 text-sm font-bold text-al-text hover:border-al-accent/40">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" /> Manage Notifications
          </button>
        ) : null
      }
    >
      {error ? <ErrorNote message={error} /> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <form action={action} className={`flex items-center gap-3 rounded-lg border p-3.5 ${settings.emailEnabled ? 'border-al-accent/40 bg-al-accent/5' : 'border-al-border bg-al-surface-sunken'}`}>
          <input type="hidden" name="returnSection" value={returnSection} />
          <Mail className="h-4 w-4 shrink-0 text-al-text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-al-text">Email Notifications</p>
            <p className="text-xs font-semibold text-al-text-muted">Optional updates via email</p>
          </div>
          <AutoSubmitToggle name="emailEnabled" defaultChecked={settings.emailEnabled} label="Email notifications" />
        </form>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-al-border bg-al-surface-sunken p-3.5">
          <MessageSquare className="h-4 w-4 shrink-0 text-al-text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-al-text-muted">In-App Notifications</p>
            <p className="text-xs font-semibold text-al-text-muted">Not available yet</p>
          </div>
          <StatusPill tone="slate">Unavailable</StatusPill>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-al-border bg-al-surface-sunken p-3.5">
          <Smartphone className="h-4 w-4 shrink-0 text-al-text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-al-text-muted">Mobile Notifications</p>
            <p className="text-xs font-semibold text-al-text-muted">Not configured</p>
          </div>
          <StatusPill tone="slate">Unavailable</StatusPill>
        </div>
      </div>
      {showComplianceNote ? (
        <p className="mt-4 text-xs font-semibold leading-5 text-al-text-muted">
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
        <button type="button" onClick={onManage} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-al-border bg-al-surface-elevated px-4 text-sm font-bold text-al-text hover:border-al-accent/40">
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
            className="flex items-center gap-3 rounded-lg border border-al-border bg-al-surface-sunken p-3.5 text-left transition hover:border-al-accent/40"
          >
            <Icon className="h-4 w-4 shrink-0 text-al-text-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-al-text">{label}</p>
              <p className="truncate text-xs font-semibold text-al-text-muted">{value}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-al-text-muted" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Card>
  );
}

const THEME_OPTIONS: { key: ThemePreference; label: string; description: string; icon: typeof Moon }[] = [
  { key: 'dark', label: 'Dark', description: 'Deep, low-light workspace', icon: Moon },
  { key: 'light', label: 'Light', description: 'Bright, high-contrast workspace', icon: Sun },
  { key: 'system', label: 'System', description: 'Follow your device preference', icon: Monitor },
];

/**
 * A real, working appearance switcher - not a cosmetic card. Selecting an
 * option updates the entire application instantly via ThemeProvider's
 * applyTheme() (no Save/refresh needed), then persists through the real
 * server action; "Saved" only appears once that persistence actually
 * succeeds, and a failure reverts the instant preview rather than leaving
 * the UI claiming a choice that didn't actually save.
 */
function ThemeSwitcher({ updateThemeAction }: { updateThemeAction: (theme: ThemePreference) => Promise<UpdateThemePreferenceResult> }) {
  const { theme, applyTheme } = useTheme();
  const [pending, setPending] = useState<ThemePreference | null>(null);
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; message?: string } | null>(null);

  async function selectTheme(next: ThemePreference) {
    if (next === theme || pending) return;
    const previous = theme;
    setStatus(null);
    setPending(next);
    applyTheme(next);
    const result = await updateThemeAction(next);
    setPending(null);
    if (result.ok) {
      setStatus({ kind: 'saved' });
    } else {
      applyTheme(previous);
      setStatus({ kind: 'error', message: result.error });
    }
  }

  useEffect(() => {
    if (status?.kind !== 'saved') return;
    const timeout = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(timeout);
  }, [status]);

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-al-text-muted">Theme</p>
      <p className="mt-1 text-xs font-semibold text-al-text-muted">Choose how ApprovLine looks.</p>
      <div role="group" aria-label="Theme" className="mt-2.5 grid gap-2 sm:grid-cols-3">
        {THEME_OPTIONS.map(({ key, label, description, icon: Icon }) => {
          const selected = theme === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              aria-label={`${label} theme - ${description}`}
              onClick={() => selectTheme(key)}
              disabled={pending !== null}
              className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-al-focus disabled:cursor-not-allowed disabled:opacity-60 ${
                selected ? 'border-al-accent bg-al-accent/10' : 'border-al-border bg-al-surface-sunken hover:border-al-accent/40'
              }`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-al-accent' : 'text-al-text-muted'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-al-text">{label}</span>
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-al-accent" aria-hidden="true" /> : null}
                </span>
                <span className="block text-xs font-semibold text-al-text-muted">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs font-semibold" aria-live="polite">
        {pending ? <span className="text-al-text-muted">Saving…</span> : null}
        {!pending && status?.kind === 'saved' ? (
          <span className="inline-flex items-center gap-1 text-al-success">
            <Check className="h-3 w-3" aria-hidden="true" /> Saved
          </span>
        ) : null}
        {!pending && status?.kind === 'error' ? <span className="text-al-danger">{status.message ?? 'Your appearance preference could not be saved right now.'}</span> : null}
      </p>
    </div>
  );
}

function PreferencesCard({
  organizationName,
  showManageLink,
  onManage,
  updateThemeAction,
}: {
  organizationName: string;
  showManageLink: boolean;
  onManage: () => void;
  updateThemeAction: (theme: ThemePreference) => Promise<UpdateThemePreferenceResult>;
}) {
  return (
    <Card
      title="Appearance & Preferences"
      description="Customize your ApprovLine experience."
      action={
        showManageLink ? (
          <button type="button" onClick={onManage} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-al-border bg-al-surface-elevated px-4 text-sm font-bold text-al-text hover:border-al-accent/40">
            <Sliders className="h-3.5 w-3.5" aria-hidden="true" /> Manage Preferences
          </button>
        ) : null
      }
    >
      <ThemeSwitcher updateThemeAction={updateThemeAction} />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-al-border bg-al-surface-sunken p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-al-text-muted">Language</p>
          <p className="mt-1 text-sm font-bold text-al-text">English (US)</p>
          <p className="mt-1 text-xs font-semibold text-al-text-muted">ApprovLine doesn&apos;t support other languages yet.</p>
        </div>
        <div className="rounded-lg border border-al-border bg-al-surface-sunken p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-al-text-muted">Workspace</p>
          <p className="mt-1 truncate text-sm font-bold text-al-text">{organizationName}</p>
          <p className="mt-1 text-xs font-semibold text-al-text-muted">Each account belongs to a single workspace.</p>
        </div>
      </div>
    </Card>
  );
}

export function UserSettingsShell({
  data,
  updateProfileAction,
  updateNotificationsAction,
  updateThemeAction,
  revokeSessionAction,
}: {
  data: UserSettingsData;
  updateProfileAction: (formData: FormData) => Promise<void>;
  updateNotificationsAction: (formData: FormData) => Promise<void>;
  updateThemeAction: (theme: ThemePreference) => Promise<UpdateThemePreferenceResult>;
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
          <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Section</span>
          <select
            value={activeSection}
            onChange={(event) => setActiveSection(event.target.value as Section)}
            className="h-11 rounded-xl border border-al-border bg-al-surface px-3 text-sm font-bold text-al-text outline-none focus:border-al-focus"
          >
            {NAV_ITEMS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Left nav */}
      <nav className="hidden lg:block">
        <div className="grid gap-1.5 rounded-2xl border border-al-border bg-al-surface p-2">
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
                  isActive ? 'bg-al-accent/15 ring-1 ring-inset ring-al-accent/40' : 'hover:bg-al-surface-elevated'
                }`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? 'text-al-accent' : 'text-al-text-muted'}`} aria-hidden="true" />
                <span>
                  <span className={`block text-sm font-bold ${isActive ? 'text-al-accent' : 'text-al-text'}`}>{item.label}</span>
                  <span className="block text-xs font-semibold text-al-text-muted">{item.description}</span>
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
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-al-accent px-4 text-sm font-bold text-al-accent-text hover:bg-al-accent-hover"
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
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-al-accent/20 text-xl font-black text-al-accent">
                    {(profile.name ?? profile.email).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-lg font-black text-al-text">{profile.name ?? 'Unnamed user'}</p>
                  <p className="text-sm font-semibold text-al-text-muted">{profile.email}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    <button
                      type="button"
                      onClick={() => clerk.openUserProfile()}
                      className="inline-flex items-center gap-1 text-xs font-bold text-al-accent hover:text-al-accent-hover"
                    >
                      Change photo <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldColumn
                  fields={[
                    { label: 'Full Name', value: profile.name ?? 'Not set' },
                    { label: 'Email Address', value: profile.email || 'Not available' },
                    { label: 'Role', value: ROLE_LABELS[profile.role] },
                    { label: 'Department', value: profile.department ?? 'Not set' },
                    { label: 'Time Zone', value: profile.timezone ?? 'Not set' },
                  ]}
                />
                <FieldColumn
                  fields={[
                    { label: 'Job Title', value: profile.jobTitle ?? 'Not set' },
                    { label: 'Phone', value: profile.phone ?? 'Not set' },
                    { label: 'Location', value: profile.location ?? 'Not set' },
                    { label: 'Manager', value: profile.managerName ?? 'Not set' },
                    { label: 'Workspace', value: profile.organizationName },
                  ]}
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-al-text-muted">Member since {formatDate(profile.memberSince)}.</p>
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

            <PreferencesCard
              organizationName={profile.organizationName}
              showManageLink
              onManage={() => setActiveSection('preferences')}
              updateThemeAction={updateThemeAction}
            />
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
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-al-border bg-al-surface-elevated px-4 text-sm font-bold text-al-text hover:border-al-accent/40"
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
                      <p className="mt-2 text-xs font-semibold text-al-text-muted">
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
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-al-border bg-al-surface-elevated px-4 text-sm font-bold text-al-text hover:border-al-accent/40"
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
                <p className="text-sm font-semibold text-al-text-muted">No active sessions found.</p>
              ) : (
                <div className="grid gap-2">
                  {sessions.list.map((session) => (
                    <div key={session.id} className="flex flex-col gap-3 rounded-lg border border-al-border bg-al-surface-sunken p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-al-text-muted" aria-hidden="true" />
                        <div>
                          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-al-text">
                            {session.browserName ?? 'Unknown browser'}{session.deviceType ? ` · ${session.deviceType}` : ''}
                            {session.isCurrent ? <StatusPill tone="green">This device</StatusPill> : null}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-al-text-muted">
                            {[session.city, session.country].filter(Boolean).join(', ') || 'Location unavailable'}
                            {session.ipAddress ? ` · ${session.ipAddress}` : ''} · Active {formatRelative(session.lastActiveAt)}
                          </p>
                        </div>
                      </div>
                      {session.isCurrent ? (
                        <span className="text-xs font-bold text-al-text-muted">Current session</span>
                      ) : (
                        <form action={revokeSessionAction}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <FormSubmitButton
                            pendingText="Revoking…"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-al-border bg-al-surface-elevated px-4 text-xs font-black text-al-text hover:border-al-danger/40 hover:text-al-danger disabled:opacity-60"
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
                <p className="text-sm font-semibold text-al-text-muted">No recent security activity.</p>
              ) : (
                <div className="grid gap-2">
                  {securityActivity.list.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-al-border bg-al-surface-sunken px-3.5 py-2.5">
                      <span className="text-sm font-semibold text-al-text">{ACTIVITY_LABELS[event.action] ?? event.action}</span>
                      <span className="text-xs font-semibold text-al-text-muted">{formatRelative(event.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        ) : null}

        {activeSection === 'preferences' ? (
          <PreferencesCard
            organizationName={profile.organizationName}
            showManageLink={false}
            onManage={() => {}}
            updateThemeAction={updateThemeAction}
          />
        ) : null}

        {activeSection === 'sources' ? (
          <Card title="Connected Sources" description="Integrations connected to your organization.">
            {connectedSources.error ? (
              <ErrorNote message={connectedSources.error} />
            ) : connectedSources.list.length === 0 ? (
              <p className="text-sm font-semibold text-al-text-muted">No sources connected yet.</p>
            ) : (
              <div className="grid gap-2">
                {connectedSources.list.map((source) => (
                  <div key={source.key} className="flex items-center justify-between gap-3 rounded-lg border border-al-border bg-al-surface-sunken px-3.5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span style={{ backgroundColor: source.color }} className="h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
                      <span className="text-sm font-bold text-al-text">{source.label}</span>
                    </div>
                    <StatusPill tone={source.status === 'connected' ? 'green' : 'slate'}>
                      {source.status === 'connected' ? 'Connected' : 'Not connected'}
                    </StatusPill>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs font-semibold leading-5 text-al-text-muted">
              Sources are managed at the organization level.{' '}
              <PendingLink href="/dashboard/settings/integrations" pendingText="Opening…" className="font-bold text-al-accent hover:text-al-accent-hover">
                Manage integrations →
              </PendingLink>
            </p>
          </Card>
        ) : null}

        {activeSection === 'api' ? (
          <Card title="API Access" description="How ApprovLine's API and Universal Gateway are secured.">
            <div className="rounded-lg border border-al-border bg-al-surface-sunken p-4">
              <p className="text-sm font-bold text-al-text">No personal API credentials are configured for this workspace.</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-al-text-muted">
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
    <DetailDrawer open onClose={onClose} titleId={titleId} size="sm" className="bg-al-bg">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-al-border bg-al-surface-sunken px-5 py-4">
        <h2 id={titleId} className="text-lg font-black text-al-text">Edit Profile</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated hover:text-al-text-secondary">
          ✕
        </button>
      </div>
      <form action={action} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 gap-4 overflow-y-auto p-5">
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Full Name</span>
            <input
              name="fullName"
              value={form.fullName}
              onChange={(event) => set('fullName', event.target.value)}
              placeholder="Your full name"
              className="h-11 rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold text-al-text outline-none focus:border-al-focus"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Job Title</span>
            <input
              name="jobTitle"
              value={form.jobTitle}
              onChange={(event) => set('jobTitle', event.target.value)}
              placeholder="e.g. VP of Finance"
              className="h-11 rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold text-al-text outline-none focus:border-al-focus"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Department</span>
            <select
              name="department"
              value={form.department}
              onChange={(event) => set('department', event.target.value)}
              className="h-11 rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold text-al-text outline-none focus:border-al-focus"
            >
              <option value="">Not set</option>
              {profile.organizationDepartments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            {profile.organizationDepartments.length === 0 ? (
              <span className="text-xs font-semibold text-al-text-muted">Your organization hasn&apos;t configured any departments yet.</span>
            ) : null}
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Phone</span>
            <input
              name="phone"
              type="tel"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              placeholder="Not set"
              className="h-11 rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold text-al-text outline-none focus:border-al-focus"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Location</span>
            <input
              name="location"
              value={form.location}
              onChange={(event) => set('location', event.target.value)}
              placeholder="e.g. New York, NY"
              className="h-11 rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold text-al-text outline-none focus:border-al-focus"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Time Zone</span>
            <select
              name="timezone"
              value={form.timezone}
              onChange={(event) => set('timezone', event.target.value)}
              className="h-11 rounded-xl border border-al-border bg-al-surface px-3 text-sm font-semibold text-al-text outline-none focus:border-al-focus"
            >
              <option value="">Not set</option>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </label>
          <p className="text-xs font-semibold leading-5 text-al-text-muted">
            Email and profile photo are managed through your account portal. Role, manager, and workspace are managed by
            your organization.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-al-border bg-al-surface-sunken px-5 py-4">
          <FormSubmitButton
            pendingText="Saving…"
            disabled={!isDirty}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-al-accent px-5 text-sm font-bold text-al-accent-text hover:bg-al-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save changes
          </FormSubmitButton>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-al-border bg-al-surface-elevated px-5 text-sm font-bold text-al-text hover:border-al-accent/40"
          >
            Cancel
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}
