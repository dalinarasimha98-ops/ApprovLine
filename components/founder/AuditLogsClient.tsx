'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { FounderDrawer } from './FounderDrawer';
import { MigrationNotice } from './FounderShell';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_CATEGORY_FILTER_OPTIONS,
  AUDIT_ACTION_FILTER_OPTIONS,
  AUDIT_DATE_RANGE_OPTIONS,
  auditCategoryFor,
  auditCategoryTone,
  auditLabelFor,
  resolveAuditTarget,
  resolveStateChange,
  sanitizeActivityMetadata,
  actorDisplayName,
  truncateValue,
  fmtDateTime,
  fmtRelativeTime,
  type AuditCategory,
} from '@/lib/founder-audit-logs';

export type AuditLogRowClient = {
  id: string;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  customer: { id: string; companyName: string; domain: string } | null;
};

export type AuditKpisClient = { totalEvents: number; todayEvents: number; customersAffected: number; administrativeActions: number };

type FiltersState = { q: string; category: string; action: string; customerAccountId: string; range: string };

type CustomerOption = { id: string; companyName: string; domain: string };

type Props =
  | {
      state: 'error';
      migrationRequired: boolean;
      safeError: string;
      filters: FiltersState;
      customers: CustomerOption[];
    }
  | {
      state: 'ok';
      kpis: AuditKpisClient;
      rows: AuditLogRowClient[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      hasAnyEventsAtAll: boolean;
      filters: FiltersState;
      customers: CustomerOption[];
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

function CategoryBadge({ category }: { category: AuditCategory }) {
  return <Badge tone={auditCategoryTone(category)}>{AUDIT_CATEGORY_LABELS[category]}</Badge>;
}

function targetFor(row: AuditLogRowClient) {
  return resolveAuditTarget({ targetType: row.targetType, targetId: row.targetId, metadata: row.metadata, customer: row.customer });
}

const DRAWER_TABS = ['overview', 'details'] as const;
type DrawerTab = (typeof DRAWER_TABS)[number];

export function AuditLogsClient(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(props.filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>('overview');

  const rows = props.state === 'ok' ? props.rows : [];
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const selectedTarget = selected ? targetFor(selected) : null;
  const selectedMetadata = selected ? sanitizeActivityMetadata(selected.metadata) : [];
  const selectedStateChange = selected ? resolveStateChange(selected.metadata) : null;

  function openDrawer(id: string) {
    setTab('overview');
    setSelectedId(id);
  }

  function pushParams(next: Partial<FiltersState & { page: string }>) {
    const merged = { ...props.filters, page: '1', ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set('q', merged.q);
    if (merged.category) params.set('category', merged.category);
    if (merged.action) params.set('action', merged.action);
    if (merged.customerAccountId) params.set('customerAccountId', merged.customerAccountId);
    if (merged.range && merged.range !== 'all') params.set('range', merged.range);
    if (merged.page && merged.page !== '1') params.set('page', merged.page);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushParams({ q });
  }

  function clearFilters() {
    setQ('');
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  }

  function refresh() {
    if (pending) return;
    startTransition(() => {
      router.refresh();
    });
  }

  const hasActiveFilters = Boolean(props.filters.q || props.filters.category || props.filters.action || props.filters.customerAccountId || (props.filters.range && props.filters.range !== 'all'));

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (props.filters.q) params.set('q', props.filters.q);
    if (props.filters.category) params.set('category', props.filters.category);
    if (props.filters.action) params.set('action', props.filters.action);
    if (props.filters.customerAccountId) params.set('customerAccountId', props.filters.customerAccountId);
    if (props.filters.range && props.filters.range !== 'all') params.set('range', props.filters.range);
    if (p !== 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const kpis = props.state === 'ok' ? [
    { label: 'Total Events', value: props.kpis.totalEvents.toLocaleString(), detail: 'All privileged Founder actions ever recorded.' },
    { label: "Today's Events", value: props.kpis.todayEvents.toLocaleString(), detail: 'Events recorded since midnight, local server time.' },
    { label: 'Customers Affected', value: props.kpis.customersAffected.toLocaleString(), detail: 'Distinct customers with at least one recorded event.' },
    { label: 'Administrative Actions', value: props.kpis.administrativeActions.toLocaleString(), detail: 'User invitations, role changes, suspensions, and removals.' },
  ] : [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Governance</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Founder Audit Logs</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Complete record of privileged Founder actions, customer administration, configuration, and platform changes.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            aria-busy={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true" className={pending ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
            {pending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {props.state === 'error' ? (
        <>
          {props.migrationRequired ? <MigrationNotice message={props.safeError} /> : (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
              <p className="text-sm font-black text-rose-900">Founder audit logs could not be loaded.</p>
              <p className="mt-1 text-xs font-semibold text-rose-700">Safe diagnostic: {props.safeError}</p>
            </section>
          )}
        </>
      ) : (
        <>
          <section aria-label="Audit log metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{kpi.label}</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{kpi.value}</p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{kpi.detail}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
              <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="search"
                  placeholder="Search actor, customer, action…"
                  aria-label="Search founder audit logs"
                  className="h-9 w-72 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                />
                <select
                  value={props.filters.category}
                  onChange={(e) => pushParams({ category: e.target.value })}
                  aria-label="Filter by category"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  {AUDIT_CATEGORY_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={props.filters.action}
                  onChange={(e) => pushParams({ action: e.target.value })}
                  aria-label="Filter by action"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All actions</option>
                  {AUDIT_ACTION_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={props.filters.customerAccountId}
                  onChange={(e) => pushParams({ customerAccountId: e.target.value })}
                  aria-label="Filter by customer"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All customers</option>
                  {props.customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                </select>
                <select
                  value={props.filters.range}
                  onChange={(e) => pushParams({ range: e.target.value })}
                  aria-label="Filter by date range"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  {AUDIT_DATE_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

            {!props.hasAnyEventsAtAll ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-black text-slate-950">No Founder audit events have been recorded yet.</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-bold text-slate-500">No audit events match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {rows.map((row) => {
                    const category = auditCategoryFor(row.action);
                    const target = targetFor(row);
                    return (
                      <li key={row.id} className="space-y-1.5 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-black text-slate-950">{auditLabelFor(row.action, row.metadata)}</p>
                          <CategoryBadge category={category} />
                        </div>
                        <p className="text-xs font-semibold text-slate-500">{fmtDateTime(row.createdAt)}</p>
                        <p className="text-xs font-semibold text-slate-500">Actor: <span className="text-slate-700">{actorDisplayName(row.actorEmail)}</span></p>
                        <p className="text-xs font-semibold text-slate-500">Customer: <span className="text-slate-700">{row.customer ? row.customer.companyName : 'Platform'}</span></p>
                        <p className="text-xs font-semibold text-slate-500">Target: <span className="text-slate-700">{target.primary}</span></p>
                        <button
                          type="button"
                          onClick={() => openDrawer(row.id)}
                          className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100"
                        >
                          View →
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <table className="hidden w-full min-w-[960px] table-fixed text-left text-sm sm:table">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-[190px] whitespace-nowrap px-5 py-3">Date / Time</th>
                      <th scope="col" className="w-[140px] whitespace-nowrap px-5 py-3">Actor</th>
                      <th scope="col" className="w-[160px] whitespace-nowrap px-5 py-3">Customer</th>
                      <th scope="col" className="px-5 py-3">Action</th>
                      <th scope="col" className="hidden w-[130px] whitespace-nowrap px-5 py-3 lg:table-cell">Category</th>
                      <th scope="col" className="hidden w-[180px] whitespace-nowrap px-5 py-3 lg:table-cell">Target</th>
                      <th scope="col" className="w-24 whitespace-nowrap px-4 py-3 text-right">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const category = auditCategoryFor(row.action);
                      const target = targetFor(row);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500" title={fmtDateTime(row.createdAt)}>
                            {fmtDateTime(row.createdAt)}
                          </td>
                          <td className="truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500" title={actorDisplayName(row.actorEmail)}>
                            {actorDisplayName(row.actorEmail)}
                          </td>
                          <td className="px-5 py-4">
                            {row.customer ? (
                              <>
                                <p className="truncate font-black text-slate-950">{row.customer.companyName}</p>
                                <p className="truncate text-xs font-semibold text-slate-500">{row.customer.domain}</p>
                              </>
                            ) : (
                              <Badge tone="slate">Platform</Badge>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <p className="truncate text-xs font-semibold leading-5 text-slate-700" title={auditLabelFor(row.action, row.metadata)}>{auditLabelFor(row.action, row.metadata)}</p>
                            <span className="mt-1 inline-block lg:hidden"><CategoryBadge category={category} /></span>
                          </td>
                          <td className="hidden whitespace-nowrap px-5 py-4 lg:table-cell">
                            <CategoryBadge category={category} />
                          </td>
                          <td className="hidden truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500 lg:table-cell" title={target.primary}>
                            {target.primary}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => openDrawer(row.id)}
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

            {props.total > 0 ? (
              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                <p className="text-xs font-bold text-slate-500">
                  Page {props.page} of {props.totalPages} (Showing {rows.length ? (props.page - 1) * props.pageSize + 1 : 0}–{(props.page - 1) * props.pageSize + rows.length} of {props.total.toLocaleString()})
                </p>
                <div className="flex gap-2">
                  <Link
                    href={pageHref(Math.max(1, props.page - 1))}
                    aria-disabled={props.page <= 1}
                    className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 ${props.page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
                  >
                    Previous
                  </Link>
                  <Link
                    href={pageHref(Math.min(props.totalPages, props.page + 1))}
                    aria-disabled={props.page >= props.totalPages}
                    className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 ${props.page >= props.totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}

      {selected ? (
        <FounderDrawer onClose={() => setSelectedId(null)} titleId="audit-drawer-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div className="min-w-0">
              <h3 id="audit-drawer-title" className="truncate text-lg font-black text-slate-950">{auditLabelFor(selected.action, selected.metadata)}</h3>
              <p className="truncate text-xs font-semibold text-slate-400">{selected.customer ? `${selected.customer.companyName} · ${selected.customer.domain}` : 'Platform'}</p>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close audit event details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>

          <div className="flex gap-1 border-b border-slate-100 px-6 pt-3" role="tablist" aria-label="Audit event detail tabs">
            {DRAWER_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`audit-tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`audit-tabpanel-${t}`}
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-3 py-2 text-xs font-black capitalize transition ${tab === t ? 'border-b-2 border-[#2557dc] text-[#2557dc]' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div id="audit-tabpanel-overview" role="tabpanel" aria-labelledby="audit-tab-overview" className="flex-1 space-y-5 px-6 py-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Event</p>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="font-bold text-slate-400">Customer</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.customer ? selected.customer.companyName : 'Platform'}</dd></div>
                  <div><dt className="font-bold text-slate-400">Actor</dt><dd className="mt-0.5 font-semibold text-slate-700">{actorDisplayName(selected.actorEmail)}</dd></div>
                  <div><dt className="font-bold text-slate-400">Action</dt><dd className="mt-0.5 font-semibold text-slate-700">{auditLabelFor(selected.action, selected.metadata)}</dd></div>
                  <div><dt className="font-bold text-slate-400">Category</dt><dd className="mt-0.5"><CategoryBadge category={auditCategoryFor(selected.action)} /></dd></div>
                  <div><dt className="font-bold text-slate-400">Timestamp</dt><dd className="mt-0.5 font-semibold text-slate-700" title={fmtDateTime(selected.createdAt)}>{fmtRelativeTime(selected.createdAt)}</dd></div>
                  <div><dt className="font-bold text-slate-400">Target</dt><dd className="mt-0.5 font-semibold text-slate-700">{selectedTarget!.primary}</dd></div>
                </dl>
              </div>
              {selected.customer ? (
                <Link href={`/founder/customers/${selected.customer.id}`} className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700">
                  Open Customer 360 →
                </Link>
              ) : null}
            </div>
          ) : null}

          {tab === 'details' ? (
            <div id="audit-tabpanel-details" role="tabpanel" aria-labelledby="audit-tab-details" className="flex-1 space-y-5 px-6 py-5">
              {selectedStateChange ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">State Change</p>
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div><dt className="font-bold text-slate-400">Previous {selectedStateChange.label}</dt><dd className="mt-0.5 font-semibold text-slate-700">{selectedStateChange.previous}</dd></div>
                    <div><dt className="font-bold text-slate-400">New {selectedStateChange.label}</dt><dd className="mt-0.5 font-semibold text-slate-700">{selectedStateChange.next}</dd></div>
                  </dl>
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Metadata</p>
                {selectedMetadata.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-500">No additional metadata was recorded for this event.</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    {selectedMetadata.map((entry) => (
                      <div key={entry.label}><dt className="font-bold text-slate-400">{entry.label}</dt><dd className="mt-0.5 break-words font-semibold text-slate-700">{truncateValue(entry.value)}</dd></div>
                    ))}
                  </dl>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Internal Reference</p>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="font-bold text-slate-400">Target Type</dt><dd className="mt-0.5 font-semibold text-slate-700">{selected.targetType}</dd></div>
                  <div><dt className="font-bold text-slate-400">Target ID</dt><dd className="mt-0.5 break-all font-mono text-[11px] font-semibold text-slate-500">{selectedTarget!.rawId ?? '—'}</dd></div>
                </dl>
              </div>
            </div>
          ) : null}
        </FounderDrawer>
      ) : null}
    </div>
  );
}
