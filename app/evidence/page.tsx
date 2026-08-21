import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { RefreshButton } from '@/components/system/RefreshButton';
import { getDashboardTenant } from '@/lib/auth';
import { evidenceProviderCatalog } from '@/services/evidence/provider-catalog';
import {
  getLatestUnifiedEvidenceRecordId,
  searchUnifiedEvidence,
} from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

type EvidenceSearchParams = {
  q?: string;
  provider?: string;
  risk?: string;
  page?: string;
};

type EvidencePageProps = {
  searchParams: Promise<EvidenceSearchParams>;
};

function minutesAgo(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes === 0) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

function dateText(value: Date) {
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function riskTone(risk?: string | null) {
  const value = risk?.toUpperCase();
  if (value === 'CRITICAL' || value === 'HIGH') return 'bg-rose-50 text-rose-700';
  if (value === 'MEDIUM') return 'bg-amber-50 text-amber-800';
  if (value === 'LOW') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
}

function verificationTone(status: string) {
  if (status === 'HUMAN_VERIFIED' || status === 'APPROVER_CONFIRMED') {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (status === 'DISPUTED' || status === 'REJECTED') {
    return 'bg-rose-50 text-rose-700';
  }
  return 'bg-blue-50 text-[#2155d9]';
}

function paginationHref(params: EvidenceSearchParams, page: number) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.provider) query.set('provider', params.provider);
  if (params.risk) query.set('risk', params.risk);
  query.set('page', String(page));
  return `/evidence?${query.toString()}`;
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-[104px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse bg-slate-50" />
        ))}
      </div>
    </div>
  );
}

// Split out from the page body and Suspense-wrapped below so this optional
// shortcut (only used for the hero's "View Latest" button) never blocks the
// hero header, search form, or the stats/results sections - which don't
// depend on it - from painting first. It used to sit inline in the page
// function as a plain awaited call, which meant a single record's fetch
// stood between the whole page and its first byte even though only one
// small button in the hero actually needs it.
async function ViewLatestRecordLink({ organizationId }: { organizationId: string }) {
  const latestRecordId = await getLatestUnifiedEvidenceRecordId(organizationId);
  if (!latestRecordId) return null;
  return (
    <PendingLink
      href={`/evidence/${latestRecordId}`}
      pendingText="Opening latest record..."
      className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-sm"
    >
      View Latest
    </PendingLink>
  );
}

async function EvidenceStatsSection({ organizationId, params, page }: { organizationId: string; params: EvidenceSearchParams; page: number }) {
  const data = await searchUnifiedEvidence({
    organizationId,
    query: params.q?.trim() || undefined,
    providerKey: params.provider || undefined,
    riskLevel: params.risk || undefined,
    page,
    pageSize: 25,
  });

  const records = data.records;
  const totalEvidence = records.reduce((sum, record) => sum + record.evidenceCount, 0);
  const verified = records.filter((record) =>
    ['HUMAN_VERIFIED', 'APPROVER_CONFIRMED'].includes(record.verificationStatus),
  ).length;
  const highRisk = records.filter((record) =>
    ['HIGH', 'CRITICAL'].includes(record.riskLevel?.toUpperCase() ?? ''),
  ).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Unified records', data.pagination.total, 'Correlated business decisions'],
        ['Evidence on page', totalEvidence, 'Immutable source events'],
        ['Human verified', verified, 'Confirmed relationships'],
        ['High risk', highRisk, 'Records needing attention'],
      ].map(([label, value, help]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2155d9]">
            {label}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            {Number(value).toLocaleString()}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-500">{help}</p>
        </div>
      ))}
    </div>
  );
}

async function EvidenceResultsSection({ organizationId, params, page }: { organizationId: string; params: EvidenceSearchParams; page: number }) {
  const data = await searchUnifiedEvidence({
    organizationId,
    query: params.q?.trim() || undefined,
    providerKey: params.provider || undefined,
    riskLevel: params.risk || undefined,
    page,
    pageSize: 25,
  });

  const records = data.records;

  if (data.setupRequired) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-xs font-black uppercase tracking-wide text-amber-800">
          Evidence storage unavailable
        </p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">
          Unified evidence is not ready yet
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
          Run <code className="rounded bg-white px-2 py-1">npm run db:deploy</code> against
          the production database, then retry this page.
        </p>
        <p className="mt-3 rounded-xl bg-white p-3 text-xs font-bold text-amber-900">
          Safe diagnostic: {data.message}
        </p>
      </section>
    );
  }

  return (
    <>
      {data.message ? (
        <div
          className={
            data.alert
              ? 'rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm'
              : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm'
          }
        >
          {data.alert ? <AutoRetryOnDegraded /> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className={data.alert ? 'font-black text-amber-950' : 'font-black text-slate-950'}>
                {data.alert ? 'Unified evidence is recovering' : 'Refreshing...'}
              </h3>
              <p className="mt-1 text-sm font-semibold">{data.message}</p>
            </div>
            <RefreshButton className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-70" />
          </div>
        </div>
      ) : null}
      {!data.message && data.staleAsOfMs ? (
        <p className="-mt-2 text-xs font-bold text-slate-400">Last updated {minutesAgo(data.staleAsOfMs)}.</p>
      ) : null}

      {records.length === 0 && !data.degraded ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">
            No matching evidence
          </p>
          <h2 className="mt-3 text-2xl font-black text-slate-950">
            Capture a decision from any source
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Connect a provider, send an event through the Universal Gateway, or record a
            verbal approval. ApprovLine will normalize and correlate it here.
          </p>
        </section>
      ) : records.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black text-slate-950">Unified evidence records</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {data.pagination.total.toLocaleString()} records across all matching sources.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {records.map((record) => (
              <PendingLink
                key={record.id}
                href={`/evidence/${record.id}`}
                pendingText="Opening evidence record..."
                className="grid gap-4 p-5 transition hover:bg-slate-50 lg:grid-cols-[1fr_180px_210px]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${riskTone(record.riskLevel)}`}>
                      {record.riskLevel ?? 'Unscored'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${verificationTone(record.verificationStatus)}`}>
                      {record.verificationStatus.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-3 truncate text-base font-black text-slate-950">{record.subject}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {[record.outcome ?? record.decision, record.category, record.department]
                      .filter(Boolean)
                      .join(' · ') || 'Decision evidence'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Approver</p>
                  <p className="mt-1 text-sm font-black text-slate-800">{record.approverName ?? 'Unknown'}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{record.approverEmail ?? 'No email captured'}</p>
                </div>
                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-900">
                      {record.evidenceCount} evidence · {record.sourceCount} sources
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {record.confidence}% confidence · {dateText(record.lastSeenAt)}
                    </p>
                  </div>
                  <span className="text-xl font-black text-[#2155d9]">→</span>
                </div>
              </PendingLink>
            ))}
          </div>
          {data.pagination.pages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
              <span className="text-sm font-bold text-slate-500">
                Page {data.pagination.page} of {data.pagination.pages}
              </span>
              <div className="flex gap-2">
                {data.pagination.page > 1 ? (
                  <PendingLink
                    href={paginationHref(params, data.pagination.page - 1)}
                    pendingText="Loading previous page..."
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
                  >
                    Previous
                  </PendingLink>
                ) : null}
                {data.pagination.page < data.pagination.pages ? (
                  <PendingLink
                    href={paginationHref(params, data.pagination.page + 1)}
                    pendingText="Loading next page..."
                    className="rounded-lg bg-[#2155d9] px-3 py-2 text-sm font-black text-white"
                  >
                    Next
                  </PendingLink>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

export default async function EvidencePage({ searchParams }: EvidencePageProps) {
  const params = await searchParams;
  const tenant = await getDashboardTenant(6000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    redirect('/onboarding');
  }
  if (!tenant.organization) redirect('/dashboard');

  const organizationId = tenant.organization.id;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  return (
    <DashboardShell>
      <div className="grid gap-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-200">
            Universal Evidence Capture
          </p>
          <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                One decision. One defensible record.
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300 sm:text-base">
                Search normalized approvals and supporting evidence from every connected
                channel, including manually recorded and verbal decisions.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Suspense fallback={null}>
                <ViewLatestRecordLink organizationId={organizationId} />
              </Suspense>
              <PendingLink
                href="/approvals/manual"
                pendingText="Opening manual capture..."
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white"
              >
                Record verbal approval
              </PendingLink>
              <PendingLink
                href="/dashboard/settings/integrations"
                pendingText="Opening integrations..."
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white"
              >
                Manage sources
              </PendingLink>
            </div>
          </div>
        </section>

        <Suspense fallback={<StatsSkeleton />}>
          <EvidenceStatsSection organizationId={organizationId} params={params} page={page} />
        </Suspense>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <form action="/evidence" className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Search
              </span>
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Decision, approver, department, category..."
                className="min-h-11 min-w-0 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-[#2155d9]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Source
              </span>
              <select
                name="provider"
                defaultValue={params.provider ?? ''}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#2155d9]"
              >
                <option value="">All sources</option>
                {evidenceProviderCatalog.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Risk
              </span>
              <select
                name="risk"
                defaultValue={params.risk ?? ''}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#2155d9]"
              >
                <option value="">All risk levels</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <button className="min-h-11 self-end rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
              Apply filters
            </button>
          </form>
        </section>

        <Suspense fallback={<ResultsSkeleton />}>
          <EvidenceResultsSection organizationId={organizationId} params={params} page={page} />
        </Suspense>
      </div>
    </DashboardShell>
  );
}
