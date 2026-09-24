'use client';

import { useState, type MouseEvent } from 'react';
import { ApprovalPreviewPanel } from '@/components/approvals/ApprovalPreviewPanel';
import { riskBadgeClass, riskLabel } from '@/lib/risk-ramp';
import { extractAmountFromSubject, formatAmount } from '@/lib/amount-extraction';
import { sourceMeta } from '@/lib/source-badges';
import { isDemoApprovalRecord } from '@/lib/demo-detection';

export type ApprovalTableSources = {
  unifiedEvidenceId: string | null;
  sourceCount: number;
  providers: Array<{ key: string; count: number }>;
  amount: number | null;
  currency: string | null;
};

export type ApprovalTableRecord = {
  id: string;
  subject: string;
  sourceLink: string | null;
  correlationId: string | null;
  approverName: string | null;
  approverEmail: string | null;
  department: string | null;
  category: string | null;
  riskLevel: string | null;
  sourcePlatform: string | null;
  confidence: number;
  status: string;
  createdAt: Date;
  occurredAt: Date;
  /** Real correlated-source data (services/evidence/records.ts's
   *  getUnifiedSourceSummariesForApprovals) - null when this approval has
   *  no correlated UnifiedEvidenceRecord, in which case the table and the
   *  preview panel both fall back to a single-source display built from
   *  this approval's own sourcePlatform. This is the one query that feeds
   *  both the row's stacked source badges and the preview panel's source
   *  list, so the two can never disagree about a source count again. */
  sources: ApprovalTableSources | null;
};

function statusClass(status: string) {
  if (status === 'REJECTED') return 'bg-rose-500/10 text-rose-400';
  if (status === 'PENDING_REVIEW') return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

function approverDisplay(approval: Pick<ApprovalTableRecord, 'approverName' | 'approverEmail'>) {
  return approval.approverName ?? approval.approverEmail ?? 'Unknown approver';
}

const MAX_VISIBLE_SOURCE_BADGES = 4;

function resolvedProviders(approval: ApprovalTableRecord): string[] {
  if (approval.sources && approval.sources.providers.length > 0) {
    return approval.sources.providers.map((p) => p.key);
  }
  return [approval.sourcePlatform ?? 'custom'];
}

/** Never treat a click on a nested interactive element as a second,
 *  duplicate "open preview" trigger. */
function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function ApprovalTable({ approvals }: { approvals: ApprovalTableRecord[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = approvals.find((a) => a.id === selectedId) ?? null;

  if (approvals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#1E2D4A] bg-[#0E1830] p-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-violet-500/10 text-violet-400">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
            <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="1.8" />
            <path d="m9 12 2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-black text-[#E8EEFF]">No approvals yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B7FA8]">
          Connect Slack or Gmail, run demo ingestion, or adjust the filters to reveal captured approval records.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[#1E2D4A] bg-[#0E1830]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-32" />
              <col className="w-28" />
              <col className="w-32" />
            </colgroup>
            <thead className="bg-[#0a1524] text-xs uppercase tracking-wide text-[#6B7FA8]">
              <tr>
                <th className="px-4 py-3 font-semibold">Decision</th>
                <th className="px-4 py-3 font-semibold">Risk</th>
                <th className="px-4 py-3 font-semibold">Sources</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((approval) => {
                const isSelected = selectedId === approval.id;
                const openPreview = () => setSelectedId(approval.id);
                const providers = resolvedProviders(approval);
                const visibleProviders = providers.slice(0, MAX_VISIBLE_SOURCE_BADGES);
                const overflowCount = providers.length - visibleProviders.length;
                const { title } = extractAmountFromSubject(approval.subject);
                const amount = approval.sources?.amount ?? extractAmountFromSubject(approval.subject).amount;
                const currency = approval.sources?.currency ?? null;
                const metaParts = [approverDisplay(approval), approval.department ?? 'Unassigned', approval.occurredAt.toLocaleDateString()];

                return (
                  <tr
                    key={approval.id}
                    onClick={(event) => {
                      if (event.target instanceof HTMLElement && event.target.closest('button')) return;
                      if (isPlainLeftClick(event)) openPreview();
                    }}
                    className={`h-16 cursor-pointer border-t border-[#1E2D4A] align-middle transition hover:bg-[#152040] ${
                      isSelected ? 'bg-[#152040] ring-1 ring-inset ring-violet-500/40' : ''
                    }`}
                  >
                    <td className="max-w-0 px-4 py-3">
                      <button
                        type="button"
                        onClick={openPreview}
                        title={approval.subject}
                        className="block w-full truncate text-left font-bold text-[#E8EEFF] hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      >
                        {title}
                        {isDemoApprovalRecord(approval) ? (
                          <span className="ml-2 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-400">Demo</span>
                        ) : null}
                      </button>
                      <p className="mt-0.5 truncate text-xs font-semibold text-[#6B7FA8]" title={metaParts.join(' · ')}>
                        {metaParts.join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskBadgeClass(approval.riskLevel)}`}>
                        {riskLabel(approval.riskLevel)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        {visibleProviders.map((provider, index) => {
                          const meta = sourceMeta(provider);
                          return (
                            <span
                              key={`${provider}-${index}`}
                              title={meta.label}
                              style={{ backgroundColor: meta.color, zIndex: visibleProviders.length - index, marginLeft: index === 0 ? 0 : -5 }}
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[#0E1830] text-[9px] font-black text-white"
                            >
                              {meta.initials}
                            </span>
                          );
                        })}
                        {overflowCount > 0 ? (
                          <span
                            title={`${overflowCount} more source${overflowCount === 1 ? '' : 's'}`}
                            style={{ marginLeft: -5 }}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[#0E1830] bg-[#243350] text-[9px] font-black text-[#A8BAD8]"
                          >
                            +{overflowCount}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#A8BAD8]">
                      {formatAmount(amount, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(approval.status)}`}>
                        {approval.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ApprovalPreviewPanel approval={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
