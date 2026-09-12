'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { planDisplayName } from '@/lib/plans';
import { FounderDrawer } from './FounderDrawer';
import {
  PLAN_FILTER_OPTIONS,
  ACCOUNT_STATUS_FILTER_OPTIONS,
  UTILIZATION_FILTER_OPTIONS,
  planTone,
  accountStatusTone,
  fmtDate,
  computeUtilizationPercent,
  computeAvailableSeats,
  utilizationBucketFor,
  utilizationTone,
  fmtUtilization,
  fmtAvailableSeats,
  capacityInterpretation,
} from '@/lib/founder-seats';

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

type Props = {
  rows: SeatsRowClient[];
  page: number;
  totalPages: number;
  totalCustomers: number;
  hasAnyCustomers: boolean;
  filters: { q: string; plan: string; status: string; utilization: string };
  canWrite: boolean;
  updateSeatsAction: (formData: FormData) => void | Promise<void>;
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
    <span className={`inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${classes}`}>
      {children}
    </span>
  );
}

export function SeatsPortfolioClient({ rows, page, totalPages, totalCustomers, hasAnyCustomers, filters, canWrite, updateSeatsAction }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seatsInput, setSeatsInput] = useState('');
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // The sticky Action column's edge shadow should only render while the
  // table actually needs horizontal scrolling. Rendered unconditionally,
  // it visually bleeds over the Updated column's text even at widths
  // where the whole table already fits with no scroll at all (1440px) —
  // that looked exactly like the clipped-column defect this is meant to
  // fix, just for a new, self-inflicted reason. Measured via
  // ResizeObserver on the scroll container so it responds to viewport
  // resizes and filter/page changes without a hydration mismatch (starts
  // false, matching server-rendered markup, then corrects after mount).
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

  return (
    <div className="space-y-6">
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

        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Customer Seat Usage</p>
        </div>

        {!hasAnyCustomers ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base font-black text-slate-950">No customer accounts have been provisioned yet.</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              <Link href="/founder/provision" className="text-[#2557dc]">Provision a customer</Link> to see their seat capacity and usage.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-bold text-slate-500">No customers match your current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" ref={scrollerRef}>
            {/* table-fixed + an explicit width on every header cell —
                deliberately not the plain `auto` layout the sibling Founder
                tables use. With a sticky-positioned last column, `auto`
                layout's content-based width distribution is unreliable at
                narrow viewports: verified (by toggling the sticky class
                off/on against the real compiled markup) that the exact
                same header/badge content renders fully at every width with
                sticky removed, but gets visually clipped mid-glyph with it
                present — a real, narrow-viewport-only interaction between
                `position: sticky` and table auto-layout's column-width
                calculation, not a whitespace/overflow issue. `table-fixed`
                sidesteps it entirely by sizing every column from this
                header row alone, independent of sticky positioning.

                Column widths are also deliberately tight (summing to
                1106px) rather than merely "enough": at the 1440px desktop
                breakpoint the Founder main content area (viewport minus
                the 260px sidebar and lg:px-8 padding) is 1116px, so the
                whole table fits with no horizontal scroll at all — the
                one width this module is most commonly viewed at. Narrower
                widths (1280 and below) still scroll; the sticky Action
                column's shadow (instead of a bare 1px border) is what
                keeps that scroll reading as an intentional floating
                action rail rather than a clipped/broken column, since
                position: sticky visually overlaps whatever else would
                render in that screen slot at scrollLeft 0 — a shadow-less
                opaque cell reads as an accidental cut, a shadowed one
                reads as "pinned on purpose, scroll for the rest of the
                row" (confirmed against real rendered screenshots).

                Updated is 115px (not a tighter number) because fmtDate
                (shared with Billing, not altered here) renders "Sep 10,
                2026"-style strings — narrower and the text would overflow
                into the sticky Action cell's own opaque background and
                look silently truncated, the same failure mode this pass
                exists to remove, just caused by a width budget instead of
                position: sticky. Its cell also uses `truncate` instead of
                a bare `whitespace-nowrap` as a second line of defense: if
                a locale ever produces a longer string than this budget
                assumes, it degrades to a visible ellipsis instead of
                being invisibly eaten by the next cell. */}
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
                  <th scope="col" className={`sticky right-0 w-24 whitespace-nowrap bg-slate-50 px-4 py-3 text-right ${tableScrollable ? 'shadow-[-6px_0_8px_-4px_rgba(15,23,42,0.18)]' : ''}`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((customer) => {
                  const pct = computeUtilizationPercent(customer.usedSeats, customer.purchasedSeats);
                  const bucket = utilizationBucketFor(customer.usedSeats, customer.purchasedSeats);
                  const tone = utilizationTone(bucket);
                  const available = computeAvailableSeats(customer.usedSeats, customer.purchasedSeats);
                  const barWidth = pct == null ? 0 : Math.min(100, pct);
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
                          <span className={`text-xs font-bold tabular-nums ${tone === 'red' ? 'text-rose-600' : 'text-slate-600'}`}>{fmtUtilization(pct)}</span>
                        </div>
                      </td>
                      <td className="truncate px-5 py-4 text-xs font-semibold text-slate-500" title={fmtDate(customer.updatedAt)}>{fmtDate(customer.updatedAt)}</td>
                      <td className={`sticky right-0 whitespace-nowrap bg-white px-4 py-4 text-right group-hover:bg-slate-50 ${tableScrollable ? 'shadow-[-6px_0_8px_-4px_rgba(15,23,42,0.18)]' : ''}`}>
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
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close seat details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
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
                <form action={updateSeatsAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Manage Seats</p>
                  <input type="hidden" name="customerAccountId" value={selected.id} />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      name="purchasedSeats"
                      value={seatsInput}
                      onChange={(e) => setSeatsInput(e.target.value)}
                      min={1}
                      aria-label="Purchased seats"
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold outline-none focus:border-[#2557dc]"
                    />
                    <button
                      disabled={seatsUnchanged}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                    >
                      Save changes
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">Purchased seats cannot be set below the customer&apos;s current active user count.</p>
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
