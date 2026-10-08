import { AwaitingMyResponseTable } from '@/components/dashboard/AwaitingMyResponseTable';
import { AwaitingMyResponseCards } from '@/components/dashboard/AwaitingMyResponseCards';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { str, type RawSearchParams } from '@/lib/search-params';
import {
  getAwaitingMyResponseOverview,
  AWAITING_RESPONSE_PAGE_SIZE_OPTIONS,
  AWAITING_RESPONSE_STATUS_LABELS,
  type AwaitingResponseStatusFilter,
  type AwaitingResponseSort,
} from '@/services/awaitingMyResponse';
import type { IndividualDashboardRangeKey } from '@/services/individualDashboard';
import type { ActionCenterViewer } from '@/services/action-center';

/**
 * Awaiting My Response (/dashboard/responses) — the viewer's focused
 * personal response inbox: "what is explicitly waiting for MY response
 * right now?" A projection over the real ApprovalConfirmationRequest
 * model — never a second task/approval engine. Every row's action opens
 * the real canonical /approvals/[id] detail page, where the real
 * Confirm/Correct/Reject controls already live.
 */

const STATUS_TABS: Array<{ value: AwaitingResponseStatusFilter; label: string }> = [
  { value: 'ACTIONABLE', label: AWAITING_RESPONSE_STATUS_LABELS.ACTIONABLE },
  { value: 'OVERDUE', label: AWAITING_RESPONSE_STATUS_LABELS.OVERDUE },
  { value: 'RESPONDED', label: AWAITING_RESPONSE_STATUS_LABELS.RESPONDED },
];

const SORT_OPTIONS: Array<{ value: AwaitingResponseSort; label: string }> = [
  { value: 'priority', label: 'Urgency' },
  { value: 'due', label: 'Due date' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const RANGE_OPTIONS: Array<{ value: IndividualDashboardRangeKey; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
];

function buildHref(base: RawSearchParams, overrides: Record<string, string | number | undefined>) {
  const merged: Record<string, string | undefined> = {
    q: str(base, 'q'),
    source: str(base, 'source'),
    requester: str(base, 'requester'),
    status: str(base, 'status'),
    range: str(base, 'range'),
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
  return qs ? `/dashboard/responses?${qs}` : '/dashboard/responses';
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

export async function AwaitingMyResponseView({ viewer, rawParams }: { viewer: ActionCenterViewer; rawParams: RawSearchParams }) {
  const requestedPage = Math.max(1, Math.trunc(Number(str(rawParams, 'page')) || 1));
  const requestedPageSize = Number(str(rawParams, 'pageSize'));
  const pageSize = (AWAITING_RESPONSE_PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize) ? requestedPageSize : 10;
  const statusRaw = str(rawParams, 'status');
  const status = STATUS_TABS.some((o) => o.value === statusRaw) ? (statusRaw as AwaitingResponseStatusFilter) : 'ACTIONABLE';
  const sort = (str(rawParams, 'sort') as AwaitingResponseSort | undefined) ?? 'priority';
  const rangeRaw = str(rawParams, 'range');
  const range = (['7d', '30d', '90d', 'thisMonth', 'lastMonth', 'custom'] as const).includes(rangeRaw as IndividualDashboardRangeKey) ? (rangeRaw as IndividualDashboardRangeKey) : undefined;
  const from = str(rawParams, 'from');
  const to = str(rawParams, 'to');

  const filters = {
    q: str(rawParams, 'q'),
    source: str(rawParams, 'source'),
    requester: str(rawParams, 'requester'),
    status,
    range,
    from,
    to,
    sort,
    page: requestedPage,
    pageSize,
  };

  let loadError: string | null = null;
  let result: Awaited<ReturnType<typeof getAwaitingMyResponseOverview>> | null = null;
  try {
    result = await getAwaitingMyResponseOverview(viewer, filters);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Awaiting My Response could not be loaded.';
    console.error('[awaiting-my-response] load failed', error);
  }

  const hasActiveFilters = Boolean(filters.q || filters.source || filters.requester || status !== 'ACTIONABLE');
  const rows = result?.rows ?? [];

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  const tiles = result
    ? ([
        { label: 'Awaiting Response', value: result.kpis.awaitingResponse, ink: 'text-al-info' },
        { label: 'Due Today', value: result.kpis.dueToday, ink: 'text-al-warning' },
        { label: 'Overdue', value: result.kpis.overdue, ink: 'text-al-danger' },
        { label: 'Responded', value: result.kpis.responded, ink: 'text-al-success' },
      ] as const)
    : [];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Page header ──────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-al-border bg-al-surface p-5">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-al-accent">Personal Workspace</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-al-text sm:text-3xl">Awaiting My Response</h1>
            <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-al-text-muted">
              Confirmation requests that need your response right now.
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
              <p className={`mt-1 font-mono text-xl font-black tracking-tight sm:text-2xl ${tile.ink}`}>{tile.value.toLocaleString()}</p>
              {tile.label === 'Responded' ? (
                <p className="mt-1 text-[10px] font-semibold leading-tight text-al-text-muted">{result.respondedPeriodLabel}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Filters ──────────────────────────────────────── */}
      <form id="awaiting-response-filters" className="scroll-mt-32 rounded-xl border border-al-border bg-al-surface p-4">
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Search requests</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Search by request, source, category, or requester…"
              className="h-10 flex-1 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
            />
            <FormSubmitButton pendingText="Searching…" className="min-h-0 h-10 rounded-lg bg-al-accent px-5 text-sm font-bold text-white hover:bg-al-accent-hover">
              Search
            </FormSubmitButton>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 rounded-lg border border-al-border bg-al-surface-sunken p-1">
          {STATUS_TABS.map((o) => (
            <PendingLink
              key={o.value}
              href={buildHref(rawParams, { status: o.value === 'ACTIONABLE' ? undefined : o.value, page: 1 })}
              pendingText="…"
              aria-current={status === o.value ? 'true' : undefined}
              className={`flex-1 rounded-md px-3 py-1.5 text-center text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent ${
                status === o.value ? 'bg-al-accent text-white' : 'text-al-text-secondary hover:bg-al-surface-elevated'
              }`}
            >
              {o.label}
            </PendingLink>
          ))}
        </div>

        <details className="mt-3 group" open={hasActiveFilters || undefined}>
          <summary className="cursor-pointer list-none rounded text-xs font-bold text-al-accent hover:text-al-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent">Filters ▾</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <input type="hidden" name="status" value={status === 'ACTIONABLE' ? '' : status} />
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Source</span>
              <input
                name="source"
                defaultValue={filters.source ?? ''}
                placeholder="e.g. Slack, Gmail"
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Requester</span>
              <input
                name="requester"
                defaultValue={filters.requester ?? ''}
                placeholder="Name or email"
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
            {status === 'RESPONDED' ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Period</span>
                <select
                  name="range"
                  defaultValue={range ?? ''}
                  className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
                >
                  <option value="">All time</option>
                  {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            ) : <div />}
            {status === 'RESPONDED' && range === 'custom' ? (
              <>
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
              </>
            ) : null}
            <div className="flex items-end gap-2">
              <FormSubmitButton pendingText="Filtering…" className="min-h-0 h-9 w-full rounded-lg bg-al-accent px-4 text-sm font-bold text-white hover:bg-al-accent-hover">
                Apply filters
              </FormSubmitButton>
              {hasActiveFilters ? (
                <PendingLink
                  href="/dashboard/responses"
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
          <h3 className="font-bold">Awaiting My Response couldn&apos;t be loaded</h3>
          <p className="mt-1 text-sm">Try again or return to your dashboard. Your workspace shell is still available.</p>
          <PendingLink
            href="/dashboard/responses"
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
            {hasActiveFilters ? 'No matches' : status === 'RESPONDED' ? 'No responses yet' : status === 'OVERDUE' ? 'Nothing overdue' : 'All caught up'}
          </p>
          <h3 className="mt-3 text-xl font-black text-al-text">
            {hasActiveFilters
              ? 'No response requests match your filters.'
              : status === 'RESPONDED'
                ? "You haven't responded to anything in this range."
                : status === 'OVERDUE'
                  ? 'No overdue response requests.'
                  : 'Nothing is waiting for you.'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-al-text-muted">
            {hasActiveFilters
              ? 'Try clearing filters or searching with different terms.'
              : status === 'RESPONDED'
                ? 'Requests you confirm, correct, or reject will appear here.'
                : status === 'OVERDUE'
                  ? "You're all caught up — no requests have expired without a response."
                  : "You're all caught up on response requests."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {hasActiveFilters ? (
              <PendingLink
                href="/dashboard/responses"
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
          <AwaitingMyResponseTable rows={rows} />
          <AwaitingMyResponseCards rows={rows} />

          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-al-border bg-al-surface px-4 py-3 sm:flex-row">
            <p className="text-xs font-semibold text-al-text-muted">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} requests
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
              {AWAITING_RESPONSE_PAGE_SIZE_OPTIONS.map((size) => (
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
