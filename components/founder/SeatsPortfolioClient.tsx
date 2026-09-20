'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { planDisplayName } from '@/lib/plans';
import { FounderDrawer } from './FounderDrawer';
import {
  PLAN_FILTER_OPTIONS,
  ACCOUNT_STATUS_FILTER_OPTIONS,
  UTILIZATION_FILTER_OPTIONS,
  UTILIZATION_BUCKET_LABELS,
  planTone,
  accountStatusTone,
  fmtDate,
  fmtDateTime,
  fmtRelativeTime,
  computeUtilizationPercent,
  computeAvailableSeats,
  utilizationBucketFor,
  utilizationTone,
  fmtUtilization,
  fmtAvailableSeats,
  capacityInterpretation,
  type UtilizationBucket,
} from '@/lib/founder-seats';
import type { SeatsKpis, CapacityOverviewTotals, TopPressureRow, SeatChangeAuditRow } from '@/services/founder-seats';

export type SeatsUpdateActionState = { ok?: boolean; message?: string; error?: string };

export type SeatsRowClient = {
  id: string;
  companyName: string;
  domain: string;
  primaryAdminEmail: string;
  planTier: string;
  status: string;
  purchasedSeats: number;
  allocatedSeats: number;
  usedSeats: number;
  updatedAt: string;
  createdAt: string;
  invitedUsers: number;
  suspendedUsers: number;
  totalUsers: number;
  approvalsProcessed: number | null;
  integrationsConnected: number | null;
  lastLoginAt: string | null;
};

type SeatChangeClient = Omit<SeatChangeAuditRow, 'createdAt'> & { createdAt: string };

type Props = {
  generatedAt: string;
  kpis: SeatsKpis;
  capacityOverview: CapacityOverviewTotals;
  topPressure: TopPressureRow[];
  recentSeatChanges: SeatChangeClient[];
  rows: SeatsRowClient[];
  page: number;
  totalPages: number;
  totalCustomers: number;
  hasAnyCustomers: boolean;
  filters: { q: string; plan: string; status: string; utilization: string };
  canWrite: boolean;
  updateSeatsAction: (state: SeatsUpdateActionState, formData: FormData) => Promise<SeatsUpdateActionState>;
};

function Badge({ tone, children }: { tone: 'green' | 'blue' | 'amber' | 'red' | 'slate'; children: React.ReactNode }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return (
    <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${{ green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', slate: 'bg-slate-400', blue: 'bg-blue-500' }[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

// Minimal inline stroke icons matching this console's established icon
// language (Observability's/Certification's KpiIcon) — no icon library.
function KpiIcon({ kind }: { kind: 'purchased' | 'allocated' | 'used' | 'available' | 'utilization' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'purchased') return <svg {...common}><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M8 5v14M16 5v14" /></svg>;
  if (kind === 'allocated') return <svg {...common}><circle cx="9" cy="8.5" r="2.7" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9" r="2.2" /><path d="M15.5 13.5c2.3.3 4 2 4 4.5" /></svg>;
  if (kind === 'used') return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></svg>;
  if (kind === 'available') return <svg {...common}><rect x="4" y="4" width="12" height="16" rx="1.5" /><path d="M19 12h1.5M19 12l-1.7-1.7M19 12l-1.7 1.7" /></svg>;
  return <svg {...common}><path d="M4.5 16a7.5 7.5 0 1 1 15 0" /><path d="M12 16l3.2-4.6" /><path d="M12 16v.01" /></svg>;
}

function KpiCard({ kind, tone, label, value, detail }: { kind: Parameters<typeof KpiIcon>[0]['kind']; tone: 'green' | 'amber' | 'red' | 'slate' | 'blue'; label: string; value: string | number; detail: string }) {
  const iconBox = {
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-500',
    blue: 'bg-blue-50 text-[#2557dc]',
  }[tone];
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconBox}`}>
          <KpiIcon kind={kind} />
        </span>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black tabular-nums text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
    </div>
  );
}

function UtilizationBadge({ bucket, pct }: { bucket: UtilizationBucket | null; pct: number | null }) {
  const tone = utilizationTone(bucket);
  if (bucket === 'OVER_CAPACITY') return <Badge tone="red">Over capacity</Badge>;
  return <Badge tone={tone}>{fmtUtilization(pct)}</Badge>;
}

export function SeatsPortfolioClient({ generatedAt, kpis, capacityOverview, topPressure, recentSeatChanges, rows, page, totalPages, totalCustomers, hasAnyCustomers, filters, canWrite, updateSeatsAction }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshing, startRefresh] = useTransition();
  const [rightTab, setRightTab] = useState<'overview' | 'history' | 'requirements' | 'help'>('overview');

  const [q, setQ] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seatsInput, setSeatsInput] = useState('');
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const [actionState, formAction, savePending] = useActionState<SeatsUpdateActionState, FormData>(updateSeatsAction, {});

  function refresh() {
    if (refreshing) return;
    startRefresh(() => router.refresh());
  }

  // Same measured-not-decorative sticky shadow this table already relies
  // on: it only renders while the table actually needs horizontal scroll,
  // never as a permanent decoration that would bleed over the Updated
  // column at widths where nothing is scrolled.
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

  function pushParams(next: Partial<{ q: string; plan: string; status: string; utilization: string; page: string }>) {
    const params = new URLSearchParams();
    const merged = { q: filters.q, plan: filters.plan, status: filters.status, utilization: filters.utilization, page: String(page), ...next };
    if (merged.q) params.set('q', merged.q);
    if (merged.plan) params.set('plan', merged.plan);
    if (merged.status) params.set('status', merged.status);
    if (merged.utilization) params.set('utilization', merged.utilization);
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

  useEffect(() => {
    if (selected) setSeatsInput(String(selected.purchasedSeats));
  }, [selected]);

  const seatsUnchanged = selected != null && seatsInput === String(selected.purchasedSeats);
  const hasActiveFilters = Boolean(filters.q || filters.plan || filters.status || filters.utilization);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.plan) params.set('plan', filters.plan);
    if (filters.status) params.set('status', filters.status);
    if (filters.utilization) params.set('utilization', filters.utilization);
    if (p !== 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const kpiCards: { kind: Parameters<typeof KpiIcon>[0]['kind']; tone: 'green' | 'amber' | 'red' | 'slate' | 'blue'; label: string; value: string | number; detail: string }[] = [
    { kind: 'purchased', tone: 'blue', label: 'Purchased Seats', value: kpis.purchasedSeatsTotal, detail: 'Total seats purchased' },
    { kind: 'allocated', tone: 'blue', label: 'Allocated Seats', value: kpis.allocatedSeatsTotal, detail: 'Assigned to customer accounts' },
    { kind: 'used', tone: 'slate', label: 'Used Seats', value: kpis.usedSeatsTotal, detail: 'Currently in use' },
    { kind: 'available', tone: kpis.availableSeatsTotal < 0 ? 'red' : 'green', label: 'Available Seats', value: kpis.availableSeatsTotal < 0 ? `Over by ${Math.abs(kpis.availableSeatsTotal)}` : kpis.availableSeatsTotal, detail: 'Ready for allocation' },
    { kind: 'utilization', tone: kpis.overallUtilizationPercent == null ? 'slate' : kpis.overallUtilizationPercent > 100 ? 'red' : kpis.overallUtilizationPercent >= 80 ? 'amber' : 'green', label: 'Utilization', value: fmtUtilization(kpis.overallUtilizationPercent), detail: 'Used ÷ purchased, portfolio-wide' },
  ];

  const capacityTotalWidth = capacityOverview.usedWithinPurchasedTotal + capacityOverview.availableTotal + capacityOverview.overCapacityTotal;
  const pct = (n: number) => (capacityTotalWidth <= 0 ? 0 : (n / capacityTotalWidth) * 100);

  const currentStatusCopy = kpis.overCapacityCount > 0
    ? { label: 'Over Capacity Detected', tone: 'red' as const, detail: `${kpis.overCapacityCount} customer${kpis.overCapacityCount === 1 ? ' is' : 's are'} using more seats than purchased.` }
    : kpis.nearCapacityCount > 0
      ? { label: 'Near Capacity', tone: 'amber' as const, detail: `${kpis.nearCapacityCount} customer${kpis.nearCapacityCount === 1 ? ' is' : 's are'} at or above 80% utilization.` }
      : { label: 'Healthy', tone: 'green' as const, detail: 'No customer is near or over seat capacity.' };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Commercial</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Seats &amp; Usage</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Monitor customer seat capacity, allocation, utilization, and usage across the ApprovLine customer portfolio.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-right text-xs font-bold text-slate-500">
              Last checked<br />
              <span className="text-sm text-slate-700">{fmtDateTime(generatedAt)}</span>
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true" className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      <div className={`grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px] ${refreshing ? 'opacity-60' : ''}`}>
        <div className="min-w-0 space-y-4">
          <section aria-label="Seat KPIs" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpiCards.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
              <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="search"
                  placeholder="Search company, domain, or admin email…"
                  aria-label="Search customers"
                  className="h-9 w-72 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                />
                <select
                  value={filters.plan}
                  onChange={(e) => pushParams({ plan: e.target.value, page: '1' })}
                  aria-label="Filter by plan"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  {PLAN_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={filters.status}
                  onChange={(e) => pushParams({ status: e.target.value, page: '1' })}
                  aria-label="Filter by account status"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  {ACCOUNT_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={filters.utilization}
                  onChange={(e) => pushParams({ utilization: e.target.value, page: '1' })}
                  aria-label="Filter by utilization"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  {UTILIZATION_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
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

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Customer Seat Usage</p>
              {tableScrollable ? <p className="text-[11px] font-bold text-slate-400">Scroll horizontally to see all columns →</p> : null}
            </div>

            {!hasAnyCustomers ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-black text-slate-950">No customer seat allocations found.</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Seat data will appear here once customers are provisioned. <Link href="/founder/provision" className="text-[#2557dc]">Provision a customer</Link>.
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-bold text-slate-500">No customers match your current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto" ref={scrollerRef}>
                <table className="w-full min-w-[1106px] table-fixed text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-[180px] whitespace-nowrap px-5 py-3">Customer</th>
                      <th scope="col" className="w-[100px] whitespace-nowrap px-5 py-3">Plan</th>
                      <th scope="col" className="w-[135px] whitespace-nowrap px-5 py-3">Account Status</th>
                      <th scope="col" className="w-[90px] whitespace-nowrap px-5 py-3">Purchased</th>
                      <th scope="col" className="w-[90px] whitespace-nowrap px-5 py-3">Allocated</th>
                      <th scope="col" className="w-[80px] whitespace-nowrap px-5 py-3">Used</th>
                      <th scope="col" className="w-[90px] whitespace-nowrap px-5 py-3">Available</th>
                      <th scope="col" className="w-[130px] whitespace-nowrap px-5 py-3">Utilization</th>
                      <th scope="col" className="w-[115px] whitespace-nowrap px-5 py-3">Updated</th>
                      <th scope="col" className="w-24 whitespace-nowrap px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((customer) => {
                      const rowPct = computeUtilizationPercent(customer.usedSeats, customer.purchasedSeats);
                      const bucket = utilizationBucketFor(customer.usedSeats, customer.purchasedSeats);
                      const tone = utilizationTone(bucket);
                      const available = computeAvailableSeats(customer.usedSeats, customer.purchasedSeats);
                      const barWidth = rowPct == null ? 0 : Math.min(100, rowPct);
                      const barColor = tone === 'red' ? 'bg-rose-500' : tone === 'amber' ? 'bg-amber-400' : tone === 'green' ? 'bg-emerald-500' : 'bg-slate-300';
                      return (
                        <tr key={customer.id} className="group transition hover:bg-slate-50">
                          <td className="px-5 py-4">
                            <p className="truncate font-black text-slate-950">{customer.companyName}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{customer.domain}</p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4"><Badge tone={planTone(customer.planTier)}>{planDisplayName(customer.planTier)}</Badge></td>
                          <td className="whitespace-nowrap px-5 py-4"><Badge tone={accountStatusTone(customer.status)}>{customer.status}</Badge></td>
                          <td className="whitespace-nowrap px-5 py-4 font-black text-slate-950 tabular-nums">{customer.purchasedSeats}</td>
                          <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-700 tabular-nums">{customer.allocatedSeats}</td>
                          <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-700 tabular-nums">{customer.usedSeats}</td>
                          <td className={`whitespace-nowrap px-5 py-4 font-bold tabular-nums ${available < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{fmtAvailableSeats(available)}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                              </div>
                              <UtilizationBadge bucket={bucket} pct={rowPct} />
                            </div>
                          </td>
                          <td className="truncate px-5 py-4 text-xs font-semibold text-slate-500" title={fmtDate(customer.updatedAt)}>{fmtDate(customer.updatedAt)}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedId(customer.id)}
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

            {totalCustomers > 0 ? (
              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                <p className="text-xs font-bold text-slate-500">Page {page} of {totalPages} ({totalCustomers} customers)</p>
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

          {hasAnyCustomers ? (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Capacity Overview</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">Portfolio-wide seat capacity, computed per customer and never netted across accounts.</p>
                {capacityTotalWidth <= 0 ? (
                  <p className="mt-4 text-xs font-bold text-slate-500">No seat capacity recorded yet.</p>
                ) : (
                  <>
                    <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct(capacityOverview.usedWithinPurchasedTotal)}%` }} />
                      <div className="h-full bg-slate-300" style={{ width: `${pct(capacityOverview.availableTotal)}%` }} />
                      {capacityOverview.overCapacityTotal > 0 ? <div className="h-full bg-rose-500" style={{ width: `${pct(capacityOverview.overCapacityTotal)}%` }} /> : null}
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold">
                      <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /><dt className="text-slate-500">Used</dt><dd className="tabular-nums text-slate-800">{capacityOverview.usedWithinPurchasedTotal}</dd></div>
                      <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" /><dt className="text-slate-500">Available</dt><dd className="tabular-nums text-slate-800">{capacityOverview.availableTotal}</dd></div>
                      <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" /><dt className="text-slate-500">Over Capacity</dt><dd className="tabular-nums text-slate-800">{capacityOverview.overCapacityTotal}</dd></div>
                    </dl>
                  </>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Top Capacity Pressure</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Customers closest to their seat limit.</p>
                  </div>
                  <Link href="/founder/customers" className="shrink-0 text-xs font-black text-[#2557dc] hover:underline">View all →</Link>
                </div>
                {topPressure.length === 0 ? (
                  <p className="mt-4 text-xs font-bold text-slate-500">No customer has purchased seats yet.</p>
                ) : (
                  <ol className="mt-4 space-y-2.5">
                    {topPressure.map((row, i) => {
                      const barColor = row.utilizationBucket === 'OVER_CAPACITY' ? 'bg-rose-500' : row.utilizationBucket === 'AT_CAPACITY' || row.utilizationBucket === 'EIGHTY_TO_99' ? 'bg-amber-400' : 'bg-emerald-500';
                      const barWidth = row.utilizationPercent == null ? 0 : Math.min(100, row.utilizationPercent);
                      return (
                        <li key={row.id} className="flex items-center gap-3">
                          <span className="w-4 shrink-0 text-xs font-black text-slate-400">{i + 1}.</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-slate-800">{row.companyName}</p>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                            </div>
                          </div>
                          <span className={`shrink-0 text-xs font-black tabular-nums ${row.utilizationBucket === 'OVER_CAPACITY' ? 'text-rose-600' : 'text-slate-700'}`}>{fmtUtilization(row.utilizationPercent)}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </article>
            </section>
          ) : null}
        </div>

        {/* Right command panel */}
        <aside className="space-y-0">
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3.5">
              <h3 className="text-base font-black text-slate-950">Seats &amp; Usage</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Customer seat management and insights.</p>
            </div>
            <div className="flex flex-wrap border-b border-slate-100 px-2" role="tablist" aria-label="Seats & Usage panel">
              {(['overview', 'history', 'requirements', 'help'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={rightTab === tab}
                  onClick={() => setRightTab(tab)}
                  className={`whitespace-normal border-b-2 px-3 py-2 text-left text-xs font-black transition ${rightTab === tab ? 'border-[#2557dc] text-[#2557dc]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {tab === 'overview' ? 'Overview' : tab === 'history' ? 'History' : tab === 'requirements' ? 'Requirements' : 'Help'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {rightTab === 'overview' ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Quick Actions</p>
                    <div className="mt-3 space-y-2">
                      <Link href="/founder/billing" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl bg-[#2557dc] px-4 py-3 text-left text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
                        View Plans &amp; Billing <span aria-hidden="true">→</span>
                      </Link>
                      <Link href="/founder/customer-health" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50">
                        View Customer Health <span aria-hidden="true">→</span>
                      </Link>
                      <Link href="/founder/customers" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50">
                        View All Customers <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Current Status</p>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black text-slate-950">{currentStatusCopy.label}</p>
                        <Badge tone={currentStatusCopy.tone}>{currentStatusCopy.label === 'Healthy' ? 'Operational' : 'Attention'}</Badge>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{currentStatusCopy.detail}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Capacity Summary</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        { label: 'Healthy', value: kpis.healthyCount, tone: 'green' as const },
                        { label: 'Near Capacity', value: kpis.nearCapacityCount, tone: 'amber' as const },
                        { label: 'Over Capacity', value: kpis.overCapacityCount, tone: 'red' as const },
                        { label: 'No Usage', value: kpis.noUsageCount, tone: 'slate' as const },
                      ].map((row) => (
                        <div key={row.label} className="rounded-xl border border-slate-200 bg-white p-3">
                          <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{row.label}</dt>
                          <dd className={`mt-1 text-lg font-black ${row.tone === 'green' ? 'text-emerald-700' : row.tone === 'amber' ? 'text-amber-700' : row.tone === 'red' ? 'text-rose-700' : 'text-slate-700'}`}>{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              ) : rightTab === 'history' ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Recent Seat Changes</p>
                  {recentSeatChanges.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                      <p className="text-xs font-bold text-slate-600">No seat changes recorded yet.</p>
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {recentSeatChanges.map((change) => (
                        <li key={change.id} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-black text-slate-900">{change.companyName ?? 'Unknown customer'}</p>
                            <p className="shrink-0 text-[11px] font-semibold text-slate-500" title={fmtDateTime(change.createdAt)}>{fmtRelativeTime(change.createdAt)}</p>
                          </div>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {change.purchasedSeats != null ? `Set to ${change.purchasedSeats} purchased seat${change.purchasedSeats === 1 ? '' : 's'}` : 'Seats updated'}
                            {change.activeUsers != null ? ` · ${change.activeUsers} active user${change.activeUsers === 1 ? '' : 's'} at the time` : ''}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-400">by {change.actorEmail ?? 'unknown'}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : rightTab === 'requirements' ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Utilization Bands</p>
                  <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-500">The same thresholds used by the table&apos;s utilization filter — mutually exclusive, never overlapping.</p>
                  <ul className="mt-3 space-y-2">
                    {(Object.keys(UTILIZATION_BUCKET_LABELS) as UtilizationBucket[]).map((bucket) => (
                      <li key={bucket} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                        <span className="text-xs font-bold text-slate-800">{UTILIZATION_BUCKET_LABELS[bucket]}</span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${{ green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', slate: 'bg-slate-400' }[utilizationTone(bucket)]}`} aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="space-y-4 text-xs font-semibold leading-5 text-slate-600">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Purchased / Allocated / Used</p>
                    <p className="mt-1.5">Purchased and Allocated seats come from the customer&apos;s seat allocation record and are set together whenever a Founder updates seats. Used seats is a live count of that customer&apos;s active users.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Available</p>
                    <p className="mt-1.5">Purchased minus Used. Never floored at zero — a negative value means the customer is using more seats than purchased.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Utilization</p>
                    <p className="mt-1.5">Used ÷ Purchased. Never capped at 100% here, so a customer at 112% is shown honestly, not rounded down.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Over Capacity</p>
                    <p className="mt-1.5">Used seats exceed purchased seats. This is surfaced, never hidden or silently clamped.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {selected ? (
        <FounderDrawer onClose={() => setSelectedId(null)} titleId="seats-drawer-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div className="min-w-0">
              <h3 id="seats-drawer-title" className="truncate text-lg font-black text-slate-950">{selected.companyName}</h3>
              <p className="truncate text-xs font-semibold text-slate-400">{selected.domain}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={planTone(selected.planTier)}>{planDisplayName(selected.planTier)}</Badge>
                <Badge tone={accountStatusTone(selected.status)}>{selected.status}</Badge>
              </div>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close seat details" className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>

          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Seat Capacity</p>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Purchased Seats</dt><dd className="text-xs font-bold text-slate-700">{selected.purchasedSeats}</dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Allocated Seats</dt><dd className="text-xs font-bold text-slate-700">{selected.allocatedSeats}</dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Used Seats</dt><dd className="text-xs font-bold text-slate-700">{selected.usedSeats}</dd></div>
                <div className="flex items-center justify-between">
                  <dt className="font-semibold text-slate-500">Available Seats</dt>
                  <dd className={`text-xs font-bold ${computeAvailableSeats(selected.usedSeats, selected.purchasedSeats) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                    {fmtAvailableSeats(computeAvailableSeats(selected.usedSeats, selected.purchasedSeats))}
                  </dd>
                </div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Utilization</dt><dd className="text-xs font-bold text-slate-700">{fmtUtilization(computeUtilizationPercent(selected.usedSeats, selected.purchasedSeats))}</dd></div>
              </dl>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">
                {capacityInterpretation(selected.usedSeats, selected.purchasedSeats)}
              </p>
            </div>

            {canWrite ? (
              <form action={formAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Manage Seats</p>
                <input type="hidden" name="customerAccountId" value={selected.id} />
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500" htmlFor="seats-purchased-input">Purchased seats</label>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="seats-purchased-input"
                    type="number"
                    name="purchasedSeats"
                    value={seatsInput}
                    onChange={(e) => setSeatsInput(e.target.value)}
                    min={1}
                    aria-label="New purchased seats"
                    className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold outline-none focus:border-[#2557dc]"
                  />
                  <button
                    type="button"
                    onClick={() => setSeatsInput(String(selected.purchasedSeats))}
                    disabled={seatsUnchanged}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={seatsUnchanged || savePending}
                    aria-busy={savePending}
                    className="rounded-lg bg-[#2557dc] px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#2557dc]"
                  >
                    {savePending ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
                <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">Purchased seats cannot be set below the customer&apos;s current active user count.</p>
                {actionState.error ? (
                  <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700">{actionState.error}</p>
                ) : actionState.ok ? (
                  <p role="status" className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">{actionState.message}</p>
                ) : null}
              </form>
            ) : null}

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Usage Signals</p>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Invited Users</dt><dd className="text-xs font-bold text-slate-700">{selected.invitedUsers}</dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Suspended Users</dt><dd className="text-xs font-bold text-slate-700">{selected.suspendedUsers}</dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Total Users</dt><dd className="text-xs font-bold text-slate-700">{selected.totalUsers}</dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Approvals Processed</dt><dd className="text-xs font-bold text-slate-700">{selected.approvalsProcessed ?? '—'}</dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Integrations Connected</dt><dd className="text-xs font-bold text-slate-700">{selected.integrationsConnected ?? '—'}</dd></div>
                <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Last Activity</dt><dd className="text-xs font-bold text-slate-700">{fmtDate(selected.lastLoginAt)}</dd></div>
              </dl>
            </div>

            <Link
              href={`/founder/customers/${selected.id}`}
              className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700"
            >
              Open Customer 360 →
            </Link>
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
