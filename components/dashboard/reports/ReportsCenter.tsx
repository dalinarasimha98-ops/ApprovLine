'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, FileText, Download, Clock, CalendarOff, ChevronRight } from 'lucide-react';
import type { ReportDefinition, ReportsSummary, ExportHistoryEntry } from '@/services/reports';
import { ReportDetailPanel } from './ReportDetailPanel';

const CATEGORY_LABELS: string[] = ['All', 'Compliance', 'Executive', 'Risk & Security'];
const FORMAT_COLORS: Record<string, string> = {
  csv: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  json: 'bg-violet-50 text-violet-700 border-violet-200',
  pdf: 'bg-rose-50 text-rose-700 border-rose-200',
};
const TYPE_COLORS: Record<string, string> = {
  Standard: 'bg-blue-50 text-blue-700',
  Analytics: 'bg-amber-50 text-amber-700',
  'Per-Record': 'bg-slate-100 text-slate-600',
};
const TABS = ['All Reports', 'Exports', 'Scheduled'] as const;
type Tab = (typeof TABS)[number];

type Props = {
  catalog: ReportDefinition[];
  summary: ReportsSummary;
  exportHistory: ExportHistoryEntry[];
};

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function extractMetaString(meta: Record<string, unknown> | null, key: string): string {
  if (!meta) return '—';
  const v = meta[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '—';
}

export function ReportsCenter({ catalog, summary, exportHistory }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('All Reports');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');

  const selectedReport = useMemo(
    () => catalog.find((r) => r.id === selectedId) ?? null,
    [catalog, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return catalog.filter((r) => {
      if (category !== 'All' && r.category !== category) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, category, query]);

  return (
    <div className={`grid gap-6 ${selectedReport ? 'lg:grid-cols-[1fr_400px]' : ''}`}>
      {/* Left column — tabs + content */}
      <div className="min-w-0">
        {/* Tab bar */}
        <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab !== 'All Reports') setSelectedId(null); }}
              className={`inline-flex h-9 shrink-0 items-center rounded-lg px-4 text-sm font-semibold transition ${
                activeTab === tab
                  ? 'bg-[#2155d9] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab}
              {tab === 'Exports' && summary.recentExportCount > 0 && (
                <span className="ml-2 rounded-full bg-white/20 px-1.5 text-xs">
                  {activeTab === 'Exports' ? summary.recentExportCount : ''}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* All Reports */}
        {activeTab === 'All Reports' && (
          <div className="grid gap-4">
            {/* Filter bar */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Search reports"
                  placeholder="Search reports..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-[#2155d9] focus:outline-none focus:ring-2 focus:ring-[#2155d9]/20"
                />
              </div>
              <div className="flex shrink-0 gap-1">
                {CATEGORY_LABELS.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`h-9 rounded-lg px-3 text-xs font-semibold transition ${
                      category === cat
                        ? 'bg-[#2155d9] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Report list */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {/* Table header — desktop */}
              <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
                <span>Report Name</span>
                <span>Category</span>
                <span>Type</span>
                <span>Formats</span>
                <span>Actions</span>
              </div>

              {filtered.length === 0 && (
                <div className="px-5 py-12 text-center">
                  <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-500">No reports match your filters.</p>
                  <button onClick={() => { setCategory('All'); setQuery(''); }} className="mt-2 text-xs text-[#2155d9] hover:underline">
                    Clear filters
                  </button>
                </div>
              )}

              {filtered.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedId(selectedId === report.id ? null : report.id)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === report.id}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedId(selectedId === report.id ? null : report.id)}
                  className={`grid cursor-pointer items-center gap-4 border-b border-slate-100 px-5 py-4 transition last:border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2155d9]/30 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] ${
                    selectedId === report.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Name + description */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{report.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{report.description}</p>
                  </div>

                  {/* Category */}
                  <span className="hidden text-xs font-semibold text-slate-600 sm:block">{report.category}</span>

                  {/* Type badge */}
                  <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline-flex ${TYPE_COLORS[report.type] ?? 'bg-slate-100 text-slate-600'}`}>
                    {report.type}
                  </span>

                  {/* Format badges */}
                  <div className="hidden items-center gap-1 sm:flex">
                    {report.formats.map((fmt) => (
                      <span key={fmt} className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${FORMAT_COLORS[fmt]}`}>
                        {fmt}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!report.requiresSelection && Object.keys(report.exportPaths).length > 0 && (
                      <a
                        href={Object.values(report.exportPaths)[0]}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Export ${report.name}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">Export</span>
                      </a>
                    )}
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 transition-transform text-slate-400 ${selectedId === report.id ? 'rotate-90 text-[#2155d9]' : ''}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exports tab */}
        {activeTab === 'Exports' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h3 className="text-sm font-bold text-slate-900">Export History</h3>
              <p className="mt-0.5 text-xs text-slate-500">All report exports from this workspace, newest first.</p>
            </div>

            {exportHistory.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <Download className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">No exports yet.</p>
                <p className="mt-1 text-xs text-slate-400">Exports will appear here after running a report.</p>
                <button onClick={() => setActiveTab('All Reports')} className="mt-3 text-xs font-semibold text-[#2155d9] hover:underline">
                  View available reports
                </button>
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
                  <span>Report</span>
                  <span>Format</span>
                  <span>Requested By</span>
                  <span>Date</span>
                </div>
                {exportHistory.map((entry) => (
                  <div key={entry.id} className="grid items-center gap-4 border-b border-slate-100 px-5 py-3.5 last:border-0 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {extractMetaString(entry.metadata, 'reportName') !== '—'
                          ? extractMetaString(entry.metadata, 'reportName')
                          : 'Report Export'}
                      </p>
                      {extractMetaString(entry.metadata, 'recordCount') !== '—' && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {extractMetaString(entry.metadata, 'recordCount')} records
                        </p>
                      )}
                    </div>
                    <span className={`inline-flex w-fit rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${FORMAT_COLORS[extractMetaString(entry.metadata, 'format')] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {extractMetaString(entry.metadata, 'format')}
                    </span>
                    <span className="truncate text-xs text-slate-600">
                      {entry.actorUserId ? entry.actorUserId.slice(0, 12) + '…' : 'System'}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Scheduled tab — coming soon */}
        {activeTab === 'Scheduled' && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                <CalendarOff className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-base font-black text-slate-900">Scheduled Reports Coming Soon</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Scheduled report delivery requires an active async export queue. This feature is registered in
                the job registry but not yet operational. Exports are currently available on demand.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('All Reports')}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]"
                >
                  <Clock className="h-4 w-4" /> View On-Demand Reports
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right column — detail panel (desktop) */}
      {selectedReport && (
        <div className="hidden lg:block">
          <ReportDetailPanel report={selectedReport} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {/* Mobile detail panel — modal overlay */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedId(null)} />
          <div className="relative z-10 max-h-[80vh] w-full overflow-auto rounded-t-2xl bg-white">
            <ReportDetailPanel report={selectedReport} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportsCenterEmpty() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
      <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
      <h3 className="text-base font-black text-slate-900">No reports available yet.</h3>
      <p className="mt-2 max-w-sm mx-auto text-sm text-slate-500">
        Report data will appear here once approval records and analytics are available in your workspace.
      </p>
      <Link
        href="/dashboard/settings/integrations"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]"
      >
        Connect integrations
      </Link>
    </div>
  );
}
