import { PendingLink } from '@/components/system/PendingLink';
import { riskBadgeClass, riskLabel } from '@/lib/risk-ramp';
import { fmtDueDate } from '@/lib/action-center';
import type { AwaitingResponseRow } from '@/services/awaitingMyResponse';

/**
 * Awaiting My Response's dedicated mobile/tablet card presentation
 * (<1024px). A plain server component — no client-side preview state is
 * needed since every card's action is a direct link to the real canonical
 * /approvals/[id] detail page, never a second response surface.
 */

function statusClass(row: AwaitingResponseRow): string {
  if (row.isActionable) return 'bg-al-info/10 text-al-info';
  if (row.isOverdue) return 'bg-al-danger/10 text-al-danger';
  if (row.outcome === 'REJECTED') return 'bg-al-danger/10 text-al-danger';
  return 'bg-al-success/10 text-al-success';
}

function actionButtonClass(isActionable: boolean): string {
  if (isActionable) {
    return 'mt-4 flex h-9 w-full shrink-0 items-center justify-center rounded-lg bg-al-accent text-xs font-black text-white transition hover:bg-al-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent';
  }
  return 'mt-4 flex h-9 w-full shrink-0 items-center justify-center rounded-lg border border-al-border text-xs font-black text-al-text-secondary transition hover:border-al-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent';
}

function dueDateClass(row: AwaitingResponseRow): string {
  if (!row.isActionable) return 'text-al-text-secondary';
  const now = Date.now();
  const dueDay = new Date(row.dueAt.getFullYear(), row.dueAt.getMonth(), row.dueAt.getDate()).getTime();
  const today = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  if (dueDay === today) return 'font-bold text-al-warning';
  return 'text-al-text-secondary';
}

export function AwaitingMyResponseCards({ rows }: { rows: AwaitingResponseRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
      {rows.map((row) => (
        <article key={row.id} className="flex flex-col rounded-2xl border border-al-border bg-al-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-accent">
              {row.isActionable ? 'Response Required' : row.isOverdue ? 'Expired' : 'Responded'}
            </span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(row)}`}>{row.statusLabel}</span>
          </div>

          <h3 className="mt-3 text-base font-black leading-snug text-al-text">
            {row.title}
            {row.isDemo ? (
              <span className="ml-2 rounded-full bg-al-accent-hover/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-al-accent align-middle">Demo</span>
            ) : null}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {row.riskLevel ? (
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${riskBadgeClass(row.riskLevel)}`}>{riskLabel(row.riskLevel)}</span>
            ) : null}
            <p className="truncate text-xs font-semibold text-al-text-muted">{[row.category, row.department].filter(Boolean).join(' · ') || 'Unassigned'}</p>
          </div>

          <p className="mt-2 truncate text-xs font-semibold text-al-text-secondary">Requested by {row.requesterName ?? row.requesterEmail}</p>

          <div className="mt-3 flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className="text-al-text-muted">{row.requestedAt.toLocaleDateString()}</span>
            <span className={`inline-flex items-center gap-1.5 ${dueDateClass(row)}`}>
              {row.isOverdue ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-al-danger" aria-hidden="true" /> : null}
              {fmtDueDate(row.dueAt)}
            </span>
          </div>

          <PendingLink href={row.detailHref} pendingText="Opening…" className={actionButtonClass(row.isActionable)}>
            {row.actionLabel}
          </PendingLink>
        </article>
      ))}
    </div>
  );
}
