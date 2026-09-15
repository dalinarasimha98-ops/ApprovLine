'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FounderDrawer } from './FounderDrawer';
import {
  SECURITY_STATUS_LABELS,
  SECURITY_SEVERITY_LABELS,
  SECURITY_CATEGORY_LABELS,
  SECURITY_CATEGORY_FILTER_OPTIONS,
  SECURITY_STATUS_FILTER_OPTIONS,
  securityStatusTone,
  fmtDateTime,
  actorDisplayName,
  auditCategoryFor,
  auditCategoryTone,
  auditLabelFor,
  AUDIT_CATEGORY_LABELS,
  type SecurityControl,
  type SecurityStatus,
  type SecurityCategory,
} from '@/lib/founder-security';

const EMPTY_CONTROLS: SecurityControl[] = [];

export type SecurityKpisClient = { totalControls: number; verified: number; attention: number; notVerified: number; criticalFindings: number };

export type SecurityEventRowClient = {
  id: string;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  customer: { id: string; companyName: string; domain: string } | null;
};

type Props =
  | { state: 'error'; safeError: string }
  | {
      state: 'ok';
      generatedAt: string;
      kpis: SecurityKpisClient;
      controls: SecurityControl[];
      attentionControls: SecurityControl[];
      events: SecurityEventRowClient[];
      hasAnyEventsAtAll: boolean;
    };

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'red' | 'blue' | 'purple' | 'teal'; children: React.ReactNode }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    purple: 'border-violet-200 bg-violet-50 text-violet-700',
    teal: 'border-teal-200 bg-teal-50 text-teal-700',
  }[tone];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide ${classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${{ green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', slate: 'bg-slate-400', blue: 'bg-blue-500', purple: 'bg-violet-500', teal: 'bg-teal-500' }[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: SecurityStatus }) {
  return <Badge tone={securityStatusTone(status)}>{SECURITY_STATUS_LABELS[status]}</Badge>;
}

function eventLabel(row: SecurityEventRowClient): string {
  return auditLabelFor(row.action, row.metadata);
}

function eventAuditHref(row: SecurityEventRowClient): string {
  const params = new URLSearchParams();
  params.set('action', row.action);
  if (row.customer) params.set('customerAccountId', row.customer.id);
  return `/founder/audit?${params.toString()}`;
}

export function SecurityClient(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<SecurityCategory | ''>('');
  const [status, setStatus] = useState<SecurityStatus | ''>('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const controls = props.state === 'ok' ? props.controls : EMPTY_CONTROLS;
  const filteredControls = useMemo(() => {
    return controls.filter((c) => (!category || c.category === category) && (!status || c.status === status));
  }, [controls, category, status]);
  const selected = controls.find((c) => c.key === selectedKey) ?? null;

  function refresh() {
    if (pending) return;
    startTransition(() => {
      router.refresh();
    });
  }

  const kpis = props.state === 'ok' ? [
    { label: 'Security Controls', value: String(props.kpis.totalControls), detail: 'Controls evaluated on this page.' },
    { label: 'Verified', value: String(props.kpis.verified), detail: 'Evidence-backed controls.' },
    { label: 'Attention', value: String(props.kpis.attention), detail: 'Controls requiring review.' },
    { label: 'Not Verified', value: String(props.kpis.notVerified), detail: 'Evidence unavailable.' },
    { label: 'Critical Findings', value: String(props.kpis.criticalFindings), detail: props.kpis.criticalFindings === 0 ? 'No known failures.' : 'Concrete broken controls.' },
  ] : [];

  const hasActiveFilters = Boolean(category || status);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Governance</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Security</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Review Founder access, authorization, tenant isolation, audit controls, and security posture across ApprovLine.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {props.state === 'ok' ? (
              <p className="text-right text-xs font-bold text-slate-500">
                Last checked<br />
                <span className="text-sm text-slate-700">{fmtDateTime(props.generatedAt)}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              aria-busy={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true" className={pending ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
              {pending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {props.state === 'error' ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="text-sm font-black text-rose-900">Security posture could not be loaded.</p>
          <p className="mt-1 text-xs font-semibold text-rose-700">Safe diagnostic: {props.safeError}</p>
        </section>
      ) : (
        <>
          <section aria-label="Security metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{kpi.label}</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{kpi.value}</p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{kpi.detail}</p>
              </div>
            ))}
          </section>

          {props.attentionControls.length > 0 ? (
            <section aria-label="Security attention" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Security Attention</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Real findings requiring Founder review — never manufactured.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                {props.attentionControls.map((c) => (
                  <article key={c.key} className={`rounded-xl border p-4 ${c.status === 'FAILED' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-black ${c.status === 'FAILED' ? 'text-rose-900' : 'text-amber-900'}`}>{c.title}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className={`mt-2 text-xs font-semibold leading-5 ${c.status === 'FAILED' ? 'text-rose-800' : 'text-amber-800'}`}>{c.summary}</p>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(c.key)}
                      className={`mt-3 text-xs font-black hover:underline ${c.status === 'FAILED' ? 'text-rose-700' : 'text-amber-700'}`}
                    >
                      View control →
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Security Controls</p>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SecurityCategory | '')}
                  aria-label="Filter by category"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  {SECURITY_CATEGORY_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SecurityStatus | '')}
                  aria-label="Filter by status"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                >
                  {SECURITY_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
                </select>
                {hasActiveFilters ? (
                  <button type="button" onClick={() => { setCategory(''); setStatus(''); }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                    Clear Filters
                  </button>
                ) : null}
              </div>
            </div>

            {filteredControls.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-bold text-slate-500">No controls match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {filteredControls.map((c) => (
                    <li key={c.key} className="space-y-1.5 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-black text-slate-950">{c.title}</p>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="text-xs font-semibold text-slate-500">{SECURITY_CATEGORY_LABELS[c.category]}</p>
                      <p className="text-xs font-semibold text-slate-600">{c.summary}</p>
                      <button type="button" onClick={() => setSelectedKey(c.key)} className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100">
                        View details →
                      </button>
                    </li>
                  ))}
                </ul>

                <table className="hidden w-full min-w-[880px] table-fixed text-left text-sm sm:table">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-[220px] px-5 py-3">Control</th>
                      <th scope="col" className="hidden w-[150px] whitespace-nowrap px-5 py-3 lg:table-cell">Category</th>
                      <th scope="col" className="w-[120px] whitespace-nowrap px-5 py-3">Status</th>
                      <th scope="col" className="px-5 py-3">Evidence</th>
                      <th scope="col" className="w-28 whitespace-nowrap px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredControls.map((c) => (
                      <tr key={c.key} className="hover:bg-slate-50">
                        <td className="truncate px-5 py-4 font-black text-slate-950" title={c.title}>{c.title}</td>
                        <td className="hidden truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500 lg:table-cell">{SECURITY_CATEGORY_LABELS[c.category]}</td>
                        <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                        <td className="truncate px-5 py-4 text-xs font-semibold text-slate-600" title={c.summary}>{c.summary}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-right">
                          <button type="button" onClick={() => setSelectedKey(c.key)} className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100">
                            View details →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Recent security events" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Recent Security Events</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Role changes, suspensions, deletions, and access/config changes from the Founder audit trail.</p>
            </div>
            {!props.hasAnyEventsAtAll ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-black text-slate-700">No recent security events are recorded.</p>
              </div>
            ) : props.events.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-bold text-slate-500">No security events match the current view.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {props.events.map((event) => {
                    const eventCategory = auditCategoryFor(event.action);
                    return (
                      <li key={event.id} className="space-y-1.5 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-slate-500">{fmtDateTime(event.createdAt)}</p>
                          <Badge tone={auditCategoryTone(eventCategory)}>{AUDIT_CATEGORY_LABELS[eventCategory]}</Badge>
                        </div>
                        <p className="truncate font-black text-slate-950" title={eventLabel(event)}>{eventLabel(event)}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          {actorDisplayName(event.actorEmail)} · {event.customer ? event.customer.companyName : 'Platform'}
                        </p>
                        <Link href={eventAuditHref(event)} className="mt-1 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100">
                          View →
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                <table className="hidden w-full min-w-[860px] table-fixed text-left text-sm sm:table">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-[170px] whitespace-nowrap px-5 py-3">Date / Time</th>
                      <th scope="col" className="w-[150px] whitespace-nowrap px-5 py-3">Actor</th>
                      <th scope="col" className="w-[160px] whitespace-nowrap px-5 py-3">Customer</th>
                      <th scope="col" className="px-5 py-3">Event</th>
                      <th scope="col" className="hidden w-[130px] whitespace-nowrap px-5 py-3 lg:table-cell">Category</th>
                      <th scope="col" className="w-24 whitespace-nowrap px-4 py-3 text-right">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {props.events.map((event) => {
                      const eventCategory = auditCategoryFor(event.action);
                      return (
                        <tr key={event.id}>
                          <td className="truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500" title={fmtDateTime(event.createdAt)}>{fmtDateTime(event.createdAt)}</td>
                          <td className="truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500">{actorDisplayName(event.actorEmail)}</td>
                          <td className="truncate px-5 py-4 text-xs font-semibold text-slate-600">{event.customer ? event.customer.companyName : 'Platform'}</td>
                          <td className="truncate px-5 py-4 text-xs font-semibold text-slate-700" title={eventLabel(event)}>{eventLabel(event)}</td>
                          <td className="hidden whitespace-nowrap px-5 py-4 lg:table-cell"><Badge tone={auditCategoryTone(eventCategory)}>{AUDIT_CATEGORY_LABELS[eventCategory]}</Badge></td>
                          <td className="whitespace-nowrap px-4 py-4 text-right">
                            <Link href={eventAuditHref(event)} className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100">
                              View →
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
        </>
      )}

      {selected ? (
        <FounderDrawer onClose={() => setSelectedKey(null)} titleId="security-drawer-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div className="min-w-0">
              <h3 id="security-drawer-title" className="truncate text-lg font-black text-slate-950">{selected.title}</h3>
              <p className="text-xs font-semibold text-slate-400">{SECURITY_CATEGORY_LABELS[selected.category]}</p>
            </div>
            <button type="button" onClick={() => setSelectedKey(null)} aria-label="Close security control details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Status</p>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                {selected.severity ? <Badge tone={selected.status === 'FAILED' ? 'red' : 'amber'}>{SECURITY_SEVERITY_LABELS[selected.severity]}</Badge> : null}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Why This Status</p>
              <p className="text-xs font-semibold leading-5 text-slate-700">{selected.whyThisStatus}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Evidence</p>
              <p className="text-xs font-semibold leading-5 text-slate-700">{selected.evidence}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Source</p>
              <ul className="space-y-1">
                {selected.sources.map((s) => (
                  <li key={s} className="truncate rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-600">{s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Security Implication</p>
              <p className="text-xs font-semibold leading-5 text-slate-700">{selected.securityImplication}</p>
            </div>
            {selected.nextAction ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-700">Next Action</p>
                <p className="text-xs font-semibold leading-5 text-amber-900">{selected.nextAction}</p>
              </div>
            ) : null}
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
