'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { Pencil, ShieldCheck, Sliders, Link2, ExternalLink, Monitor } from 'lucide-react';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { ROLE_LABELS } from '@/lib/rbac';
import type { UserSettingsData } from '@/services/userSettings';

type Section = 'profile' | 'security' | 'preferences' | 'sources';

const NAV_ITEMS: { key: Section; label: string; description: string; icon: typeof Pencil }[] = [
  { key: 'profile', label: 'Profile', description: 'Your personal information', icon: Pencil },
  { key: 'security', label: 'Security', description: 'Password, 2FA, and sessions', icon: ShieldCheck },
  { key: 'preferences', label: 'Preferences', description: 'Appearance and workspace', icon: Sliders },
  { key: 'sources', label: 'Connected Sources', description: 'Your organization’s integrations', icon: Link2 },
];

function isSection(value: string | null): value is Section {
  return value === 'profile' || value === 'security' || value === 'preferences' || value === 'sources';
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

export function UserSettingsShell({
  data,
  updateProfileAction,
  revokeSessionAction,
}: {
  data: UserSettingsData;
  updateProfileAction: (formData: FormData) => Promise<void>;
  revokeSessionAction: (formData: FormData) => Promise<void>;
}) {
  const searchParams = useSearchParams();
  const initialSection = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<Section>(isSection(initialSection) ? initialSection : 'profile');
  const [editOpen, setEditOpen] = useState(false);
  const clerk = useClerk();

  const profileError = searchParams.get('profile') === 'error' ? searchParams.get('profileError') : null;
  const sessionError = searchParams.get('session') === 'error' ? searchParams.get('sessionError') : null;

  const { profile, security, sessions, connectedSources } = data;

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
        {searchParams.get('profile') === 'success' ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300">Profile updated.</div>
        ) : null}

        {activeSection === 'profile' ? (
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
                <button
                  type="button"
                  onClick={() => clerk.openUserProfile()}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-violet-400 hover:text-violet-300"
                >
                  Change photo <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Full Name" value={profile.name ?? 'Not set'} />
              <Field label="Email Address" value={profile.email || 'Not available'} />
              <Field label="Role" value={ROLE_LABELS[profile.role]} />
              <Field label="Workspace" value={profile.organizationName} />
              <Field label="Member Since" value={formatDate(profile.memberSince)} />
            </dl>
          </Card>
        ) : null}

        {activeSection === 'security' ? (
          <div className="grid gap-4">
            {sessionError ? <ErrorNote message={sessionError} /> : null}
            {searchParams.get('session') === 'success' ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300">Session revoked.</div>
            ) : null}

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
          </div>
        ) : null}

        {activeSection === 'preferences' ? (
          <Card title="Appearance & Workspace" description="Customize your ApprovLine experience.">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">Theme</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[#E8EEFF]">Dark</dd>
                <dd className="mt-1 text-xs font-semibold text-[#6B7FA8]">ApprovLine currently supports dark mode only.</dd>
              </div>
              <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">Workspace</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[#E8EEFF]">{profile.organizationName}</dd>
                <dd className="mt-1 text-xs font-semibold text-[#6B7FA8]">Each account belongs to a single workspace.</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs font-semibold leading-5 text-[#6B7FA8]">
              Language and timezone preferences aren&apos;t available yet.
            </p>
          </Card>
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
      </div>

      {editOpen ? (
        <EditProfileDrawer
          currentName={profile.name}
          onClose={() => setEditOpen(false)}
          action={updateProfileAction}
        />
      ) : null}
    </div>
  );
}

function EditProfileDrawer({
  currentName,
  onClose,
  action,
}: {
  currentName: string | null;
  onClose: () => void;
  action: (formData: FormData) => Promise<void>;
}) {
  const titleId = 'edit-profile-title';
  const [name, setName] = useState(currentName ?? '');
  const trimmed = name.trim();
  const isDirty = trimmed.length > 0 && trimmed !== (currentName ?? '');

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
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your full name"
              className="h-11 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            />
          </label>
          <p className="text-xs font-semibold leading-5 text-[#6B7FA8]">
            Email and profile photo are managed through your account portal.
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
