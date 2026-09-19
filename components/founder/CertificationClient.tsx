'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FounderDrawer } from './FounderDrawer';
import {
  CERTIFICATION_STATUS_LABELS,
  CERTIFICATION_CATEGORY_LABELS,
  CERTIFICATION_CATEGORY_FILTER_OPTIONS,
  CERTIFICATION_STATUS_FILTER_OPTIONS,
  CERTIFICATION_EVIDENCE_TYPE_LABELS,
  certificationStatusTone,
  sortCertificationControls,
  fmtDateTime,
  type CertificationControl,
  type CertificationStatus,
  type CertificationCategory,
} from '@/lib/founder-certification';
import type { CertificationDecision, CertificationKpis } from '@/services/founder-certification';

type Props = {
  generatedAt: string;
  decision: CertificationDecision;
  kpis: CertificationKpis;
  controls: CertificationControl[];
  attentionControls: CertificationControl[];
};

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'red' | 'blue'; children: React.ReactNode }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }[tone];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide ${classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${{ green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', slate: 'bg-slate-400', blue: 'bg-blue-500' }[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: CertificationStatus }) {
  return <Badge tone={certificationStatusTone(status)}>{CERTIFICATION_STATUS_LABELS[status]}</Badge>;
}

const DECISION_COPY: Record<CertificationDecision, { headline: string; detail: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  ALL_VERIFIED: {
    headline: 'All live-checked controls are currently verified.',
    detail: 'Every control backed by an automated check is passing right now. Documentation-only controls (backup policy, load targets) are shown separately below and are never counted toward this result.',
    tone: 'green',
  },
  NEEDS_ATTENTION: {
    headline: 'One or more live-checked controls need Founder attention.',
    detail: 'At least one automated check is reporting Attention or Not Verified. Review the Attention list below before treating this platform as launch-ready.',
    tone: 'amber',
  },
  HAS_FAILURES: {
    headline: 'At least one live-checked control is currently failing.',
    detail: 'A real, currently-broken control was found. This platform should not be certified for launch until every Failed control below is resolved.',
    tone: 'red',
  },
  INSUFFICIENT_DATA: {
    headline: 'Not enough live-checked data to make a certification decision.',
    detail: 'No automated control could be evaluated on this request.',
    tone: 'slate',
  },
};

export function CertificationClient({ generatedAt, decision, kpis, controls, attentionControls }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<CertificationCategory | ''>('');
  const [status, setStatus] = useState<CertificationStatus | ''>('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filteredControls = useMemo(() => {
    const filtered = controls.filter((c) => (!category || c.category === category) && (!status || c.status === status));
    return sortCertificationControls(filtered);
  }, [controls, category, status]);
  const selected = controls.find((c) => c.key === selectedKey) ?? null;
  const documentedPolicies = controls.filter((c) => c.evidenceType === 'DOCUMENTED_POLICY');

  function refresh() {
    if (pending) return;
    startTransition(() => {
      router.refresh();
    });
  }

  const kpiCards = [
    { label: 'Total Controls', value: String(kpis.totalControls), detail: 'Controls evaluated on this page.' },
    { label: 'Verified', value: String(kpis.verified), detail: 'Live checks currently passing.' },
    { label: 'Attention', value: String(kpis.attention), detail: 'Live checks needing review.' },
    { label: 'Not Verified', value: String(kpis.notVerified), detail: 'No data yet to decide.' },
    { label: 'Failed', value: String(kpis.failed), detail: 'Concrete broken controls.' },
    { label: 'Not Assessed', value: String(kpis.notAssessed), detail: 'Documented policy, not live-checked.' },
  ];

  const decisionCopy = DECISION_COPY[decision];
  const hasActiveFilters = Boolean(category || status);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Governance</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Certification</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              A go-live checklist assembled from ApprovLine&apos;s existing, already-audited Security, Tenant Isolation, Reliability, System Health, Integration Health, Observability, and AI-configuration checks — never a second, competing scoring system.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-right text-xs font-bold text-slate-500">
              Last checked<br />
              <span className="text-sm text-slate-700">{fmtDateTime(generatedAt)}</span>
            </p>
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

      <section
        aria-label="Certification decision"
        className={`rounded-2xl border p-5 ${
          decisionCopy.tone === 'green' ? 'border-emerald-200 bg-emerald-50' :
          decisionCopy.tone === 'amber' ? 'border-amber-200 bg-amber-50' :
          decisionCopy.tone === 'red' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <p className={`text-sm font-black ${
          decisionCopy.tone === 'green' ? 'text-emerald-900' :
          decisionCopy.tone === 'amber' ? 'text-amber-900' :
          decisionCopy.tone === 'red' ? 'text-rose-900' : 'text-slate-900'
        }`}>{decisionCopy.headline}</p>
        <p className={`mt-1.5 text-xs font-semibold leading-5 ${
          decisionCopy.tone === 'green' ? 'text-emerald-800' :
          decisionCopy.tone === 'amber' ? 'text-amber-800' :
          decisionCopy.tone === 'red' ? 'text-rose-800' : 'text-slate-700'
        }`}>{decisionCopy.detail}</p>
      </section>

      <section aria-label="Certification metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{kpi.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{kpi.value}</p>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{kpi.detail}</p>
          </div>
        ))}
      </section>

      {attentionControls.length > 0 ? (
        <section aria-label="Certification attention" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Certification Attention</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Real findings requiring Founder review — never manufactured.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
            {attentionControls.map((c) => (
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
            <p className="mr-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Certification Checklist</p>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CertificationCategory | '')}
              aria-label="Filter by category"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              {CERTIFICATION_CATEGORY_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CertificationStatus | '')}
              aria-label="Filter by status"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            >
              {CERTIFICATION_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
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
                  <p className="text-xs font-semibold text-slate-500">{CERTIFICATION_CATEGORY_LABELS[c.category]}</p>
                  <p className="text-xs font-semibold text-slate-600">{c.summary}</p>
                  <button type="button" onClick={() => setSelectedKey(c.key)} className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100">
                    View details →
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full min-w-[920px] table-fixed text-left text-sm sm:table">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-[200px] px-5 py-3">Control</th>
                  <th scope="col" className="hidden w-[160px] whitespace-nowrap px-5 py-3 lg:table-cell">Category</th>
                  <th scope="col" className="w-[110px] whitespace-nowrap px-5 py-3">Status</th>
                  <th scope="col" className="hidden w-[120px] whitespace-nowrap px-5 py-3 md:table-cell">Evidence Type</th>
                  <th scope="col" className="px-5 py-3">Summary</th>
                  <th scope="col" className="w-28 whitespace-nowrap px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredControls.map((c) => (
                  <tr key={c.key} className="hover:bg-slate-50">
                    <td className="truncate px-5 py-4 font-black text-slate-950" title={c.title}>{c.title}</td>
                    <td className="hidden truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500 lg:table-cell">{CERTIFICATION_CATEGORY_LABELS[c.category]}</td>
                    <td className="px-5 py-4"><StatusBadge status={c.status} /></td>
                    <td className="hidden truncate whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-500 md:table-cell">{CERTIFICATION_EVIDENCE_TYPE_LABELS[c.evidenceType]}</td>
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

      {documentedPolicies.length > 0 ? (
        <section aria-label="Documented policies" className="rounded-2xl border border-blue-200 bg-blue-50/40 shadow-sm">
          <div className="border-b border-blue-100 px-6 py-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-800">Documented Policies — Not Independently Verified</p>
            <p className="mt-0.5 text-[11px] font-semibold text-blue-700">
              No automated check backs these in this codebase. They describe targets and runbooks, never a measured result.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
            {documentedPolicies.map((c) => (
              <article key={c.key} className="rounded-xl border border-blue-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-slate-950">{c.title}</p>
                  <Badge tone="blue">{CERTIFICATION_STATUS_LABELS[c.status]}</Badge>
                </div>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{c.evidence}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selected ? (
        <FounderDrawer onClose={() => setSelectedKey(null)} titleId="certification-drawer-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div className="min-w-0">
              <h3 id="certification-drawer-title" className="truncate text-lg font-black text-slate-950">{selected.title}</h3>
              <p className="text-xs font-semibold text-slate-400">{CERTIFICATION_CATEGORY_LABELS[selected.category]}</p>
            </div>
            <button type="button" onClick={() => setSelectedKey(null)} aria-label="Close certification control details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Status</p>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <Badge tone="slate">{CERTIFICATION_EVIDENCE_TYPE_LABELS[selected.evidenceType]}</Badge>
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
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Last Verified</p>
              <p className="text-xs font-semibold leading-5 text-slate-700">
                {selected.lastVerifiedAt ? fmtDateTime(selected.lastVerifiedAt) : 'Not applicable — documentation-only control with no live check.'}
              </p>
            </div>
            {selected.requiredAction ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-700">Required Action</p>
                <p className="text-xs font-semibold leading-5 text-amber-900">{selected.requiredAction}</p>
              </div>
            ) : null}
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
