import { PendingLink } from '@/components/system/PendingLink';
import { riskBadgeClass, riskLabel } from '@/lib/risk-ramp';
import { fmtDueDate } from '@/lib/action-center';
import { MY_TASK_TYPE_LABELS } from '@/lib/my-tasks';
import type { MyTaskRow } from '@/services/myTasks';

/**
 * My Tasks' own desktop table (≥1024px) — a new component, not a reuse of
 * ApprovalTable, because task rows genuinely span two different source
 * models (ApprovalRecord-derived Confirmation/Verification tasks and
 * InvestigationCase-derived Investigation tasks) with different canonical
 * detail routes. A plain, fully server-rendered table: clicking a row just
 * navigates to the real existing detail page for its real source
 * (/approvals/[id] or /investigations/[id]) via PendingLink — "the canonical
 * existing workflow" per this module's own spec — never a second preview/
 * detail system.
 */

function statusClass(row: MyTaskRow): string {
  if (!row.isOpen) return 'bg-al-success/10 text-al-success';
  if (row.type === 'CONFIRMATION') return 'bg-al-info/10 text-al-info';
  if (row.statusLabel === 'Escalated') return 'bg-al-danger/10 text-al-danger';
  if (row.statusLabel === 'In Progress') return 'bg-al-warning/10 text-al-warning';
  return 'bg-al-warning/10 text-al-warning';
}

function dueDateClass(dueAt: Date | null): string {
  if (!dueAt) return 'text-al-text-secondary';
  const now = Date.now();
  if (dueAt.getTime() < now) return 'font-bold text-al-danger';
  const dueDay = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate()).getTime();
  const today = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  if (dueDay === today) return 'font-bold text-al-warning';
  return 'text-al-text-secondary';
}

export function MyTasksTable({ tasks }: { tasks: MyTaskRow[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-al-border bg-al-surface lg:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col />
            <col className="w-32" />
            <col className="w-36" />
            <col className="w-24" />
            <col className="w-32" />
            <col className="w-32" />
            <col className="w-36" />
          </colgroup>
          <thead className="bg-al-surface-sunken text-xs uppercase tracking-wide text-al-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Task</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Due</th>
              <th className="px-4 py-3 font-semibold">Last Activity</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="h-16 border-t border-al-border align-middle transition hover:bg-al-surface-elevated">
                <td className="max-w-0 px-4 py-3">
                  <PendingLink
                    href={task.detailHref}
                    pendingText="Opening…"
                    className="block w-full truncate text-left font-bold text-al-text hover:text-al-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent"
                  >
                    <span title={task.title}>{task.title}</span>
                    {task.isDemo ? (
                      <span className="ml-2 rounded-full bg-al-accent-hover/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-al-accent">Demo</span>
                    ) : null}
                  </PendingLink>
                  <p className="mt-0.5 truncate text-xs font-semibold text-al-text-muted">
                    {[task.category, task.department].filter(Boolean).join(' · ') || 'Unassigned'}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-al-text-secondary">{MY_TASK_TYPE_LABELS[task.type]}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(task)}`}>{task.statusLabel}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskBadgeClass(task.riskLevel)}`}>
                    {riskLabel(task.riskLevel)}
                  </span>
                </td>
                <td className={`px-4 py-3 text-xs ${dueDateClass(task.dueAt)}`}>{fmtDueDate(task.dueAt)}</td>
                <td className="px-4 py-3 text-xs text-al-text-secondary">{task.updatedAt.toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <PendingLink
                    href={task.detailHref}
                    pendingText="Opening…"
                    className="inline-flex h-8 items-center rounded-lg bg-al-accent px-3 text-xs font-bold text-white hover:bg-al-accent-hover"
                  >
                    {task.actionLabel ?? 'Open'}
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
