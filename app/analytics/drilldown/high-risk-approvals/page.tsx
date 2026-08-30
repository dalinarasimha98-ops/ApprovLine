import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { withTimeout } from '@/lib/performance';
import { KPICard } from '@/components/analytics/KPICard';
import { HighRiskTable } from '@/components/analytics/drilldown/HighRiskTable';
import type { HighRiskTableRecord } from '@/components/analytics/drilldown/HighRiskTable';
import { HighRiskFiltersForm } from '@/components/analytics/drilldown/HighRiskFiltersForm';
import type { ApprovalStatus, Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageProps = {
  searchParams: Promise<{
    q?: string;
    department?: string;
    category?: string;
    source?: string;
    riskLevel?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
};

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numberFormat(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Parse businessImpact strings like "$250,000" or "$1.2M" to a numeric value */
function parseBusinessImpact(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const m = cleaned.match(/([\d.]+)([KMBkmb]?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') return num * 1_000;
  if (suffix === 'M') return num * 1_000_000;
  if (suffix === 'B') return num * 1_000_000_000;
  return num;
}

function formatValueAtRisk(total: number): string {
  if (total >= 1_000_000_000) return `$${(total / 1_000_000_000).toFixed(1)}B`;
  if (total >= 1_000_000) return `$${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1_000) return `$${(total / 1_000).toFixed(0)}K`;
  return `$${numberFormat(Math.round(total))}`;
}

function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

// ---------------------------------------------------------------------------
// Card wrappers (matching analytics/page.tsx dark design)
// ---------------------------------------------------------------------------

function DarkCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5 ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-sm font-bold text-white ${className}`}>{children}</h3>
  );
}

// ---------------------------------------------------------------------------
// Distribution mini-bars
// ---------------------------------------------------------------------------

function MiniDistributionBars({
  title,
  items,
  color,
}: {
  title: string;
  items: Array<{ name: string; count: number }>;
  color: string;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <DarkCard>
      <CardTitle>{title}</CardTitle>
      <div className="mt-4 grid gap-2.5">
        {items.length === 0 ? (
          <p className="text-[11px] text-slate-500">No data yet.</p>
        ) : items.map((item) => {
          const pct = Math.round((item.count / total) * 100);
          return (
            <div key={item.name} className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-slate-300">{item.name}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[11px] font-bold text-slate-400">{pct}%</span>
                  <span className="text-[10px] text-slate-600">({numberFormat(item.count)})</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-[#1E2D4A]">
                <div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: color, width: `${Math.max(2, (item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </DarkCard>
  );
}

// ---------------------------------------------------------------------------
// KPI icons (inline SVG)
// ---------------------------------------------------------------------------

const KpiIcons = {
  risk: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  value: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  time: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  evidence: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  approver: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  trend: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function buildPageUrl(query: Record<string, string | undefined>, newPage: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.department) params.set('department', query.department);
  if (query.category) params.set('category', query.category);
  if (query.source) params.set('source', query.source);
  if (query.riskLevel) params.set('riskLevel', query.riskLevel);
  if (query.status) params.set('status', query.status);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDir) params.set('sortDir', query.sortDir);
  params.set('page', String(newPage));
  return `/analytics/drilldown/high-risk-approvals?${params.toString()}`;
}

function buildSortUrl(
  query: Record<string, string | undefined>,
  newSortBy: string,
  newSortDir: string,
): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.department) params.set('department', query.department);
  if (query.category) params.set('category', query.category);
  if (query.source) params.set('source', query.source);
  if (query.riskLevel) params.set('riskLevel', query.riskLevel);
  if (query.status) params.set('status', query.status);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  params.set('sortBy', newSortBy);
  params.set('sortDir', newSortDir);
  params.set('page', '1');
  return `/analytics/drilldown/high-risk-approvals?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Page data loader
// ---------------------------------------------------------------------------

type KpiRecord = {
  businessImpact: string | null;
  evidenceSnippet: string | null;
  approvalTimestamp: Date | null;
  createdAt: Date;
  occurredAt: Date;
};

async function loadHighRiskData(
  organizationId: string,
  filters: {
    q?: string;
    department?: string;
    category?: string;
    source?: string;
    riskLevels: string[];
    status?: string;
    from?: Date;
    to?: Date;
    page: number;
    sortBy: string;
    sortDir: 'asc' | 'desc';
  },
) {
  const { q, department, category, source, riskLevels, status, from, to, page, sortBy, sortDir } = filters;

  const riskOR: Prisma.ApprovalRecordWhereInput['OR'] = riskLevels.length > 0
    ? riskLevels.map((r) => ({ riskLevel: r }))
    : [{ riskLevel: 'high' }, { riskLevel: 'critical' }];

  const searchOR: Prisma.ApprovalRecordWhereInput['OR'] = q ? [
    { subject: { contains: q, mode: 'insensitive' } },
    { approverName: { contains: q, mode: 'insensitive' } },
    { department: { contains: q, mode: 'insensitive' } },
    { category: { contains: q, mode: 'insensitive' } },
  ] : undefined;

  const baseWhere: Prisma.ApprovalRecordWhereInput = {
    ...tenantScopedWhere({ organizationId }),
    OR: riskOR,
    ...(department ? { department: { contains: department, mode: 'insensitive' } } : {}),
    ...(category ? { category: { contains: category, mode: 'insensitive' } } : {}),
    ...(source ? { sourcePlatform: { contains: source, mode: 'insensitive' } } : {}),
    ...(status ? { status: status as ApprovalStatus } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(searchOR ? { AND: [{ OR: riskOR }, { OR: searchOR }] } : {}),
  };

  // When there's a search query, the AND clause overrides the top-level OR,
  // so rebuild without the duplicate top-level OR
  const effectiveWhere: Prisma.ApprovalRecordWhereInput = searchOR
    ? {
        ...tenantScopedWhere({ organizationId }),
        AND: [
          { OR: riskOR },
          { OR: searchOR },
          ...(department ? [{ department: { contains: department, mode: 'insensitive' as const } }] : []),
          ...(category ? [{ category: { contains: category, mode: 'insensitive' as const } }] : []),
          ...(source ? [{ sourcePlatform: { contains: source, mode: 'insensitive' as const } }] : []),
          ...(status ? [{ status: status as ApprovalStatus }] : []),
          ...(from || to ? [{ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }] : []),
        ],
      }
    : baseWhere;

  const allTimeHighRiskWhere: Prisma.ApprovalRecordWhereInput = {
    ...tenantScopedWhere({ organizationId }),
    OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }],
  };

  const orderBy: Prisma.ApprovalRecordOrderByWithRelationInput[] = (() => {
    if (sortBy === 'status') return [{ status: sortDir }, { createdAt: 'desc' as const }];
    if (sortBy === 'createdAt') return [{ createdAt: sortDir }];
    // Default: risk level desc (critical first), then newest
    return [{ riskLevel: sortDir }, { createdAt: 'desc' as const }];
  })();

  const offset = (page - 1) * PAGE_SIZE;

  const [
    filteredTotal,
    allTimeHighRiskCount,
    totalApprovalCount,
    kpiRecords,
    rawTableRecords,
    prevPeriodHighRiskCount,
    uniqueApprovers,
    departments,
    categories,
    sources,
  ] = await Promise.all([
    withTimeout('hr:filteredTotal', prisma.approvalRecord.count({ where: effectiveWhere }), 3000).catch(() => 0),
    withTimeout('hr:allTimeHighRisk', prisma.approvalRecord.count({ where: allTimeHighRiskWhere }), 3000).catch(() => 0),
    withTimeout('hr:totalApprovals', prisma.approvalRecord.count({ where: tenantScopedWhere({ organizationId }) }), 3000).catch(() => 0),

    withTimeout(
      'hr:kpiRecords',
      prisma.approvalRecord.findMany({
        where: allTimeHighRiskWhere,
        select: { businessImpact: true, evidenceSnippet: true, approvalTimestamp: true, createdAt: true, occurredAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      3000,
    ).catch(() => [] as KpiRecord[]),

    withTimeout(
      'hr:tableRecords',
      prisma.approvalRecord.findMany({
        where: effectiveWhere,
        select: {
          id: true,
          subject: true,
          category: true,
          approverName: true,
          department: true,
          riskLevel: true,
          confidence: true,
          businessImpact: true,
          sourcePlatform: true,
          status: true,
          evidenceSnippet: true,
          sourceLink: true,
          createdAt: true,
          occurredAt: true,
          investigations: {
            select: { investigationId: true },
            take: 1,
          },
          auditLogs: {
            select: { id: true },
            take: 1,
          },
        },
        orderBy,
        take: PAGE_SIZE,
        skip: offset,
      }),
      4000,
    ).catch(() => [] as HighRiskTableRecord[]),

    withTimeout(
      'hr:prevPeriod',
      prisma.approvalRecord.count({
        where: {
          ...tenantScopedWhere({ organizationId }),
          OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }],
          createdAt: {
            gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      3000,
    ).catch(() => null as number | null),

    withTimeout(
      'hr:uniqueApprovers',
      prisma.approvalRecord.groupBy({
        by: ['approverName'],
        where: allTimeHighRiskWhere,
        _count: { approverName: true },
      }),
      3000,
    ).catch(() => [] as Array<{ approverName: string | null; _count: { approverName: number } }>),

    withTimeout(
      'hr:departments',
      prisma.approvalRecord.groupBy({
        by: ['department'],
        where: allTimeHighRiskWhere,
        _count: { department: true },
        orderBy: { _count: { department: 'desc' } },
        take: 20,
      }),
      2000,
    ).catch(() => [] as Array<{ department: string | null; _count: { department: number } }>),

    withTimeout(
      'hr:categories',
      prisma.approvalRecord.groupBy({
        by: ['category'],
        where: allTimeHighRiskWhere,
        _count: { category: true },
        orderBy: { _count: { category: 'desc' } },
        take: 20,
      }),
      2000,
    ).catch(() => [] as Array<{ category: string | null; _count: { category: number } }>),

    withTimeout(
      'hr:sources',
      prisma.approvalRecord.groupBy({
        by: ['sourcePlatform'],
        where: allTimeHighRiskWhere,
        _count: { sourcePlatform: true },
        orderBy: { _count: { sourcePlatform: 'desc' } },
        take: 20,
      }),
      2000,
    ).catch(() => [] as Array<{ sourcePlatform: string | null; _count: { sourcePlatform: number } }>),
  ]);

  // KPI calculations
  const withValue = kpiRecords.filter((r) => parseBusinessImpact(r.businessImpact) !== null);
  const totalValueAtRisk = withValue.reduce((sum, r) => sum + (parseBusinessImpact(r.businessImpact) ?? 0), 0);
  const valueAtRiskCount = withValue.length;
  const hasValueData = valueAtRiskCount > 0;

  const evidenceRecords = kpiRecords.filter((r) => r.evidenceSnippet);
  const evidenceCoveragePct = kpiRecords.length > 0
    ? Math.round((evidenceRecords.length / kpiRecords.length) * 100)
    : 0;

  // Avg time from creation to approval timestamp
  const recordsWithTime = kpiRecords.filter((r) => r.approvalTimestamp !== null);
  let avgApprovalTimeHours: number | null = null;
  if (recordsWithTime.length > 0) {
    const totalMs = recordsWithTime.reduce((sum, r) => {
      const endTs = (r.approvalTimestamp as Date).getTime();
      return sum + Math.abs(endTs - r.createdAt.getTime());
    }, 0);
    avgApprovalTimeHours = Math.round((totalMs / recordsWithTime.length / (1000 * 60 * 60)) * 10) / 10;
  }

  const uniqueApproverCount = uniqueApprovers.filter((a) => a.approverName !== null).length;

  const deptDistribution = departments
    .filter((d) => d.department)
    .map((d) => ({ name: d.department!, count: d._count.department }))
    .slice(0, 6);

  const categoryDistribution = categories
    .filter((c) => c.category)
    .map((c) => ({ name: c.category!, count: c._count.category }))
    .slice(0, 6);

  const sourceDistribution = sources
    .filter((s) => s.sourcePlatform)
    .map((s) => ({ name: s.sourcePlatform!, count: s._count.sourcePlatform }))
    .slice(0, 6);

  // Cast table records to component type (Prisma select includes all required fields)
  const tableRecords = rawTableRecords as unknown as HighRiskTableRecord[];

  return {
    filteredTotal,
    allTimeHighRiskCount,
    totalApprovalCount,
    totalValueAtRisk,
    hasValueData,
    valueAtRiskCount,
    evidenceCoveragePct,
    avgApprovalTimeHours,
    uniqueApproverCount,
    prevPeriodHighRiskCount,
    tableRecords,
    deptDistribution,
    categoryDistribution,
    sourceDistribution,
    filterOptions: {
      departments: departments.filter((d) => d.department).map((d) => d.department!),
      categories: categories.filter((c) => c.category).map((c) => c.category!),
      sources: sources.filter((s) => s.sourcePlatform).map((s) => s.sourcePlatform!),
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function HighRiskApprovalsPage({ searchParams }: PageProps) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');
  enforcePageRole('/analytics', tenant.user.role);

  const query = await searchParams;
  const organizationId = tenant.organization.id;

  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const sortBy = query.sortBy ?? 'riskLevel';
  const sortDir = (query.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const riskLevelParam = query.riskLevel ?? 'high,critical';
  const riskLevels = riskLevelParam.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);

  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;

  let data: Awaited<ReturnType<typeof loadHighRiskData>>;
  try {
    data = await loadHighRiskData(organizationId, {
      q: query.q,
      department: query.department,
      category: query.category,
      source: query.source,
      riskLevels,
      status: query.status,
      from,
      to,
      page,
      sortBy,
      sortDir,
    });
  } catch (err) {
    console.error('[high-risk-approvals] page load error', err);
    return (
      <DashboardShell>
        <div className="min-h-screen" style={{ background: '#0A0E1A' }}>
          <section className="grid gap-5 px-1 pb-10">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
              <p className="text-sm font-bold text-red-300">Unable to load high-risk approval data. Please try again.</p>
            </div>
          </section>
        </div>
      </DashboardShell>
    );
  }

  const {
    filteredTotal,
    allTimeHighRiskCount,
    totalApprovalCount,
    totalValueAtRisk,
    hasValueData,
    valueAtRiskCount,
    evidenceCoveragePct,
    avgApprovalTimeHours,
    uniqueApproverCount,
    prevPeriodHighRiskCount,
    tableRecords,
    deptDistribution,
    categoryDistribution,
    sourceDistribution,
  } = data;

  const highRiskPct = totalApprovalCount > 0 ? Math.round((allTimeHighRiskCount / totalApprovalCount) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  const trendStr = prevPeriodHighRiskCount !== null
    ? pctChange(allTimeHighRiskCount, prevPeriodHighRiskCount)
    : null;

  const analyticsBack = `/analytics${from || to ? `?from=${query.from ?? ''}&to=${query.to ?? ''}` : ''}`;

  return (
    <DashboardShell>
      <div className="min-h-screen" style={{ background: '#0A0E1A' }}>
        <section className="grid gap-5 px-1 pb-10">

          {/* Page header */}
          <div className="flex flex-col gap-3 pt-1">
            <Link
              href={analyticsBack}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-violet-400 hover:text-violet-300 transition-colors w-fit"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Executive Analytics
            </Link>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">High-Risk Approvals</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white">High-Risk Approval Records</h1>
                <p className="mt-1 text-sm font-medium text-slate-400">
                  Security, compliance, finance, legal, and procurement-sensitive approvals classified as high or critical risk.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-black text-red-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                  {numberFormat(allTimeHighRiskCount)} High-Risk
                </span>
                <Link
                  href={`/api/export/approvals?riskLevel=high,critical`}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-500 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                </Link>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KPICard
              title="High-Risk Approvals"
              value={numberFormat(allTimeHighRiskCount)}
              icon={KpiIcons.risk}
              accentColor="#EF4444"
              currentNumeric={allTimeHighRiskCount}
              prevValue={prevPeriodHighRiskCount ?? undefined}
              trendLabel={prevPeriodHighRiskCount !== null ? `${trendStr ?? '—'} vs previous 30 days` : `${highRiskPct}% of all approvals`}
            />
            <KPICard
              title="Value at Risk"
              value={hasValueData ? formatValueAtRisk(totalValueAtRisk) : 'N/A'}
              icon={KpiIcons.value}
              accentColor="#F59E0B"
              trendLabel={hasValueData ? `${valueAtRiskCount} records with value data` : 'No financial data captured'}
            />
            <KPICard
              title="Avg Approval Time"
              value={avgApprovalTimeHours !== null ? String(avgApprovalTimeHours) : 'N/A'}
              unit={avgApprovalTimeHours !== null ? 'hrs' : undefined}
              icon={KpiIcons.time}
              accentColor="#0891B2"
              trendLabel={avgApprovalTimeHours !== null ? 'For high-risk records' : 'Insufficient timestamp data'}
            />
            <KPICard
              title="Evidence Coverage"
              value={String(evidenceCoveragePct)}
              unit="%"
              icon={KpiIcons.evidence}
              accentColor={evidenceCoveragePct >= 80 ? '#10B981' : evidenceCoveragePct >= 50 ? '#F59E0B' : '#EF4444'}
              currentNumeric={evidenceCoveragePct}
              trendLabel={`${evidenceCoveragePct >= 80 ? 'Above' : 'Below'} 80% audit threshold`}
            />
            <KPICard
              title="Unique Approvers"
              value={numberFormat(uniqueApproverCount)}
              icon={KpiIcons.approver}
              accentColor="#7C3AED"
              trendLabel="Distinct approvers in high-risk records"
            />
            <KPICard
              title="% of All Approvals"
              value={String(highRiskPct)}
              unit="%"
              icon={KpiIcons.trend}
              accentColor={highRiskPct >= 20 ? '#991B1B' : highRiskPct >= 10 ? '#EF4444' : '#F59E0B'}
              currentNumeric={highRiskPct}
              trendLabel={highRiskPct >= 20 ? 'Critical — above 20% threshold' : highRiskPct >= 10 ? 'Warning — above 10% threshold' : 'Within acceptable range'}
            />
          </div>

          {/* Main content: table + sidebar */}
          <div className="grid gap-5 xl:grid-cols-[1fr_260px]">

            {/* Left: filters + table */}
            <div className="grid gap-5">
              <HighRiskFiltersForm
                values={{
                  q: query.q,
                  department: query.department,
                  category: query.category,
                  source: query.source,
                  riskLevel: query.riskLevel ?? 'high,critical',
                  status: query.status,
                  from: query.from,
                  to: query.to,
                }}
                filterOptions={data.filterOptions}
              />

              <DarkCard className="overflow-hidden !p-0">
                {/* Table header */}
                <div className="border-b border-[#1E2D4A] px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle>High-Risk Records</CardTitle>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {numberFormat(filteredTotal)} record{filteredTotal !== 1 ? 's' : ''}
                        {filteredTotal !== allTimeHighRiskCount && ` (filtered from ${numberFormat(allTimeHighRiskCount)} total)`}
                        {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
                      </p>
                    </div>
                    <Link
                      href={buildSortUrl(query, sortBy, sortDir === 'asc' ? 'desc' : 'asc')}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-400 transition-colors"
                    >
                      Sort: {sortBy} {sortDir === 'asc' ? '↑' : '↓'}
                    </Link>
                  </div>
                </div>

                <HighRiskTable records={tableRecords} />

                {/* Pagination */}
                {filteredTotal > PAGE_SIZE && (
                  <div className="flex items-center justify-between border-t border-[#1E2D4A] px-5 py-3">
                    <p className="text-[11px] text-slate-500">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      {page > 1 && (
                        <Link
                          href={buildPageUrl(query, page - 1)}
                          className="inline-flex h-7 items-center justify-center rounded-lg border border-[#1E2D4A] px-3 text-[11px] font-bold text-slate-300 hover:border-[#2A3F66] hover:text-white transition-colors"
                        >
                          Prev
                        </Link>
                      )}
                      {page < totalPages && (
                        <Link
                          href={buildPageUrl(query, page + 1)}
                          className="inline-flex h-7 items-center justify-center rounded-lg border border-[#1E2D4A] px-3 text-[11px] font-bold text-slate-300 hover:border-[#2A3F66] hover:text-white transition-colors"
                        >
                          Next
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {filteredTotal === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
                      <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-400">
                        {allTimeHighRiskCount === 0 ? 'No high-risk approvals captured yet' : 'No records match your filters'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {allTimeHighRiskCount === 0
                          ? 'Connect integrations and capture approvals to see high-risk records here.'
                          : 'Try adjusting your search or filter criteria.'}
                      </p>
                    </div>
                    {allTimeHighRiskCount > 0 && (
                      <Link
                        href="/analytics/drilldown/high-risk-approvals"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/20 px-3 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-600/30 transition-colors border border-violet-500/20"
                      >
                        Clear all filters
                      </Link>
                    )}
                  </div>
                )}
              </DarkCard>
            </div>

            {/* Right: distribution sidebar */}
            <div className="grid gap-5 content-start xl:sticky xl:top-6">
              <MiniDistributionBars
                title="By Department"
                items={deptDistribution}
                color="#EF4444"
              />
              <MiniDistributionBars
                title="By Category"
                items={categoryDistribution}
                color="#F59E0B"
              />
              <MiniDistributionBars
                title="By Source Platform"
                items={sourceDistribution}
                color="#7C3AED"
              />

              <DarkCard>
                <CardTitle>Quick Actions</CardTitle>
                <div className="mt-3 grid gap-2">
                  {[
                    { label: 'All High-Risk Approvals', href: '/approvals?riskLevel=high' },
                    { label: 'Critical-Only Records', href: '/approvals?riskLevel=critical' },
                    { label: 'Open Investigations', href: '/investigations?status=OPEN' },
                    { label: 'Start New Investigation', href: '/investigations/new' },
                    { label: 'Evidence Platform', href: '/unified-evidence' },
                    { label: 'AI Copilot', href: '/copilot?context=high-risk' },
                  ].map(({ label, href }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-[#2A3F66] hover:text-white transition-colors"
                    >
                      {label}
                      <svg className="h-3 w-3 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </DarkCard>
            </div>
          </div>

        </section>
      </div>
    </DashboardShell>
  );
}
