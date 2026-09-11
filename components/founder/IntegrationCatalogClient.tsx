'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  CUSTOMER_AVAILABILITY_LABELS,
  CUSTOMER_CONNECTION_LABELS,
  DANGEROUS_LIFECYCLE_TRANSITIONS,
  PROVIDER_LIFECYCLE_LABELS,
  PROVIDER_LIFECYCLE_OPTIONS,
  REQUEST_PRIORITY_OPTIONS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_OPTIONS,
  connectionStateBadgeClass,
  isGrantableLifecycle,
  lifecycleBadgeClass,
  requestStatusBadgeClass,
  type ProviderLifecycle,
} from '@/lib/founder-integrations';
import type {
  CustomerDirectoryEntry,
  IntegrationRequestRow,
  ProviderCatalogRow,
} from '@/services/founder-integrations';

export type MutationResult = { ok: true } | { ok: false; error: string };

type Props = {
  providers: ProviderCatalogRow[];
  requests: IntegrationRequestRow[];
  customers: CustomerDirectoryEntry[];
  canManage: boolean;
  onUpdateProviderStatus: (input: { providerSlug: string; status: ProviderLifecycle }) => Promise<MutationResult>;
  onEnableProviderAccess: (input: { providerSlug: string; organizationId: string }) => Promise<MutationResult>;
  onDisableProviderAccess: (input: { providerSlug: string; organizationId: string }) => Promise<MutationResult>;
  onUpdateRequestStatus: (input: { requestId: string; status: string; founderNotes?: string }) => Promise<MutationResult>;
};

type Tab = 'catalog' | 'requests';

function initials(label: string): string {
  return label.split(/[\s_-]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function priorityTone(priority: string): string {
  if (priority === 'HIGH') return 'text-rose-600';
  if (priority === 'MEDIUM') return 'text-amber-600';
  return 'text-slate-500';
}

export function IntegrationCatalogClient({
  providers,
  requests,
  customers,
  canManage,
  onUpdateProviderStatus,
  onEnableProviderAccess,
  onDisableProviderAccess,
  onUpdateRequestStatus,
}: Props) {
  const [tab, setTab] = useState<Tab>('catalog');

  // Provider Catalog filter state
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [lifecycleFilter, setLifecycleFilter] = useState('ALL');
  const [implementationFilter, setImplementationFilter] = useState<'ALL' | 'NATIVE' | 'EXTERNAL'>('ALL');
  const [capabilityFilter, setCapabilityFilter] = useState('ALL');

  // Request filter state
  const [reqQuery, setReqQuery] = useState('');
  const [reqStatus, setReqStatus] = useState('ALL');
  const [reqPriority, setReqPriority] = useState('ALL');
  const [reqCategory, setReqCategory] = useState('ALL');
  const [reqProvider, setReqProvider] = useState('ALL');
  const [reqCustomer, setReqCustomer] = useState('ALL');
  const [reqPage, setReqPage] = useState(1);
  const REQ_PAGE_SIZE = 20;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'access' | 'requests' | 'activity'>('overview');
  const [customerQuery, setCustomerQuery] = useState('');
  const [grantCustomerId, setGrantCustomerId] = useState('');
  const [confirmingStatus, setConfirmingStatus] = useState<ProviderLifecycle | null>(null);

  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const categories = useMemo(() => Array.from(new Set(providers.map((p) => p.category))).sort(), [providers]);
  const capabilities = useMemo(
    () => Array.from(new Set(providers.flatMap((p) => p.capabilities))).sort(),
    [providers],
  );
  const requestCategories = useMemo(
    () => Array.from(new Set(requests.map((r) => r.category).filter((c): c is string => Boolean(c)))).sort(),
    [requests],
  );
  const requestProviders = useMemo(
    () => Array.from(new Set(requests.map((r) => r.providerName))).sort(),
    [requests],
  );
  const requestCustomers = useMemo(
    () => Array.from(new Set(requests.map((r) => r.companyName))).sort(),
    [requests],
  );

  const filteredProviders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (lifecycleFilter !== 'ALL' && p.status !== lifecycleFilter) return false;
      if (implementationFilter === 'NATIVE' && !p.isNative) return false;
      if (implementationFilter === 'EXTERNAL' && p.isNative) return false;
      if (capabilityFilter !== 'ALL' && !p.capabilities.includes(capabilityFilter)) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.capabilities.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [providers, query, categoryFilter, lifecycleFilter, implementationFilter, capabilityFilter]);

  const filteredRequests = useMemo(() => {
    const q = reqQuery.trim().toLowerCase();
    return requests.filter((r) => {
      if (reqStatus !== 'ALL' && r.status !== reqStatus) return false;
      if (reqPriority !== 'ALL' && r.priority !== reqPriority) return false;
      if (reqCategory !== 'ALL' && r.category !== reqCategory) return false;
      if (reqProvider !== 'ALL' && r.providerName !== reqProvider) return false;
      if (reqCustomer !== 'ALL' && r.companyName !== reqCustomer) return false;
      if (!q) return true;
      return (
        r.providerName.toLowerCase().includes(q) ||
        r.companyName.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [requests, reqQuery, reqStatus, reqPriority, reqCategory, reqProvider, reqCustomer]);

  const pagedRequests = useMemo(() => {
    const start = (reqPage - 1) * REQ_PAGE_SIZE;
    return filteredRequests.slice(start, start + REQ_PAGE_SIZE);
  }, [filteredRequests, reqPage]);
  const totalReqPages = Math.max(1, Math.ceil(filteredRequests.length / REQ_PAGE_SIZE));

  function clearRequestFilters() {
    setReqQuery('');
    setReqStatus('ALL');
    setReqPriority('ALL');
    setReqCategory('ALL');
    setReqProvider('ALL');
    setReqCustomer('ALL');
    setReqPage(1);
  }

  const selected = providers.find((p) => p.slug === selectedSlug) ?? null;
  const filteredCustomerAccess = useMemo(() => {
    if (!selected) return [];
    const q = customerQuery.trim().toLowerCase();
    if (!q) return selected.customerAccess;
    return selected.customerAccess.filter((row) => row.companyName.toLowerCase().includes(q));
  }, [selected, customerQuery]);

  const availableCustomersForGrant = useMemo(() => {
    if (!selected) return [];
    const grantedOrgIds = new Set(selected.customerAccess.map((row) => row.organizationId));
    return customers.filter((c) => !grantedOrgIds.has(c.organizationId));
  }, [selected, customers]);

  useEffect(() => {
    if (!selected) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingStatus) setConfirmingStatus(null);
        else setSelectedSlug(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, confirmingStatus]);

  function openDrawer(slug: string) {
    setActionError(null);
    setActionSuccess(null);
    setCustomerQuery('');
    setGrantCustomerId('');
    setDrawerTab('overview');
    setConfirmingStatus(null);
    setSelectedSlug(slug);
  }

  function runMutation(promise: Promise<MutationResult>, successMessage: string) {
    setActionError(null);
    setActionSuccess(null);
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) setActionError(result.error);
      else setActionSuccess(successMessage);
    });
  }

  function requestLifecycleChange(status: ProviderLifecycle) {
    if (!selected) return;
    if (DANGEROUS_LIFECYCLE_TRANSITIONS.has(status)) {
      setConfirmingStatus(status);
      return;
    }
    runMutation(onUpdateProviderStatus({ providerSlug: selected.slug, status }), `Lifecycle updated to ${PROVIDER_LIFECYCLE_LABELS[status]}.`);
  }

  function confirmLifecycleChange() {
    if (!selected || !confirmingStatus) return;
    const status = confirmingStatus;
    setConfirmingStatus(null);
    runMutation(onUpdateProviderStatus({ providerSlug: selected.slug, status }), `Lifecycle updated to ${PROVIDER_LIFECYCLE_LABELS[status]}.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('catalog')}
          className={`border-b-2 px-4 py-2.5 text-sm font-black transition ${tab === 'catalog' ? 'border-[#2557dc] text-[#2557dc]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Provider Catalog
        </button>
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={`border-b-2 px-4 py-2.5 text-sm font-black transition ${tab === 'requests' ? 'border-[#2557dc] text-[#2557dc]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Customer Requests {requests.length > 0 ? <span className="ml-1 text-xs font-bold text-slate-400">({requests.length})</span> : null}
        </button>
      </div>

      {tab === 'catalog' ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Search providers…"
                aria-label="Search providers"
                className="h-9 w-56 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
              />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                <option value="ALL">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={lifecycleFilter} onChange={(e) => setLifecycleFilter(e.target.value)} aria-label="Filter by lifecycle" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                <option value="ALL">All lifecycle states</option>
                {PROVIDER_LIFECYCLE_OPTIONS.map((s) => <option key={s} value={s}>{PROVIDER_LIFECYCLE_LABELS[s]}</option>)}
              </select>
              <select value={implementationFilter} onChange={(e) => setImplementationFilter(e.target.value as typeof implementationFilter)} aria-label="Filter by implementation" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                <option value="ALL">Native + External</option>
                <option value="NATIVE">Native only</option>
                <option value="EXTERNAL">External only</option>
              </select>
              {capabilities.length > 0 ? (
                <select value={capabilityFilter} onChange={(e) => setCapabilityFilter(e.target.value)} aria-label="Filter by capability" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                  <option value="ALL">All capabilities</option>
                  {capabilities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : null}
            </div>
          </div>

          {providers.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-base font-black text-slate-950">No integration providers exist yet</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">The MarketplaceProvider registry is empty.</p>
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-bold text-slate-500">No integration providers match your current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Provider</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Lifecycle</th>
                    <th className="px-6 py-3">Implementation</th>
                    <th className="px-6 py-3">Capabilities</th>
                    <th className="px-6 py-3">Customer Access</th>
                    <th className="px-6 py-3">Requests</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProviders.map((provider) => (
                    <tr key={provider.slug} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-[#2557dc]">
                            {initials(provider.displayName)}
                          </span>
                          <div>
                            <p className="font-black text-slate-950">{provider.displayName}</p>
                            <p className="mt-0.5 max-w-xs text-xs font-semibold text-slate-400">{provider.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">{provider.category}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${lifecycleBadgeClass(provider.status)}`}>
                          {PROVIDER_LIFECYCLE_LABELS[provider.status as ProviderLifecycle] ?? provider.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-black ${provider.isNative ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {provider.isNative ? 'Native' : 'External'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {provider.capabilities.length === 0 ? (
                            <span className="text-xs font-semibold text-slate-400">None listed</span>
                          ) : (
                            provider.capabilities.slice(0, 3).map((c) => (
                              <span key={c} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">{c}</span>
                            ))
                          )}
                          {provider.capabilities.length > 3 ? <span className="text-[10px] font-bold text-slate-400">+{provider.capabilities.length - 3}</span> : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">{provider.customerAccessCount}</td>
                      <td className="px-6 py-4 font-bold text-slate-700">{provider.requestCount}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openDrawer(provider.slug)}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={reqQuery}
                onChange={(e) => { setReqQuery(e.target.value); setReqPage(1); }}
                type="search"
                placeholder="Search requests…"
                aria-label="Search requests"
                className="h-9 w-56 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
              />
              <select value={reqStatus} onChange={(e) => { setReqStatus(e.target.value); setReqPage(1); }} aria-label="Filter by status" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                <option value="ALL">All statuses</option>
                {REQUEST_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>)}
              </select>
              <select value={reqPriority} onChange={(e) => { setReqPriority(e.target.value); setReqPage(1); }} aria-label="Filter by priority" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                <option value="ALL">All priorities</option>
                {REQUEST_PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {requestCategories.length > 0 ? (
                <select value={reqCategory} onChange={(e) => { setReqCategory(e.target.value); setReqPage(1); }} aria-label="Filter by category" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                  <option value="ALL">All categories</option>
                  {requestCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : null}
              {requestProviders.length > 0 ? (
                <select value={reqProvider} onChange={(e) => { setReqProvider(e.target.value); setReqPage(1); }} aria-label="Filter by provider" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                  <option value="ALL">All providers</option>
                  {requestProviders.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : null}
              {requestCustomers.length > 0 ? (
                <select value={reqCustomer} onChange={(e) => { setReqCustomer(e.target.value); setReqPage(1); }} aria-label="Filter by customer" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100">
                  <option value="ALL">All customers</option>
                  {requestCustomers.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : null}
              <button
                type="button"
                onClick={clearRequestFilters}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-base font-black text-slate-950">No integration requests yet</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Customer requests will appear here as they come in.</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-bold text-slate-500">No requests match the current filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Provider</th>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Category</th>
                      <th className="px-6 py-3">Priority</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Requested</th>
                      <th className="px-6 py-3">Founder Notes</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedRequests.map((req) => (
                      <tr key={req.id} className="transition hover:bg-slate-50">
                        <td className="px-6 py-4 font-black text-slate-950">{req.providerName}</td>
                        <td className="px-6 py-4 font-bold text-slate-700">{req.companyName}</td>
                        <td className="px-6 py-4 text-slate-500">{req.category ?? '—'}</td>
                        <td className="px-6 py-4"><span className={`text-xs font-black ${priorityTone(req.priority)}`}>{req.priority}</span></td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${requestStatusBadgeClass(req.status)}`}>
                            {REQUEST_STATUS_LABELS[req.status as keyof typeof REQUEST_STATUS_LABELS] ?? req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{fmtDate(req.createdAt)}</td>
                        <td className="px-6 py-4 max-w-[180px] truncate text-xs text-slate-500" title={req.founderNotes ?? ''}>{req.founderNotes ?? '—'}</td>
                        <td className="px-6 py-4 text-right">
                          {canManage ? (
                            <RequestStatusControl
                              request={req}
                              disabled={pending}
                              onUpdate={(status, notes) => runMutation(onUpdateRequestStatus({ requestId: req.id, status, founderNotes: notes }), 'Request status updated.')}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                <p className="text-xs font-bold text-slate-500">
                  Showing {(reqPage - 1) * REQ_PAGE_SIZE + 1}–{Math.min(reqPage * REQ_PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={reqPage <= 1} onClick={() => setReqPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={reqPage >= totalReqPages} onClick={() => setReqPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 disabled:opacity-40">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* Backdrop + drawer for a selected provider's details. Fixed
          positioning keeps this overflow-proof at every viewport width. */}
      {selected ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-950/30" onClick={() => setSelectedSlug(null)} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-drawer-title"
            className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-[#2557dc]">
                    {initials(selected.displayName)}
                  </span>
                  <div>
                    <h3 id="provider-drawer-title" className="text-lg font-black text-slate-950">{selected.displayName}</h3>
                    <span className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${lifecycleBadgeClass(selected.status)}`}>
                      {PROVIDER_LIFECYCLE_LABELS[selected.status as ProviderLifecycle] ?? selected.status}
                    </span>
                  </div>
                </div>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setSelectedSlug(null)} aria-label="Close provider details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
                Close
              </button>
            </div>

            <div className="flex gap-1 border-b border-slate-100 px-4 pt-2">
              {(['overview', 'access', 'requests', 'activity'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDrawerTab(t)}
                  className={`rounded-t-lg px-3 py-2 text-xs font-black capitalize transition ${drawerTab === t ? 'bg-blue-50 text-[#2557dc]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {t === 'access' ? 'Customer Access' : t}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-5 px-6 py-5">
              {actionError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{actionError}</p> : null}
              {actionSuccess ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{actionSuccess}</p> : null}

              {drawerTab === 'overview' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Description</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{selected.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Category</p>
                      <p className="mt-1 text-sm font-bold text-slate-700">{selected.category}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Implementation</p>
                      <p className="mt-1 text-sm font-bold text-slate-700">{selected.isNative ? 'Native' : 'External'}</p>
                    </div>
                  </div>
                  {selected.websiteUrl ? (
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Website</p>
                      <a href={selected.websiteUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm font-bold text-[#2557dc] hover:underline">{selected.websiteUrl}</a>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Capabilities</p>
                    {selected.capabilities.length === 0 ? (
                      <p className="mt-1 text-sm font-semibold text-slate-400">No capabilities listed for this provider.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selected.capabilities.map((c) => (
                          <span key={c} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {canManage ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Founder Actions</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Update Lifecycle Status</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {PROVIDER_LIFECYCLE_OPTIONS.filter((s) => s !== selected.status).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={pending}
                            onClick={() => requestLifecycleChange(s)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Mark {PROVIDER_LIFECYCLE_LABELS[s]}
                          </button>
                        ))}
                      </div>

                      {confirmingStatus ? (
                        <div role="alertdialog" aria-labelledby="confirm-title" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p id="confirm-title" className="text-xs font-black text-amber-900">
                            Mark this provider as {PROVIDER_LIFECYCLE_LABELS[confirmingStatus].toLowerCase()}?
                          </p>
                          <p className="mt-1 text-xs font-semibold text-amber-800">
                            This changes the provider lifecycle state for Founder-controlled availability. Existing customer connections will not be automatically disconnected.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => setConfirmingStatus(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-black text-amber-900">Cancel</button>
                            <button type="button" onClick={confirmLifecycleChange} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-700">Confirm</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {drawerTab === 'access' ? (
                <div className="space-y-4">
                  <p className="text-xs font-semibold leading-5 text-slate-500">
                    Granting access makes this provider available to the customer. It does not connect the customer&apos;s external account or expose credentials.
                  </p>

                  {canManage ? (
                    isGrantableLifecycle(selected.status) ? (
                      <div className="flex gap-2">
                        <select
                          value={grantCustomerId}
                          onChange={(e) => setGrantCustomerId(e.target.value)}
                          aria-label="Select customer to grant access"
                          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Select customer…</option>
                          {availableCustomersForGrant.map((c) => (
                            <option key={c.customerAccountId} value={c.organizationId}>{c.companyName}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={pending || !grantCustomerId}
                          onClick={() => runMutation(onEnableProviderAccess({ providerSlug: selected.slug, organizationId: grantCustomerId }), 'Access granted.')}
                          className="rounded-lg bg-[#2557dc] px-3 py-1.5 text-xs font-black text-white hover:bg-[#1a44be] disabled:opacity-50"
                        >
                          Grant Access
                        </button>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                        Providers in {PROVIDER_LIFECYCLE_LABELS[selected.status as ProviderLifecycle] ?? selected.status} status cannot be granted to new customers.
                      </p>
                    )
                  ) : null}

                  <input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    type="search"
                    placeholder="Search customers with access…"
                    aria-label="Search customers with access"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                  />

                  {selected.customerAccess.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">No customer has been granted access to this provider.</p>
                  ) : filteredCustomerAccess.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">No customers match your search.</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredCustomerAccess.map((row) => (
                        <div key={row.organizationId} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-black text-slate-950">{row.companyName}</p>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                              {CUSTOMER_AVAILABILITY_LABELS[row.availability]}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${connectionStateBadgeClass(row.connectionState)}`}>
                              {CUSTOMER_CONNECTION_LABELS[row.connectionState]}
                            </span>
                            {canManage ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => runMutation(onDisableProviderAccess({ providerSlug: selected.slug, organizationId: row.organizationId }), 'Access revoked.')}
                                className="text-xs font-black text-rose-600 hover:underline disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[10px] font-semibold text-slate-400">
                            Granted {row.enabledAt ? fmtDate(row.enabledAt) : '—'}{row.enabledBy ? ` by ${row.enabledBy}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {drawerTab === 'requests' ? (
                <div className="space-y-2">
                  {selected.requests.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">No customer requests for this provider.</p>
                  ) : (
                    selected.requests.map((req) => (
                      <div key={req.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-black text-slate-950">{req.companyName}</p>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${requestStatusBadgeClass(req.status)}`}>
                            {REQUEST_STATUS_LABELS[req.status as keyof typeof REQUEST_STATUS_LABELS] ?? req.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Priority: {req.priority} · Requested {fmtDate(req.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {drawerTab === 'activity' ? (
                <div className="space-y-2">
                  {selected.activity.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs font-bold text-slate-500">No lifecycle changes recorded for this provider yet.</p>
                  ) : (
                    selected.activity.map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-slate-200 p-3">
                        <p className="text-xs font-bold text-slate-700">
                          {entry.previousStatus && entry.newStatus ? `${entry.previousStatus} → ${entry.newStatus}` : entry.action}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-400">{entry.actorEmail ?? 'Unknown actor'} · {fmtDate(entry.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function RequestStatusControl({
  request,
  disabled,
  onUpdate,
}: {
  request: IntegrationRequestRow;
  disabled: boolean;
  onUpdate: (status: string, notes?: string) => void;
}) {
  const [status, setStatus] = useState(request.status);
  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        aria-label={`Update status for ${request.providerName} request from ${request.companyName}`}
        disabled={disabled}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
      >
        {REQUEST_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>)}
      </select>
      <button
        type="button"
        disabled={disabled || status === request.status}
        onClick={() => onUpdate(status)}
        className="rounded-lg bg-[#2557dc] px-3 py-1.5 text-xs font-black text-white hover:bg-[#1a44be] disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}
