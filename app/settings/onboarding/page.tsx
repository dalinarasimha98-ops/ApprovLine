import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { PendingLink } from '@/components/system/PendingLink';
import { RefreshButton } from '@/components/system/RefreshButton';
import { getDashboardTenant } from '@/lib/auth';
import { isMigrationError, safeDiagnosticSummary } from '@/lib/prisma-errors';
import { buildOnboardingState } from '@/services/onboarding';
import { enforcePageRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 260) : 'Onboarding status could not load safely.';
}

function minutesAgo(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes === 0) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

export default async function OnboardingSettingsPage() {
  const tenant = await getDashboardTenant(3000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/settings', tenant.user.role);

  let state: Awaited<ReturnType<typeof buildOnboardingState>> | null = null;
  let error: string | null = null;
  try {
    state = await buildOnboardingState(tenant.organization.id);
  } catch (cause) {
    error = safeError(cause);
  }

  if (error) {
    return (
      <main className="min-h-screen bg-al-bg px-4 py-8 text-al-text sm:px-6">
        <section className="mx-auto grid max-w-5xl gap-5 rounded-[28px] border border-al-warning/30 bg-al-surface p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-al-warning">Onboarding Management</p>
          <h1 className="text-2xl font-black text-al-text">
            {isMigrationError(error) ? 'Onboarding storage is not ready yet' : 'We could not load onboarding status this time'}
          </h1>
          <p className="text-sm leading-6 text-al-text-secondary">
            {isMigrationError(error)
              ? 'Run npm run db:deploy in production to enable onboarding tables.'
              : 'The database did not respond in time. This is usually transient - retry in a moment.'}
          </p>
          <p className="rounded-xl bg-al-warning/10 p-3 text-xs font-bold text-al-warning">Safe diagnostic: {safeDiagnosticSummary(error)}</p>
          <div className="flex flex-wrap gap-3">
            <PendingLink href="/settings/onboarding" pendingText="Retrying..." className="inline-flex w-fit rounded-xl bg-al-accent px-5 py-3 text-sm font-black text-white">
              Retry
            </PendingLink>
            <Link href="/dashboard/settings" className="inline-flex w-fit rounded-xl border border-al-border bg-al-surface px-5 py-3 text-sm font-black text-al-text-secondary">
              Back to settings
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (!state) return null;

  const organization = state.organization;
  const readiness = state.readiness;

  return (
    <main className="min-h-screen bg-al-bg px-4 py-8 text-al-text sm:px-6">
      <section className="mx-auto grid max-w-5xl gap-6">
        <div className="rounded-[28px] border border-al-border bg-al-surface p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-al-accent">Onboarding Management</p>
          <div className="mt-2 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-al-text">Workspace setup status</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-al-text-secondary">
                Continue setup, review completed steps, or restart the customer onboarding wizard.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={organization.onboardedAt ? '/onboarding?restart=1' : '/onboarding'} className="rounded-xl bg-al-accent px-5 py-3 text-sm font-black text-white shadow-sm shadow-blue-200">
                {organization.onboardedAt ? 'Restart onboarding' : 'Continue onboarding'}
              </Link>
              <Link href="/dashboard/settings" className="rounded-xl border border-al-border bg-al-surface px-5 py-3 text-sm font-black text-al-text-secondary shadow-sm">
                Back to settings
              </Link>
            </div>
          </div>
        </div>

        {state.message ? (
          <div className={state.alert ? 'rounded-2xl border border-al-warning/30 bg-al-warning/10 p-4 text-al-warning shadow-sm' : 'rounded-2xl border border-al-border bg-al-surface p-4 text-al-text-secondary shadow-sm'}>
            {state.alert ? <AutoRetryOnDegraded /> : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={state.alert ? 'text-sm font-black text-al-warning' : 'text-sm font-black text-al-text'}>
                  {state.alert ? 'Onboarding status is recovering' : 'Refreshing...'}
                </p>
                <p className="mt-1 text-sm leading-6">{state.message}</p>
              </div>
              <RefreshButton className="inline-flex h-10 items-center gap-2 rounded-lg border border-al-border bg-al-surface px-4 text-sm font-bold text-al-text-secondary disabled:opacity-70" />
            </div>
          </div>
        ) : null}
        {!state.message && state.staleAsOfMs ? (
          <p className="-mt-2 text-xs font-bold text-al-text-muted">Last updated {minutesAgo(state.staleAsOfMs)}.</p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Readiness score" value={`${readiness.score}%`} />
          <Metric label="Current step" value={`${organization.onboardingStep}/10`} />
          <Metric label="Last saved" value={organization.onboardingLastSavedAt ? organization.onboardingLastSavedAt.toLocaleString() : 'Not saved yet'} />
        </div>

        <div className="rounded-[28px] border border-al-border bg-al-surface p-6 shadow-sm">
          <h2 className="text-xl font-black text-al-text">Completed steps</h2>
          <div className="mt-5 grid gap-3">
            {readiness.checks.map((check) => (
              <div key={check.key} className="flex items-center justify-between gap-4 rounded-2xl border border-al-border p-4">
                <div>
                  <p className="font-black text-al-text">{check.label}</p>
                  <p className="text-sm text-al-text-muted">{check.complete ? 'Ready for go-live validation.' : 'Still needs administrator attention.'}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${check.complete ? 'bg-al-success/10 text-al-success' : 'bg-al-warning/10 text-al-warning'}`}>
                  {check.complete ? 'Complete' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-al-info/20 bg-al-info/10/70 p-6">
          <h2 className="text-xl font-black text-al-text">Founder visibility</h2>
          <p className="mt-2 text-sm leading-6 text-al-text-secondary">
            Time-to-complete, step saves, completion, and abandonment are tracked through organization readiness fields and `onboarding.*` audit events for Founder Control Center reporting.
          </p>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-al-border bg-al-surface p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-al-text">{value}</p>
    </div>
  );
}
