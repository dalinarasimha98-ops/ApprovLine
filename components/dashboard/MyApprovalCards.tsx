'use client';

import { useState } from 'react';
import { ApprovalPreviewPanel } from '@/components/approvals/ApprovalPreviewPanel';
import {
  type ApprovalTableRecord,
  personalStatusClass,
  PERSONAL_STATUS_LABELS,
  dueDateClass,
  resolvedProviders,
} from '@/components/dashboard/ApprovalTable';
import { riskBadgeClass, riskLabel } from '@/lib/risk-ramp';
import { extractAmountFromSubject, formatAmount } from '@/lib/amount-extraction';
import { sourceMeta } from '@/lib/source-badges';
import { isDemoApprovalRecord } from '@/lib/demo-detection';
import { fmtDueDate } from '@/lib/action-center';

/**
 * My Approvals' dedicated mobile/tablet card presentation — NOT a change to
 * the shared components/dashboard/ApprovalTable.tsx (untouched here beyond
 * the small, additive, zero-behavior-change exports it already gained:
 * personalStatusClass/PERSONAL_STATUS_LABELS/dueDateClass/resolvedProviders).
 * Fed by the exact same server-loaded `approvals` array the desktop
 * ApprovalTable renders (components/dashboard/MyApprovalsView.tsx passes
 * the same `approvalRows` to both, toggled by CSS breakpoint, never two
 * separate fetches).
 *
 * Manages its own `selectedId`/ApprovalPreviewPanel instance, independent
 * of ApprovalTable's own internal one — both are always mounted (CSS
 * `hidden`/`lg:hidden` picks which is visible), but only the visible one's
 * "Review" button is ever reachable, so there is never a conflict between
 * the two.
 *
 * "Requester" is shown ONLY when a real one exists (ManualApprovalDetail.
 * recorder, threaded through as MyApprovalRow.requestedByName by
 * services/myApprovals.ts) — a plain classifier/system-originated decision
 * has no such structured field anywhere in this schema, so that line is
 * omitted rather than parsed out of free-text businessImpact or fabricated.
 */
export function MyApprovalCards({ approvals }: { approvals: ApprovalTableRecord[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = approvals.find((a) => a.id === selectedId) ?? null;

  if (approvals.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {approvals.map((approval) => {
          const { title } = extractAmountFromSubject(approval.subject);
          const amount = approval.sources?.amount ?? extractAmountFromSubject(approval.subject).amount;
          const currency = approval.sources?.currency ?? null;
          const providers = resolvedProviders(approval);
          const primaryProvider = providers[0];
          const meta = primaryProvider ? sourceMeta(primaryProvider) : null;

          return (
            <article key={approval.id} className="flex flex-col rounded-2xl border border-al-border bg-al-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${riskBadgeClass(approval.riskLevel)}`}>
                  {riskLabel(approval.riskLevel)} risk
                </span>
                {approval.personalStatus ? (
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${personalStatusClass(approval.personalStatus)}`}>
                    {PERSONAL_STATUS_LABELS[approval.personalStatus]}
                  </span>
                ) : null}
              </div>

              <h3 className="mt-3 text-sm font-black leading-snug text-al-text">
                {title}
                {isDemoApprovalRecord(approval) ? (
                  <span className="ml-2 rounded-full bg-al-accent-hover/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-al-accent align-middle">Demo</span>
                ) : null}
              </h3>

              {approval.requestedByName ? (
                <p className="mt-1 truncate text-xs font-semibold text-al-text-secondary">{approval.requestedByName}</p>
              ) : null}
              <p className="mt-0.5 truncate text-xs font-semibold text-al-text-muted">{approval.category ?? approval.department ?? 'Unassigned'}</p>

              <div className="mt-3 flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                {amount !== null ? (
                  <span className="font-mono font-bold tabular-nums text-al-text">{formatAmount(amount, currency)}</span>
                ) : null}
                <span className={dueDateClass(approval.dueAt)}>{fmtDueDate(approval.dueAt ?? null)}</span>
                {meta ? (
                  <span className="inline-flex items-center gap-1.5 text-al-text-muted">
                    <span
                      style={{ backgroundColor: meta.color }}
                      className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8px] font-black text-white"
                      aria-hidden="true"
                    >
                      {meta.initials}
                    </span>
                    {meta.label}
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(approval.id)}
                className="mt-4 h-9 w-full shrink-0 rounded-lg bg-al-accent text-xs font-black text-white transition hover:bg-al-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent"
              >
                Review
              </button>
            </article>
          );
        })}
      </div>

      <ApprovalPreviewPanel approval={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
