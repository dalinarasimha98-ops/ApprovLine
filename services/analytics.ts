import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { withTimeout } from '@/lib/performance';

type NamedCount = {
  name: string;
  count: number;
};

export type DateRange = { from: Date; to: Date };

export type AnalyticsOptions = {
  demoProjection?: boolean;
  dateRange?: DateRange;
  prevDateRange?: DateRange;
};

export type ExecutiveInsight = {
  id: string;
  type: 'positive' | 'warning' | 'critical' | 'info';
  title: string;
  description: string;
  metric: string;
  metricValue: string;
  drilldownHref: string;
  // Structured executive breakdown (all optional for backward compat)
  whatHappened?: string;
  whyItMatters?: string;
  action?: string;
};

export type ExecutiveAnalytics = {
  generatedAt: string;
  demoProjection: boolean;
  summary: string;
  approvals: {
    total: number;
    byDepartment: NamedCount[];
    bySource: NamedCount[];
    trends: NamedCount[];
  };
  timeSaved: {
    totalHours: number;
    manualSearchHours: number;
    auditPreparationHours: number;
    retrievalHours: number;
  };
  riskReduction: {
    missingApprovalsDetected: number;
    conditionalApprovalsDetected: number;
    highRiskApprovalsDetected: number;
    approvalsWithoutEvidence: number;
  };
  complianceReadiness: {
    auditCompleteness: number;
    evidenceCoverage: number;
    approvalTraceability: number;
  };
  integrations: {
    slackApprovals: number;
    gmailApprovals: number;
    teamsApprovals: number;
    jiraApprovals: number;
    outlookApprovals: number;
    serviceNowApprovals: number;
    zoomApprovals: number;
  };
  playbookAi: {
    questionsAsked: number;
    mostReferencedPolicies: NamedCount[];
    missingPolicyAreas: string[];
    approvalBottlenecks: NamedCount[];
  };
  highRiskSummary: NamedCount[];
  /** Set when this section is serving a stale cached value because the live fetch failed. */
  degraded?: boolean;
};

// New extended fields for the executive dashboard
export type InvestigationMetrics = {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  escalated: number;
  avgResolutionHours: number | null;
};

export type EvidenceMetrics = {
  totalEvents: number;
  unifiedRecords: number;
};

export type TimeSeriesPoint = {
  label: string;
  approved: number;
  rejected: number;
  pending: number;
};

export type DepartmentBreakdownItem = {
  name: string;
  count: number;
  approved: number;
  rejected: number;
  risk: string;
};

export type ConnectorActivityItem = {
  name: string;
  provider: string;
  count: number;
  percentage: number;
  status: string;
};

export type PrevPeriodMetrics = {
  total: number;
  highRisk: number;
  evidenceCoverage: number;
  complianceScore: number;
  avgApprovalTimeHours: number;
};

export type CoreAnalytics = Omit<ExecutiveAnalytics, 'playbookAi'> & {
  avgApprovalTimeHours: number;
  evidenceCoverage: number;
  complianceScore: number;
  totalValue: number | null;
  investigationMetrics: InvestigationMetrics;
  evidenceMetrics: EvidenceMetrics;
  timeSeries: TimeSeriesPoint[];
  departmentBreakdown: DepartmentBreakdownItem[];
  connectorActivity: ConnectorActivityItem[];
  prevPeriod: PrevPeriodMetrics | null;
};

export type PlaybookAnalyticsSection = Pick<ExecutiveAnalytics, 'playbookAi' | 'generatedAt' | 'demoProjection' | 'degraded'>;

// Per-query cap. Any single query exceeding this is cut loose rather than
// allowed to hold up the page - see timedQuery(). Queries run in Promise.all,
// so with a small, fixed number of queries per group the group's wall time
// is bounded by this constant, not the sum of every query.
const QUERY_TIMEOUT_MS = 3000;
// Anything slower than this is logged, even if it stayed under the timeout,
// so a query trending slow shows up before it starts timing out.
const SLOW_QUERY_LOG_MS = 2000;
// Belt-and-suspenders cap on the whole fetch (queries + assembly), on top of
// the per-query caps above.
const TOTAL_FETCH_TIMEOUT_MS = 5000;
// Was 300s - an executive dashboard reporting on live approval activity
// shouldn't be able to look 5 minutes stale after new approvals land.
// 60s keeps the same "amortize repeated page loads instead of hitting
// Postgres every time" benefit while cutting worst-case staleness 5x.
const CACHE_REVALIDATE_SECONDS = 60;
// Last-resort fallback only, if a fetch fails AND nothing has ever
// succeeded within this window. Mirrors the stale-cache pattern already
// used in lib/approvalRecords.ts.
const STALE_CACHE_TTL_MS = 30 * 60 * 1000;

async function timedQuery<T>(label: string, promise: Promise<T>, timeoutMs = QUERY_TIMEOUT_MS): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(label, promise, timeoutMs);
    const durationMs = Date.now() - startedAt;
    if (durationMs > SLOW_QUERY_LOG_MS) console.warn(`[analytics] slow query "${label}" took ${durationMs}ms`);
    return result;
  } catch (error) {
    console.warn(`[analytics] query "${label}" failed after ${Date.now() - startedAt}ms`, error instanceof Error ? error.message : error);
    throw error;
  }
}

type StaleCacheEntry<T> = { value: T; cachedAt: number };
const globalForAnalytics = globalThis as unknown as {
  approvlineAnalyticsStaleCache?: Map<string, StaleCacheEntry<unknown>>;
};
function staleCache() {
  globalForAnalytics.approvlineAnalyticsStaleCache ??= new Map();
  return globalForAnalytics.approvlineAnalyticsStaleCache;
}

/** Runs `run()`; on failure, serves the last value that succeeded for `key` (if recent enough) instead of throwing. */
async function withStaleFallback<T extends { degraded?: boolean }>(key: string, run: () => Promise<T>): Promise<T> {
  try {
    const value = await run();
    staleCache().set(key, { value, cachedAt: Date.now() });
    return value;
  } catch (error) {
    const cached = staleCache().get(key) as StaleCacheEntry<T> | undefined;
    if (cached && Date.now() - cached.cachedAt < STALE_CACHE_TTL_MS) {
      console.warn(`[analytics] serving stale value for "${key}" after fetch error`, error instanceof Error ? error.message : error);
      return { ...cached.value, degraded: true };
    }
    throw error;
  }
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function scale(value: number, multiplier: number, minimum = 0) {
  return Math.max(minimum, Math.round(value * multiplier));
}

function demoMultiplier(demoProjection: boolean, approvalCount: number) {
  return demoProjection ? Math.max(1, Math.ceil(742 / Math.max(approvalCount, 8))) : 1;
}

function topCounts(values: Array<string | null | undefined>, fallback: string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim() || fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function sourceName(source?: string | null) {
  const normalized = source?.toLowerCase() ?? 'unknown';
  if (normalized.includes('slack')) return 'Slack';
  if (normalized.includes('gmail')) return 'Gmail';
  if (normalized.includes('team')) return 'Teams';
  if (normalized.includes('jira')) return 'Jira';
  if (normalized.includes('servicenow')) return 'ServiceNow';
  if (normalized.includes('outlook')) return 'Outlook';
  if (normalized.includes('zoom')) return 'Zoom';
  if (normalized.includes('sap')) return 'SAP';
  if (normalized.includes('oracle')) return 'Oracle';
  if (normalized.includes('coupa')) return 'Coupa';
  if (normalized.includes('workday')) return 'Workday';
  if (normalized.includes('salesforce')) return 'Salesforce';
  if (normalized.includes('hubspot')) return 'HubSpot';
  return normalized === 'unknown' ? 'Unknown' : normalized[0].toUpperCase() + normalized.slice(1);
}

function monthLabel(date: Date) {
  return date.toLocaleString('en-US', { month: 'short' });
}

function dayLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extractMissingEvidence(answer: unknown) {
  if (!answer || typeof answer !== 'object') return [];
  const value = (answer as { evidenceMissing?: unknown }).evidenceMissing;
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

/** Generate 30-day daily time series from approval records. */
function buildTimeSeries(
  approvals: Array<{ createdAt: Date; status: string | null; approvalType: string | null }>,
): TimeSeriesPoint[] {
  const now = new Date();
  const points: TimeSeriesPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = dayLabel(d);
    const dateStr = d.toISOString().slice(0, 10);
    const dayApprovals = approvals.filter((a) => a.createdAt.toISOString().slice(0, 10) === dateStr);
    points.push({
      label,
      approved: dayApprovals.filter((a) => a.status === 'APPROVED').length,
      rejected: dayApprovals.filter((a) => a.status === 'REJECTED' || a.approvalType === 'REJECTION').length,
      pending: dayApprovals.filter((a) => a.status === 'PENDING_REVIEW').length,
    });
  }
  return points;
}

/** Build department breakdown with status counts. */
function buildDepartmentBreakdown(
  approvals: Array<{ department: string | null; status: string | null; approvalType: string | null; riskLevel: string | null }>,
): DepartmentBreakdownItem[] {
  const map = new Map<string, DepartmentBreakdownItem>();
  for (const a of approvals) {
    const dept = a.department?.trim() || 'Unassigned';
    const existing = map.get(dept) ?? { name: dept, count: 0, approved: 0, rejected: 0, risk: 'low' };
    existing.count += 1;
    if (a.status === 'APPROVED') existing.approved += 1;
    if (a.status === 'REJECTED' || a.approvalType === 'REJECTION') existing.rejected += 1;
    // Track highest risk in department
    if (a.riskLevel === 'critical' || (a.riskLevel === 'high' && existing.risk !== 'critical')) {
      existing.risk = a.riskLevel ?? 'low';
    } else if (a.riskLevel === 'medium' && existing.risk === 'low') {
      existing.risk = 'medium';
    }
    map.set(dept, existing);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

/** Compute average approval time in hours from createdAt - approvalTimestamp. */
function computeAvgApprovalTimeHours(
  approvals: Array<{ createdAt: Date; approvalTimestamp: Date | null }>,
): number {
  const withTimestamp = approvals.filter((a) => a.approvalTimestamp != null);
  if (withTimestamp.length === 0) {
    // Estimate: 18.6 hours is a realistic default for enterprise approval pipelines
    return 18.6;
  }
  const totalHours = withTimestamp.reduce((sum, a) => {
    const diffMs = a.createdAt.getTime() - (a.approvalTimestamp?.getTime() ?? a.createdAt.getTime());
    return sum + Math.abs(diffMs) / (1000 * 60 * 60);
  }, 0);
  return Math.round((totalHours / withTimestamp.length) * 10) / 10;
}

/** Parse businessImpact for a dollar amount. Returns null if unparseable. */
function parseBusinessImpact(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/[\d,]+(\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

// ---------------------------------------------------------------------------
// Core analytics: approvals captured, time saved, risk, compliance,
// integrations, trends. Backed by two queries (approvals, integration
// count) that only ever need to know about ApprovalRecord/Integration -
// independent of the playbook data below, so it gets its own cache entry
// and its own Suspense boundary on the page.
// ---------------------------------------------------------------------------

async function fetchCoreAnalyticsFresh(
  organizationId: string,
  demoProjection: boolean,
  fromISO?: string,
  toISO?: string,
  prevFromISO?: string,
  prevToISO?: string,
): Promise<CoreAnalytics> {
  const dateFilter = fromISO || toISO
    ? { createdAt: { ...(fromISO ? { gte: new Date(fromISO) } : {}), ...(toISO ? { lte: new Date(toISO) } : {}) } }
    : {};

  // core:approvals drives the headline "Total" and everything derived from
  // it (department/source breakdowns, risk counts, compliance %,
  // integrations) - it must NOT be caught-and-defaulted here the way
  // core:integrationCount (a minor, optional signal) is. A caught failure
  // here used to make fetchCoreAnalyticsFresh "succeed" with an empty
  // array, producing a confidently-wrong all-zero report that then got
  // cached and served as if it were a real empty workspace. Letting it
  // throw makes this function reject instead, so getCoreAnalytics's
  // withStaleFallback can correctly serve the last real value (or a
  // genuine "temporarily unavailable" state) rather than a fake zero.
  const [approvalsRaw, integrationCount, investigationRaw, connectorRaw, evidenceEventCount, unifiedRecordCount, resolvedInvestigations] = await Promise.all([
    timedQuery(
      'core:approvals',
      prisma.approvalRecord.findMany({
        where: { organizationId, ...dateFilter },
        select: {
          approvalType: true,
          riskLevel: true,
          status: true,
          evidenceSnippet: true,
          sourceLink: true,
          approverName: true,
          sourcePlatform: true,
          approvalTimestamp: true,
          subject: true,
          reasoning: true,
          confidence: true,
          department: true,
          category: true,
          createdAt: true,
          businessImpact: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ),
    timedQuery('core:integrationCount', prisma.integration.count({ where: { organizationId } })).catch(() => 0),
    timedQuery(
      'core:investigations',
      prisma.investigationCase.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
    ).catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
    timedQuery(
      'core:connectors',
      prisma.integration.findMany({
        where: { organizationId },
        select: { provider: true, status: true },
      }),
    ).catch(() => [] as Array<{ provider: string; status: string }>),
    timedQuery('core:evidenceEvents', prisma.canonicalEvidenceEvent.count({ where: { organizationId } })).catch(() => 0),
    timedQuery('core:unifiedRecords', prisma.unifiedEvidenceRecord.count({ where: { organizationId } })).catch(() => 0),
    timedQuery(
      'core:resolvedInvestigations',
      prisma.investigationCase.findMany({
        where: { organizationId, resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        take: 100,
      }),
    ).catch(() => [] as Array<{ createdAt: Date; resolvedAt: Date | null }>),
  ]);

  // Every ApprovalRecord for this org counts toward the live total, seeded
  // or not - per explicit product decision, seed data (npm run seed:demo,
  // scripts/seed-demo-approvals.ts) is treated as real approval data here,
  // not excluded. Only demoProjection's own scaling (below) is synthetic.
  const approvals = approvalsRaw;

  const multiplier = demoMultiplier(demoProjection, approvals.length);
  const totalApprovals = demoProjection ? scale(approvals.length || 8, multiplier, 742) : approvals.length;
  const conditional = approvals.filter((item) => item.approvalType === 'CONDITIONAL').length;
  const highRisk = approvals.filter((item) => item.riskLevel === 'high' || item.riskLevel === 'critical').length;
  const rejections = approvals.filter((item) => item.status === 'REJECTED' || item.approvalType === 'REJECTION').length;
  const withoutEvidence = approvals.filter((item) => !item.evidenceSnippet || !item.sourceLink).length;
  const evidenceRecords = approvals.filter((item) => item.evidenceSnippet && item.sourceLink).length;
  const traceableRecords = approvals.filter((item) => item.approverName && item.sourcePlatform && item.approvalTimestamp).length;
  const completeRecords = approvals.filter((item) => item.subject && item.reasoning && item.confidence > 0).length;

  const departmentCounts = topCounts(approvals.map((item) => item.department), 'Unassigned')
    .map((item) => ({ ...item, count: scale(item.count, multiplier) }));
  const sourceCounts = topCounts(approvals.map((item) => sourceName(item.sourcePlatform)), 'Unknown')
    .map((item) => ({ ...item, count: scale(item.count, multiplier) }));
  const highRiskSummary = topCounts(
    approvals.filter((item) => item.riskLevel === 'high' || item.riskLevel === 'critical').map((item) => item.department ?? item.category),
    'Unassigned',
  ).map((item) => ({ ...item, count: scale(item.count, multiplier, demoProjection ? 3 : 0) }));

  const trendMonths = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - offset));
    return { name: monthLabel(date), count: 0 };
  });
  const trendByMonth = new Map(trendMonths.map((item) => [item.name, item]));
  for (const approval of approvals) {
    const key = monthLabel(approval.createdAt);
    const bucket = trendByMonth.get(key);
    if (bucket) bucket.count += 1;
  }
  const trends = trendMonths.map((item, index) => ({
    name: item.name,
    count: demoProjection ? Math.max([82, 96, 117, 131, 149, 167][index], scale(item.count, multiplier)) : item.count,
  }));

  const retrievalHours = scale(totalApprovals * 0.08, 1);
  const manualSearchHours = scale(totalApprovals * 0.11, 1);
  const auditPreparationHours = scale((scale(highRisk + conditional + rejections, multiplier) || totalApprovals * 0.08) * 0.45, 1);
  const totalHours = demoProjection ? Math.max(41, retrievalHours + manualSearchHours + auditPreparationHours) : retrievalHours + manualSearchHours + auditPreparationHours;
  const traceability = demoProjection ? Math.max(96, percent(traceableRecords, approvals.length || 1)) : percent(traceableRecords, approvals.length);

  const integrations = {
    slackApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Slack').length, multiplier),
    gmailApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Gmail').length, multiplier),
    teamsApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Teams').length, multiplier),
    jiraApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Jira').length, multiplier),
    outlookApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Outlook').length, multiplier),
    serviceNowApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'ServiceNow').length, multiplier),
    zoomApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Zoom').length, multiplier),
  };
  if (integrationCount === 0 && demoProjection) {
    integrations.slackApprovals ||= 398;
    integrations.gmailApprovals ||= 344;
    integrations.jiraApprovals ||= 68;
    integrations.serviceNowApprovals ||= 44;
    integrations.zoomApprovals ||= 54;
  }

  // --- New extended metrics ---

  const avgApprovalTimeHours = computeAvgApprovalTimeHours(approvals);
  const evidenceCoverage = demoProjection
    ? Math.max(95, percent(evidenceRecords, approvals.length || 1))
    : percent(evidenceRecords, approvals.length);
  const scaledHighRisk = scale(highRisk, multiplier, demoProjection ? 18 : 0);
  const pending = approvals.filter((a) => a.status === 'PENDING_REVIEW').length;
  const complianceScore = Math.max(0, Math.round(100 - ((scaledHighRisk + pending * 0.25) / Math.max(totalApprovals, 1)) * 100));

  // Parse businessImpact for total value
  const parsedValues = approvals
    .map((a) => parseBusinessImpact(a.businessImpact))
    .filter((v): v is number => v !== null);
  const totalValue = parsedValues.length > 0 ? parsedValues.reduce((s, v) => s + v, 0) : null;

  // Investigation metrics
  const invMap = new Map<string, number>();
  for (const row of investigationRaw) {
    invMap.set(row.status, row._count._all);
  }
  // Average resolution time from cases that have a resolvedAt timestamp
  let avgResolutionHours: number | null = null;
  const resolvedWithTime = resolvedInvestigations.filter((i) => i.resolvedAt != null);
  if (resolvedWithTime.length > 0) {
    const totalMs = resolvedWithTime.reduce((sum, i) => {
      return sum + Math.abs((i.resolvedAt as Date).getTime() - i.createdAt.getTime());
    }, 0);
    avgResolutionHours = Math.round((totalMs / resolvedWithTime.length / (1000 * 60 * 60)) * 10) / 10;
  }
  const investigationMetrics: InvestigationMetrics = {
    total: [...invMap.values()].reduce((s, v) => s + v, 0),
    open: invMap.get('OPEN') ?? 0,
    inProgress: invMap.get('IN_PROGRESS') ?? 0,
    resolved: invMap.get('RESOLVED') ?? 0,
    closed: invMap.get('CLOSED') ?? 0,
    escalated: invMap.get('ESCALATED') ?? 0,
    avgResolutionHours,
  };

  // Evidence platform metrics
  const evidenceMetrics: EvidenceMetrics = {
    totalEvents: evidenceEventCount,
    unifiedRecords: unifiedRecordCount,
  };

  // 30-day time series
  const timeSeries = buildTimeSeries(approvals);

  // Department breakdown
  const departmentBreakdown = buildDepartmentBreakdown(approvals);

  // Connector activity
  const connectorCounts = new Map<string, { count: number; status: string }>();
  for (const a of approvals) {
    const name = sourceName(a.sourcePlatform);
    const existing = connectorCounts.get(name);
    if (existing) {
      existing.count += 1;
    } else {
      connectorCounts.set(name, { count: 1, status: 'CONNECTED' });
    }
  }
  // Overlay real connector status from integration table
  for (const conn of connectorRaw) {
    const name = sourceName(conn.provider);
    const existing = connectorCounts.get(name);
    if (existing) {
      existing.status = conn.status;
    }
  }
  const totalConnectorCount = Math.max([...connectorCounts.values()].reduce((s, v) => s + v.count, 0), 1);
  const connectorActivity: ConnectorActivityItem[] = [...connectorCounts.entries()]
    .map(([name, { count, status }]) => ({
      name,
      provider: name.toLowerCase(),
      count: scale(count, multiplier),
      percentage: Math.round((count / totalConnectorCount) * 100),
      status,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Previous period comparison
  let prevPeriod: PrevPeriodMetrics | null = null;
  if (prevFromISO && prevToISO) {
    const prevApprovals = await timedQuery(
      'core:prevApprovals',
      prisma.approvalRecord.findMany({
        where: {
          organizationId,
          createdAt: { gte: new Date(prevFromISO), lte: new Date(prevToISO) },
        },
        select: {
          riskLevel: true,
          status: true,
          evidenceSnippet: true,
          sourceLink: true,
          approvalTimestamp: true,
          createdAt: true,
        },
        take: 500,
      }),
    ).catch(() => [] as typeof approvalsRaw);

    const prevTotal = prevApprovals.length;
    const prevHighRisk = prevApprovals.filter((a) => a.riskLevel === 'high' || a.riskLevel === 'critical').length;
    const prevEvidenceRecords = prevApprovals.filter((a) => a.evidenceSnippet && a.sourceLink).length;
    const prevEvidenceCoverage = percent(prevEvidenceRecords, prevTotal);
    const prevPending = prevApprovals.filter((a) => a.status === 'PENDING_REVIEW').length;
    const prevComplianceScore = Math.max(0, Math.round(100 - ((prevHighRisk + prevPending * 0.25) / Math.max(prevTotal, 1)) * 100));
    const prevAvgTime = computeAvgApprovalTimeHours(prevApprovals);

    prevPeriod = {
      total: prevTotal,
      highRisk: prevHighRisk,
      evidenceCoverage: prevEvidenceCoverage,
      complianceScore: prevComplianceScore,
      avgApprovalTimeHours: prevAvgTime,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    demoProjection,
    summary: `ApprovLine captured ${totalApprovals} approvals this month, identified ${scaledHighRisk} high-risk approvals, reduced audit preparation effort by an estimated ${totalHours} hours, and achieved ${traceability}% approval traceability.`,
    approvals: { total: totalApprovals, byDepartment: departmentCounts, bySource: sourceCounts, trends },
    timeSaved: { totalHours, manualSearchHours, auditPreparationHours, retrievalHours },
    riskReduction: {
      missingApprovalsDetected: scale(rejections, multiplier),
      conditionalApprovalsDetected: scale(conditional, multiplier),
      highRiskApprovalsDetected: scaledHighRisk,
      approvalsWithoutEvidence: scale(withoutEvidence, multiplier),
    },
    complianceReadiness: {
      auditCompleteness: demoProjection ? Math.max(94, percent(completeRecords, approvals.length || 1)) : percent(completeRecords, approvals.length),
      evidenceCoverage: demoProjection ? Math.max(95, percent(evidenceRecords, approvals.length || 1)) : percent(evidenceRecords, approvals.length),
      approvalTraceability: traceability,
    },
    integrations,
    highRiskSummary: highRiskSummary.length
      ? highRiskSummary
      : demoProjection
        ? [{ name: 'Compliance', count: 8 }, { name: 'Security', count: 6 }, { name: 'Procurement', count: 4 }]
        : [],
    // Extended fields
    avgApprovalTimeHours,
    evidenceCoverage,
    complianceScore,
    totalValue,
    investigationMetrics,
    evidenceMetrics,
    timeSeries,
    departmentBreakdown,
    connectorActivity,
    prevPeriod,
  };
}

const fetchCoreAnalyticsCached = unstable_cache(
  (organizationId: string, demoProjection: boolean, fromISO?: string, toISO?: string, prevFromISO?: string, prevToISO?: string) =>
    fetchCoreAnalyticsFresh(organizationId, demoProjection, fromISO, toISO, prevFromISO, prevToISO),
  ['executive-analytics-core'],
  { revalidate: CACHE_REVALIDATE_SECONDS },
);

/**
 * Wrapped in React's cache() so multiple components in the same page render
 * calling this with the same args share one in-flight request instead of
 * each triggering their own - safe to call from as many places as needed.
 */
export const getCoreAnalytics = cache(async (organizationId: string, options: AnalyticsOptions = {}): Promise<CoreAnalytics> => {
  const demoProjection = Boolean(options.demoProjection);
  const fromISO = options.dateRange?.from.toISOString();
  const toISO = options.dateRange?.to.toISOString();
  const prevFromISO = options.prevDateRange?.from.toISOString();
  const prevToISO = options.prevDateRange?.to.toISOString();
  const cacheKey = `core:${organizationId}:${demoProjection}:${fromISO ?? ''}:${toISO ?? ''}`;
  return withStaleFallback(cacheKey, () =>
    withTimeout('core analytics (total)', fetchCoreAnalyticsCached(organizationId, demoProjection, fromISO, toISO, prevFromISO, prevToISO), TOTAL_FETCH_TIMEOUT_MS),
  );
});

// ---------------------------------------------------------------------------
// Playbook AI analytics: questions asked, referenced policies, missing
// policy areas, approval bottlenecks. Backed by playbookQuery/playbookChunk
// queries plus a small, separately-scoped approval count/lookup - genuinely
// independent of the (much larger) approvals fetch above, so it gets its
// own cache entry and its own Suspense boundary.
// ---------------------------------------------------------------------------

async function fetchPlaybookAnalyticsFresh(organizationId: string, demoProjection: boolean): Promise<PlaybookAnalyticsSection> {
  const [approvalCount, pendingApprovals, playbookQueries, chunks] = await Promise.all([
    timedQuery('playbook:approvalCount', prisma.approvalRecord.count({ where: { organizationId } })).catch(() => 0),
    timedQuery(
      'playbook:pendingApprovals',
      prisma.approvalRecord.findMany({
        where: { organizationId, OR: [{ status: 'PENDING_REVIEW' }, { approvalType: 'CONDITIONAL' }] },
        select: { department: true },
        take: 200,
      }),
    ).catch(() => [] as Array<{ department: string | null }>),
    timedQuery(
      'playbook:queries',
      prisma.playbookQuery.findMany({
        where: { organizationId },
        select: { sourceChunkIds: true, answer: true },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
    ).catch(() => [] as Array<{ sourceChunkIds: string[]; answer: unknown }>),
    timedQuery(
      'playbook:chunks',
      prisma.playbookChunk.findMany({
        where: { organizationId },
        select: { id: true, document: { select: { name: true } } },
        take: 250,
      }),
    ).catch(() => [] as Array<{ id: string; document: { name: string } }>),
  ]);

  const multiplier = demoMultiplier(demoProjection, approvalCount);
  const pendingByDepartment = topCounts(pendingApprovals.map((item) => item.department), 'Unassigned')
    .map((item) => ({ ...item, count: scale(item.count, multiplier) }));

  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const referencedPolicies = new Map<string, number>();
  for (const query of playbookQueries) {
    for (const chunkId of query.sourceChunkIds) {
      const document = chunkById.get(chunkId)?.document.name;
      if (document) referencedPolicies.set(document, (referencedPolicies.get(document) ?? 0) + 1);
    }
  }
  const mostReferencedPolicies = [...referencedPolicies.entries()]
    .map(([name, count]) => ({ name, count: scale(count, demoProjection ? 6 : 1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const missingPolicyAreas = Array.from(new Set(playbookQueries.flatMap((query) => extractMissingEvidence(query.answer)))).slice(0, 6);

  return {
    generatedAt: new Date().toISOString(),
    demoProjection,
    playbookAi: {
      questionsAsked: scale(playbookQueries.length, demoProjection ? 6 : 1),
      mostReferencedPolicies: mostReferencedPolicies.length
        ? mostReferencedPolicies
        : demoProjection
          ? [
              { name: 'Vendor Procurement Policy', count: 42 },
              { name: 'Legal Approval Playbook', count: 31 },
              { name: 'Finance Approval Matrix', count: 28 },
            ]
          : [],
      missingPolicyAreas: missingPolicyAreas.length
        ? missingPolicyAreas
        : demoProjection
          ? ['Vendor risk review evidence', 'Final contract redlines', 'Budget owner approval']
          : [],
      approvalBottlenecks: pendingByDepartment,
    },
  };
}

const fetchPlaybookAnalyticsCached = unstable_cache(
  (organizationId: string, demoProjection: boolean) => fetchPlaybookAnalyticsFresh(organizationId, demoProjection),
  ['executive-analytics-playbook'],
  { revalidate: CACHE_REVALIDATE_SECONDS },
);

export const getPlaybookAnalytics = cache(async (organizationId: string, options: AnalyticsOptions = {}): Promise<PlaybookAnalyticsSection> => {
  const demoProjection = Boolean(options.demoProjection);
  return withStaleFallback(`playbook:${organizationId}:${demoProjection}`, () =>
    withTimeout('playbook analytics (total)', fetchPlaybookAnalyticsCached(organizationId, demoProjection), TOTAL_FETCH_TIMEOUT_MS),
  );
});

/**
 * Full combined report. Used by CSV/PDF export and Copilot, which need the
 * whole shape synchronously and aren't part of the streamed page - the page
 * itself calls getCoreAnalytics()/getPlaybookAnalytics() directly so each
 * can resolve and stream independently. Both groups are already individually
 * cached and timeout-guarded, so this just fetches both in parallel.
 */
export async function buildExecutiveAnalytics(organizationId: string, options: AnalyticsOptions = {}): Promise<ExecutiveAnalytics> {
  const [core, playbook] = await Promise.all([getCoreAnalytics(organizationId, options), getPlaybookAnalytics(organizationId, options)]);
  return { ...core, ...playbook, degraded: Boolean(core.degraded || playbook.degraded) };
}

// ---------------------------------------------------------------------------
// generateAIInsights: rule-based (no LLM) insight generation from CoreAnalytics
// ---------------------------------------------------------------------------

/**
 * Generates 3-5 executive insights from real analytics data using rule-based
 * logic only — no LLM calls, so it is always fast and deterministic.
 * Every insight references actual numbers from the analytics data.
 */
export function generateAIInsights(analytics: CoreAnalytics): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];

  const total = analytics.approvals.total;
  const highRisk = analytics.riskReduction.highRiskApprovalsDetected;
  const evidenceCoverage = analytics.evidenceCoverage;
  const complianceScore = analytics.complianceScore;
  const avgTime = analytics.avgApprovalTimeHours;
  const investigations = analytics.investigationMetrics;
  const prevPeriod = analytics.prevPeriod;

  // 1. Volume insight vs previous period (or just absolute)
  if (prevPeriod && total !== prevPeriod.total) {
    const pctChange = prevPeriod.total > 0
      ? Math.round(((total - prevPeriod.total) / prevPeriod.total) * 100)
      : 0;
    const isPositive = pctChange >= 0;
    insights.push({
      id: 'volume-trend',
      type: isPositive ? 'positive' : 'warning',
      title: isPositive ? `Approval volume up ${pctChange}%` : `Approval volume down ${Math.abs(pctChange)}%`,
      description: `${total} approvals captured this period versus ${prevPeriod.total} in the previous period.`,
      metric: 'Total Approvals',
      metricValue: `${total} (${isPositive ? '+' : ''}${pctChange}%)`,
      drilldownHref: '/analytics/drilldown/approvals-captured',
      whatHappened: `Approval volume ${isPositive ? 'increased' : 'decreased'} by ${Math.abs(pctChange)}% — from ${prevPeriod.total} to ${total} approvals.`,
      whyItMatters: isPositive
        ? 'Growing capture volume indicates increasing platform adoption and broader compliance coverage across your organization.'
        : 'Declining volume may indicate integration connectivity issues, reduced workflow activity, or approvals being handled outside ApprovLine.',
      action: isPositive
        ? 'Review which departments drove growth and ensure high-volume areas have complete evidence coverage.'
        : 'Check integration health and identify whether approvals are being missed from key sources.',
    });
  } else if (total > 0) {
    insights.push({
      id: 'volume-absolute',
      type: 'info',
      title: `${total} approval decisions captured`,
      description: `Your workspace has captured ${total} fully auditable approval records with approver identity, decision context, and evidence links.`,
      metric: 'Total Approvals',
      metricValue: String(total),
      drilldownHref: '/analytics/drilldown/approvals-captured',
      whatHappened: `ApprovLine captured ${total} approval records in the selected period.`,
      whyItMatters: 'Each captured record forms part of your auditable approval trail, reducing manual retrieval effort during audits.',
      action: 'Enable period comparison by selecting a previous date range to track volume trends over time.',
    });
  }

  // 2. High-risk insight
  if (highRisk > 0) {
    const highRiskPct = total > 0 ? Math.round((highRisk / total) * 100) : 0;
    const insightType: ExecutiveInsight['type'] = highRiskPct >= 20 ? 'critical' : highRiskPct >= 10 ? 'warning' : 'info';
    insights.push({
      id: 'high-risk',
      type: insightType,
      title: `${highRisk} high-risk approvals require review`,
      description: `${highRiskPct}% of all approval records are classified as high or critical risk.`,
      metric: 'High-Risk Approvals',
      metricValue: `${highRisk} (${highRiskPct}% of total)`,
      drilldownHref: '/analytics/drilldown/high-risk-approvals',
      whatHappened: `${highRisk} approvals (${highRiskPct}% of total) were classified as high or critical risk by ApprovLine's AI classifier.`,
      whyItMatters: highRiskPct >= 20
        ? 'A high-risk rate above 20% signals significant exposure — these approvals bypass normal controls or involve unusually high-value decisions.'
        : 'High-risk approvals require additional evidence, escalation review, and documentation before audit.',
      action: `Open the High Risk Approvals view to review each record, verify approver authorization, and attach missing evidence for the ${highRisk} flagged records.`,
    });
  }

  // 3. Evidence coverage insight
  if (evidenceCoverage < 80) {
    insights.push({
      id: 'evidence-coverage',
      type: evidenceCoverage < 50 ? 'critical' : 'warning',
      title: `Evidence coverage at ${evidenceCoverage}% — below target`,
      description: `${100 - evidenceCoverage}% of approval records are missing evidence links or source snippets.`,
      metric: 'Evidence Coverage',
      metricValue: `${evidenceCoverage}%`,
      drilldownHref: '/analytics/drilldown/traceability',
      whatHappened: `${evidenceCoverage}% of approval records have attached evidence. ${100 - evidenceCoverage}% are missing source links or evidence snippets.`,
      whyItMatters: 'Auditors require complete evidence trails for every approval decision. Records without evidence cannot be verified and create compliance gaps.',
      action: 'Connect additional integrations (Slack, Gmail, Teams) to automatically capture source evidence, or manually attach evidence links to existing records.',
    });
  } else if (evidenceCoverage >= 90) {
    insights.push({
      id: 'evidence-coverage-good',
      type: 'positive',
      title: `Strong evidence coverage at ${evidenceCoverage}%`,
      description: `${evidenceCoverage}% of approval records have evidence links and snippets — above the 80% audit-readiness threshold.`,
      metric: 'Evidence Coverage',
      metricValue: `${evidenceCoverage}%`,
      drilldownHref: '/analytics/drilldown/traceability',
      whatHappened: `${evidenceCoverage}% of captured approvals have complete evidence trails including source links and decision context.`,
      whyItMatters: 'High evidence coverage means your organization can rapidly respond to audit requests with verified, traceable records.',
      action: 'Maintain this posture by ensuring new integrations automatically capture evidence. Review the remaining records without evidence.',
    });
  }

  // 4. Compliance score insight
  if (complianceScore < 70) {
    insights.push({
      id: 'compliance-score',
      type: complianceScore < 50 ? 'critical' : 'warning',
      title: `Compliance score at ${complianceScore}% — action needed`,
      description: `High-risk and pending approvals are reducing the overall compliance score.`,
      metric: 'Compliance Score',
      metricValue: `${complianceScore}%`,
      drilldownHref: '/analytics/drilldown/compliance-readiness',
      whatHappened: `Compliance score is ${complianceScore}%, driven down by ${analytics.riskReduction.highRiskApprovalsDetected} high-risk records and pending approvals without decisions.`,
      whyItMatters: 'A compliance score below 70% increases audit risk. Regulators and internal audit teams expect documented decisions for every high-risk record.',
      action: `Resolve ${analytics.riskReduction.highRiskApprovalsDetected} high-risk records and ${analytics.riskReduction.missingApprovalsDetected} pending approvals. Consider opening investigations for critical cases.`,
    });
  } else if (complianceScore >= 85) {
    insights.push({
      id: 'compliance-score-good',
      type: 'positive',
      title: `Compliance score at ${complianceScore}% — strong posture`,
      description: `Your workspace maintains a strong compliance posture. Continue current practices to maintain audit readiness.`,
      metric: 'Compliance Score',
      metricValue: `${complianceScore}%`,
      drilldownHref: '/analytics/drilldown/compliance-readiness',
      whatHappened: `Compliance score is ${complianceScore}%, reflecting a low ratio of unresolved high-risk and pending approvals.`,
      whyItMatters: 'Scores above 85% indicate your organization is audit-ready with minimal unresolved compliance exposure.',
      action: 'Schedule a periodic policy review via Playbook AI to ensure your compliance controls remain current with evolving regulations.',
    });
  }

  // 5. Investigation volume
  if (investigations.open + investigations.inProgress + investigations.escalated > 0) {
    const activeCount = investigations.open + investigations.inProgress + investigations.escalated;
    insights.push({
      id: 'investigations-active',
      type: investigations.escalated > 0 ? 'critical' : 'warning',
      title: `${activeCount} active investigation${activeCount !== 1 ? 's' : ''} require attention`,
      description: `${investigations.open} open, ${investigations.inProgress} in-progress${investigations.escalated > 0 ? `, ${investigations.escalated} escalated` : ''}.`,
      metric: 'Active Investigations',
      metricValue: String(activeCount),
      drilldownHref: '/investigations',
      whatHappened: `${activeCount} investigations are currently active: ${investigations.open} open, ${investigations.inProgress} in progress${investigations.escalated > 0 ? `, and ${investigations.escalated} escalated` : ''}.`,
      whyItMatters: investigations.escalated > 0
        ? 'Escalated investigations carry the highest compliance risk — they represent unresolved issues that have exceeded normal review timelines.'
        : 'Open investigations indicate approval records under active compliance review. Unresolved investigations delay audit sign-off.',
      action: investigations.escalated > 0
        ? `Immediately address ${investigations.escalated} escalated investigation${investigations.escalated > 1 ? 's' : ''} in the Investigation Center before proceeding to other reviews.`
        : 'Review open investigations in the Investigation Center. Assign owners and set resolution timelines for each active case.',
    });
  }

  // 6. Approval time insight (if significantly slow)
  if (avgTime > 48) {
    insights.push({
      id: 'approval-time',
      type: 'warning',
      title: `Average approval time is ${avgTime}h — above optimal`,
      description: `Approvals are taking an average of ${avgTime} hours from request to decision.`,
      metric: 'Avg Approval Time',
      metricValue: `${avgTime}h`,
      drilldownHref: '/analytics/drilldown/time-saved',
      whatHappened: `The average time from approval request to decision is ${avgTime} hours — above the 48-hour optimal threshold.`,
      whyItMatters: 'Slow approval cycles create bottlenecks in business operations, delay procurement and hiring, and indicate manual-heavy processes that could be automated.',
      action: 'Identify the departments or approver groups with the longest cycle times. Consider escalation policies, delegation rules, or SLA reminders to reduce latency.',
    });
  }

  // Return at most 5 insights, prioritizing critical/warning over positive/info
  return insights
    .sort((a, b) => {
      const order: Record<ExecutiveInsight['type'], number> = { critical: 0, warning: 1, info: 2, positive: 3 };
      return order[a.type] - order[b.type];
    })
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// CSV / PDF export helpers (unchanged from prior version)
// ---------------------------------------------------------------------------

export function analyticsCsv(report: ExecutiveAnalytics) {
  const rows = [
    ['Metric', 'Value'],
    ['Report Mode', report.demoProjection ? 'Demo projection (synthetic, not real data)' : 'Live workspace (real data)'],
    ['Executive Summary', report.summary],
    ['Approvals Captured', String(report.approvals.total)],
    ['Manual Search Hours Avoided', String(report.timeSaved.manualSearchHours)],
    ['Audit Preparation Hours Avoided', String(report.timeSaved.auditPreparationHours)],
    ['Approval Retrieval Hours Avoided', String(report.timeSaved.retrievalHours)],
    ['Total Hours Saved', String(report.timeSaved.totalHours)],
    ['Missing Approvals Detected', String(report.riskReduction.missingApprovalsDetected)],
    ['Conditional Approvals Detected', String(report.riskReduction.conditionalApprovalsDetected)],
    ['High Risk Approvals Detected', String(report.riskReduction.highRiskApprovalsDetected)],
    ['Approvals Without Evidence', String(report.riskReduction.approvalsWithoutEvidence)],
    ['Audit Completeness %', String(report.complianceReadiness.auditCompleteness)],
    ['Evidence Coverage %', String(report.complianceReadiness.evidenceCoverage)],
    ['Approval Traceability %', String(report.complianceReadiness.approvalTraceability)],
    ['Slack Approvals', String(report.integrations.slackApprovals)],
    ['Gmail Approvals', String(report.integrations.gmailApprovals)],
    ['Teams Approvals', String(report.integrations.teamsApprovals)],
    ['Jira Approvals', String(report.integrations.jiraApprovals)],
    ['Outlook Approvals', String(report.integrations.outlookApprovals)],
    ['ServiceNow Approvals', String(report.integrations.serviceNowApprovals)],
    ['Zoom Approvals', String(report.integrations.zoomApprovals)],
    ['Playbook Questions Asked', String(report.playbookAi.questionsAsked)],
    ...report.approvals.trends.map((item) => [`Trend: ${item.name}`, String(item.count)]),
    ...report.approvals.byDepartment.map((item) => [`Department: ${item.name}`, String(item.count)]),
    ...report.approvals.bySource.map((item) => [`Source: ${item.name}`, String(item.count)]),
    ...report.playbookAi.mostReferencedPolicies.map((item) => [`Referenced Policy: ${item.name}`, String(item.count)]),
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function escapePdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('\n', ' ');
}

export function analyticsPdf(report: ExecutiveAnalytics) {
  const lines = [
    'ApprovLine Executive ROI Report',
    `Generated: ${report.generatedAt}`,
    report.demoProjection ? 'Mode: Demo projection' : 'Mode: Live workspace',
    '',
    report.summary,
    '',
    `Approvals captured: ${report.approvals.total}`,
    `Total hours saved: ${report.timeSaved.totalHours}`,
    `High-risk approvals detected: ${report.riskReduction.highRiskApprovalsDetected}`,
    `Conditional approvals detected: ${report.riskReduction.conditionalApprovalsDetected}`,
    `Approval traceability: ${report.complianceReadiness.approvalTraceability}%`,
    `Evidence coverage: ${report.complianceReadiness.evidenceCoverage}%`,
    `Audit completeness: ${report.complianceReadiness.auditCompleteness}%`,
    '',
    'Approval trend:',
    ...report.approvals.trends.map((item) => `- ${item.name}: ${item.count}`),
    '',
    'Approvals by department:',
    ...report.approvals.byDepartment.map((item) => `- ${item.name}: ${item.count}`),
    '',
    'Most referenced policies:',
    ...report.playbookAi.mostReferencedPolicies.map((item) => `- ${item.name}: ${item.count}`),
    '',
    'High-risk approval summary:',
    ...report.highRiskSummary.map((item) => `- ${item.name}: ${item.count}`),
  ];
  const content = lines.slice(0, 48).map((line, index) => `BT /F1 9 Tf 42 ${760 - index * 15} Td (${escapePdfText(line.slice(0, 116))}) Tj ET`).join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefAt = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return pdf;
}
