'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { planDisplayName } from '@/lib/plans';
import { FounderDrawer } from './FounderDrawer';
import { planTone } from '@/lib/founder-billing';
import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  NOTES_COVERAGE_FILTER_OPTIONS,
  accountStatusTone,
  fmtDate,
  notePreview,
  healthStatusLabel,
  healthStatusTone,
} from '@/lib/founder-notes';
import type { HealthStatus } from '@/lib/customer-health';

export type NotesRowClient = {
  id: string;
  companyName: string;
  domain: string;
  primaryAdminEmail: string;
  planTier: string;
  status: string;
  healthStatus: HealthStatus | null;
  latestNote: {
    id: string;
    body: string;
    authorEmail: string | null;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type Props = {
  rows: NotesRowClient[];
  page: number;
  totalPages: number;
  totalCustomers: number;
  hasAnyCustomers: boolean;
  filters: { q: string; status: string; coverage: string };
  canWrite: boolean;
  addNoteAction: (formData: FormData) => void | Promise<void>;
  togglePinAction: (formData: FormData) => void | Promise<void>;
  deleteNoteAction: (formData: FormData) => void | Promise<void>;
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

export function NotesPortfolioClient({ rows, page, totalPages, totalCustomers, hasAnyCustomers, filters, canWrite, addNoteAction, togglePinAction, deleteNoteAction }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // Same fix already proven for Seats & Usage and Revenue: the sticky
  // Action column's edge shadow only renders while the table actually
  // needs horizontal scroll (measured live via ResizeObserver) — a
  // permanent shadow bleeds over adjacent text even when nothing is
  // scrolled, reading exactly like a clipped column. Applied here from
  // the start rather than discovered later.
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

  function pushParams(next: Partial<{ q: string; status: string; coverage: string; page: string }>) {
    const params = new URLSearchParams();
    const merged = { q: filters.q, status: filters.status, coverage: filters.coverage, page: String(page), ...next };
    if (merged.q) params.set('q', merged.q);
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
    setNoteBody('');
  }, [selected?.id]);

  const hasActiveFilters = Boolean(filters.q || filters.status || filters.coverage);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
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
              placeholder="Search company, domain, admin email, or note text…"
              aria-label="Search customers or notes"
              className="h-9 w-80 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            />
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
              aria-label="Filter by notes coverage"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              {NOTES_COVERAGE_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
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
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Customer Support & Notes</p>
        </div>

        {!hasAnyCustomers ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base font-black text-slate-950">No customer accounts have been provisioned yet.</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              <Link href="/founder/provision" className="text-[#2557dc]">Provision a customer</Link> to start recording support context.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-bold text-slate-500">No customers match your current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" ref={scrollerRef}>
            {/* Same table-fixed + responsive-column-hiding + scroll-conditional
                sticky shadow already proven for Revenue: the 4 columns that
                matter most for fast triage (Customer/Account Status/Latest
                Note/Action) are always rendered at a 666px minimum and need
                zero horizontal scroll at 1024px and 768px, not just
                1440/1280. Author/Updated/Pinned — secondary detail, already
                visible in full in the drawer — render only at xl+ (1280px),
                where the full 946px table genuinely fits. */}
            <table className="w-full min-w-[666px] table-fixed text-left text-sm xl:min-w-[946px]">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-[160px] whitespace-nowrap px-5 py-3">Customer</th>
                  <th scope="col" className="w-[120px] whitespace-nowrap px-5 py-3">Account Status</th>
                  <th scope="col" className="w-[290px] px-5 py-3">Latest Note</th>
                  <th scope="col" className="hidden w-[110px] whitespace-nowrap px-5 py-3 xl:table-cell">Author</th>
                  <th scope="col" className="hidden w-[100px] whitespace-nowrap px-5 py-3 xl:table-cell">Updated</th>
                  {/* Narrower than the other columns, so it uses px-3 (matching
                      the sticky Action column's own precedent of a tighter
                      padding for a narrow column) rather than the standard
                      px-5, which alone would consume 40px of this 70px
                      column and force any real content to be clipped by the
                      sticky Action column next to it — the exact defect
                      already found and fixed once for Revenue's table,
                      caught here during this module's own visual QA before
                      shipping rather than after. */}
                  <th scope="col" className="hidden w-[70px] whitespace-nowrap px-3 py-3 text-center xl:table-cell">Pinned</th>
                  <th scope="col" className={`sticky right-0 w-24 whitespace-nowrap bg-slate-50 px-4 py-3 text-right ${tableScrollable ? 'shadow-[-6px_0_8px_-4px_rgba(15,23,42,0.18)]' : ''}`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((customer) => {
                  const note = customer.latestNote;
                  return (
                    <tr key={customer.id} className="group transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="truncate font-black text-slate-950">{customer.companyName}</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{customer.domain}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4"><Badge tone={accountStatusTone(customer.status)}>{customer.status}</Badge></td>
                      <td className="px-5 py-4">
                        {note ? (
                          <p className="truncate text-xs font-semibold leading-5 text-slate-700" title={note.body}>{notePreview(note.body)}</p>
                        ) : (
                          <p className="text-xs font-semibold text-slate-400">No notes recorded</p>
                        )}
                      </td>
                      <td className="hidden w-[110px] truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500 xl:table-cell" title={note?.authorEmail ?? undefined}>
                        {note?.authorEmail ?? '—'}
                      </td>
                      <td className="hidden truncate px-5 py-4 text-xs font-semibold text-slate-500 xl:table-cell" title={note ? fmtDate(note.updatedAt) : undefined}>
                        {note ? fmtDate(note.updatedAt) : '—'}
                      </td>
                      <td className="hidden px-3 py-4 text-center xl:table-cell">
                        {note?.pinned ? (
                          <span className="text-base text-amber-500" role="img" aria-label="Pinned">★</span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-300" aria-hidden="true">—</span>
                        )}
                      </td>
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
        <FounderDrawer onClose={() => setSelectedId(null)} titleId="notes-drawer-title" size="md">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <h3 id="notes-drawer-title" className="truncate text-lg font-black text-slate-950">{selected.companyName}</h3>
                <p className="truncate text-xs font-semibold text-slate-400">{selected.domain}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={planTone(selected.planTier)}>{planDisplayName(selected.planTier)}</Badge>
                  <Badge tone={accountStatusTone(selected.status)}>{selected.status}</Badge>
                  {selected.healthStatus ? <Badge tone={healthStatusTone(selected.healthStatus)}>{healthStatusLabel(selected.healthStatus)}</Badge> : null}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close customer support details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
                Close
              </button>
            </div>

            <div className="flex-1 space-y-5 px-6 py-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Latest Note</p>
                {selected.latestNote ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span>{selected.latestNote.authorEmail ?? 'Founder'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{fmtDate(selected.latestNote.updatedAt)}</span>
                      {selected.latestNote.pinned ? <Badge tone="amber">Pinned</Badge> : null}
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">{selected.latestNote.body}</p>
                    {canWrite ? (
                      <div className="mt-4 flex gap-2">
                        <form action={togglePinAction}>
                          <input type="hidden" name="noteId" value={selected.latestNote.id} />
                          <input type="hidden" name="customerAccountId" value={selected.id} />
                          <input type="hidden" name="pinned" value={selected.latestNote.pinned ? 'false' : 'true'} />
                          <button className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-100">
                            {selected.latestNote.pinned ? 'Unpin' : 'Pin'}
                          </button>
                        </form>
                        <form action={deleteNoteAction}>
                          <input type="hidden" name="noteId" value={selected.latestNote.id} />
                          <input type="hidden" name="customerAccountId" value={selected.id} />
                          <button className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100">
                            Delete
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs font-semibold leading-5 text-slate-400">No notes have been recorded for this customer yet.</p>
                )}
              </div>

              {canWrite ? (
                <form action={addNoteAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Add Note</p>
                  <input type="hidden" name="customerAccountId" value={selected.id} />
                  <textarea
                    required
                    name="body"
                    rows={3}
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Add an internal support note…"
                    aria-label="New note"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="mt-2 flex justify-end">
                    <button disabled={!noteBody.trim()} className="rounded-lg bg-[#2557dc] px-4 py-1.5 text-xs font-black text-white hover:bg-[#1a44be] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#2557dc]">
                      Save note
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="space-y-2">
                <Link
                  href={`/founder/customers/${selected.id}`}
                  className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700"
                >
                  Open Customer 360 →
                </Link>
                <Link
                  href={`/founder/audit?customerAccountId=${selected.id}`}
                  className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Open Customer Activity →
                </Link>
              </div>
            </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
