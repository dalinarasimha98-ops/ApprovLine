'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { planDisplayName } from '@/lib/plans';
import {
  GATE_LABELS,
  GATE_STATUS_LABELS,
  READINESS_STATUS_LABELS,
  type GateKey,
  type GateStatus,
  type ReadinessStatus,
} from '@/lib/go-live-readiness';
import type { ReadinessGate, ReadinessRow } from '@/services/founder-go-live-readiness';

type Props = {
  rows: ReadinessRow[];
  attention: ReadinessRow[];
  canExport: boolean;
};

// Countable gates in display/priority order, plus the two gates that are
// never part of the readiness computation but are still shown for honest
// context in the detail panel (see services/founder-go-live-readiness.ts's
// overallReadiness doc comment for why SECURITY/DECISION are excluded).
const GATE_DISPLAY_ORDER: GateKey[] = ['ADMIN', 'WORKSPACE', 'INTEGRATIONS', 'APPROVALS', 'EVIDENCE', 'SECURITY', 'PILOT', 'DECISION'];

function readinessTone(status: ReadinessStatus): { badge: string; dot: string } {
  if (status === 'READY') return { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' };
  if (status === 'BLOCKED') return { badge: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' };
  if (status === 'NOT_READY') return { badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' };
  return { badge: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400' };
}

function gateTone(status: GateStatus): string {
  if (status === 'COMPLETE') return 'text-emerald-600';
  if (status === 'BLOCKED') return 'text-rose-600';
  if (status === 'IN_PROGRESS') return 'text-blue-600';
  return 'text-slate-400';
}

function gateIcon(status: GateStatus): string {
  if (status === 'COMPLETE') return '✓';
  if (status === 'BLOCKED') return '✕';
  if (status === 'IN_PROGRESS') return '●';
  return '○';
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function customer360Href(id: string, tab?: string) {
  return tab ? `/founder/customers/${id}?tab=${tab}` : `/founder/customers/${id}`;
}

function gateActionHref(id: string, gate: ReadinessGate | null) {
  if (!gate) return `/founder/customers/${id}`;
  if (gate.usersPage) return `/founder/customers/${id}/users`;
  if (gate.pilotPage) return `/founder/pilots/${id}`;
  return customer360Href(id, gate.tab);
}

export function GoLiveReadinessClient({ rows, attention, canExport }: Props) {
  const [query, setQuery] = useState('');
  const [readinessFilter, setReadinessFilter] = useState<'ALL' | ReadinessStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(attention[0]?.id ?? rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (readinessFilter !== 'ALL' && row.readiness !== readinessFilter) return false;
      if (!q) return true;
      return row.companyName.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q);
    });
  }, [rows, query, readinessFilter]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      {/* Split into two columns only at 2xl+ — same fix already applied to
          Customer Health and Onboarding Pipeline, so the fixed-width detail
          panel never crowds the tables at common laptop widths. */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* Go-Live Attention */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Go-Live Attention</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Customers that require action before production readiness</h2>
            </div>
            {attention.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-black text-slate-950">No customers need attention</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">Every assessed customer is either ready or has no open blockers.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Readiness</th>
                      <th className="px-6 py-3">Primary Blocker</th>
                      <th className="px-6 py-3">Remaining Gates</th>
                      <th className="px-6 py-3">Next Action</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attention.map((row) => {
                      const tone = readinessTone(row.readiness);
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
                              {READINESS_STATUS_LABELS[row.readiness]}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.primaryGate?.reason ?? '—'}</td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.gatesRemaining} of {row.gatesTotal}</td>
                          <td className="px-6 py-4">
                            <Link
                              href={gateActionHref(row.id, row.primaryGate)}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                            >
                              {row.primaryGate?.action ?? 'Open Customer 360'}
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
                <h2 className="mt-1 text-lg font-black text-slate-950">Complete view of go-live readiness across your customer portfolio</h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <select
                  value={readinessFilter}
                  onChange={(e) => setReadinessFilter(e.target.value as 'ALL' | ReadinessStatus)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">All readiness states</option>
                  {(Object.keys(READINESS_STATUS_LABELS) as ReadinessStatus[]).map((status) => (
                    <option key={status} value={status}>{READINESS_STATUS_LABELS[status]}</option>
                  ))}
                </select>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="search"
                  placeholder="Search customers…"
                  className="h-9 w-48 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                />
                {canExport ? (
                  <Link
                    href="/api/founder/go-live-readiness/export"
                    className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    Export
                  </Link>
                ) : null}
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-black text-slate-950">No customers available for readiness assessment</p>
                <Link href="/founder/provision" className="mt-3 inline-block rounded-xl bg-[#2557dc] px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
                  Provision Customer
                </Link>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-bold text-slate-500">No customers match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Readiness</th>
                      <th className="px-6 py-3">Onboarding</th>
                      <th className="px-6 py-3">Integrations</th>
                      <th className="px-6 py-3">Approvals</th>
                      <th className="px-6 py-3">Pilot</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const tone = readinessTone(row.readiness);
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
                              {READINESS_STATUS_LABELS[row.readiness]}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.onboardingStage}</td>
                          <td className={`px-6 py-4 font-bold ${gateTone(row.gates.INTEGRATIONS.status)}`}>
                            {gateIcon(row.gates.INTEGRATIONS.status)} {GATE_STATUS_LABELS[row.gates.INTEGRATIONS.status]}
                          </td>
                          <td className={`px-6 py-4 font-bold ${gateTone(row.gates.APPROVALS.status)}`}>
                            {gateIcon(row.gates.APPROVALS.status)} {GATE_STATUS_LABELS[row.gates.APPROVALS.status]}
                          </td>
                          <td className={`px-6 py-4 font-bold ${gateTone(row.gates.PILOT.status)}`}>
                            {gateIcon(row.gates.PILOT.status)} {GATE_STATUS_LABELS[row.gates.PILOT.status]}
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
        </div>

        {/* Customer detail panel */}
        <aside className="h-fit min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm 2xl:sticky 2xl:top-6">
          {!selected ? (
            <p className="text-sm font-semibold text-slate-500">Select a customer to see readiness details.</p>
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

              <div className={`rounded-xl border p-4 ${readinessTone(selected.readiness).badge}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Readiness</p>
                <p className="mt-1 text-2xl font-black uppercase tracking-tight">{READINESS_STATUS_LABELS[selected.readiness]}</p>
                <p className="mt-1 text-xs font-semibold opacity-80">
                  {selected.gatesRemaining === 0
                    ? `All ${selected.gatesTotal} core gates verified`
                    : `${selected.gatesRemaining} of ${selected.gatesTotal} core gates require attention`}
                </p>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Readiness Gates</p>
                <ul className="mt-2.5 space-y-2">
                  {GATE_DISPLAY_ORDER.map((key) => {
                    const gate = selected.gates[key];
                    return (
                      <li key={key} className="flex items-start justify-between gap-2 text-sm">
                        <span className="flex items-start gap-2 font-semibold text-slate-700">
                          <span className={`mt-0.5 font-black ${gateTone(gate.status)}`}>{gateIcon(gate.status)}</span>
                          {GATE_LABELS[key]}
                        </span>
                        <span className={`shrink-0 text-xs font-black ${gateTone(gate.status)}`}>{GATE_STATUS_LABELS[gate.status]}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {selected.primaryGate ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Primary Blocker</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{selected.primaryGate.reason}</p>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Next Actions</p>
                <div className="mt-2.5 space-y-2">
                  {selected.primaryGate?.action ? (
                    <Link
                      href={gateActionHref(selected.id, selected.primaryGate)}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                    >
                      {selected.primaryGate.action}
                      <span className="text-slate-400">→</span>
                    </Link>
                  ) : null}
                  <Link
                    href={`/founder/customers/${selected.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    Open Customer 360
                    <span className="text-slate-400">→</span>
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
