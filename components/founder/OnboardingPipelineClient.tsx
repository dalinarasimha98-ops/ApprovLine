'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { planDisplayName } from '@/lib/plans';
import { ONBOARDING_BUCKET_LABELS, ONBOARDING_WAITING_ON_LABELS, type OnboardingBucket, type OnboardingWaitingOn } from '@/lib/onboarding-pipeline';
import type { OnboardingRow } from '@/services/founder-onboarding';

type Props = {
  rows: OnboardingRow[];
  needsAttention: OnboardingRow[];
  canExport: boolean;
};

const STAGE_SEQUENCE: { stage: OnboardingRow['stage']; label: string }[] = [
  { stage: 'Provisioned', label: 'Account Provisioned' },
  { stage: 'Admin Invited', label: 'Admin Invitation' },
  { stage: 'Admin Accepted', label: 'Admin Accepted' },
  { stage: 'Integrations Connected', label: 'Integrations Connected' },
  { stage: 'Go-Live', label: 'Go-Live' },
];
const STAGE_INDEX: Record<OnboardingRow['stage'], number> = {
  'Provisioned': 0,
  'Admin Invited': 1,
  'Admin Accepted': 2,
  'Integrations Connected': 3,
  'Go-Live': 4,
};

function bucketTone(bucket: OnboardingBucket): { badge: string; dot: string; bar: string } {
  if (bucket === 'LIVE') return { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', bar: 'bg-emerald-500' };
  if (bucket === 'BLOCKED') return { badge: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500', bar: 'bg-rose-500' };
  if (bucket === 'IN_PROGRESS') return { badge: 'border-blue-200 bg-blue-50 text-blue-700', dot: 'bg-blue-500', bar: 'bg-[#2557dc]' };
  return { badge: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400', bar: 'bg-slate-400' };
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function waitingOnTone(waitingOn: OnboardingWaitingOn): string {
  if (waitingOn === 'TECHNICAL') return 'text-rose-600';
  if (waitingOn === 'FOUNDER') return 'text-amber-600';
  return 'text-slate-500';
}

function daysInStageLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function customer360Href(id: string, tab?: string) {
  return tab ? `/founder/customers/${id}?tab=${tab}` : `/founder/customers/${id}`;
}

function actionHref(id: string, blocker: OnboardingRow['blockers'][number] | undefined) {
  if (!blocker) return `/founder/customers/${id}`;
  if (blocker.linkToUsersPage) return `/founder/customers/${id}/users`;
  return customer360Href(id, blocker.tab);
}

export function OnboardingPipelineClient({ rows, needsAttention, canExport }: Props) {
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'ALL' | OnboardingBucket>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(needsAttention[0]?.id ?? rows[0]?.id ?? null);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (stageFilter !== 'ALL' && row.bucket !== stageFilter) return false;
      if (!q) return true;
      return row.companyName.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q);
    });
  }, [rows, query, stageFilter]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      {/* Split into two columns only at 2xl+, same fix applied to Customer
          Health: a fixed 360px detail panel eating into the table's width at
          xl (1280px) made both tables feel clipped even with their own
          overflow-x-auto. Below 2xl the panel stacks under the tables
          full-width. */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* Needs Attention */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Needs Attention</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Onboarding tasks that need your attention</h2>
            </div>
            {needsAttention.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-black text-slate-950">All customers are progressing</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">No onboarding blockers require Founder attention.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Stage</th>
                      <th className="px-6 py-3">Blocking Issue</th>
                      <th className="px-6 py-3">Days in Stage</th>
                      <th className="px-6 py-3">Next Action</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {needsAttention.map((row) => {
                      const tone = bucketTone(row.bucket);
                      const top = row.blockers[0];
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
                              {ONBOARDING_BUCKET_LABELS[row.bucket]}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {top ? (
                              <p className={`text-[10px] font-black uppercase tracking-wide ${waitingOnTone(top.waitingOn)}`}>
                                {ONBOARDING_WAITING_ON_LABELS[top.waitingOn]}
                              </p>
                            ) : null}
                            <p className="font-bold text-slate-700">{top?.reason}</p>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-700">
                            <span className={row.bucket === 'BLOCKED' ? 'text-rose-600' : ''}>{daysInStageLabel(row.daysInStage)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              href={actionHref(row.id, top)}
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
                <h2 className="mt-1 text-lg font-black text-slate-950">Complete view of onboarding progress and key milestones</h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value as 'ALL' | OnboardingBucket)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">All stages</option>
                  {(Object.keys(ONBOARDING_BUCKET_LABELS) as OnboardingBucket[]).map((bucket) => (
                    <option key={bucket} value={bucket}>{ONBOARDING_BUCKET_LABELS[bucket]}</option>
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
                    href="/api/founder/onboarding/export"
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
                <p className="font-bold text-slate-500">No customers match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Stage</th>
                      <th className="px-6 py-3">Progress</th>
                      <th className="px-6 py-3">Current Step</th>
                      <th className="px-6 py-3">Days in Stage</th>
                      <th className="px-6 py-3">Target Go-Live</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const tone = bucketTone(row.bucket);
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
                              {ONBOARDING_BUCKET_LABELS[row.bucket]}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${row.progressPercent}%` }} />
                              </div>
                              <span className="text-xs font-black tabular-nums text-slate-600">{row.progressPercent}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-700">{row.currentStep}</td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">{daysInStageLabel(row.daysInStage)}</td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">Not set</td>
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
            <p className="text-sm font-semibold text-slate-500">Select a customer to see onboarding details.</p>
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

              <div className={`rounded-xl border p-4 ${bucketTone(selected.bucket).badge}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Onboarding Status</p>
                <div className="mt-1 flex items-end justify-between">
                  <p className="text-2xl font-black uppercase tracking-tight">{ONBOARDING_BUCKET_LABELS[selected.bucket]}</p>
                  <p className="text-sm font-black tabular-nums">{selected.progressPercent}%</p>
                </div>
                <p className="mt-1 text-xs font-semibold opacity-80">Current step: {selected.currentStep}</p>
              </div>

              {selected.blockers.length > 0 ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Blocking Issue</p>
                  <ul className="mt-2.5 space-y-2">
                    {selected.blockers.map((blocker) => (
                      <li key={blocker.priority} className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                        <span>
                          <span className={`block text-[10px] font-black uppercase tracking-wide ${waitingOnTone(blocker.waitingOn)}`}>
                            {ONBOARDING_WAITING_ON_LABELS[blocker.waitingOn]}
                          </span>
                          {blocker.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Onboarding Progress</p>
                <ul className="mt-2.5 space-y-2">
                  {STAGE_SEQUENCE.map((step) => {
                    const done = STAGE_INDEX[selected.stage] >= STAGE_INDEX[step.stage];
                    return (
                      <li key={step.stage} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black text-white ${done ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          {done ? '✓' : ''}
                        </span>
                        <span className={done ? '' : 'text-slate-400'}>{step.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Key Information</p>
                <dl className="mt-2.5 space-y-2.5">
                  {[
                    ['Days in Current Stage', daysInStageLabel(selected.daysInStage)],
                    ['Target Go-Live', 'Not set'],
                    ['Plan', planDisplayName(selected.planTier)],
                    ['Integrations', String(selected.integrationsConnected)],
                    ['Approvals Processed', String(selected.approvalsProcessed)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <dt className="font-semibold text-slate-500">{label}</dt>
                      <dd className="font-black text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Recommended Actions</p>
                <div className="mt-2.5 space-y-2">
                  {selected.blockers.length > 0 ? (
                    selected.blockers.map((blocker) => (
                      <Link
                        key={blocker.priority}
                        href={actionHref(selected.id, blocker)}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                      >
                        {blocker.action}
                        <span className="text-slate-400">→</span>
                      </Link>
                    ))
                  ) : (
                    <Link
                      href={`/founder/customers/${selected.id}`}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                    >
                      Open Customer 360
                      <span className="text-slate-400">→</span>
                    </Link>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Quick Links</p>
                <div className="mt-2.5 space-y-2">
                  <Link href={`/founder/customers/${selected.id}`} className="flex items-center justify-between text-sm font-bold text-[#2557dc] hover:text-blue-700">
                    Open Customer 360 <span>→</span>
                  </Link>
                  <Link href={`/founder/customers/${selected.id}/users`} className="flex items-center justify-between text-sm font-bold text-[#2557dc] hover:text-blue-700">
                    Manage Users <span>→</span>
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
