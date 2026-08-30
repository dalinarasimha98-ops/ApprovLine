'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type FilterValues = {
  q?: string;
  department?: string;
  category?: string;
  source?: string;
  riskLevel?: string;
  status?: string;
  from?: string;
  to?: string;
};

type FilterOptions = {
  departments: string[];
  categories: string[];
  sources: string[];
};

export function HighRiskFiltersForm({
  values,
  filterOptions,
}: {
  values: FilterValues;
  filterOptions: FilterOptions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const entries: [string, string][] = [
      ['q', fd.get('q') as string],
      ['department', fd.get('department') as string],
      ['category', fd.get('category') as string],
      ['source', fd.get('source') as string],
      ['riskLevel', fd.get('riskLevel') as string],
      ['status', fd.get('status') as string],
      ['from', fd.get('from') as string],
      ['to', fd.get('to') as string],
    ];
    for (const [key, val] of entries) {
      if (val && val.trim()) params.set(key, val.trim());
    }
    params.set('page', '1');
    router.push(`/analytics/drilldown/high-risk-approvals?${params.toString()}`);
  }

  function handleClear() {
    router.push('/analytics/drilldown/high-risk-approvals');
  }

  const hasActiveFilters = Object.values(values).some(Boolean) && values.riskLevel !== 'high,critical';

  return (
    <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-bold text-white">
            Filter & Search
          </span>
          {hasActiveFilters && (
            <span className="rounded-full bg-violet-600/20 px-1.5 py-0.5 text-[10px] font-black text-violet-400 border border-violet-500/20">
              Active
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="border-t border-[#1E2D4A] px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Search
              </label>
              <input
                name="q"
                defaultValue={values.q ?? ''}
                placeholder="Title, approver, department, category..."
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition"
              />
            </div>

            {/* Department */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Department
              </label>
              <select
                name="department"
                defaultValue={values.department ?? ''}
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 outline-none focus:border-violet-500/50 transition appearance-none"
              >
                <option value="">All departments</option>
                {filterOptions.departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Category
              </label>
              <select
                name="category"
                defaultValue={values.category ?? ''}
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 outline-none focus:border-violet-500/50 transition appearance-none"
              >
                <option value="">All categories</option>
                {filterOptions.categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Source */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Source Platform
              </label>
              <select
                name="source"
                defaultValue={values.source ?? ''}
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 outline-none focus:border-violet-500/50 transition appearance-none"
              >
                <option value="">All sources</option>
                {filterOptions.sources.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Risk Level */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Risk Level
              </label>
              <select
                name="riskLevel"
                defaultValue={values.riskLevel ?? 'high,critical'}
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 outline-none focus:border-violet-500/50 transition appearance-none"
              >
                <option value="high,critical">High + Critical</option>
                <option value="critical">Critical only</option>
                <option value="high">High only</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Decision Status
              </label>
              <select
                name="status"
                defaultValue={values.status ?? ''}
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 outline-none focus:border-violet-500/50 transition appearance-none"
              >
                <option value="">All statuses</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="REJECTED">Rejected</option>
                <option value="NOT_A_DECISION">Not a Decision</option>
              </select>
            </div>

            {/* From */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                From
              </label>
              <input
                name="from"
                type="date"
                defaultValue={values.from ?? ''}
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 outline-none focus:border-violet-500/50 transition [color-scheme:dark]"
              />
            </div>

            {/* To */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                To
              </label>
              <input
                name="to"
                type="date"
                defaultValue={values.to ?? ''}
                className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-sm font-semibold text-slate-200 outline-none focus:border-violet-500/50 transition [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-8 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500 transition-colors"
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-[#1E2D4A] px-4 text-sm font-bold text-slate-400 hover:text-slate-200 hover:border-[#2A3F66] transition-colors"
            >
              Clear All
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
