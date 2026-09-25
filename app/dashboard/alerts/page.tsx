import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Suspense } from 'react';
import Link from 'next/link';
import { ShieldAlert, AlertTriangle, TrendingUp, Search } from 'lucide-react';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { RefreshButton } from '@/components/system/RefreshButton';
import { CardSkeleton } from '@/components/system/Skeletons';
import { getDashboardTenant } from '@/lib/auth';
import { createInvestigationCase } from '@/services/investigations';
import {
  dismissApprovalAlert,
  escalateApprovalAlert,
  acknowledgeApprovalAlert,
  getApprovalAlerts,
  type ApprovalAlert,
} from '@/services/alerts';
import { enforcePageRole } from '@/lib/rbac';
import { SeverityBadge, OperationalStatusBadge } from '@/components/dashboard/alerts/AlertStatusBadge';
import { AlertsTableClient } from '@/components/dashboard/alerts/AlertsTableClient';

export const dynamic = 'force-dynamic';

const AUTO_RETRY_INTERVAL_MS = 30_000;

type AlertsPageProps = {
  searchParams: Promise<{
    severity?: string;
    approvalType?: string;
    from?: string;
    to?: string;
    q?: string;
    department?: string;
    sourcePlatform?: string;
    status?: string;
  }>;
};

// ── Auth helper ───────────────────────────────────────────────────────────────
async function requireOrganizationId() {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/dashboard');
  enforcePageRole('/dashboard/alerts', tenant.user.role);
  return { organizationId: tenant.organization.id, actorUserId: tenant.user.id };
}

// ── Server actions ────────────────────────────────────────────────────────────

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

async function acknowledgeAlertAction(formData: FormData) {
  'use server';
  const { organizationId, actorUserId } = await requireOrganizationId();
  const approvalId = String(formData.get('approvalId') ?? '');
  if (approvalId) await acknowledgeApprovalAlert({ organizationId, actorUserId, approvalId });
  revalidatePath('/dashboard/alerts');
}

// ── Degraded banner ───────────────────────────────────────────────────────────
function DegradedBanner({ message, alert }: { message: string; alert: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-al-warning/30 bg-al-warning/10 text-al-warning' : 'border-al-border bg-al-surface text-al-text-secondary'}`}>
      {alert ? <AutoRetryOnDegraded intervalMs={AUTO_RETRY_INTERVAL_MS} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-sm font-black ${alert ? 'text-al-warning' : 'text-al-text'}`}>
            {alert ? 'Alerts are recovering' : 'Refreshing alerts…'}
          </p>
          <p className="mt-1 text-sm leading-5">{message}</p>
        </div>
        <RefreshButton className="inline-flex h-9 items-center gap-2 rounded-lg border border-al-border bg-al-surface px-3 text-sm font-bold text-al-text-secondary disabled:opacity-70" />
      </div>
    </div>
  );
}

// ── KPI metrics row ───────────────────────────────────────────────────────────
type KpiMetric = {
  label: string;
  value: number;
  href: string;
  colorClass: string;
  dotClass: string;
  desc: string;
};

function KpiCard({ metric, active }: { metric: KpiMetric; active: boolean }) {
  return (
    <Link
      href={metric.href}
      className={`group rounded-xl border bg-al-surface p-4 shadow-sm transition hover:shadow-md ${active ? 'ring-2 ring-al-accent/30 border-al-accent/30' : 'border-al-border'}`}
    >
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${metric.colorClass}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${metric.dotClass}`} />
        {metric.label}
      </div>
      <p className="mt-3 text-3xl font-black tabular-nums tracking-tight text-al-text">{metric.value}</p>
      <p className="mt-1 text-[11px] text-al-text-muted">{metric.desc}</p>
    </Link>
  );
}

async function AlertMetricsRow({ filters }: { filters: Awaited<AlertsPageProps['searchParams']> }) {
  const { organizationId } = await requireOrganizationId();
  const result = await getApprovalAlerts(organizationId, filters);

  const baseUrl = '/dashboard/alerts';
  const qs = (params: Record<string, string>) => {
    const p = new URLSearchParams(params);
    return `${baseUrl}?${p.toString()}`;
  };

  const metrics: KpiMetric[] = [
    {
      label: 'Critical',
      value: result.severityCounts.Critical,
      href: qs({ severity: 'critical' }),
      colorClass: 'border-al-danger/30 bg-al-danger/10 text-al-danger',
      dotClass: 'bg-al-danger',
      desc: 'Needs immediate attention',
    },
    {
      label: 'High',
      value: result.severityCounts.High,
      href: qs({ severity: 'high' }),
      colorClass: 'border-al-warning/30 bg-al-warning/10 text-al-warning',
      dotClass: 'bg-al-warning',
      desc: 'Requires prompt review',
    },
    {
      label: 'Open',
      value: result.openCount,
      href: qs({ status: 'open' }),
      colorClass: 'border-orange-200 bg-orange-50 text-orange-700',
      dotClass: 'bg-orange-500 animate-pulse',
      desc: 'Unassigned, not escalated',
    },
    {
      label: 'Escalated',
      value: result.escalatedCount,
      href: qs({ status: 'escalated' }),
      colorClass: 'border-al-accent/30 bg-al-accent/10 text-al-accent',
      dotClass: 'bg-al-accent-hover',
      desc: 'Sent to senior review',
    },
    {
      label: 'Investigating',
      value: result.investigatingCount,
      href: qs({ status: 'investigating' }),
      colorClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      dotClass: 'bg-indigo-500',
      desc: 'Active investigation case',
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m) => (
          <KpiCard
            key={m.label}
            metric={m}
            active={
              (m.label === 'Critical' && filters.severity === 'critical') ||
              (m.label === 'High' && filters.severity === 'high') ||
              (m.label === 'Open' && filters.status === 'open') ||
              (m.label === 'Escalated' && filters.status === 'escalated') ||
              (m.label === 'Investigating' && filters.status === 'investigating')
            }
          />
        ))}
      </div>
      {result.staleAsOfMs ? (
        <p className="text-[11px] text-al-text-muted">
          Last refreshed {Math.max(0, Math.round((Date.now() - result.staleAsOfMs) / 60_000))}m ago.
        </p>
      ) : null}
    </div>
  );
}

// ── Attention queue (top critical / high alerts) ──────────────────────────────
function AttentionItem({
  alert,
  investigateAction,
}: {
  alert: ApprovalAlert;
  investigateAction: (fd: FormData) => Promise<void>;
}) {
  const borderColor = alert.severity === 'Critical' ? 'border-al-danger/30' : 'border-al-warning/30';
  const stripColor = alert.severity === 'Critical' ? 'bg-al-danger' : 'bg-al-warning';

  return (
    <div className={`relative overflow-hidden rounded-xl border ${borderColor} bg-al-surface shadow-sm`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${stripColor}`} />
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 pl-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} score={alert.riskScore} />
            {alert.escalated ? <OperationalStatusBadge escalated={true} investigating={false} acknowledged={false} /> : null}
          </div>
          <h4 className="mt-2 text-sm font-black text-al-text">{alert.subject}</h4>
          <p className="mt-1 text-[12px] text-al-text-muted">
            {alert.department ?? 'Unknown'} · {alert.approverName ?? 'Unknown approver'}
            {alert.reasons[0] ? ` · ${alert.reasons[0]}` : ''}
          </p>
          {alert.complianceExplanation ? (
            <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-al-text-secondary">{alert.complianceExplanation}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <PendingLink
            href={`/approvals/${alert.id}`}
            pendingText="Opening…"
            className="inline-flex h-9 items-center rounded-lg border border-al-border px-3 text-xs font-black text-al-text-secondary hover:bg-al-surface-sunken"
          >
            View approval
          </PendingLink>
          <form action={investigateAction}>
            <input type="hidden" name="approvalId" value={alert.id} />
            <FormSubmitButton pendingText="Opening case…" className="min-h-0 h-9 rounded-lg bg-al-accent px-3 text-xs font-black text-white shadow-sm shadow-blue-200">
              Investigate
            </FormSubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main alerts list (table) ──────────────────────────────────────────────────
async function AlertsList({
  filters,
  investigateAction,
  escalateAction,
  dismissAction,
  acknowledgeAction,
}: {
  filters: Awaited<AlertsPageProps['searchParams']>;
  investigateAction: (fd: FormData) => Promise<void>;
  escalateAction: (fd: FormData) => Promise<void>;
  dismissAction: (fd: FormData) => Promise<void>;
  acknowledgeAction: (fd: FormData) => Promise<void>;
}) {
  const { organizationId } = await requireOrganizationId();
  const result = await getApprovalAlerts(organizationId, filters);

  if (result.message) {
    return <DegradedBanner message={result.message} alert={result.alert} />;
  }

  if (result.alerts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-al-success/30 bg-al-success/10/60 p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-al-success/15">
          <ShieldAlert className="h-5 w-5 text-al-success" />
        </div>
        <h3 className="mt-4 text-base font-black text-al-text">No active alerts</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-al-text-muted">
          {result.dismissedCount > 0
            ? `${result.dismissedCount} alert${result.dismissedCount === 1 ? '' : 's'} dismissed. Nothing else currently requires review.`
            : 'No high-risk or policy-violating approvals are currently flagged.'}
        </p>
        {Object.values(filters).some(Boolean) ? (
          <PendingLink href="/dashboard/alerts" pendingText="Clearing…" className="mt-4 inline-flex h-9 items-center rounded-lg border border-al-border bg-al-surface px-4 text-sm font-bold text-al-text-secondary">
            Clear filters
          </PendingLink>
        ) : null}
      </div>
    );
  }

  const attentionItems = result.alerts
    .filter((a) => (a.severity === 'Critical' || a.severity === 'High') && !a.investigating)
    .slice(0, 3);

  return (
    <div className="grid gap-4">
      {/* Attention Required queue */}
      {attentionItems.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-al-warning" />
            <h3 className="text-sm font-black text-al-text">Attention Required</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-al-warning">{attentionItems.length}</span>
          </div>
          <div className="grid gap-3">
            {attentionItems.map((alert) => (
              <AttentionItem key={alert.id} alert={alert} investigateAction={investigateAction} />
            ))}
          </div>
          <div className="mt-4 mb-1 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-al-text-muted" />
            <h3 className="text-sm font-black text-al-text">All Alerts</h3>
            <span className="rounded-full bg-al-surface-elevated px-2 py-0.5 text-[10px] font-semibold text-al-text-secondary">{result.alerts.length}</span>
          </div>
        </section>
      ) : null}

      {/* Operational table */}
      <AlertsTableClient
        alerts={result.alerts}
        investigateAction={investigateAction}
        escalateAction={escalateAction}
        dismissAction={dismissAction}
        acknowledgeAction={acknowledgeAction}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const filters = await searchParams;
  const cacheKey = JSON.stringify(filters);
  const hasActiveFilter = Object.values(filters).some(Boolean);

  return (
    <section className="grid gap-5">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-al-text-muted" />
            <h2 className="text-xl font-black tracking-tight text-white">Alerts &amp; Risks</h2>
          </div>
          <p className="mt-1 text-sm text-al-text-muted">
            Monitor, investigate, and resolve approval risks across your organization.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PendingLink
            href="/investigations"
            pendingText="Opening…"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-al-surface/[0.06] px-3 text-xs font-bold text-al-text-secondary hover:bg-al-surface/[0.1]"
          >
            Investigation Center
          </PendingLink>
          <PendingLink
            href="/dashboard/audit"
            pendingText="Opening…"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-al-surface/[0.06] px-3 text-xs font-bold text-al-text-secondary hover:bg-al-surface/[0.1]"
          >
            Export
          </PendingLink>
          <RefreshButton className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-al-surface/[0.06] px-3 text-xs font-bold text-al-text-secondary disabled:opacity-50 hover:bg-al-surface/[0.1]" />
        </div>
      </div>

      {/* KPI metrics */}
      <Suspense key={`metrics-${cacheKey}`} fallback={<CardSkeleton rows={1} />}>
        <AlertMetricsRow filters={filters} />
      </Suspense>

      {/* Filter bar */}
      <form className="rounded-xl border border-white/[0.07] bg-al-surface/[0.04] p-4 backdrop-blur-sm">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <label className="xl:col-span-2 grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-al-text-muted">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-al-text-muted" />
              <input
                name="q"
                type="search"
                defaultValue={filters.q ?? ''}
                placeholder="Alert title, approver, department…"
                className="h-10 w-full rounded-lg border border-white/10 bg-al-surface/[0.07] pl-9 pr-3 text-sm font-semibold text-al-text placeholder-slate-500 outline-none focus:border-al-accent/60 focus:ring-2 focus:ring-al-focus/25"
              />
            </div>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-al-text-muted">Severity</span>
            <select name="severity" defaultValue={filters.severity ?? ''} className="h-10 rounded-lg border border-white/10 bg-al-surface/[0.07] px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60">
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-al-text-muted">Status</span>
            <select name="status" defaultValue={filters.status ?? ''} className="h-10 rounded-lg border border-white/10 bg-al-surface/[0.07] px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60">
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="escalated">Escalated</option>
              <option value="investigating">Investigating</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-al-text-muted">Type</span>
            <select name="approvalType" defaultValue={filters.approvalType ?? ''} className="h-10 rounded-lg border border-white/10 bg-al-surface/[0.07] px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60">
              <option value="">All types</option>
              <option value="EXPLICIT">Explicit</option>
              <option value="IMPLICIT">Implicit</option>
              <option value="CONDITIONAL">Conditional</option>
              <option value="REJECTION">Rejection</option>
              <option value="ESCALATION">Escalation</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-al-text-muted">Source</span>
            <select name="sourcePlatform" defaultValue={filters.sourcePlatform ?? ''} className="h-10 rounded-lg border border-white/10 bg-al-surface/[0.07] px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60">
              <option value="">All sources</option>
              <option value="slack">Slack</option>
              <option value="gmail">Gmail</option>
              <option value="teams">Teams</option>
              <option value="jira">Jira</option>
              <option value="zoom">Zoom</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-3">
          <label className="flex items-center gap-2 text-[11px] text-al-text-muted">
            <span className="text-[10px] font-bold uppercase tracking-widest">From</span>
            <input name="from" type="date" defaultValue={filters.from ?? ''} className="h-8 rounded-lg border border-white/10 bg-al-surface/[0.07] px-2 text-sm text-al-text outline-none focus:border-al-accent/60" />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-al-text-muted">
            <span className="text-[10px] font-bold uppercase tracking-widest">To</span>
            <input name="to" type="date" defaultValue={filters.to ?? ''} className="h-8 rounded-lg border border-white/10 bg-al-surface/[0.07] px-2 text-sm text-al-text outline-none focus:border-al-accent/60" />
          </label>
          <div className="ml-auto flex gap-2">
            {hasActiveFilter ? (
              <PendingLink href="/dashboard/alerts" pendingText="Clearing…" className="inline-flex h-9 items-center rounded-lg border border-white/10 px-4 text-sm font-bold text-al-text-secondary hover:bg-al-surface/[0.06]">
                Clear
              </PendingLink>
            ) : null}
            <FormSubmitButton pendingText="Filtering…" className="min-h-0 h-9 rounded-lg bg-al-accent px-5 text-sm font-bold text-white shadow-sm shadow-blue-900">
              Apply
            </FormSubmitButton>
          </div>
        </div>
      </form>

      {/* Alerts list */}
      <Suspense key={`alerts-${cacheKey}`} fallback={<CardSkeleton rows={5} />}>
        <AlertsList
          filters={filters}
          investigateAction={investigateAlertAction}
          escalateAction={escalateAlertAction}
          dismissAction={dismissAlertAction}
          acknowledgeAction={acknowledgeAlertAction}
        />
      </Suspense>
    </section>
  );
}
