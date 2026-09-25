'use client';

import { X, ExternalLink, AlertTriangle, Brain, Zap } from 'lucide-react';
import type { ApprovalAlert } from '@/services/alerts';
import { SeverityBadge, OperationalStatusBadge } from './AlertStatusBadge';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';

function dateStr(d: Date) {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function approvalTypeLabel(t: string) {
  const map: Record<string, string> = {
    EXPLICIT: 'Explicit',
    IMPLICIT: 'Implicit',
    CONDITIONAL: 'Conditional',
    REJECTION: 'Rejection',
    ESCALATION: 'Escalation',
    NOT_APPROVAL: 'Not an approval',
  };
  return map[t] ?? t;
}

function recommendedActions(alert: ApprovalAlert): string[] {
  const actions: string[] = [];
  if (alert.riskLevel === 'critical') actions.push('Escalate immediately to department head and compliance team.');
  if (!alert.evidenceSnippet || !alert.sourceLink) actions.push('Attach the missing approval evidence before finalising the decision.');
  if (alert.approvalType === 'CONDITIONAL') actions.push('Verify all conditions have been met and documented.');
  if (alert.status === 'PENDING_REVIEW') actions.push('Complete the pending review or re-route to an available approver.');
  if (alert.status === 'REJECTED') actions.push('Determine whether a re-approval is required per policy.');
  if (alert.riskLevel === 'high' && actions.length === 0) actions.push('Review the approval chain and verify policy compliance.');
  if (actions.length === 0) actions.push('Open an investigation case to assess the risk thoroughly.');
  return actions;
}

type Props = {
  alert: ApprovalAlert | null;
  onClose: () => void;
  investigateAction: (fd: FormData) => Promise<void>;
  escalateAction: (fd: FormData) => Promise<void>;
  dismissAction: (fd: FormData) => Promise<void>;
  acknowledgeAction: (fd: FormData) => Promise<void>;
};

export function AlertDetailDrawer({ alert, onClose, investigateAction, escalateAction, dismissAction, acknowledgeAction }: Props) {
  if (!alert) return null;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Alert detail"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden border-l border-al-border bg-white shadow-2xl lg:max-w-lg"
      >
        {/* header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-al-border bg-al-surface-sunken px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={alert.severity} score={alert.riskScore} />
              <OperationalStatusBadge escalated={alert.escalated} investigating={alert.investigating} acknowledged={alert.acknowledged} />
            </div>
            <h2 className="mt-2 text-sm font-black leading-snug text-al-text">{alert.subject}</h2>
            <p className="mt-0.5 text-[11px] text-al-text-muted">{dateStr(alert.occurredAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="mt-0.5 shrink-0 rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated hover:text-al-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-color:rgba(71,85,105,.4)_transparent] [scrollbar-width:thin]">
          <div className="grid gap-5">

            {/* Risk details */}
            <section>
              <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Risk details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-al-border bg-al-surface-sunken p-3 text-[12px]">
                {[
                  ['Category', alert.category ?? '—'],
                  ['Risk level', alert.riskLevel ?? '—'],
                  ['Approval type', approvalTypeLabel(alert.approvalType)],
                  ['Record status', alert.status],
                  ['Department', alert.department ?? '—'],
                  ['Approver', alert.approverName ?? '—'],
                  ['Source', alert.sourcePlatform ?? '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-al-text-muted">{label}</dt>
                    <dd className="mt-0.5 font-semibold text-al-text">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Why this alert */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-al-text-muted">
                <AlertTriangle className="h-3 w-3" />
                Why this alert was raised
              </h3>
              <ul className="grid gap-1.5">
                {alert.reasons.map((r) => (
                  <li key={r} className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-al-warning" />
                    {r}
                  </li>
                ))}
              </ul>
            </section>

            {/* Playbook / AI analysis */}
            {alert.complianceExplanation ? (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-al-text-muted">
                  <Brain className="h-3 w-3" />
                  Playbook finding
                  {alert.complianceSeverity ? (
                    <span className="ml-1 rounded bg-al-surface-elevated px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-al-text-secondary">{alert.complianceSeverity}</span>
                  ) : null}
                </h3>
                <p className="rounded-xl border border-al-border bg-al-surface-sunken p-3 text-[12px] leading-5 text-al-text-secondary">
                  {alert.complianceExplanation}
                </p>
              </section>
            ) : null}

            {/* Evidence snippet */}
            {alert.evidenceSnippet ? (
              <section>
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-al-text-muted">Evidence snippet</h3>
                <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[12px] leading-5 text-blue-900">
                  {alert.evidenceSnippet}
                </p>
                {alert.sourceLink ? (
                  <a
                    href={alert.sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                  >
                    Open source <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </section>
            ) : null}

            {/* Recommended actions */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-al-text-muted">
                <Zap className="h-3 w-3" />
                Recommended actions
              </h3>
              <ol className="grid gap-1.5">
                {recommendedActions(alert).map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-al-text-secondary">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-al-surface-elevated text-[9px] font-black text-al-text-secondary">{i + 1}</span>
                    {action}
                  </li>
                ))}
              </ol>
            </section>

          </div>
        </div>

        {/* sticky footer with actions */}
        <div className="shrink-0 border-t border-al-border bg-white px-5 py-4">
          <div className="grid gap-2">
            <form action={investigateAction}>
              <input type="hidden" name="approvalId" value={alert.id} />
              <FormSubmitButton pendingText="Opening case…" className="min-h-0 h-10 w-full rounded-lg bg-al-accent text-sm font-black text-white shadow-sm shadow-blue-200">
                Open Investigation Case
              </FormSubmitButton>
            </form>
            <div className="grid grid-cols-3 gap-2">
              {!alert.acknowledged && !alert.escalated ? (
                <form action={acknowledgeAction}>
                  <input type="hidden" name="approvalId" value={alert.id} />
                  <FormSubmitButton pendingText="…" className="min-h-0 h-9 w-full rounded-lg border border-al-border text-xs font-black text-al-text-secondary hover:bg-al-surface-sunken">
                    Acknowledge
                  </FormSubmitButton>
                </form>
              ) : null}
              {!alert.escalated ? (
                <form action={escalateAction} className={!alert.acknowledged && !alert.escalated ? '' : 'col-span-1'}>
                  <input type="hidden" name="approvalId" value={alert.id} />
                  <FormSubmitButton pendingText="…" className="min-h-0 h-9 w-full rounded-lg border border-violet-200 bg-violet-50 text-xs font-black text-violet-700">
                    Escalate
                  </FormSubmitButton>
                </form>
              ) : null}
              <form action={dismissAction} className="col-start-3">
                <input type="hidden" name="approvalId" value={alert.id} />
                <FormSubmitButton pendingText="…" className="min-h-0 h-9 w-full rounded-lg border border-al-border text-xs font-black text-al-text-muted hover:bg-al-surface-sunken">
                  Dismiss
                </FormSubmitButton>
              </form>
            </div>
            <a
              href={`/approvals/${alert.id}`}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-al-border text-xs font-black text-al-text-secondary hover:bg-al-surface-sunken"
            >
              View Approval Record <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
