import { PendingLink } from '@/components/system/PendingLink';
import { WAITING_ON_OTHERS_TYPE_LABELS, type WaitingOnOthersRow } from '@/services/waitingOnOthers';

/**
 * Waiting on Others' desktop table (≥1024px). A new, dedicated component —
 * not a reuse of ApprovalTable/MyTasksTable/AwaitingMyResponseTable —
 * because this page's rows span three different source tables read from
 * the opposite (initiator, not assignee) direction. "Workflow" and
 * "Status" are shown in one column (title + a status pill directly below
 * it) rather than two separate columns, the same compacting judgment
 * AwaitingMyResponseTable already documents for its own merged column.
 * Every row's action is a direct link to the real canonical detail page
 * (/approvals/[id] or /investigations/[id]) — never a second workflow
 * engine or a fake "Remind"/"Escalate" button (no such backend action
 * exists anywhere in this codebase for either source).
 */

function dueClass(row: WaitingOnOthersRow): string {
  if (row.dueBucket === 'OVERDUE') return 'font-bold text-al-danger';
  if (row.dueLabel === 'Due today') return 'font-bold text-al-warning';
  return 'text-al-text-secondary';
}

function statusClass(row: WaitingOnOthersRow): string {
  return row.dueBucket === 'OVERDUE' ? 'bg-al-danger/10 text-al-danger' : 'bg-al-info/10 text-al-info';
}

export function WaitingOnOthersTable({ rows }: { rows: WaitingOnOthersRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-al-border bg-al-surface lg:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col />
            <col className="w-44" />
            <col className="w-48" />
            <col className="w-28" />
            <col className="w-40" />
            <col className="w-32" />
          </colgroup>
          <thead className="bg-al-surface-sunken text-xs uppercase tracking-wide text-al-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Workflow</th>
              <th className="px-4 py-3 font-semibold">Waiting On</th>
              <th className="px-4 py-3 font-semibold">Expected Action</th>
              <th className="px-4 py-3 font-semibold">Requested</th>
              <th className="px-4 py-3 font-semibold">Due / Waiting For</th>
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
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusClass(row)}`}>{row.dueBucket === 'OVERDUE' ? 'Overdue' : row.statusLabel}</span>
                    <span className="truncate">{[WAITING_ON_OTHERS_TYPE_LABELS[row.type], row.category].filter(Boolean).join(' · ')}</span>
                  </p>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-al-text-secondary">
                  <span className="block truncate" title={row.waitingOn.map((p) => p.name).join(', ') || undefined}>
                    {row.waitingOnLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-al-text-secondary">
                  <span className="block truncate">{row.expectedAction}</span>
                </td>
                <td className="px-4 py-3 text-xs text-al-text-secondary">{row.requestedAt.toLocaleDateString()}</td>
                <td className={`px-4 py-3 text-xs ${dueClass(row)}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {row.dueBucket === 'OVERDUE' ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-al-danger" aria-hidden="true" /> : null}
                    {row.dueLabel}
                  </span>
                  <span className="block text-[10px] font-semibold text-al-text-muted">{row.waitingLabel}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <PendingLink
                    href={row.detailHref}
                    pendingText="Opening…"
                    className="inline-flex h-8 items-center rounded-lg border border-al-border px-3 text-xs font-bold text-al-text-secondary hover:border-al-accent/40"
                  >
                    {row.type === 'INVESTIGATION' ? 'Open Investigation' : 'View Approval'}
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
