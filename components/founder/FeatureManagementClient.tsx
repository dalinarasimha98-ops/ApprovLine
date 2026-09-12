'use client';

import { useMemo, useState, useTransition } from 'react';
import { planDisplayName } from '@/lib/plans';
import { FounderDrawer } from './FounderDrawer';
import {
  EFFECTIVE_ACCESS_LABELS,
  FEATURE_EFFECTIVE_SUMMARY_LABELS,
} from '@/lib/founder-features';
import type { FeatureAccessRow, FeatureCatalogRow } from '@/services/founder-features';

export type MutationResult = { ok: true } | { ok: false; error: string };

type Props = {
  features: FeatureCatalogRow[];
  canManage: boolean;
  onSetOverride: (input: { customerAccountId: string; key: string; enabled: boolean }) => Promise<MutationResult>;
  onResetOverride: (input: { customerAccountId: string; key: string }) => Promise<MutationResult>;
  exportHref: string | null;
};

function summaryTone(summary: FeatureCatalogRow['effectiveSummary']): string {
  if (summary === 'ENABLED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (summary === 'DISABLED') return 'border-slate-200 bg-slate-50 text-slate-600';
  if (summary === 'MIXED') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

function summaryDot(summary: FeatureCatalogRow['effectiveSummary']): string {
  if (summary === 'ENABLED') return 'bg-emerald-500';
  if (summary === 'DISABLED') return 'bg-slate-400';
  if (summary === 'MIXED') return 'bg-blue-500';
  return 'bg-slate-300';
}

function categoryTone(category: string): string {
  if (category === 'AI') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (category === 'Compliance') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (category === 'Analytics') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (category === 'Ingestion') return 'border-purple-200 bg-purple-50 text-purple-700';
  if (category === 'Customer Success') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function effectiveTone(enabled: boolean): string {
  return enabled ? 'text-emerald-600' : 'text-slate-400';
}

function featureInitials(label: string): string {
  return label.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FeatureManagementClient({ features, canManage, onSetOverride, onResetOverride, exportHref }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(features.map((f) => f.category))), [features]);

  const filteredFeatures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return features.filter((feature) => {
      if (category !== 'ALL' && feature.category !== category) return false;
      if (!q) return true;
      return feature.label.toLowerCase().includes(q) || feature.description.toLowerCase().includes(q) || feature.key.toLowerCase().includes(q);
    });
  }, [features, query, category]);

  const selected = features.find((f) => f.key === selectedKey) ?? null;

  const filteredCustomerAccess = useMemo(() => {
    if (!selected) return [];
    const q = customerQuery.trim().toLowerCase();
    if (!q) return selected.customerAccess;
    return selected.customerAccess.filter((row) => row.companyName.toLowerCase().includes(q) || row.domain.toLowerCase().includes(q));
  }, [selected, customerQuery]);

  function openDrawer(key: string) {
    setActionError(null);
    setCustomerQuery('');
    setSelectedKey(key);
  }

  function runMutation(promise: Promise<MutationResult>) {
    setActionError(null);
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) setActionError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Feature Catalog</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">All product capabilities and their customer entitlements</h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
              aria-label="Filter by category"
            >
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search features…"
              aria-label="Search features"
              className="h-9 w-52 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
            />
            {exportHref ? (
              <a
                href={exportHref}
                className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                Export
              </a>
            ) : null}
          </div>
        </div>

        {features.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base font-black text-slate-950">No feature definitions are available</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">The founderFeatures catalog is empty.</p>
          </div>
        ) : filteredFeatures.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-bold text-slate-500">No features match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Feature</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Plan Access</th>
                  <th className="px-6 py-3">Effective Status</th>
                  <th className="px-6 py-3">Customers</th>
                  <th className="px-6 py-3">Overrides</th>
                  <th className="px-6 py-3">Default</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFeatures.map((feature) => (
                  <tr key={feature.key} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-[#2557dc]">
                          {featureInitials(feature.label)}
                        </span>
                        <div>
                          <p className="font-black text-slate-950">{feature.label}</p>
                          <p className="mt-0.5 max-w-xs text-xs font-semibold text-slate-400">{feature.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${categoryTone(feature.category)}`}>
                        {feature.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{feature.planAccessLabel}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${summaryTone(feature.effectiveSummary)}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${summaryDot(feature.effectiveSummary)}`} />
                        {FEATURE_EFFECTIVE_SUMMARY_LABELS[feature.effectiveSummary]}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{feature.customersEnabledCount}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{feature.overridesCount}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-500">{feature.defaultEnabled ? 'Enabled' : 'Disabled'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openDrawer(feature.key)}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                      >
                        Manage →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Backdrop + drawer. `fixed` positioning means this can never itself
          cause page-level horizontal overflow, unlike a persistent grid
          column would. */}
      {selected ? (
        <FounderDrawer onClose={() => setSelectedKey(null)} titleId="feature-drawer-title" size="md">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-[#2557dc]">
                    {featureInitials(selected.label)}
                  </span>
                  <div>
                    <h2 id="feature-drawer-title" className="text-base font-black text-slate-950">{selected.label}</h2>
                    <span className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${summaryTone(selected.effectiveSummary)}`}>
                      <span className={`h-1 w-1 rounded-full ${summaryDot(selected.effectiveSummary)}`} />
                      {FEATURE_EFFECTIVE_SUMMARY_LABELS[selected.effectiveSummary]}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                aria-label="Close feature details"
                className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc]"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 px-6 py-5">
              {!canManage ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                  Read-only Founder access: overrides can be viewed here but not changed.
                </div>
              ) : null}
              {actionError ? (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
                  {actionError}
                </div>
              ) : null}

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Overview</p>
                <dl className="mt-2.5 space-y-2 text-sm">
                  <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Feature key</dt><dd className="font-mono text-xs font-black text-slate-900">{selected.key}</dd></div>
                  <div className="flex items-center justify-between"><dt className="font-semibold text-slate-500">Category</dt><dd className="font-black text-slate-900">{selected.category}</dd></div>
                </dl>
                <p className="mt-2.5 text-sm font-semibold leading-6 text-slate-600">{selected.description}</p>
                {!selected.runtimeEnforced ? (
                  <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                    Founder UI state only: no runtime code path currently checks this feature&apos;s entitlement, so this toggle does not yet gate any customer-facing behavior.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Plan Entitlement</p>
                <div className="mt-2.5 space-y-1.5">
                  {selected.planMatrix.map((row) => (
                    <div key={row.tier} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-black text-slate-900">{row.displayName}</span>
                      <span className={`text-xs font-black ${row.included === null ? 'text-slate-400' : row.included ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {row.included === null ? 'Founder controlled' : row.included ? 'Included' : 'Not included'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Default</p>
                <p className="mt-2.5 text-sm font-semibold text-slate-700">
                  Default for new customers: <span className="font-black text-slate-950">{selected.defaultEnabled ? 'Enabled' : 'Disabled'}</span>
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Customer Access</p>
                  <span className="text-[11px] font-bold text-slate-400">{selected.customerAccess.length} customers</span>
                </div>
                <input
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  type="search"
                  placeholder="Search customers…"
                  aria-label="Search customers"
                  className="mt-2.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                />
                {selected.customerAccess.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-500">No customer accounts are currently provisioned.</p>
                ) : filteredCustomerAccess.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-500">No customers match &quot;{customerQuery}&quot;.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {filteredCustomerAccess.map((row: FeatureAccessRow) => (
                      <li key={row.customerId} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{row.companyName}</p>
                            <p className="truncate text-xs font-semibold text-slate-400">{row.domain} · {planDisplayName(row.planTier)}</p>
                          </div>
                          <span className={`shrink-0 text-xs font-black ${effectiveTone(row.effective.enabled)}`}>
                            {row.effective.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-500">
                          <div>
                            <p className="uppercase tracking-wide text-slate-400">Plan entitlement</p>
                            <p className="mt-0.5 font-bold text-slate-700">{row.planIncluded === null ? 'Founder controlled' : row.planIncluded ? 'Included' : 'Not included'}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-wide text-slate-400">Founder override</p>
                            <p className="mt-0.5 font-bold text-slate-700">{row.override === null ? 'None' : row.override.enabled ? 'Enabled' : 'Disabled'}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] font-semibold text-slate-400">
                          Effective: {EFFECTIVE_ACCESS_LABELS[row.effective.source]}
                          {row.override ? ` · Last updated ${fmtDate(row.override.updatedAt)}${row.override.updatedBy ? ` by ${row.override.updatedBy}` : ''}` : ''}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={!canManage || pending || (row.override?.enabled ?? false)}
                            onClick={() => runMutation(onSetOverride({ customerAccountId: row.customerId, key: selected.key, enabled: true }))}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Enable
                          </button>
                          <button
                            type="button"
                            disabled={!canManage || pending || (row.override !== null && !row.override.enabled)}
                            onClick={() => runMutation(onSetOverride({ customerAccountId: row.customerId, key: selected.key, enabled: false }))}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Disable
                          </button>
                          <button
                            type="button"
                            disabled={!canManage || pending || !row.override}
                            onClick={() => runMutation(onResetOverride({ customerAccountId: row.customerId, key: selected.key }))}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-black text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Reset override
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Activity</p>
                {selected.activity.length === 0 ? (
                  <p className="mt-2.5 rounded-xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-500">No Founder activity recorded for this feature yet.</p>
                ) : (
                  <ul className="mt-2.5 space-y-2">
                    {selected.activity.map((entry) => (
                      <li key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                        <p className="font-black text-slate-900">
                          {entry.companyName ?? 'Unknown customer'} · {entry.newEnabled === null ? 'override reset' : entry.newEnabled ? 'enabled' : 'disabled'}
                        </p>
                        <p className="mt-0.5 font-semibold text-slate-500">
                          {entry.actorEmail ?? 'system'} · {fmtDate(entry.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
