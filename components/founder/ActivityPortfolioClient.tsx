'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { FounderDrawer } from './FounderDrawer';
import { planTone } from '@/lib/founder-billing';
import { planDisplayName } from '@/lib/plans';
import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  ACTIVITY_CATEGORY_FILTER_OPTIONS,
  ACTIVITY_ACTION_FILTER_OPTIONS,
  ACTIVITY_TIME_RANGE_OPTIONS,
  accountStatusTone,
  activityCategoryFor,
  activityCategoryTone,
  activityContextSuffix,
  activityLabelFor,
  fmtActivityTarget,
  fmtDateTime,
  fmtRelativeTime,
  healthStatusLabel,
  healthStatusTone,
  sanitizeActivityMetadata,
  ACTIVITY_CATEGORY_LABELS,
} from '@/lib/founder-activity';
import type { HealthStatus } from '@/lib/customer-health';

export type ActivityRowClient = {
  id: string;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  customer: {
    id: string;
    companyName: string;
    domain: string;
    status: string;
    planTier: string;
    healthStatus: HealthStatus | null;
    purchasedSeats: number | null;
  };
};

type Filters = { q: string; customerAccountId: string; category: string; action: string; status: string; timeRange: string };

type Props = {
  rows: ActivityRowClient[];
  page: number;
  totalPages: number;
  totalEvents: number;
  hasAnyCustomers: boolean;
  filters: Filters;
};

function Badge({ tone, children }: { tone: 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'purple' | 'teal'; children: React.ReactNode }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    purple: 'border-violet-200 bg-violet-50 text-violet-700',
    teal: 'border-teal-200 bg-teal-50 text-teal-700',
  }[tone];
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide ${classes}`}>
      {children}
    </span>
  );
}

function eventDisplayLabel(row: ActivityRowClient): string {
  return `${activityLabelFor(row.action, row.metadata)}${activityContextSuffix(row.action, row.metadata, row.targetId)}`;
}

const DRAWER_TABS = ['overview', 'recent', 'details'] as const;
type DrawerTab = (typeof DRAWER_TABS)[number];

export function ActivityPortfolioClient({ rows, page, totalPages, totalEvents, hasAnyCustomers, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>('overview');
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    setTab('overview');
  }, [selectedId]);

  // Same fix proven for Seats/Revenue/Notes: only shadow the sticky Action
  // column while horizontal scroll is genuinely needed, measured live —
  // an unconditional shadow bleeds over adjacent text at widths that need
  // no scroll at all.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollable, setTableScrollable] = useState(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setTableScrollable(el.scrollWidth > el.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rows]);

  function pushParams(next: Partial<Record<keyof Filters | 'page', string>>) {
    const params = new URLSearchParams();
    const merged = { ...filters, page: String(page), ...next };
    if (merged.q) params.set('q', merged.q);
    if (merged.customerAccountId) params.set('customerAccountId', merged.customerAccountId);
    if (merged.category) params.set('category', merged.category);
    if (merged.action) params.set('action', merged.action);
    if (merged.status) params.set('status', merged.status);
    if (merged.timeRange && merged.timeRange !== '30') params.set('timeRange', merged.timeRange);
    if (merged.page && merged.page !== '1') params.set('page', merged.page);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushParams({ q, page: '1' });
  }

  function clearFilters() {
    setQ('');
    router.push(pathname);
  }

  const hasActiveFilters = Boolean(
    filters.q || filters.customerAccountId || filters.category || filters.action || filters.status || (filters.timeRange && filters.timeRange !== '30'),
  );

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.customerAccountId) params.set('customerAccountId', filters.customerAccountId);
    if (filters.category) params.set('category', filters.category);
    if (filters.action) params.set('action', filters.action);
    if (filters.status) params.set('status', filters.status);
    if (filters.timeRange && filters.timeRange !== '30') params.set('timeRange', filters.timeRange);
    if (p !== 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const viewAllForCustomerHref = (customerAccountId: string) => {
    const params = new URLSearchParams();
    params.set('customerAccountId', customerAccountId);
    return `${pathname}?${params.toString()}`;
  };

  const recentForSelectedCustomer = selected
    ? rows.filter((r) => r.customer.id === selected.customer.id && r.id !== selected.id).slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
          <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="Search customer, domain, actor, or event…"
              aria-label="Search customer activity"
              className="h-9 w-72 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            />
            <select
              value={filters.category}
              onChange={(e) => pushParams({ category: e.target.value, page: '1' })}
              aria-label="Filter by category"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              {ACTIVITY_CATEGORY_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filters.action}
              onChange={(e) => pushParams({ action: e.target.value, page: '1' })}
              aria-label="Filter by event type"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All event types</option>
              {ACTIVITY_ACTION_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filters.timeRange || '30'}
              onChange={(e) => pushParams({ timeRange: e.target.value, page: '1' })}
              aria-label="Filter by time range"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              {ACTIVITY_TIME_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filters.status}
              onChange={(e) => pushParams({ status: e.target.value, page: '1' })}
              aria-label="Filter by account status"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              {ACCOUNT_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
            <button type="submit" className="h-9 rounded-lg bg-[#2557dc] px-3 text-xs font-black text-white hover:bg-[#1a44be]">
              Search
            </button>
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                Clear Filters
              </button>
            ) : null}
          </form>
        </div>

        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Customer Activity Timeline</p>
        </div>

        {!hasAnyCustomers ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base font-black text-slate-950">No customer accounts have been provisioned yet.</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              <Link href="/founder/provision" className="text-[#2557dc]">Provision a customer</Link> to start recording activity.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-bold text-slate-500">
              {hasActiveFilters ? 'No activity matches your current filters.' : 'No customer activity has been recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto" ref={scrollerRef}>
            {/* Core columns (Date/Customer/Event/Action) stay visible down
                to 1024/768 at a tight min-width; Category/Actor/Target —
                secondary detail, already visible in full in the drawer —
                render only at xl+ (1280px), the same responsive-column-
                hiding strategy already proven for Notes/Revenue. */}
            <table className="w-full min-w-[726px] table-fixed text-left text-sm xl:min-w-[1156px]">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-[150px] whitespace-nowrap px-5 py-3">Date / Time</th>
                  <th scope="col" className="w-[160px] whitespace-nowrap px-5 py-3">Customer</th>
                  <th scope="col" className="w-[290px] px-5 py-3">Event</th>
                  <th scope="col" className="hidden w-[120px] whitespace-nowrap px-5 py-3 xl:table-cell">Category</th>
                  <th scope="col" className="hidden w-[150px] whitespace-nowrap px-5 py-3 xl:table-cell">Actor</th>
                  <th scope="col" className="hidden w-[160px] whitespace-nowrap px-5 py-3 xl:table-cell">Target</th>
                  <th scope="col" className={`sticky right-0 w-24 whitespace-nowrap bg-slate-50 px-4 py-3 text-right ${tableScrollable ? 'shadow-[-6px_0_8px_-4px_rgba(15,23,42,0.18)]' : ''}`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const category = activityCategoryFor(row.action);
                  return (
                    <tr key={row.id} className="group transition hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500" title={fmtDateTime(row.createdAt)}>
                        {fmtDateTime(row.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <p className="truncate font-black text-slate-950">{row.customer.companyName}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{row.customer.domain}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="truncate text-xs font-semibold leading-5 text-slate-700" title={eventDisplayLabel(row)}>{eventDisplayLabel(row)}</p>
                        <span className="mt-1 inline-block xl:hidden"><Badge tone={activityCategoryTone(category)}>{ACTIVITY_CATEGORY_LABELS[category]}</Badge></span>
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-4 xl:table-cell">
                        <Badge tone={activityCategoryTone(category)}>{ACTIVITY_CATEGORY_LABELS[category]}</Badge>
                      </td>
                      <td className="hidden w-[150px] truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500 xl:table-cell" title={row.actorEmail ?? 'System'}>
                        {row.actorEmail ?? 'System'}
                      </td>
                      <td className="hidden w-[160px] truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500 xl:table-cell" title={fmtActivityTarget(row.targetType, row.targetId)}>
                        {fmtActivityTarget(row.targetType, row.targetId)}
                      </td>
                      <td className={`sticky right-0 whitespace-nowrap bg-white px-4 py-4 text-right group-hover:bg-slate-50 ${tableScrollable ? 'shadow-[-6px_0_8px_-4px_rgba(15,23,42,0.18)]' : ''}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalEvents > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <p className="text-xs font-bold text-slate-500">Page {page} of {totalPages} ({totalEvents} events)</p>
            <div className="flex gap-2">
              <Link
                href={pageHref(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 ${page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
              >
                Previous
              </Link>
              <Link
                href={pageHref(Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 ${page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      {selected ? (
        <FounderDrawer onClose={() => setSelectedId(null)} titleId="activity-drawer-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div className="min-w-0">
              <h3 id="activity-drawer-title" className="truncate text-lg font-black text-slate-950">{selected.customer.companyName}</h3>
              <p className="truncate text-xs font-semibold text-slate-400">{selected.customer.domain}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={planTone(selected.customer.planTier)}>{planDisplayName(selected.customer.planTier)}</Badge>
                <Badge tone={accountStatusTone(selected.customer.status)}>{selected.customer.status}</Badge>
                {selected.customer.healthStatus ? <Badge tone={healthStatusTone(selected.customer.healthStatus)}>{healthStatusLabel(selected.customer.healthStatus)}</Badge> : null}
              </div>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close customer activity details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>

          <div className="flex gap-1 border-b border-slate-100 px-6 pt-3" role="tablist" aria-label="Customer activity detail tabs">
            {DRAWER_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`activity-tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`activity-tabpanel-${t}`}
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-3 py-2 text-xs font-black capitalize transition ${
                  tab === t ? 'border-b-2 border-[#2557dc] text-[#2557dc]' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'recent' ? 'Recent Activity' : t}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div id="activity-tabpanel-overview" role="tabpanel" aria-labelledby="activity-tab-overview" className="flex-1 space-y-5 px-6 py-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Customer Information</p>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="font-bold text-slate-400">Domain</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.customer.domain}</dd></div>
                  <div><dt className="font-bold text-slate-400">Account Status</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.customer.status}</dd></div>
                  <div><dt className="font-bold text-slate-400">Plan</dt><dd className="mt-0.5 font-semibold text-slate-700">{planDisplayName(selected.customer.planTier)}</dd></div>
                  {selected.customer.purchasedSeats !== null ? (
                    <div><dt className="font-bold text-slate-400">Seats</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.customer.purchasedSeats}</dd></div>
                  ) : null}
                  {selected.customer.healthStatus ? (
                    <div><dt className="font-bold text-slate-400">Health</dt><dd className="mt-0.5 font-semibold text-slate-700">{healthStatusLabel(selected.customer.healthStatus)}</dd></div>
                  ) : null}
                </dl>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Latest Activity</p>
                <p className="text-xs font-semibold text-slate-500">{fmtRelativeTime(selected.createdAt)}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{eventDisplayLabel(selected)}</p>
                <div className="mt-2"><Badge tone={activityCategoryTone(activityCategoryFor(selected.action))}>{ACTIVITY_CATEGORY_LABELS[activityCategoryFor(selected.action)]}</Badge></div>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  Actor: <span className="text-slate-700">{selected.actorEmail ?? 'System'}</span>
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Target: <span className="text-slate-700">{fmtActivityTarget(selected.targetType, selected.targetId)}</span>
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Quick Actions</p>
                <Link
                  href={`/founder/customers/${selected.customer.id}`}
                  className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700"
                >
                  Open Customer 360 →
                </Link>
                <Link
                  href={`/founder/notes?q=${encodeURIComponent(selected.customer.domain)}`}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Open Support & Notes →
                </Link>
                <Link
                  href={`/founder/audit?customerAccountId=${selected.customer.id}`}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Open Founder Audit Logs →
                </Link>
              </div>
            </div>
          ) : null}

          {tab === 'recent' ? (
            <div id="activity-tabpanel-recent" role="tabpanel" aria-labelledby="activity-tab-recent" className="flex-1 space-y-3 px-6 py-5">
              {recentForSelectedCustomer.length === 0 ? (
                <p className="text-xs font-semibold leading-5 text-slate-400">
                  No other activity for this customer is present on the current page of the timeline.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentForSelectedCustomer.map((r) => (
                    <li key={r.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-[11px] font-bold text-slate-400">{fmtRelativeTime(r.createdAt)}</p>
                      <p className="mt-0.5 text-sm font-black text-slate-950">{eventDisplayLabel(r)}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={viewAllForCustomerHref(selected.customer.id)}
                className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                View all activity for this customer →
              </Link>
            </div>
          ) : null}

          {tab === 'details' ? (
            <div id="activity-tabpanel-details" role="tabpanel" aria-labelledby="activity-tab-details" className="flex-1 space-y-3 px-6 py-5">
              <dl className="space-y-3 text-xs">
                <div><dt className="font-bold text-slate-400">Event</dt><dd className="mt-0.5 font-semibold text-slate-700">{eventDisplayLabel(selected)}</dd></div>
                <div><dt className="font-bold text-slate-400">Customer</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.customer.companyName}</dd></div>
                <div><dt className="font-bold text-slate-400">Timestamp</dt><dd className="mt-0.5 font-semibold text-slate-700">{fmtDateTime(selected.createdAt)}</dd></div>
                <div><dt className="font-bold text-slate-400">Actor</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.actorEmail ?? 'System'}</dd></div>
                <div><dt className="font-bold text-slate-400">Category</dt><dd className="mt-0.5 font-semibold text-slate-700">{ACTIVITY_CATEGORY_LABELS[activityCategoryFor(selected.action)]}</dd></div>
                <div><dt className="font-bold text-slate-400">Target</dt><dd className="mt-0.5 font-semibold text-slate-700">{fmtActivityTarget(selected.targetType, selected.targetId)}</dd></div>
              </dl>
              {sanitizeActivityMetadata(selected.metadata).length > 0 ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Context</p>
                  <dl className="space-y-2 text-xs">
                    {sanitizeActivityMetadata(selected.metadata).map((entry) => (
                      <div key={entry.label} className="flex justify-between gap-3">
                        <dt className="font-bold text-slate-400">{entry.label}</dt>
                        <dd className="truncate text-right font-semibold text-slate-700">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          ) : null}
        </FounderDrawer>
      ) : null}
    </div>
  );
}
