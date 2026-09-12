'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { planDisplayName } from '@/lib/plans';
import { FounderDrawer } from './FounderDrawer';
import {
  PLAN_FILTER_OPTIONS,
  ACCOUNT_STATUS_FILTER_OPTIONS,
  REVENUE_COVERAGE_FILTER_OPTIONS,
  planTone,
  accountStatusTone,
  fmtDate,
  fmtEstimatedArr,
  revenueStatusFor,
  revenueStatusLabel,
  revenueStatusTone,
} from '@/lib/founder-revenue';

export type RevenueRowClient = {
  id: string;
  companyName: string;
  domain: string;
  primaryAdminEmail: string;
  planTier: string;
  status: string;
  estimatedArrUsd: number | null;
  purchasedSeats: number;
  allocatedSeats: number;
  usedSeats: number;
  internalNotes: string | null;
  updatedAt: string;
  createdAt: string;
};

type Props = {
  rows: RevenueRowClient[];
  page: number;
  totalPages: number;
  totalCustomers: number;
  hasAnyCustomers: boolean;
  filters: { q: string; plan: string; status: string; coverage: string };
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
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide ${classes}`}>
      {children}
    </span>
  );
}

export function RevenuePortfolioClient({ rows, page, totalPages, totalCustomers, hasAnyCustomers, filters, canWrite, updateSeatsAction }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seatsInput, setSeatsInput] = useState('');
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // See Seats & Usage's identical fix: the sticky Action column's edge
  // shadow only renders while the table actually needs horizontal scroll
  // (measured live via ResizeObserver) — a permanent shadow bleeds over
  // adjacent text even when nothing is scrolled, which reads exactly like
  // a clipped column.
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

  function pushParams(next: Partial<{ q: string; plan: string; status: string; coverage: string; page: string }>) {
    const params = new URLSearchParams();
    const merged = { q: filters.q, plan: filters.plan, status: filters.status, coverage: filters.coverage, page: String(page), ...next };
    if (merged.q) params.set('q', merged.q);
    if (merged.plan) params.set('plan', merged.plan);
    if (merged.status) params.set('status', merged.status);
    if (merged.coverage) params.set('coverage', merged.coverage);
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

  const hasActiveFilters = Boolean(filters.q || filters.plan || filters.status || filters.coverage);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.plan) params.set('plan', filters.plan);
    if (filters.status) params.set('status', filters.status);
    if (filters.coverage) params.set('coverage', filters.coverage);
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
              value={filters.coverage}
              onChange={(e) => pushParams({ coverage: e.target.value, page: '1' })}
              aria-label="Filter by revenue coverage"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              {REVENUE_COVERAGE_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
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
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Revenue Portfolio</p>
        </div>

        {!hasAnyCustomers ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base font-black text-slate-950">No customer accounts have been provisioned yet.</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              <Link href="/founder/provision" className="text-[#2557dc]">Provision a customer</Link> to see their commercial position.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-bold text-slate-500">No customers match your current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" ref={scrollerRef}>
            {/* table-fixed + explicit widths + a scroll-conditional sticky
                shadow — the same fix applied to Seats & Usage's identical
                table after visual QA found the un-fixed version silently
                clipped whatever column fell under the sticky Action
                column's pinned slot. Column widths sum to 946px, comfortably
                under the Founder shell's main-content width at both 1440px
                (1116px) and 1280px (956px), so the table needs no
                horizontal scroll at all at either common desktop width. */}
            <table className="w-full min-w-[946px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-[185px] whitespace-nowrap px-5 py-3">Customer</th>
                  <th scope="col" className="w-[95px] whitespace-nowrap px-5 py-3">Plan</th>
                  <th scope="col" className="w-[130px] whitespace-nowrap px-5 py-3">Account Status</th>
                  <th scope="col" className="w-[100px] whitespace-nowrap px-5 py-3">Est. ARR</th>
                  <th scope="col" className="w-[75px] whitespace-nowrap px-5 py-3">Seats</th>
                  <th scope="col" className="w-[150px] whitespace-nowrap px-5 py-3">Revenue Status</th>
                  <th scope="col" className="w-[115px] whitespace-nowrap px-5 py-3">Updated</th>
                  <th scope="col" className={`sticky right-0 w-24 whitespace-nowrap bg-slate-50 px-4 py-3 text-right ${tableScrollable ? 'shadow-[-6px_0_8px_-4px_rgba(15,23,42,0.18)]' : ''}`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((customer) => {
                  const revenueStatus = revenueStatusFor(customer.estimatedArrUsd);
                  return (
                    <tr key={customer.id} className="group transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="truncate font-black text-slate-950">{customer.companyName}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{customer.domain}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4"><Badge tone={planTone(customer.planTier)}>{planDisplayName(customer.planTier)}</Badge></td>
                      <td className="whitespace-nowrap px-5 py-4"><Badge tone={accountStatusTone(customer.status)}>{customer.status}</Badge></td>
                      <td className="whitespace-nowrap px-5 py-4 font-black text-slate-950 tabular-nums">{fmtEstimatedArr(customer.estimatedArrUsd)}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-700 tabular-nums">{customer.purchasedSeats}</td>
                      <td className="px-5 py-4"><Badge tone={revenueStatusTone(revenueStatus)}>{revenueStatusLabel(revenueStatus)}</Badge></td>
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
        <FounderDrawer onClose={() => setSelectedId(null)} titleId="revenue-drawer-title" size="md">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <h3 id="revenue-drawer-title" className="truncate text-lg font-black text-slate-950">{selected.companyName}</h3>
                <p className="truncate text-xs font-semibold text-slate-400">{selected.domain}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={planTone(selected.planTier)}>{planDisplayName(selected.planTier)}</Badge>
                  <Badge tone={accountStatusTone(selected.status)}>{selected.status}</Badge>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close revenue details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
                Close
              </button>
            </div>

            <div className="flex-1 space-y-5 px-6 py-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Commercial</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="font-semibold text-slate-500">Estimated ARR</dt>
                    <dd className="text-xs font-bold text-slate-700">{fmtEstimatedArr(selected.estimatedArrUsd)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-semibold text-slate-500">Revenue Status</dt>
                    <dd><Badge tone={revenueStatusTone(revenueStatusFor(selected.estimatedArrUsd))}>{revenueStatusLabel(revenueStatusFor(selected.estimatedArrUsd))}</Badge></dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">
                  {selected.estimatedArrUsd != null
                    ? 'A Founder-entered planning estimate, not actual or recognized revenue.'
                    : 'No Founder-entered commercial estimate exists for this customer.'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Seats</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Purchased</dt><dd className="text-xs font-bold text-slate-700">{selected.purchasedSeats}</dd></div>
                  <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Allocated</dt><dd className="text-xs font-bold text-slate-700">{selected.allocatedSeats}</dd></div>
                  <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Used</dt><dd className="text-xs font-bold text-slate-700">{selected.usedSeats}</dd></div>
                </dl>
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
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Commercial Notes</p>
                {selected.internalNotes ? (
                  <p className="text-xs font-semibold leading-5 text-slate-600">{selected.internalNotes}</p>
                ) : (
                  <p className="text-xs font-semibold leading-5 text-slate-400">No commercial notes recorded for this customer.</p>
                )}
              </div>

              <div className="space-y-2">
                <Link
                  href={`/founder/customers/${selected.id}`}
                  className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700"
                >
                  Open Customer 360 →
                </Link>
                <Link
                  href="/founder/billing"
                  className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Open Plans & Billing →
                </Link>
              </div>
            </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
