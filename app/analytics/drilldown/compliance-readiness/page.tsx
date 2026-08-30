import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { withTimeout } from '@/lib/performance';
import { KPICard } from '@/components/analytics/KPICard';
import { SVGDonutChart } from '@/components/analytics/SVGDonutChart';
import { ComplianceTable } from '@/components/analytics/drilldown/ComplianceTable';
import type { ComplianceTableRecord } from '@/components/analytics/drilldown/ComplianceTable';
import { ComplianceFiltersForm } from '@/components/analytics/drilldown/ComplianceFiltersForm';
import { ComplianceInsightsPanel } from '@/components/analytics/drilldown/ComplianceInsightsPanel';
import type { ComplianceInsight } from '@/components/analytics/drilldown/ComplianceInsightsPanel';
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

/**
 * Per-record compliance score (0–100).
 *
 * Priority: if the record has an ApprovalComplianceEvaluation, use that score.
 * Otherwise derive from four signals (+25 each):
 *   1. Approver identified (approverName not null)
 *   2. Evidence present (evidenceSnippet not null OR evidenceAssociationCount > 0)
 *   3. Decision made (status !== PENDING_REVIEW)
 *   4. Source identified (sourcePlatform not null)
 */
function deriveComplianceScore(record: {
  approverName: string | null;
  evidenceSnippet: string | null;
  status: string;
  sourcePlatform: string | null;
  evidenceAssociationCount: number;
  evalScore: number | null;
}): number {
  if (record.evalScore !== null) {
    return Math.max(0, Math.min(100, record.evalScore));
  }
  let score = 0;
  if (record.approverName) score += 25;
  if (record.evidenceSnippet || record.evidenceAssociationCount > 0) score += 25;
  if (record.status?.toUpperCase() !== 'PENDING_REVIEW') score += 25;
  if (record.sourcePlatform) score += 25;
  return score;
}

/**
 * Per-record evidence coverage estimate (0–100).
 *
 * ClassifierResult has no evidenceCoverage field, so we estimate:
 *   0   – no evidenceSnippet, no evidenceAssociations, no messageSource
 *   50  – messageSource exists but no evidenceAssociation
 *   75  – evidenceAssociation exists OR evidenceSnippet present
 */
function deriveEvidenceCoverage(record: {
  evidenceSnippet: string | null;
  messageSourceId: string | null;
  evidenceAssociationCount: number;
}): number {
  if (record.evidenceAssociationCount > 0 || record.evidenceSnippet) return 75;
  if (record.messageSourceId) return 50;
  return 0;
}

// ---------------------------------------------------------------------------
// Card wrappers
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
// KPI icons
// ---------------------------------------------------------------------------

const KpiIcons = {
  compliance: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  risk: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  pending: (
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
  audit: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Donut legend
// ---------------------------------------------------------------------------

function DonutLegend({
  segments,
  total,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  return (
    <div className="grid gap-1.5 min-w-0">
      {segments.map((seg) => {
        const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
        return (
          <div key={seg.label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[10px] font-medium text-slate-400 truncate">{seg.label}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-bold text-white">{pct}%</span>
              <span className="text-[10px] text-slate-600">({numberFormat(seg.value)})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  return `/analytics/drilldown/compliance-readiness?${params.toString()}`;
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
  return `/analytics/drilldown/compliance-readiness?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Raw record type from Prisma query
// ---------------------------------------------------------------------------

type RawKpiRecord = {
  id: string;
  approverName: string | null;
  evidenceSnippet: string | null;
  status: string;
  sourcePlatform: string | null;
  messageSourceId: string | null;
  department: string | null;
  category: string | null;
  _count: { evidenceAssociations: number };
  complianceEvaluations: Array<{ score: number }>;
};

type RawTableRecord = {
  id: string;
  subject: string;
  category: string | null;
  approverName: string | null;
  department: string | null;
  riskLevel: string | null;
  sourcePlatform: string | null;
  status: string;
  evidenceSnippet: string | null;
  messageSourceId: string | null;
  createdAt: Date;
  _count: { evidenceAssociations: number };
  complianceEvaluations: Array<{ score: number }>;
  investigations: Array<{ investigationId: string }>;
  auditLogs: Array<{ id: string }>;
};

// ---------------------------------------------------------------------------
// Data loader
// ---------------------------------------------------------------------------

async function loadComplianceData(
  organizationId: string,
  filters: {
    q?: string;
    department?: string;
    category?: string;
    source?: string;
    riskLevel?: string;
    status?: string;
    from?: Date;
    to?: Date;
    page: number;
    sortBy: string;
    sortDir: 'asc' | 'desc';
  },
) {
  const { q, department, category, source, riskLevel, status, from, to, page, sortBy, sortDir } = filters;

  // Build effective where clause for filtered table view
  const searchOR: Prisma.ApprovalRecordWhereInput['OR'] = q
    ? [
        { subject: { contains: q, mode: 'insensitive' } },
        { approverName: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ]
    : undefined;

  const baseFilterClauses: Prisma.ApprovalRecordWhereInput[] = [
    ...(department ? [{ department: { contains: department, mode: 'insensitive' as const } }] : []),
    ...(category ? [{ category: { contains: category, mode: 'insensitive' as const } }] : []),
    ...(source ? [{ sourcePlatform: { contains: source, mode: 'insensitive' as const } }] : []),
    ...(riskLevel ? [{ riskLevel: { contains: riskLevel, mode: 'insensitive' as const } }] : []),
    ...(status ? [{ status: status as ApprovalStatus }] : []),
    ...(from || to ? [{ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }] : []),
  ];

  const effectiveWhere: Prisma.ApprovalRecordWhereInput = searchOR
    ? {
        ...tenantScopedWhere({ organizationId }),
        AND: [{ OR: searchOR }, ...baseFilterClauses],
      }
    : {
        ...tenantScopedWhere({ organizationId }),
        ...(baseFilterClauses.length > 0 ? { AND: baseFilterClauses } : {}),
      };

  const allRecordsWhere: Prisma.ApprovalRecordWhereInput = tenantScopedWhere({ organizationId });

  // Table ordering
  const orderBy: Prisma.ApprovalRecordOrderByWithRelationInput[] = (() => {
    if (sortBy === 'status') return [{ status: sortDir }, { createdAt: 'desc' as const }];
    if (sortBy === 'createdAt') return [{ createdAt: sortDir }];
    return [{ createdAt: 'desc' as const }];
  })();

  const offset = (page - 1) * PAGE_SIZE;

  const kpiSelect = {
    id: true,
    approverName: true,
    evidenceSnippet: true,
    status: true,
    sourcePlatform: true,
    messageSourceId: true,
    department: true,
    category: true,
    _count: { select: { evidenceAssociations: true } },
    complianceEvaluations: {
      select: { score: true },
      take: 1,
      orderBy: { createdAt: 'desc' as const },
    },
  } satisfies Prisma.ApprovalRecordSelect;

  const tableSelect = {
    id: true,
    subject: true,
    category: true,
    approverName: true,
    department: true,
    riskLevel: true,
    sourcePlatform: true,
    status: true,
    evidenceSnippet: true,
    messageSourceId: true,
    createdAt: true,
    _count: { select: { evidenceAssociations: true } },
    complianceEvaluations: {
      select: { score: true },
      take: 1,
      orderBy: { createdAt: 'desc' as const },
    },
    investigations: { select: { investigationId: true }, take: 1 },
    auditLogs: { select: { id: true }, take: 1 },
  } satisfies Prisma.ApprovalRecordSelect;

  const [
    filteredTotal,
    totalCount,
    kpiRaw,
    tableRaw,
    departments,
    categories,
    sources,
  ] = await Promise.all([
    withTimeout('cr:filteredTotal', prisma.approvalRecord.count({ where: effectiveWhere }), 3000).catch(() => 0),
    withTimeout('cr:totalCount', prisma.approvalRecord.count({ where: allRecordsWhere }), 3000).catch(() => 0),

    // KPI sample — first 500 records for scoring
    withTimeout(
      'cr:kpiSample',
      prisma.approvalRecord.findMany({
        where: allRecordsWhere,
        select: kpiSelect,
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      4000,
    ).catch(() => [] as RawKpiRecord[]),

    // Table page
    withTimeout(
      'cr:tablePage',
      prisma.approvalRecord.findMany({
        where: effectiveWhere,
        select: tableSelect,
        orderBy,
        take: PAGE_SIZE,
        skip: offset,
      }),
      4000,
    ).catch(() => [] as RawTableRecord[]),

    // Department distribution (all records)
    withTimeout(
      'cr:departments',
      prisma.approvalRecord.groupBy({
        by: ['department'],
        where: allRecordsWhere,
        _count: { department: true },
        orderBy: { _count: { department: 'desc' } },
        take: 20,
      }),
      2000,
    ).catch(() => [] as Array<{ department: string | null; _count: { department: number } }>),

    // Category distribution (all records)
    withTimeout(
      'cr:categories',
      prisma.approvalRecord.groupBy({
        by: ['category'],
        where: allRecordsWhere,
        _count: { category: true },
        orderBy: { _count: { category: 'desc' } },
        take: 20,
      }),
      2000,
    ).catch(() => [] as Array<{ category: string | null; _count: { category: number } }>),

    // Source distribution (all records)
    withTimeout(
      'cr:sources',
      prisma.approvalRecord.groupBy({
        by: ['sourcePlatform'],
        where: allRecordsWhere,
        _count: { sourcePlatform: true },
        orderBy: { _count: { sourcePlatform: 'desc' } },
        take: 20,
      }),
      2000,
    ).catch(() => [] as Array<{ sourcePlatform: string | null; _count: { sourcePlatform: number } }>),
  ]);

  // ---------------------------------------------------------------------------
  // KPI computation over the sample
  // ---------------------------------------------------------------------------

  const sampleTotal = kpiRaw.length;

  const scoredSample = (kpiRaw as RawKpiRecord[]).map((r) => {
    const evalScore = r.complianceEvaluations[0]?.score ?? null;
    const cs = deriveComplianceScore({
      approverName: r.approverName,
      evidenceSnippet: r.evidenceSnippet,
      status: r.status,
      sourcePlatform: r.sourcePlatform,
      evidenceAssociationCount: r._count.evidenceAssociations,
      evalScore,
    });
    const ev = deriveEvidenceCoverage({
      evidenceSnippet: r.evidenceSnippet,
      messageSourceId: r.messageSourceId,
      evidenceAssociationCount: r._count.evidenceAssociations,
    });
    return { ...r, complianceScore: cs, evidenceCoverage: ev };
  });

  const overallComplianceScore =
    sampleTotal > 0
      ? Math.round(scoredSample.reduce((sum, r) => sum + r.complianceScore, 0) / sampleTotal)
      : 0;

  const atRiskCount = scoredSample.filter((r) => r.complianceScore < 70).length;

  // Scale at-risk count to full population if sampling
  const atRiskEstimate =
    sampleTotal > 0 && totalCount > sampleTotal
      ? Math.round((atRiskCount / sampleTotal) * totalCount)
      : atRiskCount;

  const pendingCount = sampleTotal > 0
    ? (sampleTotal < totalCount
      ? Math.round(((kpiRaw as RawKpiRecord[]).filter((r) => r.status?.toUpperCase() === 'PENDING_REVIEW').length / sampleTotal) * totalCount)
      : (kpiRaw as RawKpiRecord[]).filter((r) => r.status?.toUpperCase() === 'PENDING_REVIEW').length)
    : 0;

  const avgEvidenceCoverage =
    sampleTotal > 0
      ? Math.round(scoredSample.reduce((sum, r) => sum + r.evidenceCoverage, 0) / sampleTotal)
      : 0;

  const approverPresentCount = scoredSample.filter((r) => r.approverName !== null).length;
  const approverPresencePct =
    sampleTotal > 0 ? Math.round((approverPresentCount / sampleTotal) * 100) : 0;

  const bothEvidenceAndApproverCount = scoredSample.filter(
    (r) => r.approverName !== null && (r.evidenceCoverage > 0),
  ).length;
  const auditTrailPct =
    sampleTotal > 0 ? Math.round((bothEvidenceAndApproverCount / sampleTotal) * 100) : 0;

  // ---------------------------------------------------------------------------
  // Table records — score each
  // ---------------------------------------------------------------------------

  const tableRecords: ComplianceTableRecord[] = (tableRaw as RawTableRecord[]).map((r) => {
    const evalScore = r.complianceEvaluations[0]?.score ?? null;
    const cs = deriveComplianceScore({
      approverName: r.approverName,
      evidenceSnippet: r.evidenceSnippet,
      status: r.status,
      sourcePlatform: r.sourcePlatform,
      evidenceAssociationCount: r._count.evidenceAssociations,
      evalScore,
    });
    const ev = deriveEvidenceCoverage({
      evidenceSnippet: r.evidenceSnippet,
      messageSourceId: r.messageSourceId,
      evidenceAssociationCount: r._count.evidenceAssociations,
    });
    return {
      id: r.id,
      subject: r.subject,
      category: r.category,
      approverName: r.approverName,
      department: r.department,
      riskLevel: r.riskLevel,
      sourcePlatform: r.sourcePlatform,
      status: r.status,
      evidenceSnippet: r.evidenceSnippet,
      messageSourceId: r.messageSourceId,
      createdAt: r.createdAt,
      complianceScore: cs,
      evidenceCoverage: ev,
      investigations: r.investigations,
      auditLogs: r.auditLogs,
      _evidenceAssociationCount: r._count.evidenceAssociations,
    };
  });

  // ---------------------------------------------------------------------------
  // Distribution data for donuts
  // ---------------------------------------------------------------------------

  const deptDistribution = (departments as Array<{ department: string | null; _count: { department: number } }>)
    .filter((d) => d.department)
    .map((d) => ({ name: d.department!, count: d._count.department }))
    .slice(0, 8);

  const categoryDistribution = (categories as Array<{ category: string | null; _count: { category: number } }>)
    .filter((c) => c.category)
    .map((c) => ({ name: c.category!, count: c._count.category }))
    .slice(0, 7);

  const sourceDistribution = (sources as Array<{ sourcePlatform: string | null; _count: { sourcePlatform: number } }>)
    .filter((s) => s.sourcePlatform)
    .map((s) => ({ name: s.sourcePlatform!, count: s._count.sourcePlatform }))
    .slice(0, 6);

  // ---------------------------------------------------------------------------
  // Filter options
  // ---------------------------------------------------------------------------

  const filterOptions = {
    departments: deptDistribution.map((d) => d.name),
    categories: categoryDistribution.map((c) => c.name),
    sources: sourceDistribution.map((s) => s.name),
  };

  return {
    filteredTotal,
    totalCount,
    overallComplianceScore,
    atRiskEstimate,
    pendingCount,
    avgEvidenceCoverage,
    approverPresencePct,
    auditTrailPct,
    tableRecords,
    deptDistribution,
    categoryDistribution,
    sourceDistribution,
    filterOptions,
    sampleTotal,
  };
}

// ---------------------------------------------------------------------------
// Insight generation
// ---------------------------------------------------------------------------

function generateInsights(data: {
  overallComplianceScore: number;
  atRiskEstimate: number;
  totalCount: number;
  avgEvidenceCoverage: number;
  pendingCount: number;
}): ComplianceInsight[] {
  const insights: ComplianceInsight[] = [];
  const { overallComplianceScore, atRiskEstimate, totalCount, avgEvidenceCoverage, pendingCount } = data;

  // 1. Overall score
  if (overallComplianceScore < 40) {
    insights.push({
      id: 'score-critical',
      type: 'critical',
      title: `Compliance score at ${overallComplianceScore}% — immediate action required`,
      description: `Your workspace compliance score is critically low. ${atRiskEstimate} of ${numberFormat(totalCount)} records are below the 70% threshold. Auditors will flag these unresolved records.`,
      filterHref: '/analytics/drilldown/compliance-readiness?status=PENDING_REVIEW',
    });
  } else if (overallComplianceScore < 70) {
    insights.push({
      id: 'score-warning',
      type: 'warning',
      title: `Compliance score at ${overallComplianceScore}% — action needed`,
      description: `${atRiskEstimate} records fall below the 70% compliance threshold. High-risk and pending approvals are the primary contributors to the reduced score.`,
      filterHref: '/analytics/drilldown/compliance-readiness',
    });
  } else {
    insights.push({
      id: 'score-good',
      type: 'positive',
      title: `Compliance score at ${overallComplianceScore}% — strong posture`,
      description: `Your workspace maintains a strong compliance posture. Continue current practices and schedule periodic policy reviews to remain audit-ready.`,
      filterHref: '/analytics/drilldown/compliance-readiness',
    });
  }

  // 2. At-risk records
  if (atRiskEstimate > 0) {
    const pct = totalCount > 0 ? Math.round((atRiskEstimate / totalCount) * 100) : 0;
    insights.push({
      id: 'at-risk-records',
      type: pct >= 30 ? 'critical' : 'warning',
      title: `${numberFormat(atRiskEstimate)} records below compliance threshold`,
      description: `${pct}% of all approval records scored below 70%. These records lack complete approver identification, evidence, or a final decision.`,
      filterHref: '/analytics/drilldown/compliance-readiness',
    });
  }

  // 3. Evidence gaps
  if (avgEvidenceCoverage < 50) {
    insights.push({
      id: 'evidence-gaps',
      type: 'warning',
      title: `Evidence coverage at ${avgEvidenceCoverage}% — gaps detected`,
      description: `Average evidence coverage is below 50%. Records without associated evidence or message sources cannot be fully audited. Connect more integrations or manually attach evidence.`,
      filterHref: '/analytics/drilldown/compliance-readiness',
    });
  } else {
    insights.push({
      id: 'evidence-ok',
      type: 'info',
      title: `Evidence coverage at ${avgEvidenceCoverage}%`,
      description: `Average evidence coverage across approval records is ${avgEvidenceCoverage}%. Connect additional integrations for richer evidence trails.`,
      filterHref: '/analytics/drilldown/compliance-readiness',
    });
  }

  // 4. Pending approvals
  if (pendingCount > 0) {
    insights.push({
      id: 'pending-approvals',
      type: pendingCount > 10 ? 'warning' : 'info',
      title: `${numberFormat(pendingCount)} pending approval${pendingCount !== 1 ? 's' : ''} without a decision`,
      description: `Pending records without a final decision lower the overall compliance score by up to 25 points per record. Review and resolve these to improve your score.`,
      filterHref: '/analytics/drilldown/compliance-readiness?status=PENDING_REVIEW',
    });
  }

  return insights.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Donut color palettes
// ---------------------------------------------------------------------------

const DEPT_COLORS: Record<string, string> = {
  Finance: '#22C55E',
  Legal: '#3B82F6',
  Procurement: '#6366F1',
  Engineering: '#F87171',
  Operations: '#F59E0B',
  HR: '#14B8A6',
  Security: '#A78BFA',
  Marketing: '#FB923C',
  Compliance: '#818CF8',
  Unassigned: '#475569',
};
const DEPT_FALLBACK = ['#22C55E', '#3B82F6', '#6366F1', '#F87171', '#F59E0B', '#14B8A6', '#A78BFA', '#FB923C'];
const CAT_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#F97316', '#8B5CF6'];
const SRC_COLORS = ['#22D3EE', '#818CF8', '#34D399', '#FB923C', '#F87171', '#A78BFA'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ComplianceReadinessPage({ searchParams }: PageProps) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');
  enforcePageRole('/analytics', tenant.user.role);

  const query = await searchParams;
  const organizationId = tenant.organization.id;

  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const sortBy = query.sortBy ?? 'createdAt';
  const sortDir = (query.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;

  let data: Awaited<ReturnType<typeof loadComplianceData>>;
  try {
    data = await loadComplianceData(organizationId, {
      q: query.q,
      department: query.department,
      category: query.category,
      source: query.source,
      riskLevel: query.riskLevel,
      status: query.status,
      from,
      to,
      page,
      sortBy,
      sortDir,
    });
  } catch (err) {
    console.error('[compliance-readiness] page load error', err);
    return (
      <DashboardShell>
        <div className="min-h-screen" style={{ background: '#0A0E1A' }}>
          <section className="grid gap-5 px-1 pb-10">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
              <p className="text-sm font-bold text-red-300">
                Unable to load compliance readiness data. Please try again.
              </p>
            </div>
          </section>
        </div>
      </DashboardShell>
    );
  }

  const {
    filteredTotal,
    totalCount,
    overallComplianceScore,
    atRiskEstimate,
    pendingCount,
    avgEvidenceCoverage,
    approverPresencePct,
    auditTrailPct,
    tableRecords,
    deptDistribution,
    categoryDistribution,
    sourceDistribution,
    filterOptions,
    sampleTotal,
  } = data;

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  const analyticsBack = `/analytics${from || to ? `?from=${query.from ?? ''}&to=${query.to ?? ''}` : ''}`;

  const scoreColor =
    overallComplianceScore >= 70 ? '#10B981' : overallComplianceScore >= 40 ? '#F59E0B' : '#EF4444';

  // Build donut segments
  const deptSegments = deptDistribution.map((d, i) => ({
    label: d.name,
    value: d.count,
    color: DEPT_COLORS[d.name] ?? DEPT_FALLBACK[i % DEPT_FALLBACK.length],
  }));
  const deptTotal = deptDistribution.reduce((s, d) => s + d.count, 0);

  const catSegments = categoryDistribution.map((c, i) => ({
    label: c.name,
    value: c.count,
    color: CAT_COLORS[i % CAT_COLORS.length],
  }));
  const catTotal = categoryDistribution.reduce((s, c) => s + c.count, 0);

  const srcSegments = sourceDistribution.map((s, i) => ({
    label: s.name,
    value: s.count,
    color: SRC_COLORS[i % SRC_COLORS.length],
  }));
  const srcTotal = sourceDistribution.reduce((s, src) => s + src.count, 0);

  const insights = generateInsights({
    overallComplianceScore,
    atRiskEstimate,
    totalCount,
    avgEvidenceCoverage,
    pendingCount,
  });

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
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
                  Compliance Readiness
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white">
                  Compliance Readiness Records
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-400">
                  Per-record compliance scoring, evidence coverage, and audit trail readiness across all approval records.
                </p>
                {sampleTotal > 0 && sampleTotal < totalCount && (
                  <p className="mt-1 text-[10px] text-slate-600">
                    KPIs computed from a sample of {numberFormat(sampleTotal)} of {numberFormat(totalCount)} records.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black"
                  style={{
                    borderColor: `${scoreColor}40`,
                    backgroundColor: `${scoreColor}15`,
                    color: scoreColor,
                  }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Compliance Score {overallComplianceScore}%
                </span>
                {from && (
                  <span className="text-[11px] text-slate-500">
                    {new Date(from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {to && ` – ${new Date(to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  </span>
                )}
                <Link
                  href="/api/export/analytics?format=csv&type=compliance"
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
              title="Compliance Score"
              value={String(overallComplianceScore)}
              unit="%"
              icon={KpiIcons.compliance}
              accentColor={scoreColor}
              currentNumeric={overallComplianceScore}
              trendLabel={
                overallComplianceScore >= 70
                  ? 'Above 70% audit threshold'
                  : overallComplianceScore >= 40
                  ? 'Below 70% — action needed'
                  : 'Critical — below 40%'
              }
            />
            <KPICard
              title="At Risk Records"
              value={numberFormat(atRiskEstimate)}
              icon={KpiIcons.risk}
              accentColor="#EF4444"
              currentNumeric={atRiskEstimate}
              trendLabel={
                totalCount > 0
                  ? `${Math.round((atRiskEstimate / totalCount) * 100)}% of all records`
                  : 'No records yet'
              }
            />
            <KPICard
              title="Pending Approvals"
              value={numberFormat(pendingCount)}
              icon={KpiIcons.pending}
              accentColor="#3B82F6"
              currentNumeric={pendingCount}
              trendLabel="Awaiting a final decision"
            />
            <KPICard
              title="Evidence Coverage"
              value={String(avgEvidenceCoverage)}
              unit="%"
              icon={KpiIcons.evidence}
              accentColor={avgEvidenceCoverage >= 70 ? '#10B981' : avgEvidenceCoverage >= 40 ? '#F59E0B' : '#EF4444'}
              currentNumeric={avgEvidenceCoverage}
              trendLabel="Avg across all records"
            />
            <KPICard
              title="Approver Presence"
              value={String(approverPresencePct)}
              unit="%"
              icon={KpiIcons.approver}
              accentColor={approverPresencePct >= 80 ? '#10B981' : approverPresencePct >= 50 ? '#F59E0B' : '#EF4444'}
              currentNumeric={approverPresencePct}
              trendLabel="Records with an identified approver"
            />
            <KPICard
              title="Evidence + Audit Trail"
              value={String(auditTrailPct)}
              unit="%"
              icon={KpiIcons.audit}
              accentColor={auditTrailPct >= 70 ? '#10B981' : auditTrailPct >= 40 ? '#F59E0B' : '#EF4444'}
              currentNumeric={auditTrailPct}
              trendLabel="Records with approver + evidence"
            />
          </div>

          {/* Three donut charts */}
          <div className="grid gap-5 md:grid-cols-3">
            {/* By Department */}
            <DarkCard>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">By Department</p>
              <CardTitle className="mt-1 mb-4">Records by Department</CardTitle>
              {deptSegments.length === 0 ? (
                <p className="text-[11px] text-slate-500">No department data yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <SVGDonutChart
                      segments={deptSegments}
                      size={120}
                      strokeWidth={22}
                      centerLabel={String(deptTotal)}
                      centerSublabel="records"
                      showLegend={false}
                    />
                  </div>
                  <DonutLegend segments={deptSegments} total={deptTotal} />
                </div>
              )}
            </DarkCard>

            {/* By Category */}
            <DarkCard>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">By Category</p>
              <CardTitle className="mt-1 mb-4">Records by Category</CardTitle>
              {catSegments.length === 0 ? (
                <p className="text-[11px] text-slate-500">No category data yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <SVGDonutChart
                      segments={catSegments}
                      size={120}
                      strokeWidth={22}
                      centerLabel={String(catTotal)}
                      centerSublabel="records"
                      showLegend={false}
                    />
                  </div>
                  <DonutLegend segments={catSegments} total={catTotal} />
                </div>
              )}
            </DarkCard>

            {/* By Source Platform */}
            <DarkCard>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">By Source</p>
              <CardTitle className="mt-1 mb-4">Records by Source Platform</CardTitle>
              {srcSegments.length === 0 ? (
                <p className="text-[11px] text-slate-500">No source data yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <SVGDonutChart
                      segments={srcSegments}
                      size={120}
                      strokeWidth={22}
                      centerLabel={String(srcTotal)}
                      centerSublabel="records"
                      showLegend={false}
                    />
                  </div>
                  <DonutLegend segments={srcSegments} total={srcTotal} />
                </div>
              )}
            </DarkCard>
          </div>

          {/* Main content: table + right sidebar */}
          <div className="grid gap-5 xl:grid-cols-[1fr_280px]">

            {/* Left: filters + table */}
            <div className="grid gap-5">
              <ComplianceFiltersForm
                values={{
                  q: query.q,
                  department: query.department,
                  category: query.category,
                  source: query.source,
                  riskLevel: query.riskLevel,
                  status: query.status,
                  from: query.from,
                  to: query.to,
                }}
                filterOptions={filterOptions}
              />

              <DarkCard className="overflow-hidden !p-0">
                {/* Table header */}
                <div className="border-b border-[#1E2D4A] px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle>Compliance Records</CardTitle>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {numberFormat(filteredTotal)} record{filteredTotal !== 1 ? 's' : ''}
                        {filteredTotal !== totalCount && ` (filtered from ${numberFormat(totalCount)} total)`}
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

                <ComplianceTable records={tableRecords} />

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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-400">
                        {totalCount === 0
                          ? 'No approval records captured yet'
                          : 'No records match your filters'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {totalCount === 0
                          ? 'Connect integrations and capture approvals to see compliance records here.'
                          : 'Try adjusting your search or filter criteria.'}
                      </p>
                    </div>
                    {totalCount > 0 && (
                      <Link
                        href="/analytics/drilldown/compliance-readiness"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/20 px-3 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-600/30 transition-colors border border-violet-500/20"
                      >
                        Clear all filters
                      </Link>
                    )}
                  </div>
                )}
              </DarkCard>
            </div>

            {/* Right: insights + quick actions */}
            <div className="grid gap-5 content-start xl:sticky xl:top-6">
              <ComplianceInsightsPanel
                insights={insights}
                overallScore={overallComplianceScore}
              />
            </div>
          </div>

        </section>
      </div>
    </DashboardShell>
  );
}
