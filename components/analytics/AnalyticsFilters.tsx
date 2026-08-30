'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

type Props = {
  currentDepartment?: string;
  currentRiskLevel?: string;
  currentStatus?: string;
  currentSource?: string;
};

const RISK_LEVELS = ['', 'low', 'medium', 'high', 'critical'];
const STATUSES = ['', 'APPROVED', 'PENDING_REVIEW', 'REJECTED', 'NOT_A_DECISION'];
const SOURCES = ['', 'Slack', 'Gmail', 'Teams', 'Jira', 'ServiceNow', 'Outlook', 'Zoom', 'SAP', 'Oracle', 'Coupa', 'Workday'];

export function AnalyticsFilters({ currentDepartment, currentRiskLevel, currentStatus, currentSource }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [department, setDepartment] = useState(currentDepartment ?? '');
  const [riskLevel, setRiskLevel] = useState(currentRiskLevel ?? '');
  const [status, setStatus] = useState(currentStatus ?? '');
  const [source, setSource] = useState(currentSource ?? '');
  const [expanded, setExpanded] = useState(false);

  const activeCount = [department, riskLevel, status, source].filter(Boolean).length;

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (department) params.set('department', department); else params.delete('department');
    if (riskLevel) params.set('riskLevel', riskLevel); else params.delete('riskLevel');
    if (status) params.set('status', status); else params.delete('status');
    if (source) params.set('source', source); else params.delete('source');
    router.push(`${pathname}?${params.toString()}`);
  }, [department, riskLevel, status, source, pathname, router, searchParams]);

  const clearAll = useCallback(() => {
    setDepartment('');
    setRiskLevel('');
    setStatus('');
    setSource('');
    const params = new URLSearchParams(searchParams.toString());
    ['department', 'riskLevel', 'status', 'source'].forEach((k) => params.delete(k));
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0D1526] px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#1E2D4A] bg-[#0D1526] p-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Department</label>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Finance"
              className="h-8 w-36 rounded-md border border-[#1E2D4A] bg-[#0A0E1A] px-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Risk Level</label>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="h-8 rounded-md border border-[#1E2D4A] bg-[#0A0E1A] px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
            >
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>{r === '' ? 'All risk levels' : r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 rounded-md border border-[#1E2D4A] bg-[#0A0E1A] px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s === '' ? 'All statuses' : s.replaceAll('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-8 rounded-md border border-[#1E2D4A] bg-[#0A0E1A] px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s === '' ? 'All sources' : s}</option>
              ))}
            </select>
          </div>

          <button
            onClick={applyFilters}
            className="h-8 rounded-md bg-violet-600 px-4 text-xs font-bold text-white hover:bg-violet-500 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
