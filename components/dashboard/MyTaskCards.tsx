import { PendingLink } from '@/components/system/PendingLink';
import { riskBadgeClass, riskLabel } from '@/lib/risk-ramp';
import { fmtDueDate } from '@/lib/action-center';
import { MY_TASK_TYPE_LABELS } from '@/lib/my-tasks';
import type { MyTaskRow } from '@/services/myTasks';

/**
 * My Tasks' dedicated mobile/tablet card presentation (<1024px) — a plain
 * server component, not a client component like MyApprovalCards: task rows
 * have no second preview-panel surface to manage state for (a task's
 * "detail" is just its real canonical page — /approvals/[id] or
 * /investigations/[id] — opened directly via PendingLink), so no client
 * state is needed here at all.
 */

// Mirrors components/dashboard/MyTasksTable.tsx's statusClass exactly —
// every real statusLabel services/myTasks.ts ever sets maps to one tone.
function statusClass(row: MyTaskRow): string {
  if (!row.isOpen) return 'bg-al-success/10 text-al-success';
  switch (row.statusLabel) {
    case 'Overdue':
    case 'Escalated':
      return 'bg-al-danger/10 text-al-danger';
    case 'Awaiting Response':
      return 'bg-al-info/10 text-al-info';
    case 'Needs Confirmation':
      return 'bg-al-text-secondary/10 text-al-text-secondary';
    default:
      return 'bg-al-warning/10 text-al-warning';
  }
}

function actionButtonClass(actionLabel: string | null): string {
  if (actionLabel === 'View Approval') {
    return 'mt-4 flex h-9 w-full shrink-0 items-center justify-center rounded-lg border border-al-border text-xs font-black text-al-text-secondary transition hover:border-al-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent';
  }
  return 'mt-4 flex h-9 w-full shrink-0 items-center justify-center rounded-lg bg-al-accent text-xs font-black text-white transition hover:bg-al-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent';
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

export function MyTaskCards({ tasks }: { tasks: MyTaskRow[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
      {tasks.map((task) => (
        <article key={task.id} className="flex flex-col rounded-2xl border border-al-border bg-al-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${riskBadgeClass(task.riskLevel)}`}>
              {riskLabel(task.riskLevel)} risk
            </span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(task)}`}>{task.statusLabel}</span>
          </div>

          <h3 className="mt-3 text-base font-black leading-snug text-al-text">
            {task.title}
            {task.isDemo ? (
              <span className="ml-2 rounded-full bg-al-accent-hover/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-al-accent align-middle">Demo</span>
            ) : null}
          </h3>

          <p className="mt-1 truncate text-xs font-semibold text-al-text-secondary">{MY_TASK_TYPE_LABELS[task.type]}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-al-text-muted">
            {[task.category, task.department].filter(Boolean).join(' · ') || 'Unassigned'}
          </p>

          <div className="mt-3 flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className={`inline-flex items-center gap-1.5 ${dueDateClass(task.dueAt)}`}>
              {task.dueAt && task.dueAt.getTime() < Date.now() ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-al-danger" aria-hidden="true" />
              ) : null}
              {fmtDueDate(task.dueAt)}
            </span>
            <span className="text-al-text-muted">Updated {task.updatedAt.toLocaleDateString()}</span>
          </div>

          <PendingLink
            href={task.detailHref}
            pendingText="Opening…"
            className={actionButtonClass(task.actionLabel)}
          >
            {task.actionLabel ?? 'Open'}
          </PendingLink>
        </article>
      ))}
    </div>
  );
}
