import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { getDashboardTenant } from '@/lib/auth';
import {
  getCoreAnalytics,
  generateAIInsights,
  type CoreAnalytics,
  type DateRange,
} from '@/services/analytics';
import { prisma } from '@/lib/prisma';
import { recordPerformance } from '@/lib/performance';
import { withTimeout } from '@/lib/performance';
import { enforcePageRole } from '@/lib/rbac';
import { AnalyticsDatePicker } from '@/components/analytics/AnalyticsDatePicker';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { SVGLineChart } from '@/components/analytics/SVGLineChart';
import { SVGDonutChart } from '@/components/analytics/SVGDonutChart';
import { SVGBarChart } from '@/components/analytics/SVGBarChart';
import { SVGArcGauge } from '@/components/analytics/SVGArcGauge';
import { KPICard } from '@/components/analytics/KPICard';
import { AIInsightsPanel } from '@/components/analytics/AIInsightsPanel';

export const dynamic = 'force-dynamic';

type AnalyticsPageProps = {
  searchParams: Promise<{
    demo?: string;
    from?: string;
    to?: string;
    prevFrom?: string;
    prevTo?: string;
    department?: string;
    riskLevel?: string;
    status?: string;
    source?: string;
  }>;
};

function numberFormat(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

function pctChange(current: number | undefined, previous: number | undefined): string | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">{children}</p>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-1 text-sm font-bold text-white">{children}</h3>
  );
}

function SectionHeader({
  label, title, subtitle, href, hrefLabel,
}: {
  label: string; title: string; subtitle?: string; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <SectionLabel>{label}</SectionLabel>
        <CardTitle>{title}</CardTitle>
        {subtitle && <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="mt-1 flex-shrink-0 text-[10px] font-bold text-violet-400 transition-colors hover:text-violet-300">
          {hrefLabel ?? 'View all →'}
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector activity horizontal bars
// ---------------------------------------------------------------------------

function ConnectorBars({ items }: { items: CoreAnalytics['connectorActivity'] }) {
  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <div className="grid gap-2.5">
      {items.length === 0 ? (
        <p className="text-xs font-semibold text-slate-500">No connector data yet. Connect integrations to see activity.</p>
      ) : items.map((item) => (
        <div key={item.name} className="grid gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300">{item.name}</span>
            <span className="text-[11px] font-bold text-slate-400">{item.percentage}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1E2D4A]">
            <div
              className="h-1.5 rounded-full bg-blue-500"
              style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category horizontal bars
// ---------------------------------------------------------------------------

function CategoryBars({ items }: { items: Array<{ name: string; count: number }> }) {
  const total = Math.max(items.reduce((s, i) => s + i.count, 0), 1);
  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <div className="grid gap-2.5">
      {items.length === 0 ? (
        <p className="text-xs font-semibold text-slate-500">Categories appear once approvals are captured.</p>
      ) : items.map((item) => {
        const pct = Math.round((item.count / total) * 100);
        return (
          <div key={item.name} className="grid gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300">{item.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">{pct}%</span>
                <span className="w-10 text-right text-[11px] font-bold text-white">{numberFormat(item.count)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-[#1E2D4A]">
              <div
                className="h-1.5 rounded-full bg-violet-500"
                style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Degraded / unavailable notices
// ---------------------------------------------------------------------------

function DegradedNotice({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300">
      {label}: showing last successfully loaded data while the live query recovers.
    </div>
  );
}

function SectionUnavailable({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
      <p className="text-xs font-black uppercase tracking-wide text-amber-300">{title}</p>
      <p className="mt-2 text-sm font-semibold text-amber-200">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard section (core analytics)
// ---------------------------------------------------------------------------

async function ExecutiveDashboardSection({
  organizationId,
  requestedDemo,
  dateRange,
  prevDateRange,
}: {
  organizationId: string;
  requestedDemo: boolean;
  dateRange?: DateRange;
  prevDateRange?: DateRange;
}) {
  const startedAt = Date.now();
  let report: CoreAnalytics;
  try {
    report = await getCoreAnalytics(organizationId, {
      demoProjection: requestedDemo,
      dateRange,
      prevDateRange,
    });
    recordPerformance('/analytics/core', Date.now() - startedAt, 200);
  } catch (error) {
    recordPerformance('/analytics/core', Date.now() - startedAt, 504);
    return (
      <SectionUnavailable
        title="Core analytics unavailable"
        message={error instanceof Error ? error.message : 'The analytics query did not complete. Please retry.'}
      />
    );
  }

  const insights = generateAIInsights(report);

  // Fetch top high-risk approvals for the panel
  const highRiskApprovals = await withTimeout(
    'analytics:highRisk',
    prisma.approvalRecord.findMany({
      where: {
        organizationId,
        OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }],
        ...(dateRange
          ? { createdAt: { gte: dateRange.from, lte: dateRange.to } }
          : {}),
      },
      select: { id: true, subject: true, riskLevel: true, department: true, approverName: true, businessImpact: true },
      orderBy: [{ riskLevel: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    }),
    2000,
  ).catch(() => []);

  const prev = report.prevPeriod;
  const total = report.approvals.total;
  const highRisk = report.riskReduction.highRiskApprovalsDetected;
  const hasNoLiveData = !requestedDemo && total === 0;

  // KPI icon helpers (inline SVG to avoid import)
  const icons = {
    approvals: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
    risk: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    evidence: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    compliance: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  };

  // Department donut colors
  const DEPT_COLORS: Record<string, string> = {
    Finance: '#2563EB',
    Procurement: '#7C3AED',
    Engineering: '#0891B2',
    Legal: '#4F46E5',
    Operations: '#D97706',
    HR: '#059669',
    Unassigned: '#475569',
  };
  const deptSegments = report.departmentBreakdown.map((d) => ({
    label: d.name,
    value: d.count,
    color: DEPT_COLORS[d.name] ?? '#6366F1',
  }));

  // Risk distribution donut
  const riskSegments = [
    { label: 'Low', value: report.approvals.total > 0 ? Math.max(0, report.approvals.total - report.riskReduction.highRiskApprovalsDetected - report.riskReduction.conditionalApprovalsDetected) : 0, color: '#10B981' },
    { label: 'Medium', value: report.riskReduction.conditionalApprovalsDetected, color: '#F59E0B' },
    { label: 'High', value: highRisk, color: '#EF4444' },
    { label: 'Critical', value: 0, color: '#991B1B' }, // critical is included in highRisk
  ].filter((s) => s.value > 0);

  // Time series for line chart
  const lineData = report.timeSeries.map((p) => ({
    label: p.label,
    approved: p.approved,
    rejected: p.rejected,
    pending: p.pending,
  }));
  const lineSeries = [
    { key: 'approved', color: '#10B981', label: 'Approved' },
    { key: 'pending', color: '#7C3AED', label: 'Pending' },
    { key: 'rejected', color: '#EF4444', label: 'Rejected' },
  ];

  // Bar chart for approval volume by month
  const barData = report.approvals.trends.map((t) => ({ label: t.name, value: t.count }));

  return (
    <>
      {/* Demo mode banner */}
      {report.demoProjection && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border-2 border-violet-500/50 bg-violet-500/10 p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-black text-white">Demo analytics preview — synthetic numbers only</h3>
            <p className="mt-1 text-sm font-semibold text-slate-300">Use this for sales conversations. Every figure is scaled/fabricated.</p>
          </div>
          <PendingLink href="/analytics" pendingText="Loading live..." className="inline-flex h-9 items-center justify-center rounded-lg border border-[#1E2D4A] bg-[#0D1526] px-4 text-sm font-bold text-slate-200 hover:bg-[#1a2a45]">
            View live data
          </PendingLink>
        </div>
      )}

      {hasNoLiveData && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-black text-white">No approvals captured yet</h3>
            <p className="mt-1 text-sm font-semibold text-slate-400">These are your real, live numbers — zero because no approvals have been captured. Connect an integration to start.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PendingLink href="/analytics?demo=1" pendingText="Loading demo..." className="inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500">
              Preview demo
            </PendingLink>
            <form action="/api/demo/seed" method="post">
              <FormSubmitButton pendingText="Generating..." className="inline-flex h-9 items-center justify-center rounded-lg border border-[#1E2D4A] bg-[#0D1526] px-4 text-sm font-bold text-slate-200">
                Generate demo data
              </FormSubmitButton>
            </form>
          </div>
        </div>
      )}

      {report.degraded && <DegradedNotice label="Core analytics" />}

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard
          title="Total Approvals"
          value={numberFormat(total)}
          icon={icons.approvals}
          accentColor="#7C3AED"
          currentNumeric={total}
          prevValue={prev?.total}
          href="/analytics/drilldown/approvals-captured"
          trendLabel={prev ? `${pctChange(total, prev.total) ?? '—'} vs previous period` : undefined}
        />
        <KPICard
          title="Approved Value"
          value={report.totalValue !== null ? `$${numberFormat(Math.round(report.totalValue / 1000))}K` : '—'}
          icon={icons.value}
          accentColor="#059669"
          href="/analytics/drilldown/approvals-captured"
          trendLabel={report.totalValue === null ? 'No value data' : undefined}
        />
        <KPICard
          title="Avg Approval Time"
          value={`${report.avgApprovalTimeHours}`}
          unit="hrs"
          icon={icons.time}
          accentColor="#0891B2"
          currentNumeric={report.avgApprovalTimeHours}
          prevValue={prev?.avgApprovalTimeHours}
          trendLabel={prev ? `${pctChange(report.avgApprovalTimeHours, prev.avgApprovalTimeHours) ?? '—'} vs previous period` : undefined}
        />
        <KPICard
          title="High Risk Approvals"
          value={numberFormat(highRisk)}
          icon={icons.risk}
          accentColor="#EF4444"
          currentNumeric={highRisk}
          prevValue={prev?.highRisk}
          href="/analytics/drilldown/high-risk-approvals"
          trendLabel={prev ? `${pctChange(highRisk, prev.highRisk) ?? '—'} vs previous period` : undefined}
        />
        <KPICard
          title="Evidence Coverage"
          value={`${report.evidenceCoverage}`}
          unit="%"
          icon={icons.evidence}
          accentColor="#F59E0B"
          currentNumeric={report.evidenceCoverage}
          prevValue={prev?.evidenceCoverage}
          href="/analytics/drilldown/traceability"
          trendLabel={prev ? `${pctChange(report.evidenceCoverage, prev.evidenceCoverage) ?? '—'} vs previous period` : undefined}
        />
        <KPICard
          title="Compliance Score"
          value={`${report.complianceScore}`}
          unit="%"
          icon={icons.compliance}
          accentColor="#10B981"
          currentNumeric={report.complianceScore}
          prevValue={prev?.complianceScore}
          href="/analytics/drilldown/compliance-readiness"
          trendLabel={prev ? `${pctChange(report.complianceScore, prev.complianceScore) ?? '—'} vs previous period` : undefined}
        />
      </div>

      {/* Main content + AI panel */}
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="grid gap-5">
          {/* Row 1: Line chart + Department donut */}
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <DarkCard>
              <SectionHeader
                label="Approval Volume"
                title="Approval Volume Trend"
                subtitle="Approved, Pending, Rejected"
                href="/approvals"
                hrefLabel="View all approvals →"
              />
              <div className="mt-4">
                <SVGLineChart
                  data={lineData}
                  series={lineSeries}
                  height={200}
                  labelEvery={7}
                />
              </div>
            </DarkCard>

            <DarkCard>
              <SectionHeader
                label="Department"
                title="Approvals by Department"
                href="/approvals"
              />
              <div className="mt-4 flex items-center gap-4">
                <div className="flex-shrink-0">
                  <SVGDonutChart
                    segments={deptSegments}
                    size={120}
                    strokeWidth={20}
                    centerLabel={numberFormat(total)}
                    centerSublabel="total"
                  />
                </div>
                <div className="min-w-0 flex-1 grid gap-1.5">
                  {deptSegments.map((seg) => {
                    const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
                    return (
                      <div key={seg.label} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-300">{seg.label}</span>
                        <span className="text-[11px] font-bold text-slate-400">{pct}%</span>
                        <span className="w-10 text-right text-[10px] text-slate-500">({numberFormat(seg.value)})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </DarkCard>
          </div>

          {/* Row 2: Risk Donut + Investigation Overview + Evidence Gauge */}
          <div className="grid gap-5 lg:grid-cols-3">
            <DarkCard>
              <SectionHeader
                label="Risk"
                title="Risk Distribution"
                href="/analytics/drilldown/high-risk-approvals"
                hrefLabel="View details →"
              />
              <div className="mt-3 flex items-center gap-4">
                <div className="flex-shrink-0">
                  <SVGDonutChart
                    segments={riskSegments.length > 0 ? riskSegments : [{ label: 'No data', value: 1, color: '#1E2D4A' }]}
                    size={130}
                    strokeWidth={22}
                    centerLabel={numberFormat(total)}
                    centerSublabel="total"
                  />
                </div>
                <div className="flex-1 grid gap-2">
                  {riskSegments.length > 0 ? riskSegments.map((seg) => {
                    const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
                    return (
                      <div key={seg.label} className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
                        <span className="flex-1 text-[11px] font-semibold text-slate-300">{seg.label} Risk</span>
                        <span className="text-[11px] font-bold text-slate-400">{pct}%</span>
                        <span className="w-10 text-right text-[10px] text-slate-500">({numberFormat(seg.value)})</span>
                      </div>
                    );
                  }) : (
                    <p className="text-[11px] text-slate-500">No risk data yet.</p>
                  )}
                </div>
              </div>
            </DarkCard>

            <DarkCard>
              <SectionHeader
                label="Investigations"
                title="Investigation Overview"
                href="/investigations"
                hrefLabel="View all investigations →"
              />
              {(() => {
                const invTotal = Math.max(report.investigationMetrics.total, 1);
                const invStats = [
                  { label: 'Total', value: report.investigationMetrics.total, color: '#7C3AED', status: '', iconPath: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', trendUp: true, trendPct: null },
                  { label: 'Open', value: report.investigationMetrics.open, color: '#3B82F6', status: 'OPEN', iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', trendUp: true, trendPct: Math.round((report.investigationMetrics.open / invTotal) * 100) },
                  { label: 'In Progress', value: report.investigationMetrics.inProgress, color: '#8B5CF6', status: 'IN_PROGRESS', iconPath: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', trendUp: false, trendPct: Math.round((report.investigationMetrics.inProgress / invTotal) * 100) },
                  { label: 'Resolved', value: report.investigationMetrics.resolved, color: '#10B981', status: 'RESOLVED', iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', trendUp: true, trendPct: Math.round((report.investigationMetrics.resolved / invTotal) * 100) },
                  { label: 'Closed', value: report.investigationMetrics.closed, color: '#64748B', status: 'CLOSED', iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', trendUp: false, trendPct: Math.round((report.investigationMetrics.closed / invTotal) * 100) },
                ];
                return (
                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {invStats.map(({ label, value, color, status, iconPath, trendUp, trendPct }) => (
                      <Link
                        key={label}
                        href={`/investigations${status ? `?status=${status}` : ''}`}
                        className="flex flex-col items-center rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] p-3 text-center transition-colors hover:border-[#2A3F66]"
                      >
                        <div className="mb-2 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}20` }}>
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                          </svg>
                        </div>
                        <span className="text-[10px] font-semibold leading-tight text-slate-500">{label}</span>
                        <span className="mt-1 text-xl font-black text-white leading-none">{numberFormat(value)}</span>
                        {trendPct !== null && (
                          <div className={`mt-1.5 flex items-center gap-0.5 text-[10px] font-bold ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
                            <span>{trendUp ? '↗' : '↘'}</span>
                            <span>{trendPct}%</span>
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                );
              })()}
            </DarkCard>

            <DarkCard className="flex flex-col">
              <SectionHeader
                label="Evidence"
                title="Evidence Coverage"
                href="/analytics/drilldown/traceability"
                hrefLabel="View details →"
              />
              <div className="mt-3 flex flex-1 w-full flex-col items-center justify-center gap-2">
                <SVGArcGauge
                  value={report.evidenceCoverage}
                  label="Coverage"
                  size={150}
                />
                {prev && (() => {
                  const change = pctChange(report.evidenceCoverage, prev.evidenceCoverage);
                  if (!change) return null;
                  const isPos = !change.startsWith('-');
                  return (
                    <p className={`text-[11px] font-bold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                      {change} vs previous period
                    </p>
                  );
                })()}
              </div>
            </DarkCard>
          </div>

          {/* Row 3: Bar chart + Top categories + Connector activity */}
          <div className="grid gap-5 lg:grid-cols-3">
            <DarkCard>
              <SectionHeader
                label="Volume"
                title="Approval Value Over Time"
                subtitle="Monthly approval counts"
                href="/api/export/analytics?format=csv"
                hrefLabel="View full report →"
              />
              <div className="mt-4">
                <SVGBarChart data={barData} height={160} color="#7C3AED" />
              </div>
            </DarkCard>

            <DarkCard>
              <SectionHeader
                label="Categories"
                title="Top Approval Categories"
                href="/approvals"
                hrefLabel="View all →"
              />
              <div className="mt-4">
                <CategoryBars items={report.approvals.byDepartment} />
              </div>
            </DarkCard>

            <DarkCard>
              <SectionHeader
                label="Sources"
                title="Connector Activity"
                href="/integrations"
                hrefLabel="View all →"
              />
              <div className="mt-4">
                <ConnectorBars items={report.connectorActivity} />
              </div>
            </DarkCard>
          </div>

        </div>

        {/* Right: AI Insights Panel */}
        <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <DarkCard>
            <AIInsightsPanel insights={insights} highRiskApprovals={highRiskApprovals} />
          </DarkCard>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-[#1E2D4A] bg-[#0D1526]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl border border-[#1E2D4A] bg-[#0D1526]" />
        <div className="h-64 animate-pulse rounded-2xl border border-[#1E2D4A] bg-[#0D1526]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');
  enforcePageRole('/analytics', tenant.user.role);

  const query = await searchParams;
  const requestedDemo = query.demo === '1';
  const organizationId = tenant.organization.id;

  // Parse date range from URL params
  const fromStr = query.from;
  const toStr = query.to;
  const prevFromStr = query.prevFrom;
  const prevToStr = query.prevTo;

  const dateRange: DateRange | undefined =
    fromStr && toStr ? { from: new Date(fromStr), to: new Date(toStr) } : undefined;
  const prevDateRange: DateRange | undefined =
    prevFromStr && prevToStr ? { from: new Date(prevFromStr), to: new Date(prevToStr) } : undefined;

  const compareEnabled = Boolean(prevFromStr && prevToStr);

  return (
    <DashboardShell>
      <div className="min-h-screen" style={{ background: '#0A0E1A' }}>
        <section className="grid gap-5 px-1 pb-10">
          {/* Header */}
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">Executive Analytics</h1>
                <p className="mt-1 text-sm font-medium text-slate-400">
                  Strategic intelligence for smarter, faster and safer decisions across your organization.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <AnalyticsDatePicker
                  currentFrom={fromStr}
                  currentTo={toStr}
                  compareEnabled={compareEnabled}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <AnalyticsFilters
                    currentDepartment={query.department}
                    currentRiskLevel={query.riskLevel}
                    currentStatus={query.status}
                    currentSource={query.source}
                  />
                  <PendingLink
                    href={`/api/export/analytics?format=csv${requestedDemo ? '&demo=1' : ''}`}
                    pendingText="Preparing..."
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-500 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export Report
                  </PendingLink>
                  {!requestedDemo && (
                    <PendingLink
                      href="/analytics?demo=1"
                      pendingText="Loading..."
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 text-xs font-bold text-violet-300 hover:bg-violet-500/20 transition-colors"
                    >
                      Demo Mode
                    </PendingLink>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main dashboard */}
          <Suspense fallback={<DashboardSkeleton />}>
            <ExecutiveDashboardSection
              organizationId={organizationId}
              requestedDemo={requestedDemo}
              dateRange={dateRange}
              prevDateRange={prevDateRange}
            />
          </Suspense>

        </section>
      </div>
    </DashboardShell>
  );
}
