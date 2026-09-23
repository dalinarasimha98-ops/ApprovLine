'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { ApprovalDetailDrawer } from '@/components/approvals/ApprovalDetailDrawer';

export type ApprovalTableRecord = {
  id: string;
  subject: string;
  sourceLink: string | null;
  reasoning: string;
  conditions: string | null;
  businessImpact: string | null;
  evidenceSnippet: string | null;
  approverName: string | null;
  approverEmail: string | null;
  department: string | null;
  category: string | null;
  riskLevel: string | null;
  sourcePlatform: string | null;
  confidence: number;
  status: string;
  createdAt: Date;
  /** UnifiedEvidenceRecord.id when this approval has one linked via
   *  primaryApprovalId, null otherwise - drives whether the "View Evidence"
   *  link renders at all (never a broken link). */
  evidenceRecordId: string | null;
};

// riskLevel is the only priority-shaped signal ApprovalRecord actually
// stores (see prisma/schema.prisma - there is no separate `priority` field).
// The Priority column below is real data, just labeled to match the
// reference design's terminology rather than fabricating a second concept.
function priorityLabel(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'High';
  if (risk === 'medium') return 'Medium';
  return 'Low';
}

function priorityClass(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (risk === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

function statusClass(status: string) {
  if (status === 'REJECTED') return 'bg-rose-500/10 text-rose-400';
  if (status === 'PENDING_REVIEW') return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

/** Opens the detail drawer on a plain click, but lets a modifier-click,
 *  middle-click, or right-click fall through to the browser's normal link
 *  behavior (new tab / new window) so keyboard and power-user navigation to
 *  the full detail route (/approvals/[id]) keeps working untouched. */
function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function ApprovalTable({ approvals }: { approvals: ApprovalTableRecord[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          <table className="min-w-[860px] w-full border-collapse text-left text-sm">
            <thead className="bg-[#0a1524] text-xs uppercase tracking-wide text-[#6B7FA8]">
              <tr>
                <th className="px-4 py-3 font-semibold">Approval</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Requested By</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((approval) => {
                const subtitle = [approval.category, approval.department].filter(Boolean).join(' · ');
                const isSelected = selectedId === approval.id;

                const openDrawer = () => setSelectedId(approval.id);

                return (
                  <tr
                    key={approval.id}
                    onClick={(event) => {
                      // Never treat a click on a nested interactive element (the
                      // View link, or a future action) as a second, duplicate
                      // "open drawer" trigger - the row click is a convenience
                      // layered on top of that always-present accessible
                      // control, never a replacement for it.
                      if (event.target instanceof HTMLElement && event.target.closest('a, button')) return;
                      if (isPlainLeftClick(event)) openDrawer();
                    }}
                    className={`cursor-pointer border-t border-[#1E2D4A] align-top transition hover:bg-[#152040] ${
                      isSelected ? 'bg-[#152040] ring-1 ring-inset ring-violet-500/40' : ''
                    }`}
                  >
                    <td className="max-w-[280px] px-4 py-4">
                      <p className="font-bold text-[#E8EEFF]">
                        {approval.subject}
                        {approval.sourceLink?.includes('demo') || approval.sourceLink?.includes('TDEMO') ? (
                          <span className="ml-2 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-400">Demo</span>
                        ) : null}
                      </p>
                      {subtitle ? <p className="mt-0.5 truncate text-xs font-semibold text-[#6B7FA8]">{subtitle}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold capitalize text-blue-400">
                        {approval.sourcePlatform ?? 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#A8BAD8]">
                      {approval.approverName ?? 'Unknown'}
                      {approval.approverEmail ? <div className="text-xs text-[#3D5070]">{approval.approverEmail}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(approval.status)}`}>
                        {approval.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass(approval.riskLevel)}`}>
                        {priorityLabel(approval.riskLevel)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#3D5070] tabular-nums">{approval.createdAt.toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/approvals/${approval.id}`}
                        onClick={(event) => {
                          if (isPlainLeftClick(event)) {
                            event.preventDefault();
                            openDrawer();
                          }
                          // Cmd/Ctrl/Shift/middle-click falls through and opens
                          // the full approval detail route normally.
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-violet-400 hover:text-violet-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ApprovalDetailDrawer approvalId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
