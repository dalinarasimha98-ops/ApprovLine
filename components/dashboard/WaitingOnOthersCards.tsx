import { PendingLink } from '@/components/system/PendingLink';
import { WAITING_ON_OTHERS_TYPE_LABELS, type WaitingOnOthersRow } from '@/services/waitingOnOthers';

/**
 * Waiting on Others' dedicated mobile/tablet card presentation (<1024px).
 * A plain server component — no client-side preview state is needed since
 * every card's action is a direct link to the real canonical detail page.
 */

function statusClass(row: WaitingOnOthersRow): string {
  return row.dueBucket === 'OVERDUE' ? 'bg-al-danger/10 text-al-danger' : 'bg-al-info/10 text-al-info';
}

function dueClass(row: WaitingOnOthersRow): string {
  if (row.dueBucket === 'OVERDUE') return 'font-bold text-al-danger';
  if (row.dueLabel === 'Due today') return 'font-bold text-al-warning';
  return 'text-al-text-secondary';
}

export function WaitingOnOthersCards({ rows }: { rows: WaitingOnOthersRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
      {rows.map((row) => (
        <article key={row.id} className="flex flex-col rounded-2xl border border-al-border bg-al-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-al-accent">Waiting on Others</span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(row)}`}>{row.dueBucket === 'OVERDUE' ? 'Overdue' : row.statusLabel}</span>
          </div>

          <h3 className="mt-3 text-base font-black leading-snug text-al-text">
            {row.title}
            {row.isDemo ? (
              <span className="ml-2 rounded-full bg-al-accent-hover/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-al-accent align-middle">Demo</span>
            ) : null}
          </h3>

          <p className="mt-1 truncate text-xs font-semibold text-al-text-muted">{[WAITING_ON_OTHERS_TYPE_LABELS[row.type], row.category].filter(Boolean).join(' · ')}</p>

          <p className="mt-2 truncate text-xs font-semibold text-al-text-secondary" title={row.waitingOn.map((p) => p.name).join(', ') || undefined}>
            {row.waitingOnLabel}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-al-text-muted">Expected: {row.expectedAction}</p>

          <div className="mt-3 flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className="text-al-text-muted">{row.waitingLabel}</span>
            <span className={`inline-flex items-center gap-1.5 ${dueClass(row)}`}>
              {row.dueBucket === 'OVERDUE' ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-al-danger" aria-hidden="true" /> : null}
              {row.dueLabel}
            </span>
          </div>

          <PendingLink
            href={row.detailHref}
            pendingText="Opening…"
            className="mt-4 flex h-9 w-full shrink-0 items-center justify-center rounded-lg border border-al-border text-xs font-black text-al-text-secondary transition hover:border-al-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent"
          >
            {row.type === 'INVESTIGATION' ? 'View Investigation' : 'View Workflow'}
          </PendingLink>
        </article>
      ))}
    </div>
  );
}
