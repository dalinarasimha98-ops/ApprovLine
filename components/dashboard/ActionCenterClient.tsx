'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PendingLink } from '@/components/system/PendingLink';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';
import {
  ACTION_TYPE_LABELS,
  ACTION_PRIORITY_LABELS,
  ACTION_STATUS_LABELS,
  SOURCE_PLATFORM_LABELS,
  normalizeSourcePlatform,
  fmtRelativeTime,
  fmtDueDate,
  type ActionPriority,
  type ActionStatus,
} from '@/lib/action-center';
import type { ActionCenterKpis, ActionRow } from '@/services/action-center';
import { Hash, Mail, Users, Ticket, Video, Link2, X, Copy, ExternalLink } from 'lucide-react';

function ProviderIcon({ platform, className }: { platform: string | null; className?: string }) {
  const p = normalizeSourcePlatform(platform);
  const props = { className: className ?? 'h-3.5 w-3.5', 'aria-hidden': true as const };
  if (p === 'SLACK') return <Hash {...props} />;
  if (p === 'GMAIL' || p === 'OUTLOOK') return <Mail {...props} />;
  if (p === 'MICROSOFT_TEAMS') return <Users {...props} />;
  if (p === 'JIRA' || p === 'SERVICENOW') return <Ticket {...props} />;
  if (p === 'ZOOM') return <Video {...props} />;
  return <Link2 {...props} />;
}

const STATUS_BADGE_CLASSES: Record<ActionStatus, string> = {
  PENDING: 'bg-al-warning/10 text-al-warning border-al-warning/20',
  DUE_TODAY: 'bg-al-info/10 text-al-info border-al-info/20',
  OVERDUE: 'bg-al-danger/10 text-al-danger border-al-danger/20',
  RESOLVED: 'bg-al-success/10 text-al-success border-al-success/20',
  DISPUTED: 'bg-al-danger/10 text-al-danger border-al-danger/20',
  SUPERSEDED: 'bg-al-text-muted/10 text-al-text-muted border-al-text-muted/20',
};

function StatusBadge({ status }: { status: ActionStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE_CLASSES[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {ACTION_STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_BADGE_CLASSES: Record<ActionPriority, string> = {
  low: 'bg-al-success/10 text-al-success border-al-success/20',
  medium: 'bg-al-warning/10 text-al-warning border-al-warning/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-al-danger/10 text-al-danger border-al-danger/20',
};

function PriorityBadge({ priority }: { priority: ActionPriority }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${PRIORITY_BADGE_CLASSES[priority]}`}>
      {ACTION_PRIORITY_LABELS[priority]}
    </span>
  );
}

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Sources' },
  { value: 'slack', label: 'Slack' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'jira', label: 'Jira' },
  { value: 'servicenow', label: 'ServiceNow' },
  { value: 'zoom', label: 'Zoom' },
];

const ACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Action Types' },
  { value: 'APPROVAL_REQUEST', label: 'Approval Request' },
  { value: 'REVIEW_REQUEST', label: 'Review Request' },
  { value: 'CONFIRMATION_REQUEST', label: 'Confirmation Request' },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'OPEN', label: 'Pending' },
  { value: 'RESOLVED', label: 'Resolved' },
];

export type ActionCenterFiltersValue = {
  q: string;
  source: string;
  actionType: string;
  priority: string;
  status: string;
};

export type ActionCenterProps = {
  rows: ActionRow[];
  kpis: ActionCenterKpis;
  page: number;
  totalPages: number;
  totalCount: number;
  filters: ActionCenterFiltersValue;
  initialSelectedId: string | null;
  initialSelectedFallback: ActionRow | null;
  approvalsHref: string;
};

function fmtExactTimestamp(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function detailField(label: string, value: React.ReactNode) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-al-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-al-text">{value}</dd>
    </div>
  );
}

export function ActionCenterClient(props: ActionCenterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(props.filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialSelectedId);
  const [copied, setCopied] = useState(false);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return props.rows.find((r) => r.id === selectedId) ?? (props.initialSelectedFallback?.id === selectedId ? props.initialSelectedFallback : null);
  }, [selectedId, props.rows, props.initialSelectedFallback]);

  const pushParams = useCallback(
    (next: Partial<ActionCenterFiltersValue> & { page?: number }) => {
      const merged = { ...props.filters, page: props.page, ...next };
      const params = new URLSearchParams();
      if (merged.q) params.set('q', merged.q);
      if (merged.source) params.set('source', merged.source);
      if (merged.actionType) params.set('actionType', merged.actionType);
      if (merged.priority) params.set('priority', merged.priority);
      if (merged.status && merged.status !== 'OPEN') params.set('status', merged.status);
      if (merged.page && merged.page !== 1) params.set('page', String(merged.page));
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [props.filters, props.page, pathname, router],
  );

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushParams({ q, page: 1 });
  }

  function clearFilters() {
    setQ('');
    startTransition(() => router.push(pathname));
  }

  function openAction(id: string) {
    setSelectedId(id);
    const params = new URLSearchParams(window.location.search);
    params.set('action', id);
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  }

  function closeDrawer() {
    setSelectedId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('action');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }

  async function copyLink(id: string) {
    const params = new URLSearchParams(window.location.search);
    params.set('action', id);
    const url = `${window.location.origin}${pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the link is still visible/selectable in the address bar */
    }
  }

  const hasActiveFilters = Boolean(props.filters.q || props.filters.source || props.filters.actionType || props.filters.priority || props.filters.status !== 'OPEN' && props.filters.status);

  const kpiCards = [
    { label: 'Needs Attention', value: props.kpis.needsAttention, detail: 'Require your review', icon: '◫', color: 'blue' },
    { label: 'Due Today', value: props.kpis.dueToday, detail: 'Action needed today', icon: '◷', color: 'amber' },
    { label: 'Overdue', value: props.kpis.overdue, detail: 'Past the due date', icon: '⚑', color: 'rose' },
    { label: 'High Priority', value: props.kpis.highPriority, detail: 'Critical or high', icon: '⚑', color: 'orange' },
    { label: 'Recently Resolved', value: props.kpis.recentlyResolved, detail: 'In the last 30 days', icon: '✓', color: 'emerald' },
  ] as const;

  const iconBg: Record<string, string> = {
    blue: 'bg-al-info/10 text-al-info',
    amber: 'bg-al-warning/10 text-al-warning',
    rose: 'bg-al-danger/10 text-al-danger',
    orange: 'bg-orange-500/10 text-orange-400',
    emerald: 'bg-al-success/10 text-al-success',
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Header */}
      <div className="overflow-hidden rounded-xl border border-al-border bg-al-surface px-5 py-4">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-al-accent">Action Center</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-al-text sm:text-3xl">Pending Actions</h1>
        <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-al-text-muted">
          Review approval requests, decisions, and other actions that require your attention.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Action Center summary">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-al-border bg-al-surface p-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${iconBg[kpi.color]}`}>{kpi.icon}</div>
              <div className="min-w-0">
                <p className="font-mono text-2xl font-black tracking-tight text-al-text">{kpi.value.toLocaleString()}</p>
                <p className="mt-0.5 text-[11px] font-bold text-al-text">{kpi.label}</p>
                <p className="text-[10.5px] font-semibold text-al-text-muted">{kpi.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <form onSubmit={submitSearch} className="flex flex-col gap-3 rounded-xl border border-al-border bg-al-surface p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          placeholder="Search actions, people, or keywords..."
          aria-label="Search actions, people, or keywords"
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
        />
        <select
          value={props.filters.source}
          onChange={(e) => pushParams({ source: e.target.value, page: 1 })}
          aria-label="Filter by source"
          className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-2.5 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
        >
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={props.filters.actionType}
          onChange={(e) => pushParams({ actionType: e.target.value, page: 1 })}
          aria-label="Filter by action type"
          className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-2.5 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
        >
          {ACTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={props.filters.priority}
          onChange={(e) => pushParams({ priority: e.target.value, page: 1 })}
          aria-label="Filter by priority"
          className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-2.5 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
        >
          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={props.filters.status || 'OPEN'}
          onChange={(e) => pushParams({ status: e.target.value, page: 1 })}
          aria-label="Filter by status"
          className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-2.5 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-al-accent px-4 text-sm font-bold text-white hover:bg-al-accent-hover">
          Search
        </button>
        {hasActiveFilters ? (
          <button type="button" onClick={clearFilters} className="h-9 rounded-lg border border-al-border px-3 text-sm font-bold text-al-text-secondary hover:border-al-accent/40">
            Clear filters
          </button>
        ) : null}
        {pending ? <span className="text-xs font-semibold text-al-text-muted" aria-live="polite">Updating…</span> : null}
      </form>

      {/* Empty state */}
      {props.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-al-border bg-al-surface/50 p-12 text-center">
          {hasActiveFilters ? (
            <>
              <h3 className="text-xl font-black text-al-text">No actions match your filters</h3>
              <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-al-text-muted">
                Try a different search term or clear filters to see everything that needs attention.
              </p>
              <div className="mt-5 flex justify-center">
                <button type="button" onClick={clearFilters} className="rounded-lg bg-al-accent px-5 py-2 text-sm font-bold text-white hover:bg-al-accent-hover">
                  Clear filters
                </button>
              </div>
            </>
          ) : props.filters.status === 'RESOLVED' ? (
            <>
              <h3 className="text-xl font-black text-al-text">No resolved actions yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-al-text-muted">
                Confirmed or disputed manual approvals will appear here once a response is recorded.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-black uppercase tracking-widest text-al-accent">All caught up</p>
              <h3 className="mt-3 text-xl font-black text-al-text">You&apos;re all caught up</h3>
              <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-al-text-muted">
                New approval and review requests will appear here when they require your attention.
              </p>
              <div className="mt-5 flex justify-center">
                <PendingLink href={props.approvalsHref} pendingText="Opening…" className="rounded-lg border border-al-border bg-al-surface-elevated px-5 py-2 text-sm font-bold text-al-accent hover:border-al-accent/40">
                  View Approvals
                </PendingLink>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden min-w-0 overflow-hidden rounded-2xl border border-al-border bg-al-surface md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-sm">
                <thead className="bg-al-surface-sunken text-xs uppercase tracking-wide text-al-text-muted">
                  <tr>
                    <th scope="col" className="w-[24%] px-4 py-3 font-semibold">Action</th>
                    <th scope="col" className="w-[13%] px-4 py-3 font-semibold">Requested By</th>
                    <th scope="col" className="w-[12%] px-4 py-3 font-semibold">Source</th>
                    <th scope="col" className="w-[9%] px-4 py-3 font-semibold">Priority</th>
                    <th scope="col" className="w-[12%] px-4 py-3 font-semibold">Requested</th>
                    <th scope="col" className="w-[11%] px-4 py-3 font-semibold">Due</th>
                    <th scope="col" className="w-[10%] px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="w-[9%] px-4 py-3 font-semibold text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {props.rows.map((row) => (
                    <tr key={row.id} className="border-t border-al-border align-top transition hover:bg-al-surface-elevated">
                      <td className="px-4 py-4">
                        <button type="button" onClick={() => openAction(row.id)} title={row.title} className="block w-full text-left font-bold text-al-text hover:text-al-accent">
                          <span className="block truncate">{row.title}</span>
                        </button>
                        <p className="mt-0.5 truncate text-xs font-semibold text-al-text-muted">{ACTION_TYPE_LABELS[row.actionType]}</p>
                      </td>
                      <td className="px-4 py-3 text-al-text-secondary">
                        <span title={row.requestedByName ?? 'Unknown'} className="block truncate font-semibold">{row.requestedByName ?? 'Unknown'}</span>
                        {row.requestedByEmail ? <span title={row.requestedByEmail} className="block truncate text-xs text-al-text-secondary">{row.requestedByEmail}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-al-info/10 px-2.5 py-1 text-xs font-bold text-al-info">
                          <ProviderIcon platform={row.sourcePlatformRaw} />
                          {SOURCE_PLATFORM_LABELS[normalizeSourcePlatform(row.sourcePlatformRaw)]}
                        </span>
                        {row.sourceChannel ? <p title={row.sourceChannel} className="mt-1 truncate text-xs text-al-text-secondary">{row.sourceChannel}</p> : null}
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={row.priority} /></td>
                      <td className="px-4 py-3 text-al-text-muted">
                        <span className="block whitespace-nowrap">{fmtRelativeTime(row.requestedAt)}</span>
                        <span className="block whitespace-nowrap text-xs text-al-text-secondary">{row.requestedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-3 text-al-text-muted">{fmtDueDate(row.dueAt)}</td>
                      <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openAction(row.id)} className="text-xs font-bold text-al-accent hover:text-al-accent hover:underline">
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {props.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openAction(row.id)}
                className="flex w-full flex-col items-stretch whitespace-normal rounded-xl border border-al-border bg-al-surface p-4 text-left transition hover:border-al-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <p title={row.title} className="min-w-0 flex-1 truncate font-bold text-al-text">{row.title}</p>
                  <StatusBadge status={row.status} />
                </div>
                <p className="mt-1 text-xs font-semibold text-al-text-muted">{ACTION_TYPE_LABELS[row.actionType]} &middot; {SOURCE_PLATFORM_LABELS[normalizeSourcePlatform(row.sourcePlatformRaw)]}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={row.priority} />
                  <span className="text-xs font-semibold text-al-text-muted">{fmtRelativeTime(row.requestedAt)}</span>
                  <span className="text-xs font-semibold text-al-text-secondary">{row.dueAt ? `Due ${fmtDueDate(row.dueAt)}` : fmtDueDate(row.dueAt)}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-al-border bg-al-surface px-4 py-3 sm:flex-row">
            <p className="text-xs font-semibold text-al-text-muted">
              Showing {(props.page - 1) * 10 + 1}–{Math.min(props.page * 10, props.totalCount)} of {props.totalCount} actions
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={props.page <= 1}
                onClick={() => pushParams({ page: props.page - 1 })}
                className="h-8 rounded-lg border border-al-border px-3 text-xs font-bold text-al-text-secondary hover:border-al-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-bold text-al-text">{props.page} / {props.totalPages}</span>
              <button
                type="button"
                disabled={props.page >= props.totalPages}
                onClick={() => pushParams({ page: props.page + 1 })}
                className="h-8 rounded-lg border border-al-border px-3 text-xs font-bold text-al-text-secondary hover:border-al-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail drawer */}
      {selected ? (
        <DetailDrawer onClose={closeDrawer} titleId="action-detail-title" descriptionId="action-detail-subject">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-al-border bg-al-surface-sunken px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-al-info/10 px-2.5 py-1 text-xs font-bold text-al-info">
                  <ProviderIcon platform={selected.sourcePlatformRaw} className="h-3 w-3" />
                  {SOURCE_PLATFORM_LABELS[normalizeSourcePlatform(selected.sourcePlatformRaw)]}
                </span>
                <StatusBadge status={selected.status} />
              </div>
              <h2 id="action-detail-title" className="mt-2 text-base font-black leading-snug text-al-text">{selected.title}</h2>
              <p id="action-detail-subject" className="mt-0.5 text-xs font-semibold text-al-text-muted">{ACTION_TYPE_LABELS[selected.actionType]}</p>
            </div>
            <button type="button" onClick={closeDrawer} aria-label="Close action detail" className="mt-0.5 shrink-0 rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated hover:text-al-text-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid gap-5">
              <section>
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Requested By</h3>
                <div className="rounded-xl border border-al-border bg-al-surface-sunken p-3">
                  <p className="text-sm font-bold text-al-text">{selected.requestedByName ?? 'Unknown'}</p>
                  {selected.requestedByEmail ? <p className="text-xs text-al-text-muted">{selected.requestedByEmail}</p> : null}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Requested For</h3>
                <div className="rounded-xl border border-al-border bg-al-surface-sunken p-3">
                  {selected.requestedForName || selected.requestedForEmail ? (
                    <>
                      <p className="text-sm font-bold text-al-text">{selected.requestedForName ?? 'Unknown'}</p>
                      {selected.requestedForEmail ? <p className="text-xs text-al-text-muted">{selected.requestedForEmail}</p> : null}
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-al-text-muted">Unassigned</p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Details</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-al-border bg-al-surface-sunken p-3">
                  {detailField(
                    'Requested',
                    <>
                      {fmtExactTimestamp(selected.requestedAt)}
                      <span className="block font-semibold text-al-text-muted">{fmtRelativeTime(selected.requestedAt)}</span>
                    </>,
                  )}
                  {detailField('Due date', fmtDueDate(selected.dueAt))}
                  {detailField('Priority', <PriorityBadge priority={selected.priority} />)}
                  {detailField('Type', ACTION_TYPE_LABELS[selected.actionType])}
                  {selected.department ? detailField('Department', selected.department) : null}
                  {selected.category ? detailField('Category', selected.category) : null}
                </dl>
              </section>

              {selected.context ? (
                <section>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Context</h3>
                  <p className="max-h-40 overflow-y-auto rounded-xl border border-al-info/20 bg-al-info/10 p-3 text-[13px] leading-5 text-blue-900">
                    {selected.context}
                  </p>
                </section>
              ) : null}

              <section>
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Evidence</h3>
                {selected.evidenceRecordId ? (
                  <a href={`/evidence/${selected.evidenceRecordId}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-al-accent hover:text-violet-900">
                    View Evidence <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <p className="text-sm font-semibold text-al-text-muted">Evidence not available yet.</p>
                )}
              </section>
            </div>
          </div>

          <div className="shrink-0 border-t border-al-border bg-al-surface px-5 py-4">
            <div className="grid gap-2">
              {selected.sourceExternalUrl ? (
                <a
                  href={selected.sourceExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-al-accent text-sm font-black text-white hover:bg-al-accent-hover"
                >
                  Open in {SOURCE_PLATFORM_LABELS[normalizeSourcePlatform(selected.sourcePlatformRaw)]} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <a href={`/approvals/${selected.id}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-al-border text-xs font-black text-al-text-secondary hover:bg-al-surface-sunken">
                  View Approval
                </a>
                <a href={`/approvals/${selected.id}/source`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-al-border text-xs font-black text-al-text-secondary hover:bg-al-surface-sunken">
                  View in ApprovLine
                </a>
              </div>
              <button
                type="button"
                onClick={() => copyLink(selected.id)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-al-border text-xs font-black text-al-text-secondary hover:bg-al-surface-sunken"
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? 'Link copied' : 'Copy link'}
              </button>
            </div>
          </div>
        </DetailDrawer>
      ) : null}
    </div>
  );
}
