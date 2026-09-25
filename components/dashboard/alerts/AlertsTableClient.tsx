'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ApprovalAlert } from '@/services/alerts';
import { SeverityBadge, OperationalStatusBadge } from './AlertStatusBadge';
import { AlertDetailDrawer } from './AlertDetailDrawer';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function approvalTypeLabel(t: string): string {
  const map: Record<string, string> = {
    EXPLICIT: 'Explicit',
    IMPLICIT: 'Implicit',
    CONDITIONAL: 'Conditional',
    REJECTION: 'Rejection',
    ESCALATION: 'Escalation',
    NOT_APPROVAL: 'N/A',
  };
  return map[t] ?? t;
}

type Props = {
  alerts: ApprovalAlert[];
  investigateAction: (fd: FormData) => Promise<void>;
  escalateAction: (fd: FormData) => Promise<void>;
  dismissAction: (fd: FormData) => Promise<void>;
  acknowledgeAction: (fd: FormData) => Promise<void>;
};

export function AlertsTableClient({ alerts, investigateAction, escalateAction, dismissAction, acknowledgeAction }: Props) {
  const [selected, setSelected] = useState<ApprovalAlert | null>(null);

  function selectAlert(alert: ApprovalAlert) {
    setSelected((prev) => (prev?.id === alert.id ? null : alert));
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-al-border bg-al-surface shadow-sm">
        {/* Mobile: card stack */}
        <div className="divide-y divide-slate-100 lg:hidden">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => selectAlert(alert)}
              className="w-full px-4 py-4 text-left transition hover:bg-al-surface-sunken"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge severity={alert.severity} />
                    <OperationalStatusBadge escalated={alert.escalated} investigating={alert.investigating} acknowledged={alert.acknowledged} />
                  </div>
                  <p className="mt-1.5 truncate text-sm font-semibold text-al-text">{alert.subject}</p>
                  <p className="mt-0.5 text-[11px] text-al-text-muted">
                    {alert.department ?? 'Unknown'} · {alert.sourcePlatform ?? '—'} · {relativeTime(alert.occurredAt)}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-al-text-secondary" />
              </div>
            </button>
          ))}
        </div>

        {/* Desktop: operational table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead className="border-b border-al-border bg-al-surface-sunken/80">
              <tr>
                <th scope="col" className="w-[110px] whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Severity</th>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Alert</th>
                <th scope="col" className="w-[110px] whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Type</th>
                <th scope="col" className="w-[130px] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Department</th>
                <th scope="col" className="w-[90px] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Source</th>
                <th scope="col" className="w-[120px] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Status</th>
                <th scope="col" className="w-[80px] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Detected</th>
                <th scope="col" className="w-[120px] px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alerts.map((alert) => {
                const isSelected = selected?.id === alert.id;
                return (
                  <tr
                    key={alert.id}
                    className={`group cursor-pointer transition ${isSelected ? 'bg-blue-50/60' : 'hover:bg-al-surface-sunken/60'}`}
                    onClick={() => selectAlert(alert)}
                  >
                    <td className="px-4 py-3">
                      <SeverityBadge severity={alert.severity} score={alert.riskScore} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-al-text leading-tight">{alert.subject}</p>
                      {alert.reasons.length > 0 ? (
                        <p className="mt-0.5 text-[11px] text-al-text-muted leading-tight">{alert.reasons[0]}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-al-surface-elevated px-2 py-0.5 text-[11px] font-semibold text-al-text-secondary">
                        {approvalTypeLabel(alert.approvalType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-al-text-secondary">{alert.department ?? '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-al-text-secondary">{alert.sourcePlatform ?? '—'}</td>
                    <td className="px-4 py-3">
                      <OperationalStatusBadge escalated={alert.escalated} investigating={alert.investigating} acknowledged={alert.acknowledged} />
                    </td>
                    <td className="px-4 py-3 text-[11px] text-al-text-muted tabular-nums">{relativeTime(alert.occurredAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <form action={investigateAction}>
                          <input type="hidden" name="approvalId" value={alert.id} />
                          <FormSubmitButton pendingText="…" className="min-h-0 h-7 rounded-md bg-al-accent px-2.5 text-[11px] font-black text-white">
                            Investigate
                          </FormSubmitButton>
                        </form>
                        {!alert.escalated ? (
                          <form action={escalateAction}>
                            <input type="hidden" name="approvalId" value={alert.id} />
                            <FormSubmitButton pendingText="…" className="min-h-0 h-7 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-black text-violet-700">
                              Escalate
                            </FormSubmitButton>
                          </form>
                        ) : null}
                        <form action={dismissAction}>
                          <input type="hidden" name="approvalId" value={alert.id} />
                          <FormSubmitButton pendingText="…" className="min-h-0 h-7 rounded-md border border-al-border px-2.5 text-[11px] font-black text-al-text-muted">
                            Dismiss
                          </FormSubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-al-border px-4 py-2.5 text-[11px] text-al-text-muted">
          Showing {alerts.length} alert{alerts.length === 1 ? '' : 's'} · sorted by risk score
        </p>
      </div>

      <AlertDetailDrawer
        alert={selected}
        onClose={() => setSelected(null)}
        investigateAction={investigateAction}
        escalateAction={escalateAction}
        dismissAction={dismissAction}
        acknowledgeAction={acknowledgeAction}
      />
    </>
  );
}
