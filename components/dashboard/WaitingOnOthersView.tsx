import { WaitingOnOthersTable } from '@/components/dashboard/WaitingOnOthersTable';
import { WaitingOnOthersCards } from '@/components/dashboard/WaitingOnOthersCards';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { str, type RawSearchParams } from '@/lib/search-params';
import {
  getWaitingOnOthersOverview,
  WAITING_ON_OTHERS_PAGE_SIZE_OPTIONS,
  WAITING_ON_OTHERS_TYPE_LABELS,
  type WaitingOnOthersType,
  type WaitingOnOthersSort,
} from '@/services/waitingOnOthers';
import type { ActionCenterViewer } from '@/services/action-center';

/**
 * Waiting on Others (/dashboard/waiting-on-others) — the viewer's personal
 * dependency/follow-up workspace: "what did I initiate that is now waiting
 * on someone else?" A projection over real ApprovalConfirmationRequest/
 * ManualApprovalDetail/InvestigationCase rows read from the initiator
 * side — never a second task/approval engine. Every row's action opens the
 * real canonical detail page, where the other party's real controls
 * already live — never a dialog, a fake "Remind" button, or a second
 * workflow engine here.
 */

const TYPE_TABS: Array<{ value: WaitingOnOthersType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'CONFIRMATION', label: WAITING_ON_OTHERS_TYPE_LABELS.CONFIRMATION },
  { value: 'VERIFICATION', label: WAITING_ON_OTHERS_TYPE_LABELS.VERIFICATION },
  { value: 'INVESTIGATION', label: WAITING_ON_OTHERS_TYPE_LABELS.INVESTIGATION },
];

const SORT_OPTIONS: Array<{ value: WaitingOnOthersSort; label: string }> = [
  { value: 'priority', label: 'Urgency' },
  { value: 'due', label: 'Due date' },
  { value: 'longestWaiting', label: 'Longest waiting' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

function buildHref(base: RawSearchParams, overrides: Record<string, string | number | undefined>) {
  const merged: Record<string, string | undefined> = {
    q: str(base, 'q'),
    type: str(base, 'type'),
    waitingOn: str(base, 'waitingOn'),
    source: str(base, 'source'),
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
  return qs ? `/dashboard/waiting-on-others?${qs}` : '/dashboard/waiting-on-others';
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

export async function WaitingOnOthersView({ viewer, rawParams }: { viewer: ActionCenterViewer; rawParams: RawSearchParams }) {
  const requestedPage = Math.max(1, Math.trunc(Number(str(rawParams, 'page')) || 1));
  const requestedPageSize = Number(str(rawParams, 'pageSize'));
  const pageSize = (WAITING_ON_OTHERS_PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize) ? requestedPageSize : 10;
  const typeRaw = str(rawParams, 'type');
  const type = TYPE_TABS.some((o) => o.value === typeRaw) && typeRaw !== 'ALL' ? (typeRaw as WaitingOnOthersType) : undefined;
  const sort = (str(rawParams, 'sort') as WaitingOnOthersSort | undefined) ?? 'priority';

  const filters = {
    q: str(rawParams, 'q'),
    type,
    waitingOn: str(rawParams, 'waitingOn'),
    source: str(rawParams, 'source'),
    sort,
    page: requestedPage,
    pageSize,
  };

  let loadError: string | null = null;
  let result: Awaited<ReturnType<typeof getWaitingOnOthersOverview>> | null = null;
  try {
    result = await getWaitingOnOthersOverview(viewer, filters);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Waiting on Others could not be loaded.';
    console.error('[waiting-on-others] load failed', error);
  }

  const hasActiveFilters = Boolean(filters.q || filters.waitingOn || filters.source || filters.type);
  const rows = result?.rows ?? [];
  const canSeeInvestigations = result?.canSeeInvestigations ?? false;
  const typeTabs = TYPE_TABS.filter((t) => t.value !== 'INVESTIGATION' || canSeeInvestigations);

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  const tiles = result
    ? ([
        { label: 'Waiting', value: String(result.kpis.waiting), ink: 'text-al-info' },
        { label: 'Due Soon', value: String(result.kpis.dueSoon), ink: 'text-al-warning' },
        { label: 'Overdue', value: String(result.kpis.overdue), ink: 'text-al-danger' },
        { label: 'Longest Waiting', value: result.kpis.longestWaitingLabel ?? '—', ink: 'text-al-success' },
      ] as const)
    : [];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Page header ──────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-al-border bg-al-surface p-5">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-al-accent">Personal Workspace</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-al-text sm:text-3xl">Waiting on Others</h1>
            <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-al-text-muted">
              Track work you initiated that is waiting for someone else.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PendingLink
              href="/dashboard/tasks"
              pendingText="Opening…"
              className="rounded-lg border border-al-border bg-al-surface-elevated px-4 py-2 text-sm font-bold text-al-text transition hover:border-al-accent/40"
            >
              View My Tasks
            </PendingLink>
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────── */}
      {result ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-xl border border-al-border bg-al-surface p-3 sm:p-4">
              <p className="text-[10.5px] font-semibold leading-tight text-al-text-muted sm:text-[11px]">{tile.label}</p>
              <p className={`mt-1 font-mono text-xl font-black tracking-tight sm:text-2xl ${tile.ink}`}>{tile.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Filters ──────────────────────────────────────── */}
      <form id="waiting-on-others-filters" className="scroll-mt-32 rounded-xl border border-al-border bg-al-surface p-4">
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Search workflows</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Search by workflow, waiting-on person, source, or category…"
              className="h-10 flex-1 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
            />
            <FormSubmitButton pendingText="Searching…" className="min-h-0 h-10 rounded-lg bg-al-accent px-5 text-sm font-bold text-white hover:bg-al-accent-hover">
              Search
            </FormSubmitButton>
          </div>
        </div>

        {/* 2-column grid below sm (4 tabs - "Confirmation"/"Investigation" -
            never fit a single flex row at 390px without overflowing the
            page), a single flex row from sm: up, matching the KPI strip's
            own 390px 2-column precedent. */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-lg border border-al-border bg-al-surface-sunken p-1 sm:flex">
          {typeTabs.map((o) => (
            <PendingLink
              key={o.value}
              href={buildHref(rawParams, { type: o.value === 'ALL' ? undefined : o.value, page: 1 })}
              pendingText="…"
              aria-current={(type ?? 'ALL') === o.value ? 'true' : undefined}
              className={`rounded-md px-3 py-1.5 text-center text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent sm:flex-1 ${
                (type ?? 'ALL') === o.value ? 'bg-al-accent text-white' : 'text-al-text-secondary hover:bg-al-surface-elevated'
              }`}
            >
              {o.label}
            </PendingLink>
          ))}
        </div>

        <details className="mt-3 group" open={hasActiveFilters || undefined}>
          <summary className="cursor-pointer list-none rounded text-xs font-bold text-al-accent hover:text-al-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent">Filters ▾</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <input type="hidden" name="type" value={type ?? ''} />
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Waiting On</span>
              <input
                name="waitingOn"
                defaultValue={filters.waitingOn ?? ''}
                placeholder="Name or email"
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Source</span>
              <input
                name="source"
                defaultValue={filters.source ?? ''}
                placeholder="e.g. Verbal, Manual"
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
            <div className="flex items-end gap-2">
              <FormSubmitButton pendingText="Filtering…" className="min-h-0 h-9 w-full rounded-lg bg-al-accent px-4 text-sm font-bold text-white hover:bg-al-accent-hover">
                Apply filters
              </FormSubmitButton>
              {hasActiveFilters ? (
                <PendingLink
                  href="/dashboard/waiting-on-others"
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
          <h3 className="font-bold">Waiting on Others couldn&apos;t be loaded</h3>
          <p className="mt-1 text-sm">Try again or return to your dashboard. Your workspace shell is still available.</p>
          <PendingLink
            href="/dashboard/waiting-on-others"
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
          <p className="text-xs font-black uppercase tracking-widest text-al-accent">{hasActiveFilters ? 'No matches' : 'Nothing waiting'}</p>
          <h3 className="mt-3 text-xl font-black text-al-text">
            {hasActiveFilters ? 'No waiting items match your filters.' : 'Nothing is waiting on someone else.'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-al-text-muted">
            {hasActiveFilters
              ? 'Try clearing filters or searching with different terms.'
              : 'Work you initiate will appear here when the next step belongs to another person.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {hasActiveFilters ? (
              <PendingLink
                href="/dashboard/waiting-on-others"
                pendingText="…"
                className="rounded-lg bg-al-accent px-5 py-2 text-sm font-bold text-white hover:bg-al-accent-hover"
              >
                Clear filters
              </PendingLink>
            ) : (
              <PendingLink
                href="/dashboard/tasks"
                pendingText="Opening…"
                className="rounded-lg border border-al-border bg-al-surface-elevated px-5 py-2 text-sm font-bold text-al-text hover:border-al-accent/40"
              >
                View My Tasks
              </PendingLink>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Table + pagination ───────────────────────────── */}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-3">
          <WaitingOnOthersTable rows={rows} />
          <WaitingOnOthersCards rows={rows} />

          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-al-border bg-al-surface px-4 py-3 sm:flex-row">
            <p className="text-xs font-semibold text-al-text-muted">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} items
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <PendingLink
                href={buildHref(rawParams, { page: Math.max(1, currentPage - 1) })}
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
                    href={buildHref(rawParams, { page: p })}
                    pendingText="…"
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold tabular-nums ${p === currentPage ? 'bg-al-accent text-white' : 'text-al-text-secondary hover:bg-al-surface-elevated'}`}
                  >
                    {p}
                  </PendingLink>
                ),
              )}
              <PendingLink
                href={buildHref(rawParams, { page: Math.min(totalPages, currentPage + 1) })}
                pendingText="…"
                aria-disabled={currentPage >= totalPages}
                className={`inline-flex h-8 items-center rounded-lg border border-al-border px-3 text-xs font-bold ${currentPage >= totalPages ? 'pointer-events-none opacity-40' : 'text-al-text-secondary hover:border-al-accent/40'}`}
              >
                Next
              </PendingLink>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-al-text-muted">
              <span>Per page:</span>
              {WAITING_ON_OTHERS_PAGE_SIZE_OPTIONS.map((size) => (
                <PendingLink
                  key={size}
                  href={buildHref(rawParams, { pageSize: size, page: 1 })}
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
