import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Cable,
  CheckCircle2,
  Clock3,
  CreditCard,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { Role } from '@prisma/client';
import { hasAnyRole } from '@/lib/rbac';
import { ApprovalTable, type ApprovalTableRecord } from '@/components/dashboard/ApprovalTable';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { sourceMeta } from '@/lib/source-badges';
import {
  describeAuditAction,
  type ActivityGranularity,
  type DashboardOverview,
  type DashboardRangeKey,
} from '@/services/dashboard';

/**
 * Pure, Clerk/Prisma-independent presentation layer for the Organization
 * Dashboard. app/dashboard/page.tsx (a Server Component) does all the
 * tenant resolution and data fetching, then renders this component with
 * plain props - separated out specifically so it can be rendered directly
 * (via react-dom/server's renderToStaticMarkup, the same pattern
 * tests/approval-detail-render.test.ts already uses for ManualApprovalPanel)
 * with real seeded data for visual/responsive verification in an
 * environment with no Clerk credentials, without needing a live
 * authenticated request.
 */

const panelClass = 'rounded-lg border border-white/[0.09] bg-al-surface-sunken shadow-[0_12px_36px_rgba(0,0,0,.16)]';
const palette = ['#2f7cff', '#49c78e', '#7c6cf2', '#f58b3d', '#46b6df', '#aeb9c8', '#e05f8a', '#8a97a8'];

export type RawSearchParams = Record<string, string | string[] | undefined>;
export function str(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compact(value: number) {
  return new Intl.NumberFormat('en-US', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

// --- KPI card ----------------------------------------------------------------

/** Whether an increase in this metric is good or bad news - controls trend
 *  badge color. Total Approvals up = green; High Risk Approvals up = red. */
type GoodDirection = 'up' | 'down' | 'neutral';

function trendBadge(current: number, previous: number | null, goodDirection: GoodDirection) {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: '0%', positive: null as boolean | null };
  const isIncrease = pct > 0;
  const positive = goodDirection === 'neutral' ? null : goodDirection === 'up' ? isIncrease : !isIncrease;
  return { text: `${isIncrease ? '↑' : '↓'} ${Math.abs(pct)}%`, positive };
}

function KpiCard({
  label,
  value,
  unit,
  context,
  trend,
  color,
  icon,
  href,
  linkLabel,
}: {
  label: string;
  value: string;
  unit?: string;
  context: string;
  trend?: { text: string; positive: boolean | null } | null;
  color: string;
  icon: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <article className={`${panelClass} relative min-h-[116px] overflow-hidden p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-al-text-muted">{label}</p>
          <p className="mt-1 text-[24px] font-bold leading-none tracking-tight text-al-text">
            {value}
            {unit ? <span className="ml-1 text-xs font-semibold text-al-text-muted">{unit}</span> : null}
          </p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border" style={{ borderColor: `${color}66`, color }}>{icon}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
        {trend ? (
          <span className={trend.positive === null ? 'text-al-text-muted' : trend.positive ? 'text-al-success' : 'text-al-danger'}>{trend.text}</span>
        ) : null}
        <span className="text-al-text-muted">{context}</span>
        {href ? <Link href={href} className="ml-auto font-bold text-al-info hover:text-al-info">{linkLabel ?? 'View →'}</Link> : null}
      </div>
    </article>
  );
}

// --- Donut ---------------------------------------------------------------------

function Donut({ slices, total, centerLabel }: { slices: { name: string; count: number; percentage: number }[]; total: number; centerLabel: string }) {
  let offset = 25;
  return (
    <div className="flex items-center justify-center gap-5">
      <div className="relative grid h-36 w-36 shrink-0 place-items-center">
        <svg viewBox="0 0 42 42" className="-rotate-90">
          <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="rgb(var(--al-border-rgb))" strokeWidth="6" />
          {slices.map((slice, index) => {
            const percent = total > 0 ? (slice.count / total) * 100 : 0;
            const dash = `${percent} ${100 - percent}`;
            const el = (
              <circle
                key={slice.name}
                cx="21"
                cy="21"
                r="15.9155"
                fill="transparent"
                stroke={palette[index % palette.length]}
                strokeWidth="6"
                strokeDasharray={dash}
                strokeDashoffset={100 - offset}
              />
            );
            offset += percent;
            return el;
          })}
        </svg>
        <div className="absolute text-center">
          <p className="text-2xl font-bold text-al-text">{compact(total)}</p>
          <p className="text-[10px] text-al-text-muted">{centerLabel}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {slices.length ? (
          slices.map((slice, index) => (
            <div key={slice.name} className="flex items-center gap-2 text-[10px]">
              <span className="h-2 w-3 shrink-0 rounded-sm" style={{ backgroundColor: palette[index % palette.length] }} />
              <span className="min-w-0 flex-1 truncate text-al-text-muted">{slice.name}</span>
              <span className="font-semibold text-al-text-secondary">{slice.percentage}%</span>
            </div>
          ))
        ) : (
          <p className="text-[10px] text-al-text-muted">No records in this period.</p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, href, linkLabel = 'View all' }: { title: string; subtitle: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-al-text">{title}</h2>
        <p className="mt-0.5 text-[10px] text-al-text-muted">{subtitle}</p>
      </div>
      {href ? <Link href={href} className="whitespace-nowrap text-[10px] font-semibold text-al-info hover:text-al-info">{linkLabel} →</Link> : null}
    </div>
  );
}

// --- Activity chart (real, stacked bars) ---------------------------------------

function ActivityChart({ buckets }: { buckets: { label: string; approved: number; rejected: number; pending: number; highRisk: number }[] }) {
  const totals = buckets.map((b) => b.approved + b.rejected + b.pending);
  const max = Math.max(...totals, 1);
  const barWidth = buckets.length > 0 ? Math.min(100 / buckets.length, 14) : 14;
  const gap = barWidth * 0.35;
  const step = barWidth + gap;
  const chartWidth = Math.max(buckets.length * step, 10);

  if (buckets.every((b) => b.approved + b.rejected + b.pending === 0)) {
    return <p className="grid h-52 place-items-center text-xs text-al-text-muted">No approval activity in this period.</p>;
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3 text-[9px] text-al-text-muted">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-al-success" />Approved</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-al-danger" />Rejected</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-al-warning" />Pending</span>
      </div>
      <div className="mt-2 h-48 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} 100`} preserveAspectRatio="none" className="h-full" style={{ width: `${Math.max(chartWidth * 8, 100)}%`, minWidth: '100%' }} role="img" aria-label="Approval activity by period">
          {[25, 50, 75].map((y) => <line key={y} x1="0" x2={chartWidth} y1={y} y2={y} stroke="rgba(148,163,184,.12)" strokeDasharray="1 2" />)}
          {buckets.map((bucket, index) => {
            const x = index * step;
            const approvedH = (bucket.approved / max) * 82;
            const rejectedH = (bucket.rejected / max) * 82;
            const pendingH = (bucket.pending / max) * 82;
            let y = 98;
            const segments: { height: number; color: string }[] = [
              { height: approvedH, color: 'rgb(var(--al-success-rgb))' },
              { height: rejectedH, color: 'rgb(var(--al-danger-rgb))' },
              { height: pendingH, color: 'rgb(var(--al-warning-rgb))' },
            ];
            return (
              <g key={bucket.label}>
                {segments.map((segment, segIndex) => {
                  y -= segment.height;
                  return segment.height > 0 ? (
                    <rect key={segIndex} x={x} y={y} width={barWidth} height={segment.height} fill={segment.color} rx={0.6} />
                  ) : null;
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[8px] text-al-text-muted">
        <span>{buckets[0]?.label}</span>
        {buckets.length > 2 ? <span>{buckets[Math.floor(buckets.length / 2)]?.label}</span> : null}
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function rangeLink(base: RawSearchParams, overrides: Record<string, string>) {
  const params = new URLSearchParams();
  for (const key of ['range', 'granularity']) {
    const value = overrides[key] ?? str(base, key);
    if (value) params.set(key, value);
  }
  return `/dashboard?${params.toString()}`;
}

// --- View ------------------------------------------------------------------

export function OrganizationDashboardView({
  overview,
  organizationName,
  role,
  rawParams,
}: {
  overview: DashboardOverview;
  organizationName: string;
  role: Role;
  rawParams: RawSearchParams;
}) {
  const range = overview.range;
  const canSeeUsers = hasAnyRole(role, ['AUDITOR', 'MANAGER', 'ADMIN', 'OWNER']);
  const canManageUsers = hasAnyRole(role, ['ADMIN', 'OWNER']);
  const canSeeCompliance = hasAnyRole(role, ['ADMIN', 'AUDITOR', 'OWNER']);
  const canSeeWorkflows = hasAnyRole(role, ['ADMIN', 'AUDITOR', 'OWNER']);
  const canManageIntegrations = hasAnyRole(role, ['ADMIN', 'OWNER']);
  // Matches '/dashboard/settings': ['ADMIN', 'OWNER'] (lib/rbac.ts) - the
  // real Billing & Plan tab this card's "Manage Plan" link opens - so a
  // role that can't reach that tab never sees a summary of it here either.
  const canSeeBilling = hasAnyRole(role, ['ADMIN', 'OWNER']);

  const avgTimeDays = overview.kpis.avgApprovalTimeHours.value !== null ? Math.round((overview.kpis.avgApprovalTimeHours.value / 24) * 10) / 10 : null;
  const prevAvgTimeDays = overview.kpis.avgApprovalTimeHours.prevValue !== null ? overview.kpis.avgApprovalTimeHours.prevValue / 24 : null;

  const recentApprovalTableRecords: ApprovalTableRecord[] = overview.recentApprovals.records;

  const rangeOptions: { key: DashboardRangeKey; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
  ];
  const granularityOptions: { key: ActivityGranularity; label: string }[] =
    range.days <= 7 ? [{ key: 'day', label: 'Daily' }]
    : range.days <= 30 ? [{ key: 'day', label: 'Daily' }, { key: 'week', label: 'Weekly' }]
    : [{ key: 'week', label: 'Weekly' }, { key: 'month', label: 'Monthly' }];

  return (
    <section className="grid gap-3 text-al-text-secondary">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-al-text">Organization Dashboard</h1>
          <p className="mt-1 text-xs text-al-text-muted">
            Live workspace overview of approvals, risk, compliance and activity across {organizationName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overview.degraded.length > 0 ? (
            <>
              <AutoRetryOnDegraded />
              <span className="rounded-md border border-al-warning/30 bg-al-warning/10 px-3 py-2 text-[10px] font-semibold text-al-warning">
                Some workspace data is delayed and will refresh automatically
              </span>
            </>
          ) : null}
          <div className="flex items-center rounded-md border border-al-border bg-al-surface-elevated p-0.5 text-[11px] font-semibold">
            {rangeOptions.map((opt) => (
              <Link
                key={opt.key}
                href={rangeLink(rawParams, { range: opt.key, granularity: '' })}
                className={`rounded px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent ${range.key === opt.key ? 'bg-al-accent text-al-accent-text' : 'text-al-text-muted hover:text-al-text'}`}
                aria-current={range.key === opt.key ? 'true' : undefined}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Total Approvals"
          value={compact(overview.kpis.totalApprovals.value)}
          context={range.label}
          trend={trendBadge(overview.kpis.totalApprovals.value, overview.kpis.totalApprovals.prevValue, 'up')}
          color="#2f7cff"
          icon={<CheckCircle2 className="h-4 w-4" />}
          href="/dashboard/approvals"
          linkLabel="View →"
        />
        <KpiCard
          label="Pending Approvals"
          value={compact(overview.kpis.pendingApprovals.value)}
          context="Requires action"
          color="#f4b529"
          icon={<Clock3 className="h-4 w-4" />}
          href="/dashboard/pending-actions"
          linkLabel="Review →"
        />
        <KpiCard
          label="High Risk Approvals"
          value={compact(overview.kpis.highRiskApprovals.value)}
          context="Detected this period"
          trend={trendBadge(overview.kpis.highRiskApprovals.value, overview.kpis.highRiskApprovals.prevValue, 'down')}
          color="#ff624a"
          icon={<AlertTriangle className="h-4 w-4" />}
          href="/dashboard/approvals?riskLevel=high"
          linkLabel="Review →"
        />
        <KpiCard
          label="Avg Approval Time"
          value={avgTimeDays !== null ? String(avgTimeDays) : 'Not enough data'}
          unit={avgTimeDays !== null ? 'days' : undefined}
          context={avgTimeDays !== null ? range.label : 'No timestamped decisions yet'}
          trend={avgTimeDays !== null ? trendBadge(avgTimeDays, prevAvgTimeDays, 'down') : null}
          color="#46b6df"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiCard
          label="Compliance Score"
          value={overview.kpis.complianceScore.value !== null ? `${overview.kpis.complianceScore.value}%` : 'Not enough data'}
          context={overview.kpis.complianceScore.value !== null ? 'Based on risk & review backlog' : 'No qualifying approvals in this period'}
          trend={overview.kpis.complianceScore.value !== null ? trendBadge(overview.kpis.complianceScore.value, overview.kpis.complianceScore.prevValue, 'up') : null}
          color="#45cf78"
          icon={<ShieldCheck className="h-4 w-4" />}
          href="/trust/compliance"
          linkLabel="Compliance hub →"
        />
      </div>

      {/* Activity + category */}
      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-7`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionHeader title="Approval Activity" subtitle={`Approved, rejected and pending · ${range.label.toLowerCase()}`} />
            <div className="flex items-center rounded-md border border-al-border bg-al-surface-elevated p-0.5 text-[10px] font-semibold">
              {granularityOptions.map((opt) => (
                <Link
                  key={opt.key}
                  href={rangeLink(rawParams, { granularity: opt.key })}
                  className={`rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent ${overview.granularity === opt.key ? 'bg-al-accent text-al-accent-text' : 'text-al-text-muted hover:text-al-text'}`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>
          <ActivityChart buckets={overview.activity} />
        </article>

        <article className={`${panelClass} p-4 xl:col-span-5`}>
          <SectionHeader title="Approvals by Category" subtitle={range.label} href="/dashboard/approvals" linkLabel="All approvals" />
          <div className="mt-3">
            {/* Total is the sum of the slices themselves, never the separate
                totalApprovals KPI - those two are computed by different
                queries (categories from a direct ApprovalRecord groupBy,
                the KPI from getCoreAnalytics) and must never be allowed to
                silently disagree, including when one of the two degrades
                independently of the other. */}
            <Donut slices={overview.categories} total={overview.categories.reduce((sum, c) => sum + c.count, 0)} centerLabel="Total" />
          </div>
        </article>
      </div>

      {/* Recent approvals + recent activity */}
      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-8`}>
          <SectionHeader title="Recent Approvals" subtitle={range.label} href="/dashboard/approvals" linkLabel="View all" />
          <div className="mt-3">
            {recentApprovalTableRecords.length > 0 ? (
              <ApprovalTable approvals={recentApprovalTableRecords} />
            ) : (
              <p className="py-10 text-center text-xs text-al-text-muted">No approvals captured in this period yet.</p>
            )}
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Recent Activity" subtitle="Latest audited events" href="/dashboard/audit-log" />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {overview.recentAudit.length ? (
              overview.recentAudit.map((event) => (
                <div key={event.id} className="flex items-center gap-2.5 py-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-al-info/15 text-al-info"><Activity className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-al-text-secondary">{describeAuditAction(event.action)}</p>
                    <p className="text-[9px] text-al-text-muted">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-10 text-center text-xs text-al-text-muted">Activity will appear here as your team works in ApprovLine.</p>
            )}
          </div>
        </article>
      </div>

      {/* Integrations + workflows + risk */}
      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader
            title="Top Integrations"
            subtitle={`${overview.integrations.connectedCount} connected · ${overview.integrations.nativeCatalogSize} in catalog`}
            href={canManageIntegrations ? '/dashboard/settings/integrations' : undefined}
            linkLabel="Manage"
          />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {overview.connectors.length ? (
              overview.connectors.slice(0, 6).map((connector) => {
                const meta = sourceMeta(connector.provider);
                return (
                  <div key={connector.name} className="flex items-center gap-2.5 py-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[9px] font-black text-white" style={{ backgroundColor: meta.color }}>
                      {meta.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-al-text-secondary">{connector.name}</p>
                      <p className="text-[9px] text-al-text-muted">{connector.count} messages · {statusLabel(connector.status)}</p>
                    </div>
                    <span className="text-[10px] font-bold text-al-text-muted">{connector.percentage}%</span>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-xs text-al-text-muted">No integration activity in this period.</p>
            )}
            {overview.integrations.issueCount > 0 ? (
              <p className="flex items-center gap-1.5 pt-2 text-[10px] font-semibold text-al-warning">
                <ShieldAlert className="h-3.5 w-3.5" /> {overview.integrations.issueCount} integration{overview.integrations.issueCount === 1 ? '' : 's'} need attention
              </p>
            ) : null}
          </div>
        </article>

        {canSeeWorkflows ? (
          <article className={`${panelClass} p-4 xl:col-span-4`}>
            <SectionHeader title="Playbook Status" subtitle="Compliance rate where evaluated" href="/playbooks" linkLabel="Open" />
            <div className="mt-3 divide-y divide-white/[0.06]">
              {overview.workflows.items.length ? (
                overview.workflows.items.slice(0, 6).map((workflow) => (
                  <div key={workflow.id} className="flex items-center gap-2.5 py-2">
                    <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-al-accent" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-al-text-secondary">{workflow.name}</span>
                    {workflow.complianceRate !== null ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-al-border">
                          <span
                            className={`block h-full rounded-full ${workflow.complianceRate >= 85 ? 'bg-al-success' : workflow.complianceRate >= 60 ? 'bg-al-warning' : 'bg-al-danger'}`}
                            style={{ width: `${workflow.complianceRate}%` }}
                          />
                        </span>
                        <span className="text-[10px] font-bold text-al-text-secondary">{workflow.complianceRate}%</span>
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          workflow.status === 'READY'
                            ? 'bg-al-success/10 text-al-success'
                            : workflow.status === 'ERROR'
                              ? 'bg-al-danger/10 text-al-danger'
                              : 'bg-al-warning/10 text-al-warning'
                        }`}
                      >
                        {workflow.status === 'READY' ? 'Active' : workflow.status === 'ERROR' ? 'Needs attention' : statusLabel(workflow.status)}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-xs text-al-text-muted">No playbooks uploaded yet.</p>
              )}
            </div>
          </article>
        ) : null}

        <article className={`${panelClass} p-4 ${canSeeWorkflows ? 'xl:col-span-4' : 'xl:col-span-8'}`}>
          <SectionHeader title="Risk Distribution" subtitle={range.label} href="/dashboard/approvals" />
          <div className="mt-3">
            <Donut
              slices={overview.riskDistribution.map((s) => ({ name: s.label, count: s.count, percentage: s.percentage }))}
              total={overview.riskDistribution.reduce((sum, s) => sum + s.count, 0)}
              centerLabel="Approvals"
            />
          </div>
        </article>
      </div>

      {/* Users & teams + compliance + open items */}
      <div className="grid gap-3 xl:grid-cols-12">
        {canSeeUsers ? (
          <article className={`${panelClass} p-4 xl:col-span-4`}>
            <SectionHeader title="Users & Teams" subtitle="Workspace membership" href={canManageUsers ? '/settings/users' : undefined} linkLabel="Manage" />
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {[
                ['Total Users', overview.usersAndTeams.totalUsers],
                ['Administrators', overview.usersAndTeams.adminUsers],
                ['Teams', overview.usersAndTeams.totalTeams],
                ['Pending Invites', overview.usersAndTeams.pendingInvites],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border border-white/[0.06] bg-al-surface/[0.02] p-2.5">
                  <p className="text-lg font-bold text-al-text">{value}</p>
                  <p className="text-[9px] text-al-text-muted">{label}</p>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {canSeeCompliance ? (
          <article className={`${panelClass} p-4 xl:col-span-4`}>
            <SectionHeader title="Compliance Frameworks" subtitle="Configured in Compliance Hub" href="/trust/compliance" linkLabel="View all" />
            <div className="mt-3 grid gap-2">
              {overview.complianceFrameworks.length ? (
                overview.complianceFrameworks.slice(0, 5).map((framework) => (
                  <div key={framework.slug} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.05] bg-al-surface/[0.02] px-2.5 py-2 text-[11px]">
                    <span className="flex items-center gap-2 text-al-text-secondary"><ShieldCheck className="h-3.5 w-3.5 text-al-accent" />{framework.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${framework.isEnabled ? 'bg-al-success/10 text-al-success' : 'bg-al-text-muted/10 text-al-text-muted'}`}>
                      {framework.isEnabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-al-text-muted">No compliance frameworks configured yet.</p>
              )}
            </div>
          </article>
        ) : null}

        <article className={`${panelClass} p-4 ${canSeeUsers && canSeeCompliance ? 'xl:col-span-4' : 'xl:col-span-8'}`}>
          <SectionHeader title="Open Action Items" subtitle="Needs attention now" href="/dashboard/pending-actions" linkLabel="Open Action Center" />
          <div className="mt-3 grid gap-2">
            {[
              ['Pending Approvals', overview.openItems.needsAttention, '/dashboard/pending-actions'],
              ['High Risk Approvals', overview.openItems.highPriority, '/dashboard/pending-actions?priority=high'],
              ['Overdue Approvals', overview.openItems.overdue, '/dashboard/pending-actions?status=OPEN'],
              ['Integration Issues', overview.integrations.issueCount, canManageIntegrations ? '/dashboard/settings/integrations' : '/dashboard/pending-actions'],
            ]
              .filter(([, value]) => Number(value) > 0)
              .map(([label, value, href]) => (
                <Link key={String(label)} href={String(href)} className="flex items-center gap-2 rounded-md border border-white/[0.05] bg-al-surface/[0.02] px-2.5 py-2 text-[11px] hover:border-al-accent/30">
                  <ShieldAlert className="h-3.5 w-3.5 text-al-warning" />
                  <span className="flex-1 text-al-text-muted">{label}</span>
                  <span className="font-bold text-al-text">{value}</span>
                  <ArrowRight className="h-3 w-3 text-al-text-muted" />
                </Link>
              ))}
            {[overview.openItems.needsAttention, overview.openItems.highPriority, overview.openItems.overdue, overview.integrations.issueCount].every((v) => v === 0) ? (
              <p className="flex items-center gap-2 py-4 text-center text-xs text-al-success">
                <CheckCircle2 className="h-4 w-4" /> Nothing needs attention right now.
              </p>
            ) : null}
          </div>
        </article>
      </div>

      {/* Plan & Usage */}
      {canSeeBilling ? (
        <div className="grid gap-3 xl:grid-cols-12">
          <article className={`${panelClass} p-4 xl:col-span-12`}>
            <SectionHeader title="Plan & Usage" subtitle="Billing & Plan" href="/dashboard/settings?tab=billing" linkLabel="Manage Plan" />
            {overview.billing ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-white/[0.06] bg-al-surface/[0.02] p-3">
                  <p className="text-[9px] uppercase tracking-wide text-al-text-muted">Plan</p>
                  <p className="mt-1 text-sm font-bold text-al-text">{overview.billing.planLabel}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      overview.billing.accountStatus === 'ACTIVE' ? 'bg-al-success/10 text-al-success' : 'bg-al-warning/10 text-al-warning'
                    }`}
                  >
                    {statusLabel(overview.billing.accountStatus)}
                  </span>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-al-surface/[0.02] p-3">
                  <p className="text-[9px] uppercase tracking-wide text-al-text-muted">Seats</p>
                  <p className="mt-1 text-sm font-bold text-al-text">
                    {overview.billing.usedSeats} / {overview.billing.purchasedSeats > 0 ? overview.billing.purchasedSeats : (overview.planLimits?.seatLimit ?? '∞')}
                  </p>
                  <p className="mt-1 text-[9px] text-al-text-muted">{overview.billing.allocatedSeats} allocated</p>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-al-surface/[0.02] p-3">
                  <p className="text-[9px] uppercase tracking-wide text-al-text-muted">Connected Integrations</p>
                  <p className="mt-1 text-sm font-bold text-al-text">
                    {overview.integrations.connectedCount} / {overview.planLimits?.connectedSystemLimit ?? '∞'}
                  </p>
                  <p className="mt-1 text-[9px] text-al-text-muted">{overview.planLimits?.connectedSystemLimit === null ? 'No limit configured' : 'Included with plan'}</p>
                </div>
                <div className="rounded-md border border-white/[0.06] bg-al-surface/[0.02] p-3">
                  <p className="text-[9px] uppercase tracking-wide text-al-text-muted">Approvals This Month</p>
                  <p className="mt-1 text-sm font-bold text-al-text">{compact(overview.planLimits?.approvalsThisMonth ?? 0)}</p>
                  <p className="mt-1 text-[9px] text-al-text-muted">No plan limit configured</p>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3 rounded-md border border-dashed border-al-border p-4">
                <CreditCard className="h-5 w-5 shrink-0 text-al-text-muted" />
                <div>
                  <p className="text-xs font-semibold text-al-text">Plan not provisioned</p>
                  <p className="mt-0.5 text-[10px] text-al-text-muted">Contact your administrator to provision a plan for this workspace.</p>
                </div>
              </div>
            )}
          </article>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-1 pt-3 text-[9px] text-al-text-secondary">
        <div className="flex flex-wrap gap-4">
          <span className="flex items-center gap-1"><Cable className="h-3 w-3" />Read-only integrations</span>
          <span className="flex items-center gap-1"><ScrollText className="h-3 w-3" />Full audit trail</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />Role-based access</span>
        </div>
        <span>© 2026 ApprovLine</span>
      </div>
    </section>
  );
}
