import { ApprovalTable, type ApprovalTableRecord } from '@/components/dashboard/ApprovalTable';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { str, type RawSearchParams } from '@/lib/search-params';
import {
  getMyApprovalsOverview,
  MY_APPROVALS_PAGE_SIZE_OPTIONS,
  type MyApprovalsSort,
  type MyApprovalsStatusFilter,
} from '@/services/myApprovals';
import type { ActionCenterViewer } from '@/services/action-center';

/**
 * My Approvals (/dashboard/approvals?view=mine) — the viewer's personal
 * approval workspace. Lives alongside the org-wide Approval History view in
 * the same route (app/dashboard/approvals/page.tsx toggles between the two
 * via the `view` param) rather than a second route, per this module's own
 * "do not create a duplicate route" constraint. See services/myApprovals.ts
 * for the full architecture/reuse rationale behind every number here.
 *
 * Deliberately NOT a reskin of Action Center (/dashboard/pending-actions):
 * Action Center is an open-items-only operational queue with no historical
 * view and no date-range filtering; this page shows the viewer's full
 * history (open + decided) with the same richer filter/sort/pagination
 * surface the org-wide Approval History page already has.
 */

const STATUS_OPTIONS: Array<{ value: MyApprovalsStatusFilter | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'CONFIRMATION_REQUIRED', label: 'Confirmation required' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const SORT_OPTIONS: Array<{ value: MyApprovalsSort; label: string }> = [
  { value: 'priority', label: 'Priority (overdue first)' },
  { value: 'due', label: 'Due date' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'lastActivity', label: 'Last activity' },
];

function buildMyApprovalsHref(base: RawSearchParams, overrides: Record<string, string | number | undefined>) {
  const merged: Record<string, string | undefined> = {
    view: 'mine',
    q: str(base, 'q'),
    department: str(base, 'department'),
    sourcePlatform: str(base, 'sourcePlatform'),
    category: str(base, 'category'),
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
  return `/dashboard/approvals?${sp.toString()}`;
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

export async function MyApprovalsView({
  viewer,
  rawParams,
}: {
  viewer: ActionCenterViewer;
  rawParams: RawSearchParams;
}) {
  const requestedPage = Math.max(1, Math.trunc(Number(str(rawParams, 'page')) || 1));
  const requestedPageSize = Number(str(rawParams, 'pageSize'));
  const pageSize = (MY_APPROVALS_PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize) ? requestedPageSize : 10;
  const status = str(rawParams, 'status') as MyApprovalsStatusFilter | undefined;
  const sort = (str(rawParams, 'sort') as MyApprovalsSort | undefined) ?? 'priority';

  const filters = {
    q: str(rawParams, 'q'),
    department: str(rawParams, 'department'),
    sourcePlatform: str(rawParams, 'sourcePlatform'),
    category: str(rawParams, 'category'),
    riskLevel: str(rawParams, 'riskLevel'),
    status: STATUS_OPTIONS.some((o) => o.value === status) ? status : undefined,
    from: str(rawParams, 'from'),
    to: str(rawParams, 'to'),
    sort,
    page: requestedPage,
    pageSize,
  };

  let loadError: string | null = null;
  let result: Awaited<ReturnType<typeof getMyApprovalsOverview>> | null = null;
  try {
    result = await getMyApprovalsOverview(viewer, filters);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'My Approvals could not be loaded.';
    console.error('[my-approvals] load failed', error);
  }

  const hasActiveFilters = Boolean(filters.q || filters.department || filters.sourcePlatform || filters.category || filters.riskLevel || filters.status || filters.from || filters.to);

  const approvalRows: ApprovalTableRecord[] = (result?.rows ?? []).map((r) => ({
    id: r.id,
    subject: r.subject,
    sourceLink: r.sourceLink,
    correlationId: r.correlationId,
    approverName: r.approverName,
    approverEmail: r.approverEmail,
    department: r.department,
    category: r.category,
    riskLevel: r.riskLevel,
    sourcePlatform: r.sourcePlatform,
    confidence: r.confidence,
    status: r.status,
    createdAt: r.createdAt,
    occurredAt: r.occurredAt,
    sources: r.sources,
    personalStatus: r.personalStatus,
    dueAt: r.dueAt,
  }));

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  const tiles = result
    ? ([
        { label: 'Pending my decision', value: result.kpis.pendingMyDecision, ink: 'text-al-warning' },
        { label: 'Due today', value: result.kpis.dueToday, ink: 'text-al-warning' },
        { label: 'Overdue', value: result.kpis.overdue, ink: 'text-al-danger' },
        { label: 'Due soon', value: result.kpis.dueSoon, ink: 'text-al-text' },
        { label: 'Approved', value: result.kpis.approved, ink: 'text-al-success' },
        { label: 'Rejected', value: result.kpis.rejected, ink: 'text-al-danger' },
      ] as const)
    : [];
  const periodLabel = filters.from || filters.to ? 'in selected range' : 'all-time';

  return (
    <div className="flex flex-col gap-5">
      {/* ── Page header ──────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-al-border bg-al-surface p-5">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-al-accent">Approval Intelligence</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-al-text sm:text-3xl">My Approvals</h1>
            <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-al-text-muted">
              Review decisions that require your attention and keep your approval workload moving.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PendingLink
              href="/approvals/manual"
              pendingText="Opening recorder…"
              className="rounded-lg bg-al-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-al-accent-hover"
            >
              + New Approval
            </PendingLink>
            <PendingLink
              href="/dashboard/approvals"
              pendingText="Opening…"
              className="rounded-lg border border-al-border bg-al-surface-elevated px-4 py-2 text-sm font-bold text-al-text transition hover:border-al-accent/40"
            >
              View Organization Approvals
            </PendingLink>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5 rounded-lg border border-al-border bg-al-surface-sunken p-1">
          <span className="flex-1 rounded-md bg-al-accent px-3 py-1.5 text-center text-xs font-bold text-white">My Approvals</span>
          <PendingLink
            href="/dashboard/approvals"
            pendingText="…"
            className="flex-1 rounded-md px-3 py-1.5 text-center text-xs font-bold text-al-text-secondary hover:bg-al-surface-elevated"
          >
            All Approvals
          </PendingLink>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────── */}
      {result ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-xl border border-al-border bg-al-surface p-4">
              <p className="text-[11px] font-semibold text-al-text-muted">{tile.label}</p>
              <p className={`mt-0.5 font-mono text-2xl font-black tracking-tight ${tile.ink}`}>{tile.value.toLocaleString()}</p>
              {tile.label === 'Approved' || tile.label === 'Rejected' ? (
                <p className="mt-1 text-[10px] font-semibold text-al-text-muted">{periodLabel}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Filters ──────────────────────────────────────── */}
      <form id="my-approvals-filters" className="scroll-mt-32 rounded-xl border border-al-border bg-al-surface p-4">
        <input type="hidden" name="view" value="mine" />
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Search my approvals</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Search subject, source, department, or category…"
              className="h-10 flex-1 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
            />
            <FormSubmitButton pendingText="Searching…" className="min-h-0 h-10 rounded-lg bg-al-accent px-5 text-sm font-bold text-white hover:bg-al-accent-hover">
              Search
            </FormSubmitButton>
          </div>
        </div>

        <details className="mt-3 group" open={hasActiveFilters || undefined}>
          <summary className="cursor-pointer list-none text-xs font-bold text-al-accent hover:text-al-accent">Filters ▾</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {(
              [
                ['department', 'Department'],
                ['sourcePlatform', 'Source platform'],
                ['category', 'Category'],
                ['riskLevel', 'Risk level'],
              ] as ['department' | 'sourcePlatform' | 'category' | 'riskLevel', string][]
            ).map(([name, placeholder]) => (
              <label key={name} className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">{placeholder}</span>
                <input
                  name={name}
                  defaultValue={filters[name] ?? ''}
                  placeholder={placeholder}
                  className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text placeholder:text-al-text-secondary outline-none focus:border-al-accent/60"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-al-text-muted">Status</span>
              <select
                name="status"
                defaultValue={filters.status ?? ''}
                className="h-9 rounded-lg border border-al-border bg-al-surface-elevated px-3 text-sm font-semibold text-al-text outline-none focus:border-al-accent/60"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
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
                  href="/dashboard/approvals?view=mine"
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
          <h3 className="font-bold">My Approvals couldn&apos;t be loaded</h3>
          <p className="mt-1 text-sm">Try again or return to your dashboard. Your workspace shell is still available.</p>
          <PendingLink
            href="/dashboard/approvals?view=mine"
            pendingText="Retrying…"
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-al-accent px-4 text-sm font-bold text-white hover:bg-al-accent-hover"
          >
            Retry
          </PendingLink>
        </div>
      ) : null}

      {/* ── Empty states ─────────────────────────────────── */}
      {!loadError && approvalRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-al-border bg-al-surface/50 p-12 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-al-accent">
            {hasActiveFilters ? 'No matches' : 'All caught up'}
          </p>
          <h3 className="mt-3 text-xl font-black text-al-text">
            {hasActiveFilters ? 'No approvals match your filters.' : 'All caught up.'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-al-text-muted">
            {hasActiveFilters
              ? 'Try clearing filters or searching with different terms.'
              : "You don't have any approvals waiting for your decision."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {hasActiveFilters ? (
              <PendingLink
                href="/dashboard/approvals?view=mine"
                pendingText="…"
                className="rounded-lg bg-al-accent px-5 py-2 text-sm font-bold text-white hover:bg-al-accent-hover"
              >
                Clear filters
              </PendingLink>
            ) : (
              <>
                <PendingLink
                  href="/dashboard/approvals?view=mine&status=APPROVED"
                  pendingText="Opening…"
                  className="rounded-lg border border-al-border bg-al-surface-elevated px-5 py-2 text-sm font-bold text-al-accent hover:border-al-accent/40"
                >
                  View Approval History
                </PendingLink>
                <PendingLink
                  href="/dashboard/approvals"
                  pendingText="Opening…"
                  className="rounded-lg border border-al-border bg-al-surface-elevated px-5 py-2 text-sm font-bold text-al-text hover:border-al-accent/40"
                >
                  View Organization Approvals
                </PendingLink>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Table + pagination ───────────────────────────── */}
      {approvalRows.length > 0 ? (
        <div className="flex flex-col gap-3">
          <ApprovalTable approvals={approvalRows} showDueColumn />

          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-al-border bg-al-surface px-4 py-3 sm:flex-row">
            <p className="text-xs font-semibold text-al-text-muted">
              Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} approvals
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <PendingLink
                href={buildMyApprovalsHref(rawParams, { page: Math.max(1, currentPage - 1) })}
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
                    href={buildMyApprovalsHref(rawParams, { page: p })}
                    pendingText="…"
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold tabular-nums ${p === currentPage ? 'bg-al-accent text-white' : 'text-al-text-secondary hover:bg-al-surface-elevated'}`}
                  >
                    {p}
                  </PendingLink>
                ),
              )}
              <PendingLink
                href={buildMyApprovalsHref(rawParams, { page: Math.min(totalPages, currentPage + 1) })}
                pendingText="…"
                aria-disabled={currentPage >= totalPages}
                className={`inline-flex h-8 items-center rounded-lg border border-al-border px-3 text-xs font-bold ${currentPage >= totalPages ? 'pointer-events-none opacity-40' : 'text-al-text-secondary hover:border-al-accent/40'}`}
              >
                Next
              </PendingLink>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-al-text-muted">
              <span>Per page:</span>
              {MY_APPROVALS_PAGE_SIZE_OPTIONS.map((size) => (
                <PendingLink
                  key={size}
                  href={buildMyApprovalsHref(rawParams, { pageSize: size, page: 1 })}
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
