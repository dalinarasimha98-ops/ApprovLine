import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

export type ReportFormat = 'csv' | 'json' | 'pdf';
export type ReportCategory = 'Compliance' | 'Executive' | 'Risk & Security';
export type ReportType = 'Standard' | 'Analytics' | 'Per-Record';

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  category: ReportCategory;
  type: ReportType;
  formats: ReportFormat[];
  exportPaths: Partial<Record<ReportFormat, string>>;
  requiresSelection?: true;
  selectionHint?: string;
  filterParams: string[];
  commonUseCases: string[];
};

// These are the report types backed by real export API routes.
// Do not add report types here unless a corresponding API route exists.
const approvalAuditReport: ReportDefinition = {
  id: 'approval-audit',
  name: 'Approval Audit Report',
  description: 'Complete audit trail of all approvals, including approvers, timestamps, evidence, and policy checks.',
  longDescription:
    'Detailed audit trail of all approval decisions, including approval chain, timestamps, evidence references, policy compliance, and user actions. Suitable for internal audits, regulatory submissions, and compliance reviews.',
  category: 'Compliance',
  type: 'Standard',
  formats: ['csv', 'json', 'pdf'],
  exportPaths: {
    csv: '/api/export/approvals?format=csv',
    json: '/api/export/approvals?format=json',
    pdf: '/api/export/approvals?format=pdf',
  },
  filterParams: ['from', 'to', 'sourcePlatform', 'approver', 'category', 'riskLevel', 'approvalType'],
  commonUseCases: [
    'Internal and external audits',
    'Compliance reporting',
    'Approval process analysis',
    'Regulatory submissions',
  ],
};

const executiveAnalyticsReport: ReportDefinition = {
  id: 'executive-analytics',
  name: 'Executive Analytics Report',
  description: 'High-level KPIs, approval ROI, volume trends, risk distribution, and compliance scores.',
  longDescription:
    'A comprehensive executive view covering approval volume, risk distribution, compliance scores, estimated ROI, and department-level breakdowns. Suitable for board reporting, leadership dashboards, and quarterly reviews.',
  category: 'Executive',
  type: 'Analytics',
  formats: ['csv', 'pdf'],
  exportPaths: {
    csv: '/api/export/analytics?format=csv',
    pdf: '/api/export/analytics?format=pdf',
  },
  filterParams: ['from', 'to', 'compare'],
  commonUseCases: [
    'Board reporting',
    'Leadership dashboards',
    'Quarterly reviews',
    'Business case documentation',
  ],
};

const investigationReport: ReportDefinition = {
  id: 'investigation-report',
  name: 'Investigation Report',
  description: 'Per-investigation summary with timeline, findings, affected approvals, evidence, and resolution.',
  longDescription:
    'A detailed PDF covering one investigation case: timeline, findings, supporting evidence, affected approvals, and resolution or escalation status. Navigate to the Investigation Center to open and export a specific investigation.',
  category: 'Risk & Security',
  type: 'Per-Record',
  formats: ['pdf'],
  exportPaths: {},
  requiresSelection: true,
  selectionHint: 'Go to Investigation Center to export a specific investigation report.',
  filterParams: [],
  commonUseCases: [
    'Incident documentation',
    'Risk evidence packages',
    'Internal investigation archives',
    'Regulatory incident response',
  ],
};

export const REPORT_CATALOG: ReportDefinition[] = [
  approvalAuditReport,
  executiveAnalyticsReport,
  investigationReport,
];

export type ReportsSummary = {
  availableReports: number;
  approvalRecordCount: number;
  recentExportCount: number;
};

export type ExportHistoryEntry = {
  id: string;
  action: string;
  actorUserId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export async function getReportsSummary(organizationId: string): Promise<ReportsSummary> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [approvalRecordCount, recentExportCount] = await Promise.all([
    withTimeout('reports:approvals-count', prisma.approvalRecord.count({ where: { organizationId } }), 3000).catch(() => 0),
    withTimeout(
      'reports:export-count',
      prisma.auditLog.count({
        where: { organizationId, action: 'report.exported', createdAt: { gte: thirtyDaysAgo } },
      }),
      3000,
    ).catch(() => 0),
  ]);
  return { availableReports: REPORT_CATALOG.length, approvalRecordCount, recentExportCount };
}

export async function getExportHistory(organizationId: string): Promise<ExportHistoryEntry[]> {
  return withTimeout(
    'reports:export-history',
    prisma.auditLog.findMany({
      where: { organizationId, action: 'report.exported' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, actorUserId: true, metadata: true, createdAt: true },
    }),
    3000,
  ).catch(() => []) as Promise<ExportHistoryEntry[]>;
}
