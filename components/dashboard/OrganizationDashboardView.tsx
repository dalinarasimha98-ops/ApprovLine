import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Cable,
  CheckCircle2,
  Circle,
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
  type WorkspaceReadinessItem,
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

/** Icon + color per real audit-action category (matches
 *  services/dashboard.ts's MEANINGFUL_AUDIT_ACTIONS allowlist) so Recent
 *  Activity is scannable by kind at a glance - purely a presentation choice
 *  over the same real event.action string, never a new data source. */
function activityMeta(action: string): { icon: React.ReactNode; className: string } {
  if (action.startsWith('approval_record.') || action.startsWith('MANUAL_APPROVAL_')) {
    return { icon: <CheckCircle2 className="h-3.5 w-3.5" />, className: 'bg-al-success/15 text-al-success' };
  }
  if (action.startsWith('user.') || action.startsWith('team.')) {
    return { icon: <Users className="h-3.5 w-3.5" />, className: 'bg-al-accent/15 text-al-accent' };
  }
  if (action.startsWith('integration.')) {
    return { icon: <Cable className="h-3.5 w-3.5" />, className: 'bg-al-info/15 text-al-info' };
  }
  if (action.startsWith('playbook.')) {
    return { icon: <BrainCircuit className="h-3.5 w-3.5" />, className: 'bg-al-accent/15 text-al-accent' };
  }
  if (action.startsWith('investigation.')) {
    return { icon: <AlertTriangle className="h-3.5 w-3.5" />, className: 'bg-al-warning/15 text-al-warning' };
  }
  if (action.startsWith('COMPLIANCE_')) {
    return { icon: <ShieldCheck className="h-3.5 w-3.5" />, className: 'bg-al-success/15 text-al-success' };
  }
  return { icon: <ScrollText className="h-3.5 w-3.5" />, className: 'bg-al-text-muted/15 text-al-text-muted' };
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
  showComparisonState = false,
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
  /** True for KPIs that have a real prevValue concept (period-over-period
   *  comparison) - when true and `trend` is null, renders "No comparison
   *  available" instead of silently omitting the badge, so an absent trend
   *  reads as "not enough history yet," never as a missed calculation.
   *  False for KPIs with no comparison concept at all (e.g. Pending
   *  Approval Actions, a live/unscoped count with no previous-period
   *  baseline to compare against). */
  showComparisonState?: boolean;
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
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1f`, color }}>{icon}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
        {trend ? (
          <span className={`rounded px-1.5 py-0.5 ${trend.positive === null ? 'bg-al-text-muted/10 text-al-text-muted' : trend.positive ? 'bg-al-success/10 text-al-success' : 'bg-al-danger/10 text-al-danger'}`}>{trend.text}</span>
        ) : showComparisonState ? (
          <span className="rounded bg-al-text-muted/10 px-1.5 py-0.5 text-al-text-muted">No comparison available</span>
        ) : null}
        <span className="text-al-text-muted">{context}</span>
        {href ? <Link href={href} className="ml-auto font-bold text-al-info hover:text-al-info">{linkLabel ?? 'View →'}</Link> : null}
      </div>
    </article>
  );
}

// --- Donut ---------------------------------------------------------------------

function Donut({
  slices,
  total,
  centerLabel,
  emptyText,
  colorFor,
}: {
  slices: { name: string; count: number; percentage: number }[];
  total: number;
  centerLabel: string;
  emptyText: string;
  /** Optional semantic color override (e.g. Risk Distribution always maps
   *  Low/Medium/High to success/warning/danger, regardless of slice order) -
   *  falls back to the generic categorical palette when omitted. */
  colorFor?: (name: string, index: number) => string;
}) {
  const sliceColor = (name: string, index: number) => colorFor?.(name, index) ?? palette[index % palette.length];
  // Compact placeholder when there's genuinely nothing to chart - a
  // full-size ring with an empty legend next to it is exactly the "huge
  // donut chart with empty space" the visual density review called out.
  if (total === 0) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-al-border">
          <span className="text-sm font-bold text-al-text-muted">0</span>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-al-text-secondary">{centerLabel}</p>
          <p className="text-[10px] text-al-text-muted">{emptyText}</p>
        </div>
      </div>
    );
  }

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
                stroke={sliceColor(slice.name, index)}
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
        {slices.map((slice, index) => (
          <div key={slice.name} className="flex items-center gap-2 text-[10px]">
            <span className="h-2 w-3 shrink-0 rounded-sm" style={{ backgroundColor: sliceColor(slice.name, index) }} />
            <span className="min-w-0 flex-1 truncate text-al-text-muted">{slice.name}</span>
            <span className="font-semibold text-al-text-secondary">{slice.percentage}%</span>
          </div>
        ))}
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

function ActivityChart({
  buckets,
  emptyActions,
}: {
  buckets: { label: string; approved: number; rejected: number; pending: number; highRisk: number }[];
  emptyActions: { label: string; href: string }[];
}) {
  const totals = buckets.map((b) => b.approved + b.rejected + b.pending);
  const max = Math.max(...totals, 1);
  const barWidth = buckets.length > 0 ? Math.min(100 / buckets.length, 14) : 14;
  const gap = barWidth * 0.35;
  const step = barWidth + gap;
  const chartWidth = Math.max(buckets.length * step, 10);

  if (buckets.every((b) => b.approved + b.rejected + b.pending === 0)) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs font-semibold text-al-text-secondary">No approval activity captured in this period</p>
        <p className="mx-auto mt-1 max-w-sm text-[11px] text-al-text-muted">
          Your workspace is connected, but ApprovLine has not captured qualifying approval activity for this date range.
        </p>
        {emptyActions.length ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            {emptyActions.map((action) => (
              <Link key={action.label} href={action.href} className="text-[11px] font-semibold text-al-info hover:text-al-info">
                {action.label} →
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3 text-[9px] text-al-text-muted">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-al-success" />Approved</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-al-danger" />Rejected</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-al-warning" />Pending</span>
      </div>
      <div className="mt-2 h-48 w-full overflow-x-auto">
        {/* chartWidth (bucket count * per-bar step) is already normalized to
            ~100-135 viewBox units regardless of range/granularity (barWidth
            is derived as 100/bucket-count), so rendering at 100% width
            already fits every bar on screen. An earlier `chartWidth * 8`
            multiplier here always overstretched the SVG to ~1000% of its
            container - invisible without a 10x horizontal scroll, a bug
            that only ever surfaced with real, populated activity data
            (an empty period short-circuits to the empty-state message
            above and never reaches this render path). */}
        <svg viewBox={`0 0 ${chartWidth} 100`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Approval activity by period">
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

/** Even 12-column split for however many of a row's role-gated cards are
 *  actually visible to this viewer - so a role that can't see, say,
 *  Compliance Frameworks gets Workspace Membership and Plan & Usage each at
 *  half width, never a lopsided leftover gap. */
function threeColSpan(visibleCount: number): string {
  if (visibleCount <= 1) return 'xl:col-span-12';
  if (visibleCount === 2) return 'xl:col-span-6';
  return 'xl:col-span-4';
}

// --- Workspace Readiness ---------------------------------------------------

function WorkspaceReadinessSection({
  items,
  readinessActionFor,
}: {
  items: WorkspaceReadinessItem[];
  readinessActionFor: (id: WorkspaceReadinessItem['id']) => { href: string; label: string } | null;
}) {
  return (
    <article className={`${panelClass} p-4`}>
      <SectionHeader title="Workspace Readiness" subtitle="Operational readiness, from your own data — billing and plan are tracked separately below" />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const action = readinessActionFor(item.id);
          return (
            <div key={item.id} className="flex items-start gap-2 rounded-md border border-white/[0.05] bg-al-surface/[0.02] px-2.5 py-2">
              {item.complete ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-al-success" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-al-text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-al-text-secondary">{item.label}</p>
                <p className="text-[10px] text-al-text-muted">{item.detail}</p>
                {action ? (
                  <Link href={action.href} className="mt-0.5 inline-block text-[10px] font-semibold text-al-info hover:text-al-info">
                    {action.label} →
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
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
  // Matches services/manual-approvals.ts's canManageManualApprovals() exactly
  // - the real gate on /approvals/manual, which the Approval Activity empty
  // state and Workspace Readiness's "Approval capture" action both link to.
  const canCaptureApproval = hasAnyRole(role, ['OWNER', 'ADMIN', 'MANAGER']);

  const avgTimeDays = overview.kpis.avgApprovalTimeHours.value !== null ? Math.round((overview.kpis.avgApprovalTimeHours.value / 24) * 10) / 10 : null;
  const prevAvgTimeDays = overview.kpis.avgApprovalTimeHours.prevValue !== null ? overview.kpis.avgApprovalTimeHours.prevValue / 24 : null;

  const recentApprovalTableRecords: ApprovalTableRecord[] = overview.recentApprovals.records;

  const activityEmptyActions: { label: string; href: string }[] = [];
  if (canManageIntegrations && overview.integrations.connectedCount === 0) {
    activityEmptyActions.push({ label: 'Connect an integration', href: '/dashboard/settings/integrations' });
  }
  if (canCaptureApproval && !overview.hasEverCapturedApproval) {
    activityEmptyActions.push({ label: 'Capture your first approval', href: '/approvals/manual' });
  }
  activityEmptyActions.push({ label: 'View Action Center', href: '/dashboard/pending-actions' });

  // Visible to every role (a low-sensitivity operational summary, not
  // privileged data) - individual rows below are still filtered by the same
  // canSeeX flags their corresponding cards already use, so a role that
  // can't see the Compliance Frameworks card, for example, doesn't see a
  // Workspace Readiness row about it either.
  const workspaceReadinessItems = overview.workspaceReadiness.filter((item) => {
    if (item.id === 'usersAndTeams') return canSeeUsers;
    if (item.id === 'playbook') return canSeeWorkflows;
    if (item.id === 'compliance') return canSeeCompliance;
    return true;
  });
  const readinessActionFor = (id: WorkspaceReadinessItem['id']): { href: string; label: string } | null => {
    switch (id) {
      case 'organization':
        return canManageIntegrations ? { href: '/dashboard/settings', label: 'Open Settings' } : null;
      case 'usersAndTeams':
        return canManageUsers ? { href: '/settings/users', label: 'Manage Users & Teams' } : null;
      case 'integrations':
        return canManageIntegrations ? { href: '/dashboard/settings/integrations', label: 'Manage integrations' } : null;
      case 'playbook':
        return canSeeWorkflows ? { href: '/playbooks', label: 'Open Playbook AI' } : null;
      case 'compliance':
        return canSeeCompliance ? { href: '/trust/compliance', label: 'Open Compliance Hub' } : null;
      case 'approvalCaptureActive':
        return canCaptureApproval ? { href: '/approvals/manual', label: 'Capture an approval' } : null;
      default:
        return null;
    }
  };
  // Promoted right under the KPI strip (ahead of every activity/chart card)
  // when this workspace has never captured a single approval - exactly the
  // scenario the visual-density review is about, where those cards would
  // otherwise be the very first thing a new admin sees, all empty.
  const promoteReadiness = !overview.hasEverCapturedApproval;

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
          showComparisonState
          color="#2f7cff"
          icon={<CheckCircle2 className="h-4 w-4" />}
          href="/dashboard/approvals"
          linkLabel="View →"
        />
        <KpiCard
          label="Pending Approval Actions"
          value={compact(overview.kpis.pendingApprovals.value)}
          context="Open now · any age"
          color="#f4b529"
          icon={<Clock3 className="h-4 w-4" />}
          href="/dashboard/pending-actions"
          linkLabel="Review →"
        />
        <KpiCard
          label="High Risk Approvals"
          value={compact(overview.kpis.highRiskApprovals.value)}
          context={`New detections · ${range.label.toLowerCase()}`}
          trend={trendBadge(overview.kpis.highRiskApprovals.value, overview.kpis.highRiskApprovals.prevValue, 'down')}
          showComparisonState
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
          showComparisonState={avgTimeDays !== null}
          color="#46b6df"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiCard
          label="Compliance Score"
          value={overview.kpis.complianceScore.value !== null ? `${overview.kpis.complianceScore.value}%` : 'Not enough data'}
          context={overview.kpis.complianceScore.value !== null ? 'Based on risk & review backlog' : 'No qualifying approvals in this period'}
          trend={overview.kpis.complianceScore.value !== null ? trendBadge(overview.kpis.complianceScore.value, overview.kpis.complianceScore.prevValue, 'up') : null}
          showComparisonState={overview.kpis.complianceScore.value !== null}
          color="#45cf78"
          icon={<ShieldCheck className="h-4 w-4" />}
          href="/trust/compliance"
          linkLabel="Compliance hub →"
        />
      </div>
      <p className="px-1 text-[10px] text-al-text-muted">
        KPIs above are scoped to {range.label.toLowerCase()}. Pending Approval Actions and Open Action Items reflect everything currently open, regardless of when it was created.
      </p>

      {workspaceReadinessItems.length && promoteReadiness ? (
        <WorkspaceReadinessSection items={workspaceReadinessItems} readinessActionFor={readinessActionFor} />
      ) : null}

      {/* Row 2: Approval Activity | Approvals by Category | Recent Activity */}
      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-5`}>
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
          <ActivityChart buckets={overview.activity} emptyActions={activityEmptyActions} />
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Approvals by Category" subtitle={range.label} href="/dashboard/approvals" linkLabel="All approvals" />
          <div className="mt-3">
            {/* Total is the sum of the slices themselves, never the separate
                totalApprovals KPI - those two are computed by different
                queries (categories from a direct ApprovalRecord groupBy,
                the KPI from getCoreAnalytics) and must never be allowed to
                silently disagree, including when one of the two degrades
                independently of the other. */}
            <Donut
              slices={overview.categories}
              total={overview.categories.reduce((sum, c) => sum + c.count, 0)}
              centerLabel="Total"
              emptyText="No records in this period."
            />
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-3`}>
          <SectionHeader title="Recent Activity" subtitle="Latest audited events" href="/dashboard/audit-log" />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {overview.recentAudit.length ? (
              overview.recentAudit.map((event) => {
                const meta = activityMeta(event.action);
                return (
                  <div key={event.id} className="flex items-center gap-2.5 py-2.5">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${meta.className}`}>{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-al-text-secondary">{describeAuditAction(event.action)}</p>
                      <p className="text-[9px] text-al-text-muted">{new Date(event.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-center text-xs text-al-text-muted">Activity will appear here as your team works in ApprovLine.</p>
            )}
          </div>
        </article>
      </div>

      {/* Row 3: Recent Approvals | Risk Distribution */}
      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-8`}>
          <SectionHeader title="Recent Approvals" subtitle={range.label} href="/dashboard/approvals" linkLabel="View all" />
          <div className="mt-3">
            {recentApprovalTableRecords.length > 0 ? (
              <ApprovalTable approvals={recentApprovalTableRecords} />
            ) : (
              <div className="py-4 text-center">
                <p className="text-xs font-semibold text-al-text-secondary">No approvals captured in this period.</p>
                <p className="mt-1 text-[10px] text-al-text-muted">
                  Once approvals are captured, they will appear here with subject, approver, risk, status, timestamp and source.
                </p>
                <Link href="/dashboard/approvals" className="mt-2 inline-block text-[11px] font-semibold text-al-info hover:text-al-info">
                  Open Approvals →
                </Link>
              </div>
            )}
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Risk Distribution" subtitle={range.label} href="/dashboard/approvals" />
          <div className="mt-3">
            <Donut
              slices={overview.riskDistribution.map((s) => ({ name: s.label, count: s.count, percentage: s.percentage }))}
              total={overview.riskDistribution.reduce((sum, s) => sum + s.count, 0)}
              centerLabel="Approvals"
              emptyText="No risk records in this period."
              colorFor={(name) =>
                name === 'Low'
                  ? 'rgb(var(--al-success-rgb))'
                  : name === 'Medium'
                    ? 'rgb(var(--al-warning-rgb))'
                    : name === 'High'
                      ? 'rgb(var(--al-danger-rgb))'
                      : '#8a97a8'
              }
            />
          </div>
        </article>
      </div>

      {/* Row 4: Top Integrations | Playbook Status | Open Action Items */}
      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 ${canSeeWorkflows ? 'xl:col-span-4' : 'xl:col-span-6'}`}>
          <SectionHeader
            title="Top Integrations"
            subtitle={`${overview.integrations.connectedCount} connected · ${overview.integrations.nativeCatalogSize} in catalog`}
            href={canManageIntegrations ? '/dashboard/settings/integrations' : undefined}
            linkLabel="Manage"
          />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {overview.integrations.connectedList.length ? (
              overview.integrations.connectedList.slice(0, 4).map((connector) => {
                const meta = sourceMeta(connector.provider.toLowerCase());
                return (
                  <div key={connector.provider} className="flex items-center gap-2.5 py-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[9px] font-black text-white" style={{ backgroundColor: meta.color }}>
                      {meta.initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-al-text-secondary">{meta.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${connector.status === 'SYNCING' ? 'bg-al-info/10 text-al-info' : 'bg-al-success/10 text-al-success'}`}
                    >
                      {connector.status === 'SYNCING' ? 'Syncing' : 'Connected'}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-xs text-al-text-muted">No integrations connected yet.</p>
            )}
            {overview.integrations.connectedList.length > 4 ? (
              <Link href={canManageIntegrations ? '/dashboard/settings/integrations' : '/dashboard'} className="block pt-2 text-center text-[10px] font-semibold text-al-info hover:text-al-info">
                View all {overview.integrations.connectedList.length} →
              </Link>
            ) : null}
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
                  <div key={workflow.id} className="py-2">
                    <div className="flex items-center gap-2.5">
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
                        // A playbook with zero evaluations is CONFIGURED, not
                        // HEALTHY - "Active"/green here would claim a clean
                        // bill of health this playbook has never actually
                        // earned (it's only ever been checked against real
                        // approvals, never scored). "Active" is reserved for
                        // the compliance-rate branch above, which only
                        // renders once a real evaluation exists.
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            workflow.status === 'READY'
                              ? 'bg-al-info/10 text-al-info'
                              : workflow.status === 'ERROR'
                                ? 'bg-al-danger/10 text-al-danger'
                                : 'bg-al-warning/10 text-al-warning'
                          }`}
                        >
                          {workflow.status === 'READY' ? 'Configured' : workflow.status === 'ERROR' ? 'Needs attention' : statusLabel(workflow.status)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 pl-6 text-[9px] text-al-text-muted">
                      {workflow.evaluatedCount > 0 && workflow.lastEvaluatedAt
                        ? `${workflow.evaluatedCount} compliance evaluation${workflow.evaluatedCount === 1 ? '' : 's'} · Last evaluated ${new Date(workflow.lastEvaluatedAt).toLocaleDateString()}`
                        : 'No compliance evaluations yet'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-xs text-al-text-muted">No playbooks uploaded yet.</p>
              )}
            </div>
          </article>
        ) : null}

        <article className={`${panelClass} p-4 ${canSeeWorkflows ? 'xl:col-span-4' : 'xl:col-span-6'}`}>
          <SectionHeader title="Open Action Items" subtitle="Needs attention now" href="/dashboard/pending-actions" linkLabel="Open Action Center" />
          <div className="mt-3 grid gap-2">
            {[
              ['Pending Approval Actions', overview.openItems.needsAttention, '/dashboard/pending-actions'],
              ['High-Risk Approvals (Open)', overview.openItems.highPriority, '/dashboard/pending-actions?priority=high'],
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

      {/* Row 5: Users & Teams | Compliance Frameworks | Plan & Usage */}
      <div className="grid gap-3 xl:grid-cols-12">
        {canSeeUsers ? (
          <article className={`${panelClass} p-4 ${threeColSpan([canSeeUsers, canSeeCompliance, canSeeBilling].filter(Boolean).length)}`}>
            <SectionHeader title="Workspace Membership" subtitle="Users & teams" href={canManageUsers ? '/settings/users' : undefined} linkLabel="Manage" />
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {[
                { label: 'Total Users', value: overview.usersAndTeams.totalUsers, icon: <Users className="h-3.5 w-3.5" />, className: 'bg-al-info/15 text-al-info' },
                { label: 'Administrators', value: overview.usersAndTeams.adminUsers, icon: <ShieldCheck className="h-3.5 w-3.5" />, className: 'bg-al-accent/15 text-al-accent' },
                { label: 'Teams', value: overview.usersAndTeams.totalTeams, icon: <Users className="h-3.5 w-3.5" />, className: 'bg-al-success/15 text-al-success' },
                { label: 'Pending Invites', value: overview.usersAndTeams.pendingInvites, icon: <Clock3 className="h-3.5 w-3.5" />, className: 'bg-al-warning/15 text-al-warning' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-md border border-white/[0.06] bg-al-surface/[0.02] p-2.5">
                  <span className={`mb-1.5 grid h-6 w-6 place-items-center rounded-md ${stat.className}`}>{stat.icon}</span>
                  <p className="text-lg font-bold text-al-text">{stat.value}</p>
                  <p className="text-[9px] text-al-text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {canSeeCompliance ? (
          <article className={`${panelClass} p-4 ${threeColSpan([canSeeUsers, canSeeCompliance, canSeeBilling].filter(Boolean).length)}`}>
            <SectionHeader title="Compliance Frameworks" subtitle="Configured in Compliance Hub" href="/trust/compliance" linkLabel="View all" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {overview.complianceFrameworks.length ? (
                overview.complianceFrameworks.slice(0, 6).map((framework) => (
                  <div key={framework.slug} className="rounded-md border border-white/[0.05] bg-al-surface/[0.02] px-2.5 py-2">
                    <span className={`grid h-6 w-6 place-items-center rounded-md ${framework.isEnabled ? 'bg-al-success/15 text-al-success' : 'bg-al-text-muted/15 text-al-text-muted'}`}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </span>
                    <p className="mt-1.5 truncate text-[11px] font-semibold text-al-text-secondary">{framework.name}</p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${framework.isEnabled ? 'bg-al-success/10 text-al-success' : 'bg-al-text-muted/10 text-al-text-muted'}`}>
                      {framework.isEnabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="col-span-2 py-4 text-center text-xs text-al-text-muted">No compliance frameworks configured yet.</p>
              )}
            </div>
          </article>
        ) : null}

        {canSeeBilling ? (
          <article className={`${panelClass} p-4 ${threeColSpan([canSeeUsers, canSeeCompliance, canSeeBilling].filter(Boolean).length)}`}>
            <SectionHeader title="Plan & Usage" subtitle="Billing & Plan" href="/dashboard/settings?tab=billing" linkLabel="Manage Plan" />
            {overview.billing ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-al-text-muted">Plan</span>
                  <span className="flex items-center gap-1.5 font-semibold text-al-text">
                    {overview.billing.planLabel}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        overview.billing.accountStatus === 'ACTIVE' ? 'bg-al-success/10 text-al-success' : 'bg-al-warning/10 text-al-warning'
                      }`}
                    >
                      {statusLabel(overview.billing.accountStatus)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-al-text-muted">Approvals this month</span>
                  <span className="font-semibold text-al-text">{compact(overview.planLimits?.approvalsThisMonth ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-al-text-muted">Seats</span>
                  <span className="font-semibold text-al-text">
                    {overview.billing.usedSeats} / {overview.billing.purchasedSeats > 0 ? overview.billing.purchasedSeats : (overview.planLimits?.seatLimit ?? '∞')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-al-text-muted">Integrations</span>
                  <span className="font-semibold text-al-text">
                    {overview.integrations.connectedCount} / {overview.planLimits?.connectedSystemLimit ?? '∞'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between"><span className="text-al-text-muted">Plan</span><span className="font-semibold text-al-text">Not provisioned</span></div>
                <div className="flex items-center justify-between"><span className="text-al-text-muted">Status</span><span className="font-semibold text-al-warning">Awaiting provisioning</span></div>
                <div className="flex items-center justify-between"><span className="text-al-text-muted">Next step</span><span className="font-semibold text-al-text">Provision a workspace plan</span></div>
                <Link href="/dashboard/settings?tab=billing" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-al-info hover:text-al-info">
                  <CreditCard className="h-3.5 w-3.5" /> Open Billing & Plan →
                </Link>
              </div>
            )}
          </article>
        ) : null}
      </div>

      {/* Row 6: Workspace Readiness (bottom placement when approval data isn't fully empty) */}
      {workspaceReadinessItems.length && !promoteReadiness ? (
        <WorkspaceReadinessSection items={workspaceReadinessItems} readinessActionFor={readinessActionFor} />
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
