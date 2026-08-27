import { getDashboardTenant } from '@/lib/auth';
import { ApprovalTable } from '@/components/dashboard/ApprovalTable';
import type { ApprovalTableRecord } from '@/components/dashboard/ApprovalTable';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { loadDashboardApprovalRecords } from '@/lib/approvalRecords';
import { getUnifiedEvidenceIdsForApprovals } from '@/services/evidence/records';
import { redirect } from 'next/navigation';

function minutesAgo(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes === 0) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

export const dynamic = 'force-dynamic';

// ── Right-rail derivations ─────────────────────────────────────────────────────

function deriveStats(approvals: ApprovalTableRecord[]) {
  const total = approvals.length;
  const approved = approvals.filter((a) => a.status === 'APPROVED').length;
  const pending  = approvals.filter((a) => a.status === 'PENDING_REVIEW').length;
  const rejected = approvals.filter((a) => a.status === 'REJECTED').length;
  const highRisk = approvals.filter((a) =>
    a.riskLevel === 'high' || a.riskLevel === 'critical',
  ).length;
  return { total, approved, pending, rejected, highRisk };
}

function deriveDepartments(approvals: ApprovalTableRecord[]) {
  const map = new Map<string, number>();
  for (const a of approvals) {
    const dept = a.department ?? 'Unassigned';
    map.set(dept, (map.get(dept) ?? 0) + 1);
  }
  return [...map.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
}

// ── Dept bar colours cycling ───────────────────────────────────────────────────
const DEPT_COLORS = [
  'bg-emerald-500', 'bg-violet-500', 'bg-blue-500',
  'bg-amber-500',   'bg-rose-500',   'bg-teal-500',
];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    employee?: string;
    department?: string;
    sourcePlatform?: string;
    category?: string;
    riskLevel?: string;
    approvalType?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const startedAt = Date.now();
  console.info('[dashboard] approvals page start load');
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  const filters = await searchParams;
  let approvals: ApprovalTableRecord[] = [];
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
      ...filters,
    });

    const evidenceIds = await getUnifiedEvidenceIdsForApprovals(tenant.organization.id, result.records.map((r) => r.id));
    approvals = result.records.map((r) => ({ ...r, evidenceRecordId: evidenceIds.get(r.id) ?? null }));
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

  const unlinkedOnPage = approvals.filter((a) => !a.evidenceRecordId).length;
  const stats = deriveStats(approvals);
  const departments = deriveDepartments(approvals);
  const maxDept = departments[0]?.[1] ?? 1;
  const totalOnPage = approvals.length || 1;

  const kpis = [
    { label: 'Total Approvals', value: stats.total,    icon: '◫',  color: 'violet' },
    { label: 'Approved',        value: stats.approved, icon: '✓',  color: 'emerald' },
    { label: 'Pending',         value: stats.pending,  icon: '◷',  color: 'amber' },
    { label: 'Rejected',        value: stats.rejected, icon: '✕',  color: 'rose' },
    { label: 'High Risk',       value: stats.highRisk, icon: '!',  color: 'blue' },
  ] as const;

  const iconBg: Record<string, string> = {
    violet:  'bg-violet-500/10 text-violet-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber:   'bg-amber-500/10 text-amber-400',
    rose:    'bg-rose-500/10 text-rose-400',
    blue:    'bg-blue-500/10 text-blue-400',
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
            <h1 className="text-2xl font-black tracking-tight text-[#E8EEFF] sm:text-3xl">
              Approvals
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-[#6B7FA8]">
              Monitor, track, and manage all approvals across your organization.
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

      {/* ── KPI strip ────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4 transition hover:border-violet-500/30"
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${iconBg[kpi.color]}`}>
                {kpi.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#6B7FA8]">{kpi.label}</p>
                <p className="mt-0.5 font-mono text-2xl font-black tracking-tight text-[#E8EEFF]">
                  {kpi.value.toLocaleString()}
                </p>
              </div>
            </div>
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

      {/* ── Filter bar ───────────────────────────────────── */}
      <form
        id="filters"
        className="scroll-mt-32 rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {(
            [
              ['q',             'Search approvals'],
              ['employee',      'Approver'],
              ['department',    'Department'],
              ['sourcePlatform','Source platform'],
              ['category',      'Category'],
              ['riskLevel',     'Risk level'],
              ['approvalType',  'Approval type'],
            ] as [string, string][]
          ).map(([name, placeholder]) => (
            <label key={name} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">
                {placeholder}
              </span>
              <input
                name={name}
                placeholder={placeholder}
                className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] placeholder:text-[#3D5070] outline-none focus:border-violet-500/60"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">From</span>
            <input
              name="from"
              type="date"
              className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">To</span>
            <input
              name="to"
              type="date"
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
          <h3 className="font-bold">Unable to load approvals</h3>
          <p className="mt-1 text-sm">
            The approval records query returned an error. Your dashboard shell is still available.
          </p>
          <p className="mt-2 rounded-lg bg-black/20 p-2 text-xs font-semibold">{loadError}</p>
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
            No approval records
          </p>
          <h3 className="mt-3 text-xl font-black text-[#E8EEFF]">No approval records yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#6B7FA8]">
            Connect Slack or Gmail to start capturing approvals, or generate sample records for a quick demo.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <PendingLink
              href="/approvals/manual"
              pendingText="Opening recorder…"
              className="rounded-lg border border-[#1E2D4A] bg-[#152040] px-5 py-2 text-sm font-bold text-violet-400 hover:border-violet-500/40"
            >
              Record manual approval
            </PendingLink>
            <form action="/api/demo/seed" method="post">
              <FormSubmitButton
                pendingText="Generating…"
                className="min-h-0 rounded-lg bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-500"
              >
                Generate demo data
              </FormSubmitButton>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Main content: table + right rail ─────────────── */}
      {approvals.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-[1fr_260px]">
          <ApprovalTable approvals={approvals} />

          {/* Right rail */}
          <div className="flex flex-col gap-3">
            {/* Status donut */}
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
              <h3 className="mb-3 font-bold text-[#E8EEFF]">Approvals by Status</h3>
              <div className="flex items-center gap-4">
                <div className="relative h-[80px] w-[80px] flex-shrink-0">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="30" fill="none" stroke="#152040" strokeWidth="10" />
                    {stats.approved > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#22C55E" strokeWidth="10"
                        strokeDasharray={`${(stats.approved / totalOnPage) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                      />
                    ) : null}
                    {stats.pending > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#F59E0B" strokeWidth="10"
                        strokeDasharray={`${(stats.pending / totalOnPage) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform={`rotate(${-90 + (stats.approved / totalOnPage) * 360} 40 40)`}
                      />
                    ) : null}
                    {stats.rejected > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#EF4444" strokeWidth="10"
                        strokeDasharray={`${(stats.rejected / totalOnPage) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform={`rotate(${-90 + ((stats.approved + stats.pending) / totalOnPage) * 360} 40 40)`}
                      />
                    ) : null}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-lg font-black text-[#E8EEFF]">{stats.total}</span>
                    <span className="text-[9px] text-[#6B7FA8]">Total</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Approved', count: stats.approved, pct: Math.round((stats.approved / totalOnPage) * 100), color: 'bg-emerald-400' },
                    { label: 'Pending',  count: stats.pending,  pct: Math.round((stats.pending  / totalOnPage) * 100), color: 'bg-amber-400' },
                    { label: 'Rejected', count: stats.rejected, pct: Math.round((stats.rejected / totalOnPage) * 100), color: 'bg-rose-400' },
                  ].map(({ label, count, pct, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${color}`} />
                      <span className="text-[11px] text-[#6B7FA8]">{label}</span>
                      <span className="ml-auto font-mono text-[11px] font-bold text-[#E8EEFF]">{count}</span>
                      <span className="w-8 text-right text-[10px] text-[#3D5070]">({pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Department breakdown */}
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
                            ({Math.round((count / totalOnPage) * 100)}%)
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
