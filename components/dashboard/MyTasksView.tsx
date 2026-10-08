import { MyTasksTable } from '@/components/dashboard/MyTasksTable';
import { MyTaskCards } from '@/components/dashboard/MyTaskCards';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { str, type RawSearchParams } from '@/lib/search-params';
import { MY_TASK_TYPE_LABELS, type MyTaskType } from '@/lib/my-tasks';
import {
  getMyTasksOverview,
  getMyTasksCompletedCount,
  MY_TASKS_PAGE_SIZE_OPTIONS,
  type MyTaskSort,
  type MyTaskStatusFilter,
} from '@/services/myTasks';
import type { ActionCenterViewer } from '@/services/action-center';

/**
 * My Tasks (/dashboard/tasks) — the viewer's personal work-management
 * surface. A projection over the three real task sources services/myTasks.ts
 * documents (Confirmation/Verification/Investigation) — never a new task
 * engine, never a fake task-detail system. Every row opens the real
 * canonical workflow it already has (/approvals/[id] or
 * /investigations/[id]) via PendingLink.
 */

const STATUS_OPTIONS: Array<{ value: MyTaskStatusFilter; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'COMPLETED', label: 'Completed' },
];

const SORT_OPTIONS: Array<{ value: MyTaskSort; label: string }> = [
  { value: 'priority', label: 'Urgency' },
  { value: 'due', label: 'Due date' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'lastActivity', label: 'Last activity' },
];

function buildMyTasksHref(base: RawSearchParams, overrides: Record<string, string | number | undefined>) {
  const merged: Record<string, string | undefined> = {
    q: str(base, 'q'),
    type: str(base, 'type'),
    riskLevel: str(base, 'riskLevel'),
    status: str(base, 'status'),
    from: str(base, 'from'),
    to: str(base, 'to'),
    sort: str(base, 'sort'),
    pageSize: str(base, 'pageSize'),
    page: str(base, 'page'),
  };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = value === undefined ? undefined : String(value);
  }
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `/dashboard/tasks?${qs}` : '/dashboard/tasks';
}

function pageWindow(current: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1, current - 2, current + 2]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result: Array<number | null> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null);
    result.push(sorted[i]);
  }
  return result;
}

export async function MyTasksView({
  viewer,
  rawParams,
}: {
  viewer: ActionCenterViewer;
  rawParams: RawSearchParams;
}) {
  const requestedPage = Math.max(1, Math.trunc(Number(str(rawParams, 'page')) || 1));
  const requestedPageSize = Number(str(rawParams, 'pageSize'));
  const pageSize = (MY_TASKS_PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize) ? requestedPageSize : 10;
  const statusRaw = str(rawParams, 'status');
  const status = STATUS_OPTIONS.some((o) => o.value === statusRaw) ? (statusRaw as MyTaskStatusFilter) : 'OPEN';
  const typeRaw = str(rawParams, 'type');
  const type = (['CONFIRMATION', 'VERIFICATION', 'INVESTIGATION'] as const).includes(typeRaw as MyTaskType) ? (typeRaw as MyTaskType) : undefined;
  const sort = (str(rawParams, 'sort') as MyTaskSort | undefined) ?? 'priority';
  const from = str(rawParams, 'from');
  const to = str(rawParams, 'to');

  const filters = {
    q: str(rawParams, 'q'),
    type,
    riskLevel: str(rawParams, 'riskLevel'),
    status,
    from,
    to,
    sort,
    page: requestedPage,
    pageSize,
  };

  let loadError: string | null = null;
  let result: Awaited<ReturnType<typeof getMyTasksOverview>> | null = null;
  let completed = 0;
  try {
    [result, completed] = await Promise.all([getMyTasksOverview(viewer, filters), getMyTasksCompletedCount(viewer, from, to)]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'My Tasks could not be loaded.';
    console.error('[my-tasks] load failed', error);
  }

  const hasActiveFilters = Boolean(filters.q || filters.type || filters.riskLevel || filters.from || filters.to || status !== 'OPEN');
  const rows = result?.rows ?? [];
  const canSeeInvestigations = result?.canSeeInvestigations ?? false;

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  const tiles = result
    ? ([
        { label: 'Open Tasks', value: result.kpis.openTasks, ink: 'text-al-text' },
        { label: 'Due Today', value: result.kpis.dueToday, ink: 'text-al-warning' },
        { label: 'Overdue', value: result.kpis.overdue, ink: 'text-al-danger' },
        { label: 'Due Soon', value: result.kpis.dueSoon, ink: 'text-al-text' },
        { label: 'Completed', value: completed, ink: 'text-al-success' },
        { label: 'Awaiting Response', value: result.kpis.awaitingResponse, ink: 'text-al-info' },
      ] as const)
    : [];
  const periodLabel = from || to ? 'in selected range' : 'all-time';

  return (
    <div className="flex flex-col gap-5">
      {/* ── Page header ──────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-al-border bg-al-surface p-5">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-al-accent">Personal Workspace</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-al-text sm:text-3xl">My Tasks</h1>
            <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-al-text-muted">
              Everything assigned to you, organized by urgency and next action.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PendingLink
              href="/dashboard/approvals?view=mine"
              pendingText="Opening…"
              className="rounded-lg border border-al-border bg-al-surface-elevated px-4 py-2 text-sm font-bold text-al-text transition hover:border-al-accent/40"
            >
              View My Approvals
            </PendingLink>
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────── */}
      {result ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-xl border border-al-border bg-al-surface p-4">
              <p className="text-[11px] font-semibold text-al-text-muted">{tile.label}</p>
              <p className={`mt-0.5 font-mono text-2xl font-black tracking-tight ${tile.ink}`}>{tile.value.toLocaleString()}</p>
              {tile.label === 'Completed' ? (
                <p className="mt-1 text-[10px] font-semibold text-al-text-muted">{periodLabel}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Filters ──────────────────────────────────────── */}
      <form id="my-tasks-filters" className="scroll-mt-32 rounded-xl border border-al-border bg-al-surface p-4">
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Search my tasks</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Search tasks by title…"
              className="h-10 flex-1 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
            />
            <FormSubmitButton pendingText="Searching…" className="min-h-0 h-10 rounded-lg bg-al-accent px-5 text-sm font-bold text-white hover:bg-al-accent-hover">
              Search
            </FormSubmitButton>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 rounded-lg border border-al-border bg-al-surface-sunken p-1">
          {STATUS_OPTIONS.map((o) => (
            <PendingLink
              key={o.value}
              href={buildMyTasksHref(rawParams, { status: o.value === 'OPEN' ? undefined : o.value, page: 1 })}
              pendingText="…"
              className={`flex-1 rounded-md px-3 py-1.5 text-center text-xs font-bold ${
                status === o.value ? 'bg-al-accent text-white' : 'text-al-text-secondary hover:bg-al-surface-elevated'
              }`}
            >
              {o.label}
            </PendingLink>
          ))}
        </div>

        <details className="mt-3 group" open={hasActiveFilters || undefined}>
          <summary className="cursor-pointer list-none text-xs font-bold text-al-accent hover:text-al-accent">Filters ▾</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <input type="hidden" name="status" value={status === 'OPEN' ? '' : status} />
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Type</span>
              <select
                name="type"
                defaultValue={filters.type ?? ''}
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
              >
                <option value="">All types</option>
                {(['CONFIRMATION', 'VERIFICATION', 'INVESTIGATION'] as const)
                  .filter((t) => t !== 'INVESTIGATION' || canSeeInvestigations)
                  .map((t) => (
                    <option key={t} value={t}>{MY_TASK_TYPE_LABELS[t]}</option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Risk level</span>
              <input
                name="riskLevel"
                defaultValue={filters.riskLevel ?? ''}
                placeholder="Risk level"
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Sort</span>
              <select
                name="sort"
                defaultValue={sort}
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <div />
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">From</span>
              <input
                name="from"
                type="date"
                defaultValue={filters.from ?? ''}
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">To</span>
              <input
                name="to"
                type="date"
                defaultValue={filters.to ?? ''}
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
              />
            </label>
            <div className="flex items-end gap-2">
              <FormSubmitButton pendingText="Filtering…" className="min-h-0 h-9 w-full rounded-lg bg-al-accent px-4 text-sm font-bold text-white hover:bg-al-accent-hover">
                Apply filters
              </FormSubmitButton>
              {hasActiveFilters ? (
                <PendingLink
                  href="/dashboard/tasks"
                  pendingText="…"
                  className="flex h-9 shrink-0 items-center rounded-lg border border-al-border px-3 text-xs font-bold text-al-text-secondary hover:border-al-accent/40"
                >
                  Clear
                </PendingLink>
              ) : null}
            </div>
          </div>
        </details>
      </form>

      {/* ── Error state ──────────────────────────────────── */}
      {loadError ? (
        <div className="rounded-xl border border-al-warning/20 bg-al-warning/5 p-5 text-al-warning">
          <h3 className="font-bold">My Tasks couldn&apos;t be loaded</h3>
          <p className="mt-1 text-sm">Try again or return to your dashboard. Your workspace shell is still available.</p>
          <PendingLink
            href="/dashboard/tasks"
            pendingText="Retrying…"
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-al-accent px-4 text-sm font-bold text-white hover:bg-al-accent-hover"
          >
            Retry
          </PendingLink>
        </div>
      ) : null}

      {/* ── Empty states ─────────────────────────────────── */}
      {!loadError && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-al-border bg-al-surface/50 p-12 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-al-accent">
            {hasActiveFilters ? 'No matches' : status === 'COMPLETED' ? 'Nothing completed yet' : 'All caught up'}
          </p>
          <h3 className="mt-3 text-xl font-black text-al-text">
            {hasActiveFilters
              ? 'No tasks match your filters.'
              : status === 'COMPLETED'
                ? "You haven't completed any tasks in this range."
                : 'All caught up.'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-al-text-muted">
            {hasActiveFilters
              ? 'Try clearing filters or searching with different terms.'
              : status === 'COMPLETED'
                ? 'Completed confirmations, verifications, and investigations will appear here.'
                : "You don't have any open tasks right now."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {hasActiveFilters ? (
              <PendingLink
                href="/dashboard/tasks"
                pendingText="…"
                className="rounded-lg bg-al-accent px-5 py-2 text-sm font-bold text-white hover:bg-al-accent-hover"
              >
                Clear filters
              </PendingLink>
            ) : (
              <PendingLink
                href="/dashboard/approvals?view=mine"
                pendingText="Opening…"
                className="rounded-lg border border-al-border bg-al-surface-elevated px-5 py-2 text-sm font-bold text-al-text hover:border-al-accent/40"
              >
                View My Approvals
              </PendingLink>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Table + pagination ───────────────────────────── */}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-3">
          <MyTasksTable tasks={rows} />
          <MyTaskCards tasks={rows} />

          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-al-border bg-al-surface px-4 py-3 sm:flex-row">
            <p className="text-xs font-semibold text-al-text-muted">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} tasks
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <PendingLink
                href={buildMyTasksHref(rawParams, { page: Math.max(1, currentPage - 1) })}
                pendingText="…"
                aria-disabled={currentPage <= 1}
                className={`inline-flex h-8 items-center rounded-lg border border-al-border px-3 text-xs font-bold ${currentPage <= 1 ? 'pointer-events-none opacity-40' : 'text-al-text-secondary hover:border-al-accent/40'}`}
              >
                Previous
              </PendingLink>
              {pageWindow(currentPage, totalPages).map((p, idx) =>
                p === null ? (
                  <span key={`gap-${idx}`} className="px-1 text-xs text-al-text-secondary">…</span>
                ) : (
                  <PendingLink
                    key={p}
                    href={buildMyTasksHref(rawParams, { page: p })}
                    pendingText="…"
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold tabular-nums ${p === currentPage ? 'bg-al-accent text-white' : 'text-al-text-secondary hover:bg-al-surface-elevated'}`}
                  >
                    {p}
                  </PendingLink>
                ),
              )}
              <PendingLink
                href={buildMyTasksHref(rawParams, { page: Math.min(totalPages, currentPage + 1) })}
                pendingText="…"
                aria-disabled={currentPage >= totalPages}
                className={`inline-flex h-8 items-center rounded-lg border border-al-border px-3 text-xs font-bold ${currentPage >= totalPages ? 'pointer-events-none opacity-40' : 'text-al-text-secondary hover:border-al-accent/40'}`}
              >
                Next
              </PendingLink>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-al-text-muted">
              <span>Per page:</span>
              {MY_TASKS_PAGE_SIZE_OPTIONS.map((size) => (
                <PendingLink
                  key={size}
                  href={buildMyTasksHref(rawParams, { pageSize: size, page: 1 })}
                  pendingText="…"
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-bold tabular-nums ${size === pageSize ? 'bg-al-accent text-white' : 'text-al-text-secondary hover:bg-al-surface-elevated'}`}
                >
                  {size}
                </PendingLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
