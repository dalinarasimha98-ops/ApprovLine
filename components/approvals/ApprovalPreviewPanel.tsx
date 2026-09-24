'use client';

import { ExternalLink, X } from 'lucide-react';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';
import { PendingLink } from '@/components/system/PendingLink';
import type { ApprovalTableRecord } from '@/components/dashboard/ApprovalTable';
import { riskBadgeClass, riskLabel } from '@/lib/risk-ramp';
import { extractAmountFromSubject, formatAmount } from '@/lib/amount-extraction';
import { sourceMeta } from '@/lib/source-badges';
import { isDemoApprovalRecord } from '@/lib/demo-detection';

function statusClass(status: string) {
  if (status === 'APPROVED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  if (status === 'REJECTED') return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
  if (status === 'PENDING_REVIEW') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  return 'border-[#1E2D4A] bg-[#0E1830] text-[#A8BAD8]';
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3 py-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-[#E8EEFF]">{value}</dd>
    </div>
  );
}

export type ApprovalPreviewPanelProps = {
  approval: ApprovalTableRecord | null;
  onClose: () => void;
};

/**
 * Renders ONLY from the row data ApprovalTable already loaded - no fetch on
 * open, no loading state, no network failure mode. This is the fix for the
 * "Approval unavailable" class of bug: there is nothing here that can time
 * out, 404, or throw once the list query itself has already succeeded,
 * because nothing here queries anything.
 *
 * Deliberately does NOT show the classifier's reasoning, conditions,
 * businessImpact, or evidenceSnippet - those fields are excluded from the
 * list query itself (lib/approvalRecords.ts's approvalRecordListSelect) to
 * stop the over-fetching that made the list page time out, and this panel
 * only ever has what that query fetched. They remain available on "Open
 * full record," which is a real, deliberate second navigation, not a fetch
 * hidden behind opening this panel.
 */
export function ApprovalPreviewPanel({ approval, onClose }: ApprovalPreviewPanelProps) {
  const titleId = 'approval-preview-panel-title';
  if (!approval) return null;

  const { title } = extractAmountFromSubject(approval.subject);
  const amount = approval.sources?.amount ?? extractAmountFromSubject(approval.subject).amount;
  const currency = approval.sources?.currency ?? null;
  const providers = approval.sources && approval.sources.providers.length > 0
    ? approval.sources.providers
    : [{ key: approval.sourcePlatform ?? 'custom', count: 1 }];
  const sourceCount = approval.sources?.sourceCount ?? 1;
  const unifiedEvidenceId = approval.sources?.unifiedEvidenceId ?? null;

  // The user must never have to understand that two evidence systems exist
  // internally: one primary door ("Open full record"), routed to whichever
  // view actually shows the correlated evidence from every source. The
  // legacy per-approval view stays reachable - plainly labeled, as a
  // secondary text link, never a co-equal button - only when the primary
  // door leads somewhere else.
  const primaryHref = unifiedEvidenceId ? `/evidence/${unifiedEvidenceId}` : `/approvals/${approval.id}`;
  const showLegacyLink = Boolean(unifiedEvidenceId);
  const isDemo = isDemoApprovalRecord(approval);

  // Each source pill routes to the exact same full record "Open full record"
  // goes to, scoped to that one provider - a correlated record's evidence
  // timeline supports filtering to a single provider via ?provider=, and the
  // legacy per-approval page supports jumping straight to its Evidence tab
  // via ?tab=evidence (both are existing, already-supported deep links, not
  // new routes). Never non-interactive: every pill goes somewhere real.
  const approvalId = approval.id;
  function sourcePillHref(providerKey: string) {
    return unifiedEvidenceId
      ? `/evidence/${unifiedEvidenceId}?provider=${encodeURIComponent(providerKey)}`
      : `/approvals/${approvalId}?tab=evidence`;
  }

  return (
    <DetailDrawer open onClose={onClose} titleId={titleId} size="md" className="bg-[#030b18]">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#1E2D4A] bg-[#0a1524] px-5 py-4">
        <div className="min-w-0">
          <button type="button" onClick={onClose} className="mb-2 text-xs font-bold text-[#6B7FA8] hover:text-[#A8BAD8]">
            ← Back to Approvals
          </button>
          <h2 id={titleId} className="truncate text-lg font-black leading-snug text-[#E8EEFF]" title={approval.subject}>
            {title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(approval.status)}`}>
              {approval.status.replaceAll('_', ' ')}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${riskBadgeClass(approval.riskLevel)}`}>
              {riskLabel(approval.riskLevel)} risk
            </span>
            <span className="rounded-full border border-[#1E2D4A] bg-[#152040] px-2.5 py-1 text-[11px] font-bold text-[#A8BAD8]">
              #{approval.id.slice(-8)}
            </span>
            {isDemo ? (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-400">
                Demo
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close approval preview"
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-[#6B7FA8] hover:bg-[#152040] hover:text-[#A8BAD8]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-5">
          <section>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-[#6B7FA8]">Approval Information</h3>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <LabelValue label="Requester" value={approval.approverName ?? approval.approverEmail ?? 'Unknown approver'} />
              <LabelValue label="Department" value={approval.department ?? 'Unassigned'} />
              <LabelValue label="Decided" value={approval.occurredAt.toLocaleDateString('en-US', { dateStyle: 'medium' })} />
              <LabelValue label="Amount" value={formatAmount(amount, currency)} />
            </dl>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-[#6B7FA8]">
                Captured from {sourceCount} source{sourceCount === 1 ? '' : 's'}
              </h3>
            </div>
            <div className="grid gap-2">
              {providers.map(({ key, count }) => {
                const meta = sourceMeta(key);
                return (
                  <PendingLink
                    key={key}
                    href={sourcePillHref(key)}
                    pendingText="Opening…"
                    className="flex items-center gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3 py-2.5 text-left transition hover:border-violet-500/40 hover:bg-[#0E1830]"
                  >
                    <span
                      style={{ backgroundColor: meta.color }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black text-white"
                    >
                      {meta.initials}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-[#E8EEFF]">{meta.label}</span>
                    <span className="text-xs font-bold text-[#6B7FA8]">{count} entr{count === 1 ? 'y' : 'ies'}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#6B7FA8]" aria-hidden="true" />
                  </PendingLink>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-[#1E2D4A] bg-[#0a1524] px-5 py-4">
        <PendingLink
          href={primaryHref}
          pendingText="Opening full record…"
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500"
        >
          Open full record <ExternalLink className="h-3.5 w-3.5" />
        </PendingLink>
        {showLegacyLink ? (
          <PendingLink
            href={`/approvals/${approval.id}`}
            pendingText="Opening…"
            className="mt-2 block text-center text-xs font-semibold text-[#6B7FA8] hover:text-[#A8BAD8] hover:underline"
          >
            View this approval record on its own
          </PendingLink>
        ) : null}
      </div>
    </DetailDrawer>
  );
}
