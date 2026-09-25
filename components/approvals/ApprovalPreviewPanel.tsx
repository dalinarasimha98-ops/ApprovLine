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
  if (status === 'APPROVED') return 'border-al-success/30 bg-al-success/10 text-al-success';
  if (status === 'REJECTED') return 'border-al-danger/30 bg-al-danger/10 text-al-danger';
  if (status === 'PENDING_REVIEW') return 'border-al-warning/30 bg-al-warning/10 text-al-warning';
  return 'border-al-border bg-al-surface text-al-text-secondary';
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-al-border bg-al-surface-sunken px-3 py-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-al-text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-al-text">{value}</dd>
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
    <DetailDrawer open onClose={onClose} titleId={titleId} size="md" className="bg-al-bg">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-al-border bg-al-surface-sunken px-5 py-4">
        <div className="min-w-0">
          <button type="button" onClick={onClose} className="mb-2 text-xs font-bold text-al-text-muted hover:text-al-text-secondary">
            ← Back to Approvals
          </button>
          <h2 id={titleId} className="truncate text-lg font-black leading-snug text-al-text" title={approval.subject}>
            {title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(approval.status)}`}>
              {approval.status.replaceAll('_', ' ')}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${riskBadgeClass(approval.riskLevel)}`}>
              {riskLabel(approval.riskLevel)} risk
            </span>
            <span className="rounded-full border border-al-border bg-al-surface-elevated px-2.5 py-1 text-[11px] font-bold text-al-text-secondary">
              #{approval.id.slice(-8)}
            </span>
            {isDemo ? (
              <span className="rounded-full border border-al-accent/30 bg-al-accent-hover/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-al-accent">
                Demo
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close approval preview"
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated hover:text-al-text-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-5">
          <section>
            <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Approval Information</h3>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <LabelValue label="Requester" value={approval.approverName ?? approval.approverEmail ?? 'Unknown approver'} />
              <LabelValue label="Department" value={approval.department ?? 'Unassigned'} />
              <LabelValue label="Decided" value={approval.occurredAt.toLocaleDateString('en-US', { dateStyle: 'medium' })} />
              <LabelValue label="Amount" value={formatAmount(amount, currency)} />
            </dl>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-al-text-muted">
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
                    className="flex items-center gap-3 rounded-lg border border-al-border bg-al-surface-sunken px-3 py-2.5 text-left transition hover:border-al-accent/40 hover:bg-al-surface"
                  >
                    <span
                      style={{ backgroundColor: meta.color }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black text-white"
                    >
                      {meta.initials}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-al-text">{meta.label}</span>
                    <span className="text-xs font-bold text-al-text-muted">{count} entr{count === 1 ? 'y' : 'ies'}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-al-text-muted" aria-hidden="true" />
                  </PendingLink>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-al-border bg-al-surface-sunken px-5 py-4">
        <PendingLink
          href={primaryHref}
          pendingText="Opening full record…"
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-al-accent text-sm font-bold text-white hover:bg-al-accent-hover"
        >
          Open full record <ExternalLink className="h-3.5 w-3.5" />
        </PendingLink>
        {showLegacyLink ? (
          <PendingLink
            href={`/approvals/${approval.id}`}
            pendingText="Opening…"
            className="mt-2 block text-center text-xs font-semibold text-al-text-muted hover:text-al-text-secondary hover:underline"
          >
            View this approval record on its own
          </PendingLink>
        ) : null}
      </div>
    </DetailDrawer>
  );
}
