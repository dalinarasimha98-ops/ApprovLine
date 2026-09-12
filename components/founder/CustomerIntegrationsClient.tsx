'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ACCESS_STATE_LABELS,
  CONNECTION_STATE_LABELS,
  SYNC_STATE_LABELS,
  EVIDENCE_STATE_LABELS,
  HEALTH_STATE_LABELS,
  CONNECTION_STATUS_FILTER_OPTIONS,
  HEALTH_STATUS_FILTER_OPTIONS,
  accessBadgeClass,
  connectionBadgeClass,
  syncBadgeClass,
  evidenceBadgeClass,
  healthBadgeClass,
} from '@/lib/founder-customer-integrations';
import type { CustomerIntegrationDetail, CustomerIntegrationRow } from '@/services/founder-customer-integrations';

export type MutationResult = { ok: true } | { ok: false; error: string };
type DetailResult = { ok: true; data: CustomerIntegrationDetail } | { ok: false; error: string };

type Props = {
  rows: CustomerIntegrationRow[];
  providerOptions: Array<{ slug: string; displayName: string }>;
  page: number;
  totalPages: number;
  totalCustomers: number;
  filters: { q: string; provider: string; connection: string; health: string };
  canManage: boolean;
  onEnableAccess: (input: { providerSlug: string; organizationId: string }) => Promise<MutationResult>;
  onDisableAccess: (input: { providerSlug: string; organizationId: string }) => Promise<MutationResult>;
  onTriggerSync: (input: { integrationId: string }) => Promise<MutationResult>;
  onLoadDetail: (organizationId: string, providerSlug: string) => Promise<DetailResult>;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initials(label: string): string {
  return label.split(/[\s_-]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function CustomerIntegrationsClient({
  rows,
  providerOptions,
  page,
  totalPages,
  totalCustomers,
  filters,
  canManage,
  onEnableAccess,
  onDisableAccess,
  onTriggerSync,
  onLoadDetail,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(filters.q);
  const [selected, setSelected] = useState<CustomerIntegrationRow | null>(null);
  const [detail, setDetail] = useState<CustomerIntegrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'sync' | 'evidence' | 'failures' | 'activity'>('overview');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function pushParams(next: Partial<{ q: string; provider: string; connection: string; health: string; page: string }>) {
    const params = new URLSearchParams();
    const merged = { q: filters.q, provider: filters.provider, connection: filters.connection, health: filters.health, page: String(page), ...next };
    if (merged.q) params.set('q', merged.q);
    if (merged.provider) params.set('provider', merged.provider);
    if (merged.connection) params.set('connection', merged.connection);
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

  async function openDrawer(row: CustomerIntegrationRow) {
    setSelected(row);
    setDrawerTab('overview');
    setActionError(null);
    setActionSuccess(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    const result = await onLoadDetail(row.organizationId, row.providerSlug);
    setDetailLoading(false);
    if (result.ok) setDetail(result.data);
    else setDetailError(result.error);
  }

  useEffect(() => {
    if (!selected) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  function runMutation(promise: Promise<MutationResult>, successMessage: string, onDone?: () => void) {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) setActionError(result.error);
      else {
        setActionSuccess(successMessage);
        onDone?.();
        if (selected) {
          const refreshed = await onLoadDetail(selected.organizationId, selected.providerSlug);
          if (refreshed.ok) setDetail(refreshed.data);
        }
        router.refresh();
      }
    });
  }

  const hasActiveFilters = Boolean(filters.q || filters.provider || filters.connection || filters.health);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
          <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="Search customers or providers…"
              aria-label="Search customers or providers"
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
              value={filters.connection}
              onChange={(e) => pushParams({ connection: e.target.value, page: '1' })}
              aria-label="Filter by connection status"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All connection status</option>
              {CONNECTION_STATUS_FILTER_OPTIONS.map((s) => <option key={s} value={s}>{CONNECTION_STATE_LABELS[s]}</option>)}
            </select>
            <select
              value={filters.health}
              onChange={(e) => pushParams({ health: e.target.value, page: '1' })}
              aria-label="Filter by health status"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All health status</option>
              {HEALTH_STATUS_FILTER_OPTIONS.map((s) => <option key={s} value={s}>{HEALTH_STATE_LABELS[s]}</option>)}
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

        {totalCustomers === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base font-black text-slate-950">No customer integrations found</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">No customer has a connected or available integration yet.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-bold text-slate-500">No customer integrations match your current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Provider</th>
                  <th className="px-6 py-3">Access</th>
                  <th className="px-6 py-3">Connection</th>
                  <th className="px-6 py-3">Sync</th>
                  <th className="px-6 py-3">Evidence</th>
                  <th className="px-6 py-3">Health</th>
                  <th className="px-6 py-3">Last Sync</th>
                  <th className="sticky right-0 w-28 border-l border-slate-100 bg-white px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={`${row.organizationId}:${row.providerSlug}`} className="group transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="font-black text-slate-950">{row.companyName}</p>
                      <p className="text-xs font-semibold text-slate-400">{row.domain}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-[10px] font-black text-[#2557dc]">
                          {initials(row.providerDisplayName)}
                        </span>
                        <span className="font-bold text-slate-700">{row.providerDisplayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${accessBadgeClass(row.access)}`}>
                        {ACCESS_STATE_LABELS[row.access]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${connectionBadgeClass(row.connection)}`}>
                        {CONNECTION_STATE_LABELS[row.connection]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${syncBadgeClass(row.sync)}`}>
                        {SYNC_STATE_LABELS[row.sync]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${evidenceBadgeClass(row.evidence)}`}>
                        {EVIDENCE_STATE_LABELS[row.evidence]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${healthBadgeClass(row.health)}`}>
                        {HEALTH_STATE_LABELS[row.health]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">{row.lastSyncAt ? fmtDate(row.lastSyncAt) : '—'}</td>
                    <td className="sticky right-0 w-28 whitespace-nowrap border-l border-slate-100 bg-white px-4 py-4 text-right group-hover:bg-slate-50">
                      <button
                        type="button"
                        onClick={() => openDrawer(row)}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalCustomers > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <p className="text-xs font-bold text-slate-500">
              Customer {page} of {totalPages} ({totalCustomers} customers with integrations)
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `${pathname}?${new URLSearchParams({ ...(filters.q ? { q: filters.q } : {}), ...(filters.provider ? { provider: filters.provider } : {}), ...(filters.connection ? { connection: filters.connection } : {}), ...(filters.health ? { health: filters.health } : {}), page: String(page - 1) }).toString()}` : '#'}
                aria-disabled={page <= 1}
                className={`rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 ${page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'}`}
              >
                Previous
              </Link>
              <Link
                href={page < totalPages ? `${pathname}?${new URLSearchParams({ ...(filters.q ? { q: filters.q } : {}), ...(filters.provider ? { provider: filters.provider } : {}), ...(filters.connection ? { connection: filters.connection } : {}), ...(filters.health ? { health: filters.health } : {}), page: String(page + 1) }).toString()}` : '#'}
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
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-950/30" onClick={() => setSelected(null)} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-integration-drawer-title"
            className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-[#2557dc]">
                    {initials(selected.providerDisplayName)}
                  </span>
                  <div>
                    <h3 id="customer-integration-drawer-title" className="text-lg font-black text-slate-950">{selected.providerDisplayName}</h3>
                    <span className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${connectionBadgeClass(selected.connection)}`}>
                      {CONNECTION_STATE_LABELS[selected.connection]}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-black text-slate-700">{selected.companyName}</p>
                <p className="text-xs font-semibold text-slate-400">{selected.domain}</p>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setSelected(null)} aria-label="Close integration details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
                Close
              </button>
            </div>

            <div className="flex gap-1 border-b border-slate-100 px-4 pt-2">
              {(['overview', 'sync', 'evidence', 'failures', 'activity'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDrawerTab(t)}
                  className={`rounded-t-lg px-3 py-2 text-xs font-black capitalize transition ${drawerTab === t ? 'bg-blue-50 text-[#2557dc]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {t === 'sync' ? 'Sync Activity' : t}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-5 px-6 py-5">
              {actionError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{actionError}</p> : null}
              {actionSuccess ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{actionSuccess}</p> : null}

              {detailLoading ? (
                <p className="text-sm font-semibold text-slate-500">Loading…</p>
              ) : detailError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{detailError}</p>
              ) : detail ? (
                <>
                  {drawerTab === 'overview' ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Integration Status</p>
                        <dl className="space-y-2 text-sm">
                          {[
                            ['Customer Access', ACCESS_STATE_LABELS[detail.access], accessBadgeClass(detail.access)],
                            ['Connection Status', CONNECTION_STATE_LABELS[detail.connection], connectionBadgeClass(detail.connection)],
                            ['Sync Status', SYNC_STATE_LABELS[detail.sync], syncBadgeClass(detail.sync)],
                            ['Evidence Ingestion', EVIDENCE_STATE_LABELS[detail.evidence], evidenceBadgeClass(detail.evidence)],
                            ['Overall Health', HEALTH_STATE_LABELS[detail.health], healthBadgeClass(detail.health)],
                          ].map(([label, value, cls]) => (
                            <div key={label} className="flex items-center justify-between">
                              <dt className="font-semibold text-slate-500">{label}</dt>
                              <dd><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${cls}`}>{value}</span></dd>
                            </div>
                          ))}
                          <div className="flex items-center justify-between">
                            <dt className="font-semibold text-slate-500">Last Successful Sync</dt>
                            <dd className="text-xs font-bold text-slate-700">{detail.lastSyncAt ? fmtDate(detail.lastSyncAt) : '—'}</dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="font-semibold text-slate-500">Evidence Captured</dt>
                            <dd className="text-xs font-bold text-slate-700">{detail.evidenceCapturedCount} items</dd>
                          </div>
                        </dl>
                      </div>

                      {canManage ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Quick Actions</p>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={`/founder/customers/${detail.customerAccountId}`}
                              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100"
                            >
                              View in Customer 360
                            </a>
                            {detail.integrationId ? (
                              <button
                                type="button"
                                disabled={pending || detail.sync === 'SYNCING'}
                                onClick={() => runMutation(onTriggerSync({ integrationId: detail.integrationId! }), 'Sync triggered.')}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              >
                                Trigger Sync
                              </button>
                            ) : null}
                            {detail.failures.length > 0 ? (
                              <button type="button" onClick={() => setDrawerTab('failures')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100">
                                View Failures
                              </button>
                            ) : null}
                            {detail.access === 'ENABLED' ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => runMutation(onDisableAccess({ providerSlug: detail.providerSlug, organizationId: detail.organizationId }), 'Access disabled.')}
                                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              >
                                Disable Customer Access
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => runMutation(onEnableAccess({ providerSlug: detail.providerSlug, organizationId: detail.organizationId }), 'Access enabled.')}
                                className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                Enable Customer Access
                              </button>
                            )}
                          </div>
                          <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">
                            Disabling access removes provider availability for the customer. It does not disconnect the customer&apos;s external account — no code path here does so automatically.
                          </p>
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-slate-200 p-4">
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Connection Details</p>
                        <dl className="space-y-2 text-sm">
                          <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Connected By</dt><dd className="text-xs font-bold text-slate-700">{detail.connectedBy ?? '—'}</dd></div>
                          <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Connected On</dt><dd className="text-xs font-bold text-slate-700">{fmtDate(detail.connectedOn)}</dd></div>
                          <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">External Account</dt><dd className="text-xs font-bold text-slate-700">{detail.externalAccount ?? '—'}</dd></div>
                          {detail.scopes.length > 0 ? (
                            <div>
                              <dt className="font-semibold text-slate-500">Scopes</dt>
                              <dd className="mt-1 flex flex-wrap gap-1">
                                {detail.scopes.map((s) => <span key={s} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">{s}</span>)}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                          Credentials are securely encrypted and not displayed.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {drawerTab === 'sync' ? (
                    <div className="space-y-2">
                      {detail.syncActivity.length === 0 ? (
                        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">No sync history recorded for this integration yet.</p>
                      ) : (
                        detail.syncActivity.map((entry) => (
                          <div key={entry.id} className="rounded-xl border border-slate-200 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-black text-slate-950">{entry.type}</p>
                              <span className={`text-[10px] font-black uppercase ${entry.failedAt ? 'text-rose-600' : entry.processedAt ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {entry.failedAt ? 'Failed' : entry.processedAt ? 'Completed' : 'Started'}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{fmtDate(entry.occurredAt)}{entry.itemsProcessed !== null ? ` · ${entry.itemsProcessed} items` : ''}</p>
                            {entry.failureReason ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{entry.failureReason}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {drawerTab === 'evidence' ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Evidence Captured</p>
                        <p className="mt-1 text-2xl font-black text-slate-950">{detail.evidenceCapturedCount}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Total canonical evidence events captured for this connection.</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${evidenceBadgeClass(detail.evidence)}`}>
                        {EVIDENCE_STATE_LABELS[detail.evidence]}
                      </span>
                      <p className="text-xs font-semibold text-slate-500">
                        For full evidence content, open this customer&apos;s Evidence workspace from Customer 360 — this drawer shows operational status only.
                      </p>
                    </div>
                  ) : null}

                  {drawerTab === 'failures' ? (
                    <div className="space-y-2">
                      {detail.failures.length === 0 ? (
                        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">No recent integration failures.</p>
                      ) : (
                        detail.failures.map((f) => (
                          <div key={f.id} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <p className="text-xs font-black text-rose-900">{f.type}</p>
                            <p className="mt-1 text-[11px] font-semibold text-rose-700">{fmtDate(f.failedAt)}</p>
                            {f.failureReason ? <p className="mt-1 text-[11px] font-semibold text-rose-700">{f.failureReason}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {drawerTab === 'activity' ? (
                    <div className="space-y-2">
                      {detail.activity.length === 0 ? (
                        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">No Founder activity recorded for this integration yet.</p>
                      ) : (
                        detail.activity.map((entry) => (
                          <div key={entry.id} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-xs font-bold text-slate-700">{entry.action}</p>
                            {entry.previousStatus || entry.newStatus ? (
                              <p className="mt-1 text-[11px] font-semibold text-slate-500">{entry.previousStatus ?? '—'} → {entry.newStatus ?? '—'}</p>
                            ) : null}
                            <p className="mt-1 text-[10px] font-semibold text-slate-400">{entry.actorEmail ?? 'Unknown actor'} · {fmtDate(entry.createdAt)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
