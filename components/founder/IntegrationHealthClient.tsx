'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { FounderDrawer } from './FounderDrawer';
import {
  ACCESS_STATE_LABELS,
  CONNECTION_STATE_LABELS,
  HEALTH_STATE_LABELS,
  HEALTH_STATUS_FILTER_OPTIONS,
  PLAN_TIER_LABELS,
  accessBadgeClass,
  connectionBadgeClass,
  healthBadgeClass,
  fmtDateTime,
  fmtRelativeTime,
  type CustomerIntegrationHealthState,
} from '@/lib/founder-integration-health';
import type { IntegrationHealthRow, ProviderHealthSummary, CustomerImpactSummary, IntegrationHealthKpis } from '@/services/founder-integration-health';
import type { CustomerIntegrationDetail } from '@/services/founder-customer-integrations';

type DetailResult = { ok: true; data: CustomerIntegrationDetail } | { ok: false; error: string };

type Props = {
  generatedAt: string;
  kpis: IntegrationHealthKpis;
  attentionRows: IntegrationHealthRow[];
  attentionPage: number;
  attentionTotalPages: number;
  attentionTotalRows: number;
  providerOverview: ProviderHealthSummary[];
  customerImpact: CustomerImpactSummary[];
  providerOptions: Array<{ slug: string; displayName: string }>;
  hasAnyIntegrationData: boolean;
  filters: { q: string; provider: string; health: string };
  onLoadDetail: (organizationId: string, providerSlug: string) => Promise<DetailResult>;
};

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'slate'; children: React.ReactNode }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide ${classes}`}>
      {children}
    </span>
  );
}

function healthTone(health: CustomerIntegrationHealthState): 'green' | 'amber' | 'red' {
  if (health === 'HEALTHY') return 'green';
  if (health === 'ATTENTION') return 'amber';
  return 'red';
}

function initials(label: string): string {
  return label.split(/[\s_-]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function IntegrationHealthClient({
  generatedAt,
  kpis,
  attentionRows,
  attentionPage,
  attentionTotalPages,
  attentionTotalRows,
  providerOverview,
  customerImpact,
  providerOptions,
  hasAnyIntegrationData,
  filters,
  onLoadDetail,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [selected, setSelected] = useState<IntegrationHealthRow | null>(null);
  const [detail, setDetail] = useState<CustomerIntegrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'recent' | 'details'>('overview');

  function refresh() {
    if (pending) return;
    startTransition(() => router.refresh());
  }

  function pushParams(next: Partial<{ q: string; provider: string; health: string; page: string }>) {
    const merged = { q: filters.q, provider: filters.provider, health: filters.health, page: String(attentionPage), ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set('q', merged.q);
    if (merged.provider) params.set('provider', merged.provider);
    if (merged.health) params.set('health', merged.health);
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

  async function openDrawer(row: IntegrationHealthRow) {
    setSelected(row);
    setDrawerTab('overview');
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    const result = await onLoadDetail(row.organizationId, row.providerSlug);
    setDetailLoading(false);
    if (result.ok) setDetail(result.data);
    else setDetailError(result.error);
  }

  const hasActiveFilters = Boolean(filters.q || filters.provider || filters.health);
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.provider) params.set('provider', filters.provider);
    if (filters.health) params.set('health', filters.health);
    if (targetPage > 1) params.set('page', String(targetPage));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Integration Operations</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Integration Health</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Monitor connected customer integrations, connection state, failures, and operational health across ApprovLine.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-right text-xs font-bold text-slate-500">
              Last updated<br />
              <span className="text-sm text-slate-700">{fmtDateTime(generatedAt)}</span>
            </p>
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
        </div>

        {hasAnyIntegrationData ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Total Connected', value: kpis.totalConnected },
              { label: 'Healthy', value: kpis.healthy, color: 'text-emerald-600' },
              { label: 'Attention', value: kpis.attention, color: kpis.attention > 0 ? 'text-amber-600' : 'text-slate-600' },
              { label: 'Critical', value: kpis.critical, color: kpis.critical > 0 ? 'text-rose-600' : 'text-slate-600' },
              { label: 'Affected Customers', value: kpis.affectedCustomers, color: kpis.affectedCustomers > 0 ? 'text-amber-600' : 'text-slate-600' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                <p className={`text-2xl font-black ${kpi.color ?? 'text-slate-950'}`}>{kpi.value}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{kpi.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {!hasAnyIntegrationData ? (
        <section className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-base font-black text-slate-950">No customer integrations found</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">No customer has a connected or available integration yet.</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Integration Attention</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Real connections that are disconnected, erroring, or need re-authentication — never onboarding-in-progress access grants.</p>
              </div>
              <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="search"
                  placeholder="Search customers, providers, domains…"
                  aria-label="Search customers, providers, or domains"
                  className="h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                />
                <select
                  value={filters.provider}
                  onChange={(e) => pushParams({ provider: e.target.value, page: '1' })}
                  aria-label="Filter by provider"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All providers</option>
                  {providerOptions.map((p) => <option key={p.slug} value={p.slug}>{p.displayName}</option>)}
                </select>
                <select
                  value={filters.health}
                  onChange={(e) => pushParams({ health: e.target.value, page: '1' })}
                  aria-label="Filter by health state"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All health states</option>
                  {HEALTH_STATUS_FILTER_OPTIONS.filter((s) => s !== 'HEALTHY').map((s) => <option key={s} value={s}>{HEALTH_STATE_LABELS[s]}</option>)}
                </select>
                <button type="submit" className="h-9 rounded-lg bg-[#2557dc] px-3 text-xs font-black text-white hover:bg-[#1a44be]">
                  Search
                </button>
                {hasActiveFilters ? (
                  <button type="button" onClick={clearFilters} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                    Clear
                  </button>
                ) : null}
              </form>
            </div>

            {attentionTotalRows === 0 ? (
              <div className="px-6 py-10 text-center">
                {hasActiveFilters ? (
                  <p className="font-bold text-slate-500">No integrations match your current filters.</p>
                ) : (
                  <p className="text-sm font-semibold text-slate-500">All connected integrations are currently healthy.</p>
                )}
              </div>
            ) : (
              <>
                {/* Below sm: Customer/Provider/Status/Issue/Action must stay visible without
                    horizontal scrolling, so narrow screens get compact stacked cards instead
                    of a table wide enough to scroll Status/Issue/Action out of the viewport. */}
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {attentionRows.map((row) => (
                    <li key={`${row.organizationId}:${row.providerSlug}`} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950">{row.companyName}</p>
                          <p className="truncate text-xs font-semibold text-slate-400">{row.domain}</p>
                        </div>
                        <Badge tone={healthTone(row.health)}>{HEALTH_STATE_LABELS[row.health]}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-[8px] font-black text-[#2557dc]">
                          {initials(row.providerDisplayName)}
                        </span>
                        <span className="truncate text-xs font-bold text-slate-700">{row.providerDisplayName}</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-600">{row.issue ?? '—'}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-slate-400">{row.lastCheckedAt ? fmtRelativeTime(row.lastCheckedAt) : 'Never checked'}</p>
                        <button type="button" onClick={() => openDrawer(row)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-100">
                          View →
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[900px] table-fixed text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="w-[220px] px-6 py-3">Customer</th>
                        <th scope="col" className="w-[150px] px-3 py-3">Provider</th>
                        <th scope="col" className="w-[110px] px-3 py-3">Status</th>
                        <th scope="col" className="px-3 py-3">Issue</th>
                        <th scope="col" className="w-[130px] px-3 py-3">Last Check</th>
                        <th scope="col" className="w-24 px-3 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attentionRows.map((row) => (
                        <tr key={`${row.organizationId}:${row.providerSlug}`} className="hover:bg-slate-50">
                          <td className="truncate px-6 py-4">
                            <p className="truncate font-black text-slate-950">{row.companyName}</p>
                            <p className="truncate text-xs font-semibold text-slate-400">{row.domain}</p>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-2">
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-[9px] font-black text-[#2557dc]">
                                {initials(row.providerDisplayName)}
                              </span>
                              <span className="truncate font-bold text-slate-700">{row.providerDisplayName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <Badge tone={healthTone(row.health)}>{HEALTH_STATE_LABELS[row.health]}</Badge>
                          </td>
                          <td className="truncate px-3 py-4 text-xs font-semibold text-slate-600" title={row.issue ?? undefined}>{row.issue ?? '—'}</td>
                          <td className="truncate px-3 py-4 text-xs font-semibold text-slate-500" title={row.lastCheckedAt ? fmtDateTime(row.lastCheckedAt) : undefined}>
                            {row.lastCheckedAt ? fmtRelativeTime(row.lastCheckedAt) : 'Never'}
                          </td>
                          <td className="px-3 py-4 text-right">
                            <button type="button" onClick={() => openDrawer(row)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-100">
                              View →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {attentionTotalRows > 0 ? (
              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                <p className="text-xs font-bold text-slate-500">
                  Page {attentionPage} of {attentionTotalPages} ({attentionTotalRows} integration{attentionTotalRows === 1 ? '' : 's'} needing attention)
                </p>
                <div className="flex gap-2">
                  <Link
                    href={pageHref(attentionPage - 1)}
                    aria-disabled={attentionPage <= 1}
                    className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 ${attentionPage <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
                  >
                    Previous
                  </Link>
                  <Link
                    href={pageHref(attentionPage + 1)}
                    aria-disabled={attentionPage >= attentionTotalPages}
                    className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 ${attentionPage >= attentionTotalPages ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
                  >
                    Next
                  </Link>
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Provider Health Overview</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Health status for connected integrations by provider.</p>
              </div>
              {providerOverview.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm font-semibold text-slate-500">No provider has any customer integration yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] table-fixed text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">Provider</th>
                        <th scope="col" className="w-20 px-3 py-2.5 text-right">Customers</th>
                        <th scope="col" className="w-20 px-3 py-2.5 text-right">Healthy</th>
                        <th scope="col" className="w-20 px-3 py-2.5 text-right">Attention</th>
                        <th scope="col" className="w-20 px-3 py-2.5 text-right">Critical</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {providerOverview.map((p) => (
                        <tr key={p.slug} className="hover:bg-slate-50">
                          <td className="truncate px-4 py-3 font-black text-slate-950">{p.displayName}</td>
                          <td className="px-3 py-3 text-right font-bold text-slate-700">{p.totalCustomers}</td>
                          <td className="px-3 py-3 text-right font-bold text-emerald-600">{p.healthy}</td>
                          <td className={`px-3 py-3 text-right font-bold ${p.attention > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{p.attention}</td>
                          <td className={`px-3 py-3 text-right font-bold ${p.critical > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{p.critical}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Customer Impact</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Customers with degraded or failed integrations.</p>
              </div>
              {customerImpact.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm font-semibold text-slate-500">No customer is currently affected.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] table-fixed text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">Customer</th>
                        <th scope="col" className="w-20 px-3 py-2.5">Plan</th>
                        <th scope="col" className="w-16 px-3 py-2.5 text-right">Issues</th>
                        <th scope="col" className="w-20 px-3 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerImpact.map((c) => (
                        <tr key={c.customerAccountId} className="hover:bg-slate-50">
                          <td className="truncate px-4 py-3">
                            <p className="truncate font-black text-slate-950">{c.companyName}</p>
                            <p className="truncate text-xs font-semibold text-slate-400">{c.domain}</p>
                          </td>
                          <td className="px-3 py-3 text-xs font-semibold text-slate-500">{PLAN_TIER_LABELS[c.planTier]}</td>
                          <td className="px-3 py-3 text-right">
                            <Badge tone={c.worstHealth === 'CRITICAL' ? 'red' : 'amber'}>{c.issueCount}</Badge>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Link href={`/founder/customers/${c.customerAccountId}`} className="text-[11px] font-black text-[#2557dc] hover:underline">
                              View →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {selected ? (
        <FounderDrawer onClose={() => setSelected(null)} titleId="integration-health-drawer-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-[#2557dc]">
                  {initials(selected.providerDisplayName)}
                </span>
                <div>
                  <h3 id="integration-health-drawer-title" className="text-lg font-black text-slate-950">{selected.companyName}</h3>
                  <p className="text-xs font-semibold text-slate-400">{selected.domain}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-black text-slate-700">{selected.providerDisplayName}</span>
                <Badge tone={healthTone(selected.health)}>{HEALTH_STATE_LABELS[selected.health]}</Badge>
              </div>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close integration details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 pt-2" role="tablist" aria-label="Integration detail tabs">
            {(['overview', 'recent', 'details'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`integration-health-tab-${t}`}
                aria-selected={drawerTab === t}
                aria-controls={`integration-health-tabpanel-${t}`}
                onClick={() => setDrawerTab(t)}
                className={`whitespace-normal rounded-t-lg px-3 py-2 text-left text-xs font-black transition ${drawerTab === t ? 'border-b-2 border-[#2557dc] text-[#2557dc]' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t === 'overview' ? 'Overview' : t === 'recent' ? 'Recent Activity' : 'Details'}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-5 px-6 py-5">
            {detailLoading ? (
              <p className="text-sm font-semibold text-slate-500">Loading…</p>
            ) : detailError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{detailError}</p>
            ) : detail ? (
              <>
                {drawerTab === 'overview' ? (
                  <div id="integration-health-tabpanel-overview" role="tabpanel" aria-labelledby="integration-health-tab-overview" className="space-y-4">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Connection Summary</p>
                      <dl className="space-y-2 text-sm">
                        {[
                          ['Connection Status', CONNECTION_STATE_LABELS[detail.connection], connectionBadgeClass(detail.connection)],
                          ['Access Status', ACCESS_STATE_LABELS[detail.access], accessBadgeClass(detail.access)],
                          ['Health State', HEALTH_STATE_LABELS[detail.health], healthBadgeClass(detail.health)],
                        ].map(([label, value, cls]) => (
                          <div key={label} className="flex items-center justify-between">
                            <dt className="font-semibold text-slate-500">{label}</dt>
                            <dd><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${cls}`}>{value}</span></dd>
                          </div>
                        ))}
                        <div className="flex items-center justify-between">
                          <dt className="font-semibold text-slate-500">Last successful sync</dt>
                          <dd className="font-bold text-slate-700">{detail.lastSyncAt ? fmtDateTime(detail.lastSyncAt) : 'Never'}</dd>
                        </div>
                      </dl>
                    </div>
                    {selected.issue ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <p className="text-xs font-black text-rose-900">Issue</p>
                        <p className="mt-1 text-xs font-semibold text-rose-700">{selected.issue}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {drawerTab === 'recent' ? (
                  <div id="integration-health-tabpanel-recent" role="tabpanel" aria-labelledby="integration-health-tab-recent" className="space-y-4">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Sync Activity</p>
                      {detail.syncActivity.length === 0 ? (
                        <p className="text-xs font-semibold text-slate-500">No sync activity recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {detail.syncActivity.slice(0, 8).map((e) => (
                            <li key={e.id} className="text-xs">
                              <span className="font-bold text-slate-700">{e.type}</span>
                              <span className="ml-2 text-slate-400">{fmtRelativeTime(e.occurredAt)}</span>
                              {e.failureReason ? <p className="mt-0.5 text-rose-600">{e.failureReason}</p> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Founder Audit Trail</p>
                      {detail.activity.length === 0 ? (
                        <p className="text-xs font-semibold text-slate-500">No Founder actions recorded for this integration.</p>
                      ) : (
                        <ul className="space-y-2">
                          {detail.activity.slice(0, 8).map((a) => (
                            <li key={a.id} className="text-xs">
                              <span className="font-bold text-slate-700">{a.action}</span>
                              <span className="ml-2 text-slate-400">{fmtRelativeTime(a.createdAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}

                {drawerTab === 'details' ? (
                  <div id="integration-health-tabpanel-details" role="tabpanel" aria-labelledby="integration-health-tab-details" className="rounded-xl border border-slate-200 p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Connection Details</p>
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div><dt className="font-bold text-slate-400">Connected By</dt><dd className="mt-0.5 font-semibold text-slate-700">{detail.connectedBy ?? 'Unknown'}</dd></div>
                      <div><dt className="font-bold text-slate-400">Connected On</dt><dd className="mt-0.5 font-semibold text-slate-700">{detail.connectedOn ? fmtDateTime(detail.connectedOn) : 'Unknown'}</dd></div>
                      <div><dt className="font-bold text-slate-400">External Account</dt><dd className="mt-0.5 truncate font-semibold text-slate-700">{detail.externalAccount ?? 'Not available'}</dd></div>
                      <div><dt className="font-bold text-slate-400">Scopes</dt><dd className="mt-0.5 font-semibold text-slate-700">{detail.scopes.length > 0 ? detail.scopes.length : 'Not available'}</dd></div>
                    </dl>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Quick Actions</p>
              <Link href={`/founder/customers/${selected.customerAccountId}`} className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700">
                Open Customer 360 →
              </Link>
              <Link href={`/founder/customer-integrations?q=${encodeURIComponent(selected.domain)}`} className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50">
                Open Customer Integrations →
              </Link>
              <Link href={`/founder/activity?customerAccountId=${selected.customerAccountId}`} className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50">
                Open Customer Activity →
              </Link>
            </div>
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
