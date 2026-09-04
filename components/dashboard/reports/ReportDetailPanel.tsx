'use client';

import Link from 'next/link';
import { X, Download, ExternalLink, FileText, Info } from 'lucide-react';
import type { ReportDefinition } from '@/services/reports';

const FORMAT_LABELS: Record<string, string> = { csv: 'CSV', json: 'JSON', pdf: 'PDF' };
const FORMAT_COLORS: Record<string, string> = {
  csv: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  json: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
  pdf: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
};

type Props = {
  report: ReportDefinition | null;
  onClose: () => void;
};

export function ReportDetailPanel({ report, onClose }: Props) {
  if (!report) return null;

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={`${report.name} details`}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <FileText className="h-4 w-4 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">{report.category}</p>
            <h3 className="mt-0.5 text-base font-black leading-tight text-slate-950">{report.name}</h3>
            <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {report.type}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close report details"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Run Report / Export */}
        {!report.requiresSelection && report.formats.length > 0 ? (
          <div className="mb-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Export</p>
            <div className="flex flex-wrap gap-2">
              {report.formats.map((fmt) => {
                const path = report.exportPaths[fmt];
                if (!path) return null;
                return (
                  <a
                    key={fmt}
                    href={path}
                    className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition ${FORMAT_COLORS[fmt]}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {FORMAT_LABELS[fmt]}
                  </a>
                );
              })}
            </div>
          </div>
        ) : report.requiresSelection ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm leading-5">{report.selectionHint}</p>
          </div>
        ) : null}

        {/* Description */}
        <div className="mb-5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Description</p>
          <p className="text-sm leading-6 text-slate-600">{report.longDescription}</p>
        </div>

        {/* Details */}
        <div className="mb-5 overflow-hidden rounded-lg border border-slate-100">
          {[
            ['Category', report.category],
            ['Report Type', report.type],
            ['Available Formats', report.formats.map((f) => FORMAT_LABELS[f]).join(', ')],
            ['Filters Supported', report.filterParams.length > 0 ? report.filterParams.join(', ') : 'None'],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[120px_1fr] gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
              <span className="text-xs font-semibold text-slate-500">{label}</span>
              <span className="text-xs text-slate-700">{value}</span>
            </div>
          ))}
        </div>

        {/* Common Use Cases */}
        <div className="mb-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Common Use Cases</p>
          <ul className="grid gap-1.5">
            {report.commonUseCases.map((uc) => (
              <li key={uc} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2155d9]" />
                {uc}
              </li>
            ))}
          </ul>
        </div>

        {/* Related sections */}
        {report.id === 'approval-audit' && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">View Source Data</p>
            <div className="flex flex-col gap-1.5">
              <Link href="/dashboard/approvals" className="inline-flex items-center gap-2 text-xs font-semibold text-[#2155d9] hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Approvals
              </Link>
              <Link href="/evidence" className="inline-flex items-center gap-2 text-xs font-semibold text-[#2155d9] hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Unified Evidence
              </Link>
            </div>
          </div>
        )}
        {report.id === 'executive-analytics' && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">View Source Data</p>
            <Link href="/analytics" className="inline-flex items-center gap-2 text-xs font-semibold text-[#2155d9] hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Executive Analytics
            </Link>
          </div>
        )}
        {report.id === 'investigation-report' && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Navigate To</p>
            <Link href="/investigations" className="inline-flex items-center gap-2 text-xs font-semibold text-[#2155d9] hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Investigation Center
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
