'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { planDisplayName } from '@/lib/plans';
import { HEALTH_STATUS_LABELS, type HealthStatus } from '@/lib/customer-health';
import type { CustomerHealthRow } from '@/services/founder-customer-health';

type Props = {
  rows: CustomerHealthRow[];
  attention: CustomerHealthRow[];
  canExport: boolean;
};

function healthTone(status: HealthStatus): { badge: string; dot: string; text: string } {
  if (status === 'HEALTHY') return { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', text: 'text-emerald-700' };
  if (status === 'NEEDS_ATTENTION') return { badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', text: 'text-amber-700' };
  if (status === 'AT_RISK') return { badge: 'border-orange-200 bg-orange-50 text-orange-700', dot: 'bg-orange-500', text: 'text-orange-700' };
  return { badge: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500', text: 'text-rose-700' };
}

function severityTone(severity: 'High' | 'Medium' | 'Low'): string {
  if (severity === 'High') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (severity === 'Medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function statusDescription(status: HealthStatus): string {
  if (status === 'HEALTHY') return 'No significant issues detected.';
  if (status === 'NEEDS_ATTENTION') return 'Some signals warrant a closer look.';
  if (status === 'AT_RISK') return 'Meaningful risk signals present.';
  return 'Significant attention required.';
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function lastActivityLabel(row: CustomerHealthRow): string {
  if (row.lastActivityDays === null) return 'No activity recorded';
  if (row.lastActivityDays === 0) return 'Today';
  if (row.lastActivityDays === 1) return '1 day ago';
  return `${row.lastActivityDays} days ago`;
}

function customer360Href(id: string, tab?: string) {
  return tab ? `/founder/customers/${id}?tab=${tab}` : `/founder/customers/${id}`;
}

export function CustomerHealthClient({ rows, attention, canExport }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(attention[0]?.id ?? rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.companyName.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q));
  }, [rows, query]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* Founder Attention */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Founder Attention</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Customers that need your attention right now</h2>
            </div>
            {attention.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-black text-slate-950">All customers are healthy</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">No customers currently require Founder attention.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Health</th>
                      <th className="px-6 py-3">Primary Reason</th>
                      <th className="px-6 py-3">Severity</th>
                      <th className="px-6 py-3">Recommended Action</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attention.map((row) => {
                      const tone = healthTone(row.healthStatus);
                      const top = row.signals[0];
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedId(row.id)}
                          className={`cursor-pointer transition hover:bg-slate-50 ${selectedId === row.id ? 'bg-blue-50/60' : ''}`}
                        >
                          <td className="px-6 py-4">
                            <p className="font-black text-slate-950">{row.companyName}</p>
                            <p className="text-xs font-semibold text-slate-400">{row.domain}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone.badge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                              {HEALTH_STATUS_LABELS[row.healthStatus]}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-700">{top?.reason}</td>
                          <td className="px-6 py-4">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${severityTone(top?.severity ?? 'Low')}`}>
                              {top?.severity}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              href={customer360Href(row.id, top?.tab)}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                            >
                              {top?.action}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link href={`/founder/customers/${row.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-black text-[#2557dc] hover:text-blue-700">
                              Open →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* All Customers */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">All Customers</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">Complete view of customer health and key metrics</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="search"
                  placeholder="Search customers…"
                  className="h-9 w-48 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                />
                {canExport ? (
                  <Link
                    href="/api/founder/customer-health/export"
                    className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    Export
                  </Link>
                ) : null}
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-black text-slate-950">No customers provisioned yet</p>
                <Link href="/founder/provision" className="mt-3 inline-block rounded-xl bg-[#2557dc] px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
                  Provision Customer
                </Link>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-bold text-slate-500">No customers match &quot;{query}&quot;.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Health</th>
                      <th className="px-6 py-3">Adoption</th>
                      <th className="px-6 py-3">Integrations</th>
                      <th className="px-6 py-3">Approvals</th>
                      <th className="px-6 py-3">Onboarding</th>
                      <th className="px-6 py-3">Last Activity</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const tone = healthTone(row.healthStatus);
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedId(row.id)}
                          className={`cursor-pointer transition hover:bg-slate-50 ${selectedId === row.id ? 'bg-blue-50/60' : ''}`}
                        >
                          <td className="px-6 py-4">
                            <p className="font-black text-slate-950">{row.companyName}</p>
                            <p className="text-xs font-semibold text-slate-400">{row.domain} · {planDisplayName(row.planTier)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${tone.badge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                              {HEALTH_STATUS_LABELS[row.healthStatus]}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.adoptionPercent !== null ? `${row.adoptionPercent}%` : '—'}</td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.integrationsConnected}/{row.integrationsTotal}</td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.approvalsProcessed}</td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.onboardingStage}</td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">{lastActivityLabel(row)}</td>
                          <td className="px-6 py-4 text-right">
                            <Link href={`/founder/customers/${row.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-black text-[#2557dc] hover:text-blue-700">
                              Open →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Customer detail panel */}
        <aside className="h-fit min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-6">
          {!selected ? (
            <p className="text-sm font-semibold text-slate-500">Select a customer to see health details.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white">
                    {initials(selected.companyName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-950">{selected.companyName}</p>
                    <p className="truncate text-xs font-semibold text-slate-400">{selected.domain}</p>
                  </div>
                </div>
                <Link href={`/founder/customers/${selected.id}`} className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="Open Customer 360">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>

              <div className={`rounded-xl border p-4 ${healthTone(selected.healthStatus).badge}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Health Status</p>
                <div className="mt-1 flex items-end justify-between">
                  <p className="text-2xl font-black uppercase tracking-tight">{HEALTH_STATUS_LABELS[selected.healthStatus]}</p>
                  <p className="text-sm font-black tabular-nums">{selected.healthScore}<span className="text-xs font-bold opacity-70">/100</span></p>
                </div>
                <p className="mt-1 text-xs font-semibold opacity-80">{statusDescription(selected.healthStatus)}</p>
              </div>

              {selected.signals.length > 0 ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Why this status?</p>
                  <ul className="mt-2 space-y-1.5">
                    {selected.signals.map((signal) => (
                      <li key={signal.priority} className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                        {signal.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Key Metrics</p>
                <dl className="mt-2 space-y-2">
                  {[
                    ['User Adoption', selected.adoptionPercent !== null ? `${selected.adoptionPercent}%` : 'No seat data available.'],
                    ['Integrations', `${selected.integrationsConnected} / ${selected.integrationsTotal}`],
                    ['Approvals Processed', String(selected.approvalsProcessed)],
                    ['Onboarding', selected.onboardingStage],
                    ['Last Activity', lastActivityLabel(selected)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <dt className="font-semibold text-slate-500">{label}</dt>
                      <dd className="font-black text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {selected.signals.length > 0 ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Recommended Actions</p>
                  <div className="mt-2 space-y-2">
                    {selected.signals.map((signal) => (
                      <Link
                        key={signal.priority}
                        href={customer360Href(selected.id, signal.tab)}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                      >
                        {signal.action}
                        <span className="text-slate-400">→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Quick Links</p>
                <div className="mt-2 space-y-1.5">
                  <Link href={`/founder/customers/${selected.id}`} className="flex items-center justify-between text-sm font-bold text-[#2557dc] hover:text-blue-700">
                    Open Customer 360 <span>→</span>
                  </Link>
                  <Link href={`/founder/audit?customerAccountId=${selected.id}`} className="flex items-center justify-between text-sm font-bold text-[#2557dc] hover:text-blue-700">
                    View Audit Log <span>→</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
