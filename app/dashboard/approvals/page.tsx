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

    // One batch query for the whole visible page instead of one lookup per
    // row - see services/evidence/records.ts's getUnifiedEvidenceIdsForApprovals()
    // for why (avoids an N+1 query per approvals list page load). Degrades
    // to an empty map (every row's evidence link hidden) rather than
    // failing the page if this lookup itself has trouble.
    const evidenceIds = await getUnifiedEvidenceIdsForApprovals(tenant.organization.id, result.records.map((record) => record.id));
    approvals = result.records.map((record) => ({ ...record, evidenceRecordId: evidenceIds.get(record.id) ?? null }));
    isAlert = result.alert;
    // A single slow query (breaker still closed) must never alarm the user
    // — serving a slightly stale result gets a quiet caption, not a banner.
    if (result.degraded && result.source === 'cache' && !result.alert && result.staleAsOfMs) {
      staleNotice = `Last updated ${minutesAgo(result.staleAsOfMs)}.`;
    }
    if (result.alert) {
      loadErrorReference = result.reference ?? null;
      cacheNotice = result.message ?? 'Live database results are delayed.';
    } else if (result.degraded && result.source === 'empty') {
      // Cold cache + no stale fallback, but the breaker hasn't tripped yet
      // (fewer than 3 consecutive failures) — this resolves itself almost
      // always on the very next request, so it gets a calm loading message
      // instead of the alarming "recovering" banner.
      cacheNotice = result.message ?? 'Approval records are loading. Retrying automatically.';
    }
    console.info(`[dashboard] approvals query finished in ${Date.now() - startedAt}ms`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Workspace unavailable.';
    console.error(`[dashboard] approvals query failed after ${Date.now() - startedAt}ms`, error);
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Approval evidence</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Approval history</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Search and filter every captured approval record across Slack, Gmail, and future connectors.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PendingLink href="/approvals/manual" pendingText="Opening recorder..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
            Record manual approval
          </PendingLink>
          <PendingLink href="/api/export/approvals?format=csv" pendingText="Preparing CSV..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Export CSV
          </PendingLink>
          <PendingLink href="/api/export/approvals?format=pdf" pendingText="Preparing PDF..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#07111f] px-4 text-sm font-bold text-white hover:bg-slate-800">
            Export PDF
          </PendingLink>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">Records shown</span>
            <span className="text-2xl font-black text-slate-950">{approvals.length}</span>
          </div>
        </div>
      </div>
      <form id="filters" className="scroll-mt-32 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        {[
          ['q', 'Search approvals'],
          ['employee', 'Approver'],
          ['department', 'Department'],
          ['sourcePlatform', 'Source platform'],
          ['category', 'Category'],
          ['riskLevel', 'Risk level'],
          ['approvalType', 'Approval type'],
        ].map(([name, placeholder]) => (
          <label key={name} className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{placeholder}</span>
            <input name={name} placeholder={placeholder} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
          </label>
        ))}
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">From</span>
          <input name="from" type="date" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">To</span>
          <input name="to" type="date" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
        </label>
        <div className="flex items-end">
          <FormSubmitButton pendingText="Filtering..." className="min-h-0 h-11 w-full rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
            Apply filters
          </FormSubmitButton>
        </div>
      </form>
      {staleNotice ? <p className="-mt-2 text-xs font-bold text-slate-400">{staleNotice}</p> : null}
      {isAlert ? <AutoRetryOnDegraded /> : null}
      {cacheNotice ? (
        <div className={isAlert ? 'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm' : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm'}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className={isAlert ? 'text-sm font-black text-amber-950' : 'text-sm font-black text-slate-950'}>
                {isAlert ? 'Approval records are recovering' : 'Approval records are loading'}
              </h3>
              <p className="mt-1 text-sm leading-6">{cacheNotice}</p>
              {loadErrorReference ? <p className="mt-1 text-xs font-bold opacity-70">Reference: {loadErrorReference}</p> : null}
            </div>
            <PendingLink href="/dashboard/approvals" pendingText="Retrying..." className="inline-flex min-h-0 h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Retry now
            </PendingLink>
          </div>
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
          <h3 className="font-black">Unable to load approvals</h3>
          <p className="mt-1 text-sm">The approval records query returned an error. Your dashboard shell is still available.</p>
          <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs font-semibold">{loadError}</p>
          {loadErrorReference ? <p className="mt-2 text-xs font-bold text-amber-800">Reference: {loadErrorReference}</p> : null}
          <PendingLink href="/dashboard/approvals" pendingText="Retrying..." className="mt-3 inline-flex min-h-0 h-10 items-center justify-center rounded-lg bg-[#2155d9] px-3 text-sm font-bold text-white shadow-sm shadow-blue-200">
            Retry
          </PendingLink>
        </div>
      ) : null}
      {!loadError && approvals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-black text-slate-950">No approval records yet</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Connect Slack or Gmail to start capturing approvals, or generate sample records for a quick demo.</p>
            </div>
            <div className="flex flex-wrap gap-2"><PendingLink href="/approvals/manual" pendingText="Opening recorder..." className="inline-flex h-11 items-center rounded-lg border border-blue-200 bg-white px-5 text-sm font-bold text-[#2155d9]">Record manual approval</PendingLink><form action="/api/demo/seed" method="post">
              <FormSubmitButton pendingText="Generating..." className="min-h-0 h-11 rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200">
                Generate demo data
              </FormSubmitButton>
            </form></div>
          </div>
        </div>
      ) : null}
      <ApprovalTable approvals={approvals} />
    </section>
  );
}
