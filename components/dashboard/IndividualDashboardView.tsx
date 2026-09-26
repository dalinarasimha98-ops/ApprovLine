import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MessageSquareWarning,
} from 'lucide-react';
import type { Role } from '@prisma/client';
import { ApprovalTable, type ApprovalTableRecord } from '@/components/dashboard/ApprovalTable';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { IndividualRangePicker } from '@/components/dashboard/IndividualRangePicker';
import { str, type RawSearchParams } from '@/lib/search-params';
import {
  describeAuditAction,
  type IndividualDashboardOverview,
  type IndividualDashboardRangeKey,
} from '@/services/individualDashboard';

export { str };
export type { RawSearchParams };

/**
 * Pure, Clerk/Prisma-independent presentation layer for the Individual User
 * Dashboard (/dashboard/me) - mirrors the split app/dashboard/page.tsx +
 * components/dashboard/OrganizationDashboardView.tsx already established:
 * a thin Server Component resolves the tenant/viewer and fetches data, this
 * component takes plain props, so it can be rendered directly (react-dom/
 * server's renderToStaticMarkup) with real seeded data for visual
 * verification without a live Clerk session, the same way the Organization
 * Dashboard's view already is.
 *
 * Deliberately a SEPARATE component/module from OrganizationDashboardView,
 * not a variant of it - this page answers "what needs MY attention," the
 * other answers "how is the workspace performing," and the two must stay
 * visibly, structurally distinct (no shared KPI strip, no org-wide charts
 * here, no personal queues there).
 */

const panelClass = 'rounded-lg border border-white/[0.09] bg-al-surface-sunken shadow-[0_12px_36px_rgba(0,0,0,.16)]';

function firstName(name: string | null, email: string): string {
  const source = name?.trim() || email.split('@')[0];
  return source.split(/\s+/)[0];
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function daysUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due in 1 day';
  return `Due in ${days} days`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

/** Trend text/tone shared by every KPI card below - kept as a small local
 *  helper (not imported from OrganizationDashboardView.tsx) so the two
 *  dashboards' presentation layers stay fully independent modules, per
 *  this file's own header note. */
function trendBadge(current: number, previous: number | null): { text: string; positive: boolean | null } | null {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: '0%', positive: null };
  const isIncrease = pct > 0;
  return { text: `${isIncrease ? '↑' : '↓'} ${Math.abs(pct)}%`, positive: null };
}

function KpiCard({
  label,
  value,
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
  context: string;
  trend?: { text: string; positive: boolean | null } | null;
  showComparisonState?: boolean;
  color: string;
  icon: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <article className={`${panelClass} relative min-h-[112px] overflow-hidden p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-al-text-muted">{label}</p>
          <p className="mt-1 text-[24px] font-bold leading-none tracking-tight text-al-text">{value}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1f`, color }}>{icon}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
        {trend ? (
          <span className="rounded bg-al-text-muted/10 px-1.5 py-0.5 text-al-text-muted">{trend.text}</span>
        ) : showComparisonState ? (
          <span className="rounded bg-al-text-muted/10 px-1.5 py-0.5 text-al-text-muted">No comparison available</span>
        ) : null}
        <span className="text-al-text-muted">{context}</span>
        {href ? <Link href={href} className="ml-auto font-bold text-al-info hover:text-al-info">{linkLabel ?? 'View →'}</Link> : null}
      </div>
    </article>
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

export function IndividualDashboardView({
  overview,
  userName,
  userEmail,
  rawParams,
}: {
  overview: IndividualDashboardOverview;
  userName: string | null;
  userEmail: string;
  role: Role;
  rawParams: RawSearchParams;
}) {
  const range = overview.range;
  const name = firstName(userName, userEmail);
  const myApprovalTableRecords: ApprovalTableRecord[] = overview.myApprovals.records;

  const rangeOptions: { key: IndividualDashboardRangeKey; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'thisMonth', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 text-al-text-secondary">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-al-text">{greeting()}, {name}</h1>
          <p className="mt-1 text-xs text-al-text-muted">Here&apos;s a summary of your approvals, tasks and activity.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {overview.degraded.length > 0 ? (
            <>
              <AutoRetryOnDegraded />
              <span className="rounded-md border border-al-warning/30 bg-al-warning/10 px-3 py-2 text-[10px] font-semibold text-al-warning">
                Some workspace data is delayed and will refresh automatically
              </span>
            </>
          ) : null}
          <IndividualRangePicker rangeOptions={rangeOptions} activeKey={range.key} rawParams={rawParams} />
        </div>
      </div>

      <p className="px-1 text-[10px] text-al-text-muted">
        Period metrics ({range.label.toLowerCase()}) use the selected date range. Pending, due and overdue items reflect everything currently requiring your attention, regardless of when they were created.
      </p>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Total Approvals"
          value={String(overview.kpis.totalApprovals.value)}
          context={`${range.label.toLowerCase()}`}
          trend={trendBadge(overview.kpis.totalApprovals.value, overview.kpis.totalApprovals.prevValue)}
          showComparisonState
          color="#2f7cff"
          icon={<CheckCircle2 className="h-4 w-4" />}
          href="/dashboard/approvals"
          linkLabel="View →"
        />
        <KpiCard
          label="My Pending Approvals"
          value={String(overview.kpis.myPendingApprovals.value)}
          context="Requires your decision"
          color="#f4b529"
          icon={<Clock3 className="h-4 w-4" />}
          href="/dashboard/pending-actions"
          linkLabel="Review →"
        />
        <KpiCard
          label="Due Today"
          value={String(overview.kpis.dueToday.value)}
          context="Action required today"
          color="#ff9f45"
          icon={<AlertTriangle className="h-4 w-4" />}
          href="/dashboard/pending-actions"
          linkLabel="Review →"
        />
        <KpiCard
          label="Overdue"
          value={String(overview.kpis.overdue.value)}
          context="Past due items"
          color="#ff624a"
          icon={<AlertTriangle className="h-4 w-4" />}
          href="/dashboard/pending-actions?status=OPEN"
          linkLabel="Review →"
        />
        <KpiCard
          label="Awaiting My Response"
          value={String(overview.kpis.awaitingMyResponse.value)}
          context="Comments or information"
          color="#8a6cf2"
          icon={<MessageSquareWarning className="h-4 w-4" />}
          href="/dashboard/pending-actions"
          linkLabel="Review →"
        />
      </div>

      {/* My Approvals */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-8`}>
          <SectionHeader title="My Approvals" subtitle="Approvals waiting for your decision" href="/dashboard/pending-actions" linkLabel="View all" />
          <div className="mt-3">
            {myApprovalTableRecords.length > 0 ? (
              <ApprovalTable approvals={myApprovalTableRecords} />
            ) : (
              <p className="py-10 text-center text-xs text-al-text-muted">No approvals require your attention right now.</p>
            )}
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Due Soon" subtitle="Items approaching their deadline" />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {overview.dueSoon.length ? (
              overview.dueSoon.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-al-text-secondary">{item.subject}</p>
                    <p className="text-[9px] text-al-text-muted">{item.category ?? 'Uncategorized'}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-al-warning">{daysUntil(item.dueAt)}</span>
                </div>
              ))
            ) : (
              <p className="flex items-center gap-2 py-6 text-center text-xs text-al-success">
                <CheckCircle2 className="h-4 w-4" /> You&apos;re all caught up.
              </p>
            )}
          </div>
        </article>
      </div>

      {/* Waiting on Others + My Recent Activity */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-7`}>
          <SectionHeader title="Waiting on Others" subtitle="Requests you sent that are still pending a response" />
          <div className="mt-3">
            {overview.waitingOnOthers.length ? (
              <div className="divide-y divide-white/[0.06]">
                {overview.waitingOnOthers.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-al-text-secondary">{item.subject}</p>
                      <p className="text-[9px] text-al-text-muted">
                        Submitted {timeAgo(item.submittedAt)} · Current approver: {item.currentApprover}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-al-info/10 px-2 py-0.5 text-[9px] font-bold text-al-info">{statusLabel(item.approvalStatus)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-al-text-muted">Nothing is waiting on another person.</p>
            )}
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-5`}>
          <SectionHeader title="My Recent Activity" subtitle="Your actions across approvals" href="/dashboard/audit-log" />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {overview.recentActivity.length ? (
              overview.recentActivity.map((event) => (
                <div key={event.id} className="flex items-center gap-2.5 py-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-al-accent/15 text-al-accent"><FileCheck2 className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-al-text-secondary">{describeAuditAction(event.action)}</p>
                    <p className="text-[9px] text-al-text-muted">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-al-text-muted">Your actions will appear here as you work in ApprovLine.</p>
            )}
          </div>
        </article>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-1 pt-3 text-[9px] text-al-text-secondary">
        <div className="flex flex-wrap gap-4">
          <span className="flex items-center gap-1"><ArrowRight className="h-3 w-3 rotate-45" />Personal workspace view</span>
        </div>
        <span>© 2026 ApprovLine</span>
      </div>
    </section>
  );
}
