import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { withTimeout } from '@/lib/performance';

type NamedCount = {
  name: string;
  count: number;
};

type AnalyticsOptions = {
  demoProjection?: boolean;
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

export type CoreAnalytics = Omit<ExecutiveAnalytics, 'playbookAi'>;
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
const CACHE_REVALIDATE_SECONDS = 300;
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

function extractMissingEvidence(answer: unknown) {
  if (!answer || typeof answer !== 'object') return [];
  const value = (answer as { evidenceMissing?: unknown }).evidenceMissing;
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

/**
 * Same demo-record convention used everywhere else in the codebase
 * (lib/evidence-links.ts, app/approvals/[id]/page.tsx, services/investigations.ts,
 * components/dashboard/ApprovalTable.tsx, app/api/export/approvals/route.ts) -
 * demo-seeded approvals (lib/demo-data.ts) carry a sourceLink containing
 * 'demo' or the fabricated 'TDEMO' Slack workspace ID. The live (non-demo)
 * executive report must exclude these so seeded/synthetic records never
 * blend into a real customer's boardroom ROI numbers; the explicit demo
 * preview (?demo=1) is the only place they're meant to show up.
 */
function isDemoApproval(sourceLink?: string | null) {
  return Boolean(sourceLink?.includes('demo') || sourceLink?.includes('TDEMO'));
}

// ---------------------------------------------------------------------------
// Core analytics: approvals captured, time saved, risk, compliance,
// integrations, trends. Backed by two queries (approvals, integration
// count) that only ever need to know about ApprovalRecord/Integration -
// independent of the playbook data below, so it gets its own cache entry
// and its own Suspense boundary on the page.
// ---------------------------------------------------------------------------

async function fetchCoreAnalyticsFresh(organizationId: string, demoProjection: boolean): Promise<CoreAnalytics> {
  const [approvalsRaw, integrationCount] = await Promise.all([
    timedQuery(
      'core:approvals',
      prisma.approvalRecord.findMany({
        where: { organizationId },
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
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ).catch(() => [] as Awaited<ReturnType<typeof prisma.approvalRecord.findMany>>),
    timedQuery('core:integrationCount', prisma.integration.count({ where: { organizationId } })).catch(() => 0),
  ]);
  // The demo preview (demoProjection=true) intentionally uses seeded demo
  // records as its data source; the live report must not.
  const approvals = demoProjection ? approvalsRaw : approvalsRaw.filter((item) => !isDemoApproval(item.sourceLink));

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

  return {
    generatedAt: new Date().toISOString(),
    demoProjection,
    summary: `ApprovLine captured ${totalApprovals} approvals this month, identified ${scale(highRisk, multiplier, demoProjection ? 18 : 0)} high-risk approvals, reduced audit preparation effort by an estimated ${totalHours} hours, and achieved ${traceability}% approval traceability.`,
    approvals: { total: totalApprovals, byDepartment: departmentCounts, bySource: sourceCounts, trends },
    timeSaved: { totalHours, manualSearchHours, auditPreparationHours, retrievalHours },
    riskReduction: {
      missingApprovalsDetected: scale(rejections, multiplier),
      conditionalApprovalsDetected: scale(conditional, multiplier),
      highRiskApprovalsDetected: scale(highRisk, multiplier, demoProjection ? 18 : 0),
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
  };
}

const fetchCoreAnalyticsCached = unstable_cache(
  (organizationId: string, demoProjection: boolean) => fetchCoreAnalyticsFresh(organizationId, demoProjection),
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
  return withStaleFallback(`core:${organizationId}:${demoProjection}`, () =>
    withTimeout('core analytics (total)', fetchCoreAnalyticsCached(organizationId, demoProjection), TOTAL_FETCH_TIMEOUT_MS),
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
  const [approvalCount, pendingApprovalsRaw, playbookQueries, chunks] = await Promise.all([
    timedQuery('playbook:approvalCount', prisma.approvalRecord.count({ where: { organizationId } })).catch(() => 0),
    timedQuery(
      'playbook:pendingApprovals',
      prisma.approvalRecord.findMany({
        where: { organizationId, OR: [{ status: 'PENDING_REVIEW' }, { approvalType: 'CONDITIONAL' }] },
        select: { department: true, sourceLink: true },
        take: 200,
      }),
    ).catch(() => [] as Array<{ department: string | null; sourceLink: string | null }>),
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

  const pendingApprovals = demoProjection ? pendingApprovalsRaw : pendingApprovalsRaw.filter((item) => !isDemoApproval(item.sourceLink));
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

export function analyticsCsv(report: ExecutiveAnalytics) {
  const rows = [
    ['Metric', 'Value'],
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
