import { getDashboardTenant } from '@/lib/auth';
import { ApprovalTable } from '@/components/dashboard/ApprovalTable';
import type { ApprovalTableRecord } from '@/components/dashboard/ApprovalTable';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { LiveCaptureBadge } from '@/components/dashboard/DashboardNavigation';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import {
  loadDashboardApprovalRecords,
  getApprovalStatusCounts,
  getApprovalDepartmentBreakdown,
} from '@/lib/approvalRecords';
import { getCaptureStatus } from '@/lib/capture-status';
import { getUnifiedSourceSummariesForApprovals } from '@/services/evidence/records';
import { redirect } from 'next/navigation';

function minutesAgo(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes === 0) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

export const dynamic = 'force-dynamic';

// ── Dept bar colours cycling ───────────────────────────────────────────────────
const DEPT_COLORS = [
  'bg-emerald-500', 'bg-violet-500', 'bg-blue-500',
  'bg-amber-500',   'bg-rose-500',   'bg-teal-500',
];

// The five quick filter chips above the table. Each writes straight to the
// URL (riskLevel/status/multiSource - the same params the advanced filter
// panel already uses), so the server component re-runs the real query -
// there is no client-side filtering of an already-loaded page anywhere in
// this file. "Approved"/"Rejected" stay reachable through the advanced
// filter panel's Status field below rather than as a top-level chip, since
// the chip row's job is the risk/multi-source taxonomy this redesign asked
// for, not a second copy of every status value.
const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'pending', label: 'Pending' },
  { key: 'multi-source', label: 'Multi-source' },
] as const;

type FilterChipKey = (typeof FILTER_CHIPS)[number]['key'];

function normalizeFilterChip(params: RawSearchParams): FilterChipKey {
  if (str(params, 'multiSource') === 'true') return 'multi-source';
  const riskLevel = str(params, 'riskLevel')?.toLowerCase();
  if (riskLevel === 'critical') return 'critical';
  if (riskLevel === 'high') return 'high';
  if (str(params, 'status')?.toUpperCase() === 'PENDING_REVIEW') return 'pending';
  return 'all';
}

function filterChipOverrides(chip: FilterChipKey): Record<string, string | number | undefined> {
  const cleared = { riskLevel: undefined, status: undefined, multiSource: undefined, page: 1 };
  if (chip === 'critical') return { ...cleared, riskLevel: 'critical' };
  if (chip === 'high') return { ...cleared, riskLevel: 'high' };
  if (chip === 'pending') return { ...cleared, status: 'PENDING_REVIEW' };
  if (chip === 'multi-source') return { ...cleared, multiSource: 'true' };
  return cleared;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type RawSearchParams = Record<string, string | string[] | undefined>;

function str(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Builds a query string for /dashboard/approvals that preserves every
 *  existing filter/search/pageSize param, applying only the given overrides -
 *  this is what keeps "change status tab", "change page", and "change page
 *  size" all composable without losing whatever else the viewer has set. */
function buildApprovalsHref(base: RawSearchParams, overrides: Record<string, string | number | undefined>) {
  const merged: Record<string, string | undefined> = {
    q: str(base, 'q'),
    employee: str(base, 'employee'),
    department: str(base, 'department'),
    sourcePlatform: str(base, 'sourcePlatform'),
    category: str(base, 'category'),
    riskLevel: str(base, 'riskLevel'),
    approvalType: str(base, 'approvalType'),
    from: str(base, 'from'),
    to: str(base, 'to'),
    status: str(base, 'status'),
    multiSource: str(base, 'multiSource'),
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
  return qs ? `/dashboard/approvals?${qs}` : '/dashboard/approvals';
}

/** A small, capped window of page numbers around the current page, always
 *  including page 1 and the last page, with `null` marking an ellipsis gap -
 *  avoids ever rendering hundreds of page links for a large approvals table. */
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

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const startedAt = Date.now();
  console.info('[dashboard] approvals page start load');
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  const rawParams = await searchParams;

  const activeChip = normalizeFilterChip(rawParams);
  const requestedPage = Math.max(1, Math.trunc(Number(str(rawParams, 'page')) || 1));
  const requestedPageSize = Number(str(rawParams, 'pageSize'));
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedPageSize) ? requestedPageSize : 10;

  const filters = {
    q: str(rawParams, 'q'),
    employee: str(rawParams, 'employee'),
    department: str(rawParams, 'department'),
    sourcePlatform: str(rawParams, 'sourcePlatform'),
    category: str(rawParams, 'category'),
    riskLevel: str(rawParams, 'riskLevel'),
    approvalType: str(rawParams, 'approvalType'),
    status: str(rawParams, 'status'),
    multiSource: str(rawParams, 'multiSource') === 'true',
    from: str(rawParams, 'from'),
    to: str(rawParams, 'to'),
  };

  let approvals: ApprovalTableRecord[] = [];
  let total = 0;
  let loadError: string | null = null;
  let loadErrorReference: string | null = null;
  let cacheNotice: string | null = null;
  let staleNotice: string | null = null;
  let isAlert = false;

  try {
    if (!tenant.organization) throw new Error(tenant.error ?? 'Workspace unavailable.');
    console.info('[dashboard] approvals query start');
    const result = await loadDashboardApprovalRecords({
      organizationId: tenant.organization.id,
      userId: tenant.session.userId,
      page: requestedPage,
      pageSize,
      ...filters,
    });

    // The one query that feeds both this row's stacked source badges and its
    // preview panel's source list (services/evidence/records.ts) - so the
    // two can never again disagree about how many tools contributed to a
    // decision the way ApprovalRecord.sourcePlatform (a single string) used
    // to force them to.
    const sourceSummaries = await getUnifiedSourceSummariesForApprovals(tenant.organization.id, result.records.map((r) => r.id));
    approvals = result.records.map((r) => ({ ...r, sources: sourceSummaries.get(r.id) ?? null }));
    total = result.total;
    isAlert = result.alert;
    if (result.degraded && result.source === 'cache' && !result.alert && result.staleAsOfMs) {
      staleNotice = `Last updated ${minutesAgo(result.staleAsOfMs)}.`;
    }
    if (result.alert) {
      loadErrorReference = result.reference ?? null;
      cacheNotice = result.message ?? 'Live database results are delayed.';
    } else if (result.degraded && result.source === 'empty') {
      cacheNotice = result.message ?? 'Approval records are loading. Retrying automatically.';
    }
    console.info(`[dashboard] approvals query finished in ${Date.now() - startedAt}ms`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Workspace unavailable.';
    console.error(`[dashboard] approvals query failed after ${Date.now() - startedAt}ms`, error);
  }

  // Org-wide (never limited to the current page/filter) so the KPI strip and
  // filter-chip counts read as stable, trustworthy totals - see
  // lib/approvalRecords.ts's getApprovalStatusCounts doc comment. Both
  // degrade to zeroed/empty results rather than throwing.
  const statusCounts = tenant.organization
    ? await getApprovalStatusCounts(tenant.organization.id)
    : { total: 0, approved: 0, pending: 0, rejected: 0, highRisk: 0, critical: 0, high: 0, multiSource: 0 };
  const departments = tenant.organization ? await getApprovalDepartmentBreakdown(tenant.organization.id) : [];
  const captureStatus = tenant.organization ? await getCaptureStatus(tenant.organization.id) : { state: 'none' as const, label: 'No sources connected' };

  const unlinkedOnPage = approvals.filter((a) => !a.sources).length;
  const maxDept = departments[0]?.[1] ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  // Plain tiles - no card shadow, no icons. Only Pending and High-or-critical
  // take ink from the risk ramp (lib/risk-ramp.ts); Total and Approved stay
  // neutral, since they aren't risk signals.
  const tiles = [
    { label: 'Total',            value: statusCounts.total,    ink: 'text-[#E8EEFF]' },
    { label: 'Approved',         value: statusCounts.approved, ink: 'text-[#E8EEFF]' },
    { label: 'Pending review',   value: statusCounts.pending,  ink: 'text-amber-400' },
    { label: 'High or critical', value: statusCounts.highRisk, ink: 'text-red-400' },
  ] as const;

  const chipCount: Record<FilterChipKey, number> = {
    all: statusCounts.total,
    critical: statusCounts.critical,
    high: statusCounts.high,
    pending: statusCounts.pending,
    'multi-source': statusCounts.multiSource,
  };

  return (
    <div className="flex flex-col gap-5">

      {/* ── Page header ──────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-5">
        <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-violet-400">
          Approval Intelligence
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-[#E8EEFF] sm:text-3xl">
                Approval History
              </h1>
              <LiveCaptureBadge status={captureStatus} />
            </div>
            <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-[#6B7FA8]">
              Every approval decision, with the sources that captured it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PendingLink
              href="/approvals/manual"
              pendingText="Opening recorder…"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500"
            >
              + New Approval
            </PendingLink>
            <PendingLink
              href="/api/export/approvals?format=csv"
              pendingText="Preparing CSV…"
              className="rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 py-2 text-sm font-bold text-[#E8EEFF] transition hover:border-violet-500/40"
            >
              Export CSV
            </PendingLink>
            <PendingLink
              href="/api/export/approvals?format=pdf"
              pendingText="Preparing PDF…"
              className="rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 py-2 text-sm font-bold text-[#E8EEFF] transition hover:border-violet-500/40"
            >
              Export PDF
            </PendingLink>
          </div>
        </div>
      </div>

      {/* ── Stat tiles ───────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
            <p className="text-[11px] font-semibold text-[#6B7FA8]">{tile.label}</p>
            <p className={`mt-0.5 font-mono text-2xl font-black tracking-tight ${tile.ink}`}>
              {tile.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* ── Backfill notice ───────────────────────────────── */}
      {unlinkedOnPage > 0 ? (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-bold text-[#E8EEFF]">
              {unlinkedOnPage} approval{unlinkedOnPage === 1 ? '' : 's'} on this page{' '}
              {unlinkedOnPage === 1 ? "isn't" : "aren't"} in Unified Evidence yet
            </h3>
            <p className="mt-1 text-sm text-[#6B7FA8]">
              Backfill creates the missing Unified Evidence record from existing approval data — nothing is fabricated.
            </p>
          </div>
          <form action="/api/evidence/backfill" method="post">
            <FormSubmitButton
              pendingText="Backfilling…"
              className="min-h-0 h-9 shrink-0 rounded-lg bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500"
            >
              Backfill Evidence
            </FormSubmitButton>
          </form>
        </div>
      ) : null}

      {/* ── Filter chips ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-1.5">
        {FILTER_CHIPS.map(({ key, label }) => {
          const isActive = activeChip === key;
          return (
            <PendingLink
              key={key}
              href={buildApprovalsHref(rawParams, filterChipOverrides(key))}
              pendingText="Filtering…"
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition ${
                isActive
                  ? 'bg-violet-600 text-white'
                  : 'text-[#A8BAD8] hover:bg-[#152040]'
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#152040] text-[#6B7FA8]'
                }`}
              >
                {chipCount[key].toLocaleString()}
              </span>
            </PendingLink>
          );
        })}
      </div>

      {/* ── Search + filters ─────────────────────────────── */}
      <form id="filters" className="scroll-mt-32 rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
        <input type="hidden" name="multiSource" value={filters.multiSource ? 'true' : ''} />
        <input type="hidden" name="pageSize" value={pageSize} />
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">
            Search approvals, people, sources, or keywords
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="q"
              defaultValue={filters.q ?? ''}
              placeholder="Search approvals, people, sources, or keywords…"
              className="h-10 flex-1 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] placeholder:text-[#3D5070] outline-none focus:border-violet-500/60"
            />
            <FormSubmitButton
              pendingText="Searching…"
              className="min-h-0 h-10 rounded-lg bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500"
            >
              Search
            </FormSubmitButton>
          </div>
        </div>

        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-xs font-bold text-violet-400 hover:text-violet-300">
            Filters ▾
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {(
              [
                ['employee',      'Approver'],
                ['department',    'Department'],
                ['sourcePlatform','Source platform'],
                ['category',      'Category'],
                ['riskLevel',     'Risk level'],
                ['approvalType',  'Approval type'],
              ] as ['employee' | 'department' | 'sourcePlatform' | 'category' | 'riskLevel' | 'approvalType', string][]
            ).map(([name, placeholder]) => (
              <label key={name} className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">
                  {placeholder}
                </span>
                <input
                  name={name}
                  defaultValue={filters[name] ?? ''}
                  placeholder={placeholder}
                  className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] placeholder:text-[#3D5070] outline-none focus:border-violet-500/60"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">Status</span>
              <select
                name="status"
                defaultValue={filters.status ?? ''}
                className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
              >
                <option value="">All statuses</option>
                <option value="PENDING_REVIEW">Pending review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">From</span>
              <input
                name="from"
                type="date"
                defaultValue={filters.from ?? ''}
                className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">To</span>
              <input
                name="to"
                type="date"
                defaultValue={filters.to ?? ''}
                className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
              />
            </label>
            <div className="flex items-end">
              <FormSubmitButton
                pendingText="Filtering…"
                className="min-h-0 h-9 w-full rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500"
              >
                Apply filters
              </FormSubmitButton>
            </div>
          </div>
        </details>
      </form>

      {/* ── Status / stale / error banners ───────────────── */}
      {staleNotice ? (
        <p className="-mt-2 text-xs font-semibold text-[#3D5070]">{staleNotice}</p>
      ) : null}
      {isAlert ? <AutoRetryOnDegraded /> : null}
      {cacheNotice ? (
        <div
          className={
            isAlert
              ? 'rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-200'
              : 'rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4 text-[#6B7FA8]'
          }
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-bold text-[#E8EEFF]">
                {isAlert ? 'Approval records are recovering' : 'Approval records are loading'}
              </h3>
              <p className="mt-1 text-sm">{cacheNotice}</p>
              {loadErrorReference ? (
                <p className="mt-1 text-xs font-bold opacity-60">Reference: {loadErrorReference}</p>
              ) : null}
            </div>
            <PendingLink
              href="/dashboard/approvals"
              pendingText="Retrying…"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40"
            >
              Retry now
            </PendingLink>
          </div>
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 text-amber-200">
          <h3 className="font-bold">Approvals couldn&apos;t be loaded</h3>
          <p className="mt-1 text-sm">
            Try again or return to your dashboard. Your workspace shell is still available.
          </p>
          {loadErrorReference ? (
            <p className="mt-2 text-xs font-bold opacity-60">Reference: {loadErrorReference}</p>
          ) : null}
          <PendingLink
            href="/dashboard/approvals"
            pendingText="Retrying…"
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500"
          >
            Retry
          </PendingLink>
        </div>
      ) : null}

      {/* ── Empty state ───────────────────────────────────── */}
      {!loadError && approvals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1E2D4A] bg-[#0E1830]/50 p-12 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-violet-400">
            No approvals yet
          </p>
          <h3 className="mt-3 text-xl font-black text-[#E8EEFF]">
            {activeChip === 'all' && !filters.q ? 'No approvals yet' : 'No approvals match these filters'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#6B7FA8]">
            {activeChip === 'all' && !filters.q
              ? 'Approvals from your connected systems will appear here.'
              : 'Try clearing filters or choosing a different filter chip.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <PendingLink
              href="/dashboard/settings/integrations"
              pendingText="Opening…"
              className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500"
            >
              Connect a Source →
            </PendingLink>
            <PendingLink
              href="/approvals/manual"
              pendingText="Opening recorder…"
              className="rounded-lg border border-[#1E2D4A] bg-[#152040] px-5 py-2 text-sm font-bold text-violet-400 hover:border-violet-500/40"
            >
              Record manual approval
            </PendingLink>
            {activeChip === 'all' && !filters.q ? (
              <form action="/api/demo/seed" method="post">
                <FormSubmitButton
                  pendingText="Generating…"
                  className="min-h-0 rounded-lg border border-[#1E2D4A] bg-[#152040] px-5 py-2 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40"
                >
                  Generate demo data
                </FormSubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Main content: table + right rail ─────────────── */}
      {approvals.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-3">
            <ApprovalTable approvals={approvals} />

            {/* Pagination */}
            <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-4 py-3 sm:flex-row">
              <p className="text-xs font-semibold text-[#6B7FA8]">
                Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} approvals
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <PendingLink
                  href={buildApprovalsHref(rawParams, { page: Math.max(1, currentPage - 1) })}
                  pendingText="…"
                  aria-disabled={currentPage <= 1}
                  className={`inline-flex h-8 items-center rounded-lg border border-[#1E2D4A] px-3 text-xs font-bold ${
                    currentPage <= 1 ? 'pointer-events-none opacity-40' : 'text-[#A8BAD8] hover:border-violet-500/40'
                  }`}
                >
                  Previous
                </PendingLink>
                {pageWindow(currentPage, totalPages).map((p, idx) =>
                  p === null ? (
                    <span key={`gap-${idx}`} className="px-1 text-xs text-[#3D5070]">…</span>
                  ) : (
                    <PendingLink
                      key={p}
                      href={buildApprovalsHref(rawParams, { page: p })}
                      pendingText="…"
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold tabular-nums ${
                        p === currentPage ? 'bg-violet-600 text-white' : 'text-[#A8BAD8] hover:bg-[#152040]'
                      }`}
                    >
                      {p}
                    </PendingLink>
                  ),
                )}
                <PendingLink
                  href={buildApprovalsHref(rawParams, { page: Math.min(totalPages, currentPage + 1) })}
                  pendingText="…"
                  aria-disabled={currentPage >= totalPages}
                  className={`inline-flex h-8 items-center rounded-lg border border-[#1E2D4A] px-3 text-xs font-bold ${
                    currentPage >= totalPages ? 'pointer-events-none opacity-40' : 'text-[#A8BAD8] hover:border-violet-500/40'
                  }`}
                >
                  Next
                </PendingLink>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7FA8]">
                <span>Per page:</span>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <PendingLink
                    key={size}
                    href={buildApprovalsHref(rawParams, { pageSize: size, page: 1 })}
                    pendingText="…"
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-bold tabular-nums ${
                      size === pageSize ? 'bg-violet-600 text-white' : 'text-[#A8BAD8] hover:bg-[#152040]'
                    }`}
                  >
                    {size}
                  </PendingLink>
                ))}
              </div>
            </div>
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-3">
            {/* Status donut (org-wide, matches KPI strip) */}
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
              <h3 className="mb-3 font-bold text-[#E8EEFF]">Approvals by Status</h3>
              <div className="flex items-center gap-4">
                <div className="relative h-[80px] w-[80px] flex-shrink-0">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="30" fill="none" stroke="#152040" strokeWidth="10" />
                    {statusCounts.approved > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#22C55E" strokeWidth="10"
                        strokeDasharray={`${(statusCounts.approved / (statusCounts.total || 1)) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                      />
                    ) : null}
                    {statusCounts.pending > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#F59E0B" strokeWidth="10"
                        strokeDasharray={`${(statusCounts.pending / (statusCounts.total || 1)) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform={`rotate(${-90 + (statusCounts.approved / (statusCounts.total || 1)) * 360} 40 40)`}
                      />
                    ) : null}
                    {statusCounts.rejected > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#EF4444" strokeWidth="10"
                        strokeDasharray={`${(statusCounts.rejected / (statusCounts.total || 1)) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform={`rotate(${-90 + ((statusCounts.approved + statusCounts.pending) / (statusCounts.total || 1)) * 360} 40 40)`}
                      />
                    ) : null}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-lg font-black text-[#E8EEFF]">{statusCounts.total}</span>
                    <span className="text-[9px] text-[#6B7FA8]">Total</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Approved', count: statusCounts.approved, color: 'bg-emerald-400' },
                    { label: 'Pending',  count: statusCounts.pending,  color: 'bg-amber-400' },
                    { label: 'Rejected', count: statusCounts.rejected, color: 'bg-rose-400' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${color}`} />
                      <span className="text-[11px] text-[#6B7FA8]">{label}</span>
                      <span className="ml-auto font-mono text-[11px] font-bold text-[#E8EEFF]">{count}</span>
                      <span className="w-8 text-right text-[10px] text-[#3D5070]">
                        ({Math.round((count / (statusCounts.total || 1)) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Department breakdown (org-wide) */}
            {departments.length > 0 ? (
              <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-[#E8EEFF]">Approvals by Dept</h3>
                  <PendingLink
                    href="/trust/compliance"
                    pendingText="Opening…"
                    className="text-[11px] font-semibold text-violet-400 hover:text-violet-300"
                  >
                    View all
                  </PendingLink>
                </div>
                <div className="flex flex-col gap-2.5">
                  {departments.map(([dept, count], idx) => {
                    const pct = Math.round((count / maxDept) * 100);
                    return (
                      <div key={dept}>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="flex-1 truncate text-[11px] font-medium text-[#E8EEFF]">{dept}</span>
                          <span className="font-mono text-[11px] text-[#6B7FA8]">{count}</span>
                          <span className="w-10 text-right text-[10px] text-[#3D5070]">
                            ({Math.round((count / (statusCounts.total || 1)) * 100)}%)
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-[#152040]">
                          <div
                            className={`h-full rounded-full ${DEPT_COLORS[idx % DEPT_COLORS.length]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Quick actions */}
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
              <h3 className="mb-3 font-bold text-[#E8EEFF]">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'New Approval',    href: '/approvals/manual',              icon: '＋', pending: 'Opening recorder…' },
                  { label: 'Import CSV',       href: '/api/export/approvals?format=csv', icon: '↑', pending: 'Preparing CSV…' },
                  { label: 'Approval Report', href: '/api/export/approvals?format=pdf', icon: '📄', pending: 'Preparing PDF…' },
                  { label: 'Risk Analysis',   href: '/trust/compliance',              icon: '⚠', pending: 'Opening…' },
                ].map(({ label, href, icon, pending }) => (
                  <PendingLink
                    key={label}
                    href={href}
                    pendingText={pending}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#152040] p-3 text-center transition hover:border-violet-500/40"
                  >
                    <span className="text-xl">{icon}</span>
                    <span className="text-[10px] font-semibold text-[#6B7FA8]">{label}</span>
                  </PendingLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
