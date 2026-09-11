'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import type { CustomerRow } from '@/services/founder';
import { commercialPlans, planDisplayName } from '@/lib/plans';

// ── Health tone ───────────────────────────────────────────────────────────────
function healthTone(status: string): { bg: string; text: string } {
  if (status === 'HEALTHY') return { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' };
  if (status === 'NEEDS_ATTENTION') return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' };
  if (status === 'AT_RISK') return { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700' };
  return { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' };
}

function healthLabel(status: string): string {
  if (status === 'HEALTHY') return 'Healthy';
  if (status === 'NEEDS_ATTENTION') return 'Needs Attention';
  if (status === 'AT_RISK') return 'At Risk';
  if (status === 'CRITICAL') return 'Critical';
  return status;
}

function statusTone(status: string): string {
  if (status === 'ACTIVE') return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  if (status === 'TRIAL') return 'bg-blue-50 border-blue-200 text-blue-700';
  if (status === 'SUSPENDED') return 'bg-rose-50 border-rose-200 text-rose-700';
  if (status === 'CHURNED') return 'bg-slate-100 border-slate-200 text-slate-500';
  return 'bg-slate-50 border-slate-200 text-slate-600';
}

function lifecycleTone(lc: string): string {
  if (lc === 'Converted') return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  if (lc === 'Pilot Active') return 'bg-blue-50 border-blue-200 text-blue-700';
  if (lc === 'Pilot At Risk') return 'bg-rose-50 border-rose-200 text-rose-700';
  if (lc === 'Demo Scheduled') return 'bg-violet-50 border-violet-200 text-violet-700';
  if (lc === 'Lost') return 'bg-slate-100 border-slate-200 text-slate-500';
  return 'bg-slate-50 border-slate-200 text-slate-600';
}

function fmtArr(n: number): string {
  if (n === 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-black uppercase leading-none tracking-wide whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

// ── Preview drawer ────────────────────────────────────────────────────────────
function PreviewDrawer({
  customer,
  onClose,
  readOnly,
  updateStatusAction,
}: {
  customer: CustomerRow;
  onClose: () => void;
  readOnly: boolean;
  updateStatusAction: (formData: FormData) => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ht = healthTone(customer.healthStatus);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-label={`Preview: ${customer.companyName}`}
        className="fixed right-0 top-0 z-40 h-full w-full max-w-sm overflow-y-auto bg-white shadow-2xl ring-1 ring-slate-200 flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Customer Preview</p>
            <h3 className="mt-1 truncate text-xl font-black text-slate-950">{customer.companyName}</h3>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{customer.domain}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close preview"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <Badge className={statusTone(customer.status)}>{customer.status}</Badge>
            <Badge className={lifecycleTone(customer.lifecycleStatus)}>{customer.lifecycleStatus}</Badge>
            <Badge className={`${ht.bg} ${ht.text}`}>{healthLabel(customer.healthStatus)}</Badge>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            {[
              { label: 'Plan', value: planDisplayName(customer.planTier) },
              { label: 'Health Score', value: `${customer.healthScore}/100` },
              { label: 'Seats', value: `${customer.activeSeats}/${customer.allocatedSeats}` },
              { label: 'Integrations', value: String(customer.integrationsConnected) },
              { label: 'Est. ARR', value: fmtArr(customer.expectedArr) },
              { label: 'Customer Since', value: fmtDate(customer.createdAt) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-base font-black text-slate-950">{value}</p>
              </div>
            ))}
          </dl>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Admin</p>
            <p className="mt-1 truncate text-sm font-bold text-slate-700">{customer.primaryAdminEmail}</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Last Updated</p>
            <p className="mt-1 text-sm font-bold text-slate-700">{fmtDate(customer.updatedAt)}</p>
          </div>
        </div>

        <div className="border-t border-slate-100 p-5 space-y-2">
          <Link
            href={`/founder/customers/${customer.id}`}
            className="flex w-full items-center justify-center rounded-xl bg-[#2557dc] px-4 py-2.5 text-sm font-black text-white"
          >
            Open Customer 360
          </Link>
          {!readOnly && (
            <form action={updateStatusAction}>
              <input type="hidden" name="customerId" value={customer.id} />
              <input type="hidden" name="status" value={customer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'} />
              <button
                type="submit"
                className="flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                {customer.status === 'SUSPENDED' ? 'Reactivate Customer' : 'Suspend Customer'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
export function FilterBar({
  q,
  status,
  plan,
  health,
}: {
  q?: string;
  status?: string;
  plan?: string;
  health?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function navigate(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { q: q ?? '', status: status ?? '', plan: plan ?? '', health: health ?? '', ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    startTransition(() => router.push(`/founder/customers?${params.toString()}`));
  }

  const hasFilters = !!(q || status || plan || health);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Search row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          navigate({ q: String(fd.get('q') ?? ''), page: '1' });
        }}
        className="w-full"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search customers by company, domain, email…"
          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
        />
      </form>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status ?? ''}
          onChange={(e) => navigate({ status: e.target.value, page: '1' })}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Status</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Trial</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CHURNED">Churned</option>
        </select>

        <select
          value={plan ?? ''}
          onChange={(e) => navigate({ plan: e.target.value, page: '1' })}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Plan</option>
          {Object.values(commercialPlans).map((plan) => (
            <option key={plan.tier} value={plan.tier}>{plan.displayName}</option>
          ))}
        </select>

        <select
          value={health ?? ''}
          onChange={(e) => navigate({ health: e.target.value, page: '1' })}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Health</option>
          <option value="HEALTHY">Healthy</option>
          <option value="NEEDS_ATTENTION">Needs Attention</option>
          <option value="AT_RISK">At Risk</option>
          <option value="CRITICAL">Critical</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => navigate({ q: '', status: '', plan: '', health: '', page: '1' })}
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-500 hover:bg-slate-50"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────
export function CustomersTableClient({
  customers,
  readOnly,
  updateStatusAction,
}: {
  customers: CustomerRow[];
  readOnly: boolean;
  updateStatusAction: (formData: FormData) => Promise<void>;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = customers.find((c) => c.id === previewId);

  const closePreview = useCallback(() => setPreviewId(null), []);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth: 860 }}>
          <thead className="bg-slate-50">
            <tr>
              {[
                { label: 'Customer', className: 'w-[220px]' },
                { label: 'Plan', className: 'w-[90px]' },
                { label: 'Lifecycle', className: 'w-[110px]' },
                { label: 'Health', className: 'w-[110px]' },
                { label: 'Seats', className: 'w-[70px]' },
                { label: 'Integrations', className: 'w-[80px]' },
                { label: 'Est. ARR', className: 'w-[80px]' },
                { label: 'Last Updated', className: 'w-[90px]' },
                { label: '', className: 'w-[150px]' },
              ].map((h) => (
                <th key={h.label} className={`px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500 whitespace-nowrap ${h.className}`}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((customer) => {
              const ht = healthTone(customer.healthStatus);
              return (
                <tr
                  key={customer.id}
                  onClick={() => setPreviewId(customer.id === previewId ? null : customer.id)}
                  className={`cursor-pointer transition-colors hover:bg-slate-50 ${previewId === customer.id ? 'bg-blue-50/60' : ''}`}
                >
                  <td className="px-4 py-4">
                    <p className="font-black text-slate-950 leading-snug truncate max-w-[200px]">{customer.companyName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-400 truncate max-w-[200px]">{customer.domain}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-400 truncate max-w-[200px]">{customer.primaryAdminEmail}</p>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <Badge className="bg-slate-50 border-slate-200 text-slate-600">
                      {planDisplayName(customer.planTier)}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <Badge className={lifecycleTone(customer.lifecycleStatus)}>{customer.lifecycleStatus}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <Badge className={`${ht.bg} ${ht.text}`}>{healthLabel(customer.healthStatus)}</Badge>
                    <p className="mt-1 text-xs font-bold text-slate-400">{customer.healthScore}/100</p>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap font-bold text-slate-700 tabular-nums">
                    {customer.activeSeats}/{customer.allocatedSeats}
                  </td>
                  <td className="px-4 py-4 font-bold text-slate-700 tabular-nums">{customer.integrationsConnected}</td>
                  <td className="px-4 py-4 font-bold text-slate-700 tabular-nums whitespace-nowrap">{fmtArr(customer.expectedArr)}</td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-500 whitespace-nowrap">{fmtDate(customer.updatedAt)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/founder/customers/${customer.id}`}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </Link>
                      {!readOnly && (
                        <form action={updateStatusAction}>
                          <input type="hidden" name="customerId" value={customer.id} />
                          <input type="hidden" name="status" value={customer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'} />
                          <button
                            type="submit"
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                          >
                            {customer.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {customers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-16 text-center">
                  <p className="text-base font-black text-slate-400">No customers match these filters</p>
                  <p className="mt-1 text-sm font-semibold text-slate-400">Try adjusting the search or filters above.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <PreviewDrawer
          customer={preview}
          onClose={closePreview}
          readOnly={readOnly}
          updateStatusAction={updateStatusAction}
        />
      )}
    </>
  );
}
