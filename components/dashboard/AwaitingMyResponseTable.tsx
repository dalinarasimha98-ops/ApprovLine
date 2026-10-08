import { PendingLink } from '@/components/system/PendingLink';
import { riskBadgeClass, riskLabel } from '@/lib/risk-ramp';
import { fmtDueDate } from '@/lib/action-center';
import type { AwaitingResponseRow } from '@/services/awaitingMyResponse';

/**
 * Awaiting My Response's desktop table (≥1024px). A new, dedicated
 * component — not a reuse of ApprovalTable or My Tasks' MyTasksTable —
 * because this page's primary entity is genuinely different (a single
 * ApprovalConfirmationRequest row, not an ApprovalRecord/task). "Request"
 * and "related approval" are honestly the SAME underlying record in this
 * schema (a confirmation request has no separate title of its own), so
 * they are shown as one column (title + its real department/category
 * context) rather than two redundant columns repeating the same text.
 * Every row's action is a direct link to the real canonical detail page
 * (/approvals/[id]), where the real Confirm/Correct/Reject controls
 * already live — never a second response engine or dialog here.
 */

function statusClass(row: AwaitingResponseRow): string {
  if (row.isActionable) return 'bg-al-info/10 text-al-info';
  if (row.isOverdue) return 'bg-al-danger/10 text-al-danger';
  if (row.outcome === 'REJECTED') return 'bg-al-danger/10 text-al-danger';
  return 'bg-al-success/10 text-al-success'; // CONFIRMED / CORRECTED
}

function actionButtonClass(isActionable: boolean): string {
  if (isActionable) return 'inline-flex h-8 items-center rounded-lg bg-al-accent px-3 text-xs font-bold text-white hover:bg-al-accent-hover';
  return 'inline-flex h-8 items-center rounded-lg border border-al-border px-3 text-xs font-bold text-al-text-secondary hover:border-al-accent/40';
}

function dueDateClass(row: AwaitingResponseRow): string {
  if (!row.isActionable) return 'text-al-text-secondary';
  const now = Date.now();
  const dueDay = new Date(row.dueAt.getFullYear(), row.dueAt.getMonth(), row.dueAt.getDate()).getTime();
  const today = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  if (dueDay === today) return 'font-bold text-al-warning';
  return 'text-al-text-secondary';
}

export function AwaitingMyResponseTable({ rows }: { rows: AwaitingResponseRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-al-border bg-al-surface lg:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col />
            <col className="w-40" />
            <col className="w-36" />
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-36" />
          </colgroup>
          <thead className="bg-al-surface-sunken text-xs uppercase tracking-wide text-al-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Request</th>
              <th className="px-4 py-3 font-semibold">Requester</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Requested</th>
              <th className="px-4 py-3 font-semibold">Due / Expiration</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="h-16 border-t border-al-border align-middle transition hover:bg-al-surface-elevated">
                <td className="max-w-0 px-4 py-3">
                  <PendingLink
                    href={row.detailHref}
                    pendingText="Opening…"
                    className="block w-full truncate text-left font-bold text-al-text hover:text-al-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent"
                  >
                    <span title={row.title}>{row.title}</span>
                    {row.isDemo ? (
                      <span className="ml-2 rounded-full bg-al-accent-hover/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-al-accent">Demo</span>
                    ) : null}
                  </PendingLink>
                  <p className="mt-0.5 flex items-center gap-2 truncate text-xs font-semibold text-al-text-muted">
                    {row.riskLevel ? (
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${riskBadgeClass(row.riskLevel)}`}>{riskLabel(row.riskLevel)}</span>
                    ) : null}
                    {[row.category, row.department].filter(Boolean).join(' · ') || 'Unassigned'}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-al-text-secondary">
                  <span className="block truncate">{row.requesterName ?? row.requesterEmail}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(row)}`}>{row.statusLabel}</span>
                </td>
                <td className="px-4 py-3 text-xs text-al-text-secondary">{row.requestedAt.toLocaleDateString()}</td>
                <td className={`px-4 py-3 text-xs ${dueDateClass(row)}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {row.isOverdue ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-al-danger" aria-hidden="true" /> : null}
                    {fmtDueDate(row.dueAt)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <PendingLink href={row.detailHref} pendingText="Opening…" className={actionButtonClass(row.isActionable)}>
                    {row.actionLabel}
                  </PendingLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
