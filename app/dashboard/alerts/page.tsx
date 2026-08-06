import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Suspense } from 'react';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { RefreshButton } from '@/components/system/RefreshButton';
import { CardSkeleton } from '@/components/system/Skeletons';
import { getDashboardTenant } from '@/lib/auth';
import { createInvestigationCase } from '@/services/investigations';
import { dismissApprovalAlert, escalateApprovalAlert, getApprovalAlerts, type ApprovalAlert } from '@/services/alerts';

export const dynamic = 'force-dynamic';

const AUTO_RETRY_INTERVAL_MS = 30_000;

type AlertsPageProps = {
  searchParams: Promise<{
    severity?: string;
    approvalType?: string;
    from?: string;
    to?: string;
  }>;
};

function dateText(value: Date) {
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function minutesAgo(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes === 0) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

function severityClass(severity: string) {
  if (severity === 'Critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (severity === 'High') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (severity === 'Medium') return 'border-blue-200 bg-blue-50 text-[#2155d9]';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'amber' | 'blue' | 'emerald' }) {
  const toneClass = {
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-[#2155d9]',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${toneClass}`}>{label}</div>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

async function requireOrganizationId() {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');
  return { organizationId: tenant.organization.id, actorUserId: tenant.user?.id };
}

async function investigateAlertAction(formData: FormData) {
  'use server';
  const { organizationId } = await requireOrganizationId();
  const approvalId = String(formData.get('approvalId') ?? '');
  if (!approvalId) redirect('/dashboard/alerts');

  const investigation = await createInvestigationCase({ organizationId, approvalIds: [approvalId] }).catch(() => null);
  if (!investigation) redirect('/dashboard/alerts');
  redirect(`/investigations/${investigation.id}`);
}

async function escalateAlertAction(formData: FormData) {
  'use server';
  const { organizationId, actorUserId } = await requireOrganizationId();
  const approvalId = String(formData.get('approvalId') ?? '');
  if (approvalId) await escalateApprovalAlert({ organizationId, actorUserId, approvalId });
  revalidatePath('/dashboard/alerts');
}

async function dismissAlertAction(formData: FormData) {
  'use server';
  const { organizationId, actorUserId } = await requireOrganizationId();
  const approvalId = String(formData.get('approvalId') ?? '');
  if (approvalId) await dismissApprovalAlert({ organizationId, actorUserId, approvalId });
  revalidatePath('/dashboard/alerts');
}

function DegradedNotice({ message, alert }: { message: string; alert: boolean }) {
  return (
    <div className={alert ? 'rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm' : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm'}>
      {alert ? <AutoRetryOnDegraded intervalMs={AUTO_RETRY_INTERVAL_MS} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={alert ? 'text-sm font-black text-amber-950' : 'text-sm font-black text-slate-950'}>
            {alert ? 'Alerts are recovering' : 'Refreshing...'}
          </p>
          <p className="mt-1 text-sm leading-6">{message}</p>
        </div>
        <RefreshButton className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-70" />
      </div>
    </div>
  );
}

/**
 * Both alert sections below independently call getApprovalAlerts() rather
 * than threading one shared result through props — safe and cheap because
 * the underlying fetch is deduped per-request (see services/alerts.ts's
 * React cache() wrapper), and it keeps each visual section self-contained
 * in its own Suspense boundary with its own skeleton and inline recovery
 * state, matching the pattern already used on Compliance Hub.
 */
async function AlertSeverityCards({ filters }: { filters: AlertsPageProps['searchParams'] extends Promise<infer T> ? T : never }) {
  const { organizationId } = await requireOrganizationId();
  const result = await getApprovalAlerts(organizationId, filters);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Critical" value={result.severityCounts.Critical} tone="rose" />
        <MetricCard label="High" value={result.severityCounts.High} tone="amber" />
        <MetricCard label="Medium" value={result.severityCounts.Medium} tone="blue" />
        <MetricCard label="Low" value={result.severityCounts.Low} tone="emerald" />
      </div>
      {result.message ? <DegradedNotice message={result.message} alert={result.alert} /> : null}
      {!result.message && result.staleAsOfMs ? (
        <p className="-mt-2 text-xs font-bold text-slate-400">Last updated {minutesAgo(result.staleAsOfMs)}.</p>
      ) : null}
    </div>
  );
}

function AlertCard({ alert }: { alert: ApprovalAlert }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${severityClass(alert.severity)}`}>{alert.severity} · {alert.riskScore}</span>
            {alert.escalated ? <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-black uppercase text-violet-700">Escalated</span> : null}
          </div>
          <h3 className="mt-3 text-lg font-black text-slate-950">{alert.subject}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {alert.department ?? 'Unassigned'} · {alert.approverName ?? 'Unknown approver'} · {alert.sourcePlatform ?? 'unknown'} · {dateText(alert.occurredAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {alert.reasons.map((reason) => (
              <span key={reason} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{reason}</span>
            ))}
          </div>
          {alert.complianceExplanation ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <b>Playbook finding ({alert.complianceSeverity ?? 'unscored'}):</b> {alert.complianceExplanation}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <PendingLink href={`/approvals/${alert.id}`} pendingText="Opening..." className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
            View approval
          </PendingLink>
          <form action={investigateAlertAction}>
            <input type="hidden" name="approvalId" value={alert.id} />
            <FormSubmitButton pendingText="Opening case..." className="min-h-0 h-9 w-full rounded-lg bg-[#2155d9] px-3 text-xs font-black text-white shadow-sm shadow-blue-200">
              Investigate
            </FormSubmitButton>
          </form>
          <div className="flex gap-2">
            <form action={escalateAlertAction} className="flex-1">
              <input type="hidden" name="approvalId" value={alert.id} />
              <FormSubmitButton pendingText="Escalating..." className="min-h-0 h-9 w-full rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-700">
                Escalate
              </FormSubmitButton>
            </form>
            <form action={dismissAlertAction} className="flex-1">
              <input type="hidden" name="approvalId" value={alert.id} />
              <FormSubmitButton pendingText="Dismissing..." className="min-h-0 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-600">
                Dismiss
              </FormSubmitButton>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

async function AlertsList({ filters }: { filters: AlertsPageProps['searchParams'] extends Promise<infer T> ? T : never }) {
  const { organizationId } = await requireOrganizationId();
  const result = await getApprovalAlerts(organizationId, filters);

  if (result.alerts.length === 0) {
    if (result.message) return null; // DegradedNotice already rendered by AlertSeverityCards
    return (
      <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-10 text-center shadow-sm">
        <h3 className="text-lg font-black text-slate-950">No active alerts</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          {result.dismissedCount > 0
            ? `${result.dismissedCount} alert${result.dismissedCount === 1 ? '' : 's'} dismissed. Nothing else is currently flagged for review.`
            : 'No high-risk, conditional, pending, or evidence-incomplete approvals right now.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {result.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
    </div>
  );
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const filters = await searchParams;
  const severityKey = JSON.stringify(filters);

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Alerts & Risks</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight">Active risk signals requiring attention</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
          High-risk, conditional, pending, and evidence-incomplete approvals surfaced from your live approval records — triage them here, or convert one into a full Investigation Center case.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <PendingLink href="/investigations" pendingText="Opening..." className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.08] px-4 text-sm font-black text-white">
            Open Investigation Center
          </PendingLink>
        </div>
      </div>

      <Suspense key={`cards-${severityKey}`} fallback={<CardSkeleton rows={2} />}>
        <AlertSeverityCards filters={filters} />
      </Suspense>

      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Severity</span>
          <select name="severity" defaultValue={filters.severity ?? ''} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100">
            <option value="">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Approval type</span>
          <select name="approvalType" defaultValue={filters.approvalType ?? ''} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100">
            <option value="">All</option>
            <option value="EXPLICIT">Explicit</option>
            <option value="IMPLICIT">Implicit</option>
            <option value="CONDITIONAL">Conditional</option>
            <option value="REJECTION">Rejection</option>
            <option value="ESCALATION">Escalation</option>
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">From</span>
          <input name="from" type="date" defaultValue={filters.from ?? ''} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">To</span>
          <input name="to" type="date" defaultValue={filters.to ?? ''} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
        </label>
        <div className="flex items-end gap-2">
          <FormSubmitButton pendingText="Filtering..." className="min-h-0 h-11 rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200">
            Apply
          </FormSubmitButton>
          <PendingLink href="/dashboard/alerts" pendingText="Clearing..." className="inline-flex h-11 items-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">
            Clear
          </PendingLink>
        </div>
      </form>

      <Suspense key={`list-${severityKey}`} fallback={<CardSkeleton rows={4} />}>
        <AlertsList filters={filters} />
      </Suspense>
    </section>
  );
}
