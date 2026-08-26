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

function riskClass(risk?: string | null) {
  const v = risk?.toUpperCase();
  if (v === 'CRITICAL' || v === 'HIGH')
    return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
  if (v === 'MEDIUM') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  if (v === 'LOW') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  return 'bg-slate-700/40 text-slate-400 border border-slate-600/30';
}

function riskCircleClass(risk?: string | null) {
  const v = risk?.toUpperCase();
  if (v === 'CRITICAL' || v === 'HIGH') return 'bg-rose-500/10 text-rose-400';
  if (v === 'MEDIUM') return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

function verificationClass(status: string) {
  if (status === 'HUMAN_VERIFIED' || status === 'APPROVER_CONFIRMED')
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (status === 'DISPUTED' || status === 'REJECTED')
    return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
  return 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
}

function providerDot(provider: string) {
  const map: Record<string, string> = {
    slack: 'bg-rose-500',
    gmail: 'bg-orange-500',
    outlook: 'bg-blue-500',
    microsoft_teams: 'bg-indigo-500',
    teams: 'bg-indigo-500',
    jira: 'bg-blue-600',
    zoom: 'bg-blue-400',
    servicenow: 'bg-green-500',
    universal_gateway: 'bg-violet-500',
  };
  return map[provider] ?? 'bg-slate-500';
}

function paginationHref(params: EvidenceSearchParams, page: number) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.provider) query.set('provider', params.provider);
  if (params.risk) query.set('risk', params.risk);
  query.set('page', String(page));
  return `/evidence?${query.toString()}`;
}

// ── Skeleton loaders ───────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-[#1E2D4A] bg-[#0E1830]" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-[#1E2D4A] bg-[#0E1830]">
      <div className="border-b border-[#1E2D4A] px-5 py-3.5">
        <div className="h-4 w-40 animate-pulse rounded bg-[#152040]" />
      </div>
      <div className="divide-y divide-[#1E2D4A]/60">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse bg-[#0a1524]" />
        ))}
      </div>
    </div>
  );
}

// ── "View Latest" button (Suspense-isolated so it never blocks the page) ───────

async function ViewLatestRecordLink({ organizationId }: { organizationId: string }) {
  const latestRecordId = await getLatestUnifiedEvidenceRecordId(organizationId);
  if (!latestRecordId) return null;
  return (
    <PendingLink
      href={`/evidence/${latestRecordId}`}
      pendingText="Opening latest record..."
      className="rounded-lg bg-white/10 border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 transition"
    >
      View latest →
    </PendingLink>
  );
}

// ── KPI stats strip ────────────────────────────────────────────────────────────

async function EvidenceStatsSection({
  organizationId,
  params,
  page,
}: {
  organizationId: string;
  params: EvidenceSearchParams;
  page: number;
}) {
  const data = await searchUnifiedEvidence({
    organizationId,
    query: params.q?.trim() || undefined,
    providerKey: params.provider || undefined,
    riskLevel: params.risk || undefined,
    page,
    pageSize: 25,
  });

  const records = data.records;
  const totalEvidence = records.reduce((sum, r) => sum + r.evidenceCount, 0);
  const verified = records.filter((r) =>
    ['HUMAN_VERIFIED', 'APPROVER_CONFIRMED'].includes(r.verificationStatus),
  ).length;
  const highRisk = records.filter((r) =>
    ['HIGH', 'CRITICAL'].includes(r.riskLevel?.toUpperCase() ?? ''),
  ).length;

  const tiles = [
    {
      label: 'Unified Records',
      value: data.pagination.total,
      sub: 'Correlated decisions',
      icon: '⬡',
      color: 'violet',
    },
    {
      label: 'Evidence on Page',
      value: totalEvidence,
      sub: 'Immutable source events',
      icon: '📄',
      color: 'blue',
    },
    {
      label: 'Human Verified',
      value: verified,
      sub: 'Confirmed relationships',
      icon: '✓',
      color: 'emerald',
    },
    {
      label: 'High Risk',
      value: highRisk,
      sub: 'Needs attention',
      icon: '!',
      color: 'rose',
    },
  ] as const;

  const iconBg: Record<string, string> = {
    violet: 'bg-violet-500/10 text-violet-400',
    blue:   'bg-blue-500/10 text-blue-400',
    emerald:'bg-emerald-500/10 text-emerald-400',
    rose:   'bg-rose-500/10 text-rose-400',
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4 transition hover:border-violet-500/30"
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base font-bold ${iconBg[tile.color]}`}>
              {tile.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#6B7FA8]">{tile.label}</p>
              <p className="mt-0.5 font-mono text-2xl font-black tracking-tight text-[#E8EEFF]">
                {Number(tile.value).toLocaleString()}
              </p>
              <p className="mt-0.5 text-[11px] text-[#3D5070]">{tile.sub}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Evidence records table + right rail ────────────────────────────────────────

async function EvidenceResultsSection({
  organizationId,
  params,
  page,
}: {
  organizationId: string;
  params: EvidenceSearchParams;
  page: number;
}) {
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
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
        <p className="text-xs font-black uppercase tracking-wide text-amber-400">
          Evidence storage unavailable
        </p>
        <h2 className="mt-2 text-xl font-black text-[#E8EEFF]">
          Unified evidence is not ready yet
        </h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-300/80">
          Run <code className="rounded bg-black/30 px-2 py-0.5">npm run db:deploy</code> against
          the production database, then retry this page.
        </p>
        <p className="mt-3 rounded-lg bg-black/20 p-3 text-xs font-bold text-amber-300/70">
          {data.message}
        </p>
      </div>
    );
  }

  // ── Right-rail aggregations (derived from fetched records) ─────────────────
  const verifiedCount = records.filter((r) =>
    ['HUMAN_VERIFIED', 'APPROVER_CONFIRMED'].includes(r.verificationStatus),
  ).length;
  const disputedCount = records.filter((r) =>
    ['DISPUTED', 'REJECTED'].includes(r.verificationStatus),
  ).length;
  const pendingCount = records.length - verifiedCount - disputedCount;

  // Provider source breakdown
  const providerCounts = new Map<string, number>();
  for (const record of records) {
    for (const p of record.providers ?? []) {
      providerCounts.set(p, (providerCounts.get(p) ?? 0) + 1);
    }
  }
  const topProviders = [...providerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Category / decision-type breakdown
  const categoryCounts = new Map<string, number>();
  for (const record of records) {
    const key = record.category || record.decision || 'Other';
    categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
  }
  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const maxCat = topCategories[0]?.[1] ?? 1;
  const totalOnPage = records.length || 1;

  return (
    <>
      {/* Degraded / stale banners */}
      {data.message ? (
        <div
          className={
            data.alert
              ? 'rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-200'
              : 'rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4 text-[#6B7FA8]'
          }
        >
          {data.alert ? <AutoRetryOnDegraded /> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">
                {data.alert ? 'Unified evidence is recovering' : 'Refreshing…'}
              </h3>
              <p className="mt-1 text-sm">{data.message}</p>
            </div>
            <RefreshButton className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 text-sm font-bold text-[#E8EEFF] disabled:opacity-50" />
          </div>
        </div>
      ) : null}
      {!data.message && data.staleAsOfMs ? (
        <p className="-mt-2 text-xs font-semibold text-[#3D5070]">
          Last updated {minutesAgo(data.staleAsOfMs)}.
        </p>
      ) : null}

      {/* Empty state */}
      {records.length === 0 && !data.degraded ? (
        <div className="rounded-xl border border-dashed border-[#1E2D4A] bg-[#0E1830]/50 p-12 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-violet-400">
            No matching evidence
          </p>
          <h2 className="mt-3 text-2xl font-black text-[#E8EEFF]">
            Capture a decision from any source
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#6B7FA8]">
            Connect a provider, send an event through the Universal Gateway, or record a verbal
            approval. ApprovLine will normalize and correlate it here.
          </p>
        </div>
      ) : records.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_272px]">
          {/* ── Records table ─────────────────────────────── */}
          <div className="overflow-hidden rounded-xl border border-[#1E2D4A] bg-[#0E1830]">
            {/* Table header */}
            <div className="flex items-center justify-between border-b border-[#1E2D4A] bg-[#152040]/50 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-[#E8EEFF]">Evidence Records</span>
                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-400">
                  {data.pagination.total.toLocaleString()}
                </span>
              </div>
              <span className="text-xs font-semibold text-[#6B7FA8]">
                Page {data.pagination.page} of {data.pagination.pages}
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[minmax(0,1fr)_130px_110px_80px] gap-0 border-b border-[#1E2D4A]/60 bg-[#0a1524] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#6B7FA8]">
              <span>Title / Decision</span>
              <span>Approver</span>
              <span>Status</span>
              <span className="text-right">Confidence</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#1E2D4A]/40">
              {records.map((record) => (
                <PendingLink
                  key={record.id}
                  href={`/evidence/${record.id}`}
                  pendingText="Opening evidence record…"
                  className="grid grid-cols-[minmax(0,1fr)_130px_110px_80px] items-center gap-0 px-4 py-3 transition hover:bg-[#152040]"
                >
                  {/* Title + meta */}
                  <div className="min-w-0 pr-3">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {(record.providers ?? []).slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className={`h-1.5 w-1.5 rounded-full ${providerDot(p)}`}
                        />
                      ))}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${riskClass(record.riskLevel)}`}>
                        {record.riskLevel ?? 'unscored'}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold text-[#E8EEFF]">
                      {record.subject}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#6B7FA8]">
                      {[record.outcome ?? record.decision, record.category, record.department]
                        .filter(Boolean)
                        .join(' · ') || 'Decision evidence'}
                    </p>
                  </div>

                  {/* Approver */}
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-sm font-semibold text-[#E8EEFF]">
                      {record.approverName ?? 'Unknown'}
                    </p>
                    <p className="truncate text-[11px] text-[#6B7FA8]">
                      {record.approverEmail ?? 'No email captured'}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${verificationClass(record.verificationStatus)}`}>
                      {record.verificationStatus.replaceAll('_', ' ')}
                    </span>
                    <p className="mt-1 text-[11px] text-[#3D5070]">{dateText(record.lastSeenAt)}</p>
                  </div>

                  {/* Confidence */}
                  <div className="text-right">
                    <span className={`font-mono text-sm font-bold ${riskCircleClass(record.riskLevel)}`}>
                      {record.confidence}%
                    </span>
                    <p className="mt-0.5 text-[10px] text-[#3D5070]">
                      {record.evidenceCount}ev · {record.sourceCount}src
                    </p>
                  </div>
                </PendingLink>
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.pages > 1 ? (
              <div className="flex items-center justify-between border-t border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
                <span className="text-xs font-semibold text-[#6B7FA8]">
                  Showing {(data.pagination.page - 1) * 25 + 1}–
                  {Math.min(data.pagination.page * 25, data.pagination.total).toLocaleString()} of{' '}
                  {data.pagination.total.toLocaleString()}
                </span>
                <div className="flex gap-1.5">
                  {data.pagination.page > 1 ? (
                    <PendingLink
                      href={paginationHref(params, data.pagination.page - 1)}
                      pendingText="Loading previous page…"
                      className="rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 py-1.5 text-xs font-bold text-[#E8EEFF] hover:border-violet-500/40"
                    >
                      ← Prev
                    </PendingLink>
                  ) : null}
                  {data.pagination.page < data.pagination.pages ? (
                    <PendingLink
                      href={paginationHref(params, data.pagination.page + 1)}
                      pendingText="Loading next page…"
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500"
                    >
                      Next →
                    </PendingLink>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* ── Right rail ────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            {/* Evidence Overview donut */}
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
              <h3 className="mb-3 font-bold text-[#E8EEFF]">Evidence Overview</h3>
              <div className="flex items-center gap-4">
                {/* SVG donut */}
                <div className="relative h-[80px] w-[80px] flex-shrink-0">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="30" fill="none" stroke="#152040" strokeWidth="10" />
                    {verifiedCount > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#22C55E" strokeWidth="10"
                        strokeDasharray={`${(verifiedCount / totalOnPage) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                      />
                    ) : null}
                    {pendingCount > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#F59E0B" strokeWidth="10"
                        strokeDasharray={`${(pendingCount / totalOnPage) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform={`rotate(${-90 + (verifiedCount / totalOnPage) * 360} 40 40)`}
                      />
                    ) : null}
                    {disputedCount > 0 ? (
                      <circle
                        cx="40" cy="40" r="30" fill="none" stroke="#EF4444" strokeWidth="10"
                        strokeDasharray={`${(disputedCount / totalOnPage) * 188.4} 188.4`}
                        strokeLinecap="round"
                        transform={`rotate(${-90 + ((verifiedCount + pendingCount) / totalOnPage) * 360} 40 40)`}
                      />
                    ) : null}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-lg font-black text-[#E8EEFF]">{records.length}</span>
                    <span className="text-[9px] text-[#6B7FA8]">on page</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Verified', count: verifiedCount, color: 'bg-emerald-400' },
                    { label: 'Pending',  count: pendingCount,  color: 'bg-amber-400'   },
                    { label: 'Disputed', count: disputedCount, color: 'bg-rose-400'    },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${color}`} />
                      <span className="text-[11px] text-[#6B7FA8]">{label}</span>
                      <span className="ml-auto font-mono text-[11px] font-bold text-[#E8EEFF]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sources breakdown */}
            {topProviders.length > 0 ? (
              <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
                <h3 className="mb-3 font-bold text-[#E8EEFF]">Sources</h3>
                <div className="flex flex-col gap-2.5">
                  {topProviders.map(([provider, count]) => {
                    const pct = Math.round((count / totalOnPage) * 100);
                    return (
                      <div key={provider}>
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${providerDot(provider)}`} />
                          <span className="flex-1 text-[11px] font-medium capitalize text-[#E8EEFF]">
                            {provider.replaceAll('_', ' ')}
                          </span>
                          <span className="font-mono text-[11px] text-[#6B7FA8]">{count}</span>
                          <span className="w-8 text-right text-[10px] text-[#3D5070]">{pct}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-[#152040]">
                          <div
                            className={`h-full rounded-full ${providerDot(provider)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Top decision types */}
            {topCategories.length > 0 ? (
              <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
                <h3 className="mb-3 font-bold text-[#E8EEFF]">Decision Types</h3>
                <div className="flex flex-col gap-2.5">
                  {topCategories.map(([cat, count]) => {
                    const pct = Math.round((count / maxCat) * 100);
                    return (
                      <div key={cat} className="flex items-center gap-2.5">
                        <span className="flex-1 truncate text-[11px] text-[#E8EEFF]">{cat}</span>
                        <div className="h-1.5 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[#152040]">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-5 text-right font-mono text-[11px] text-[#6B7FA8]">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

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
      <div className="flex flex-col gap-5">
        {/* ── Page header ───────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-5">
          <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-violet-400">
            Universal Evidence Capture
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#E8EEFF] sm:text-3xl">
                Unified Evidence
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-[#6B7FA8]">
                Your single source of truth for all approvals, decisions, and related evidence
                across the organization.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Suspense fallback={null}>
                <ViewLatestRecordLink organizationId={organizationId} />
              </Suspense>
              <PendingLink
                href="/approvals/manual"
                pendingText="Opening manual capture…"
                className="rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 py-2 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40 transition"
              >
                Record verbal approval
              </PendingLink>
              <PendingLink
                href="/dashboard/settings/integrations"
                pendingText="Opening integrations…"
                className="rounded-lg border border-[#1E2D4A] bg-[#152040] px-4 py-2 text-sm font-bold text-[#E8EEFF] hover:border-violet-500/40 transition"
              >
                Manage sources
              </PendingLink>
            </div>
          </div>
        </div>

        {/* ── KPI strip ─────────────────────────────────── */}
        <Suspense fallback={<KpiSkeleton />}>
          <EvidenceStatsSection organizationId={organizationId} params={params} page={page} />
        </Suspense>

        {/* ── Filter bar ────────────────────────────────── */}
        <form
          action="/evidence"
          className="overflow-hidden rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_160px_auto]">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">
                Search
              </span>
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Decision, approver, department, category…"
                className="h-9 min-w-0 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] placeholder:text-[#3D5070] outline-none focus:border-violet-500/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">
                Source
              </span>
              <select
                name="provider"
                defaultValue={params.provider ?? ''}
                className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
              >
                <option value="">All sources</option>
                {evidenceProviderCatalog.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#6B7FA8]">
                Risk
              </span>
              <select
                name="risk"
                defaultValue={params.risk ?? ''}
                className="h-9 rounded-lg border border-[#1E2D4A] bg-[#152040] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/60"
              >
                <option value="">All risk levels</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <button
              type="submit"
              className="h-9 self-end rounded-lg bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-500"
            >
              Apply filters
            </button>
          </div>
        </form>

        {/* ── Records table + right rail ─────────────────── */}
        <Suspense fallback={<TableSkeleton />}>
          <EvidenceResultsSection organizationId={organizationId} params={params} page={page} />
        </Suspense>
      </div>
    </DashboardShell>
  );
}
