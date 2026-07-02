import { prisma } from '@/lib/prisma';

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
  };
  playbookAi: {
    questionsAsked: number;
    mostReferencedPolicies: NamedCount[];
    missingPolicyAreas: string[];
    approvalBottlenecks: NamedCount[];
  };
  highRiskSummary: NamedCount[];
};

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function scale(value: number, multiplier: number, minimum = 0) {
  return Math.max(minimum, Math.round(value * multiplier));
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
  if (normalized.includes('outlook')) return 'Outlook';
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

export async function buildExecutiveAnalytics(organizationId: string, options: AnalyticsOptions = {}): Promise<ExecutiveAnalytics> {
  const [approvals, integrations, playbookQueries, chunks] = await Promise.all([
    prisma.approvalRecord.findMany({
      where: { organizationId },
      include: { messageSource: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.integration.findMany({ where: { organizationId } }),
    prisma.playbookQuery.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }).catch(() => []),
    prisma.playbookChunk.findMany({
      where: { organizationId },
      include: { document: true },
      take: 500,
    }).catch(() => []),
  ]);

  const demoProjection = Boolean(options.demoProjection);
  const multiplier = demoProjection ? Math.max(1, Math.ceil(742 / Math.max(approvals.length, 8))) : 1;
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
  const pendingByDepartment = topCounts(
    approvals.filter((item) => item.status === 'PENDING_REVIEW' || item.approvalType === 'CONDITIONAL').map((item) => item.department),
    'Unassigned',
  ).map((item) => ({ ...item, count: scale(item.count, multiplier) }));
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
    count: demoProjection
      ? Math.max([82, 96, 117, 131, 149, 167][index], scale(item.count, multiplier))
      : item.count,
  }));

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
  const missingPolicyAreas = Array.from(new Set(playbookQueries.flatMap((query) => extractMissingEvidence(query.answer))))
    .slice(0, 6);

  const retrievalHours = scale(totalApprovals * 0.08, 1);
  const manualSearchHours = scale(totalApprovals * 0.11, 1);
  const auditPreparationHours = scale((scale(highRisk + conditional + rejections, multiplier) || totalApprovals * 0.08) * 0.45, 1);
  const totalHours = demoProjection ? Math.max(41, retrievalHours + manualSearchHours + auditPreparationHours) : retrievalHours + manualSearchHours + auditPreparationHours;
  const traceability = demoProjection ? Math.max(96, percent(traceableRecords, approvals.length || 1)) : percent(traceableRecords, approvals.length);

  const report: ExecutiveAnalytics = {
    generatedAt: new Date().toISOString(),
    demoProjection,
    summary: `ApprovLine captured ${totalApprovals} approvals this month, identified ${scale(highRisk, multiplier, demoProjection ? 18 : 0)} high-risk approvals, reduced audit preparation effort by an estimated ${totalHours} hours, and achieved ${traceability}% approval traceability.`,
    approvals: {
      total: totalApprovals,
      byDepartment: departmentCounts,
      bySource: sourceCounts,
      trends,
    },
    timeSaved: {
      totalHours,
      manualSearchHours,
      auditPreparationHours,
      retrievalHours,
    },
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
    integrations: {
      slackApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Slack').length, multiplier),
      gmailApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Gmail').length, multiplier),
      teamsApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Teams').length, multiplier),
      jiraApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Jira').length, multiplier),
      outlookApprovals: scale(approvals.filter((item) => sourceName(item.sourcePlatform) === 'Outlook').length, multiplier),
    },
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
    highRiskSummary: highRiskSummary.length
      ? highRiskSummary
      : demoProjection
        ? [
            { name: 'Compliance', count: 8 },
            { name: 'Security', count: 6 },
            { name: 'Procurement', count: 4 },
          ]
        : [],
  };

  if (integrations.length === 0 && demoProjection) {
    report.integrations.slackApprovals ||= 398;
    report.integrations.gmailApprovals ||= 344;
    report.integrations.jiraApprovals ||= 68;
  }

  return report;
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
    ['Playbook Questions Asked', String(report.playbookAi.questionsAsked)],
    ...report.approvals.trends.map((item) => [`Trend: ${item.name}`, String(item.count)]),
    ...report.approvals.byDepartment.map((item) => [`Department: ${item.name}`, String(item.count)]),
    ...report.approvals.bySource.map((item) => [`Source: ${item.name}`, String(item.count)]),
    ...report.playbookAi.mostReferencedPolicies.map((item) => [`Referenced Policy: ${item.name}`, String(item.count)]),
  ];

  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
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
