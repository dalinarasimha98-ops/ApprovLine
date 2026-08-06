import { ApprovalType, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/services/audit';
import { calculateRiskScore, riskLabel } from '@/services/investigations';

// Alerts have no dedicated schema — dismiss/escalate state is tracked as
// real, persisted AuditLog events (the same append-only trail every other
// approval action already writes to) rather than an unpersisted UI toggle.
export const ALERT_DISMISSED_ACTION = 'approval_alert.dismissed';
export const ALERT_ESCALATED_ACTION = 'approval_alert.escalated';

export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type ApprovalAlert = {
  id: string;
  subject: string;
  department: string | null;
  category: string | null;
  riskLevel: string | null;
  status: string;
  approvalType: string;
  sourcePlatform: string | null;
  approverName: string | null;
  evidenceSnippet: string | null;
  sourceLink: string | null;
  occurredAt: Date;
  riskScore: number;
  severity: AlertSeverity;
  reasons: string[];
  complianceExplanation: string | null;
  complianceSeverity: string | null;
  escalated: boolean;
};

const alertApprovalSelect = {
  id: true,
  subject: true,
  department: true,
  category: true,
  riskLevel: true,
  status: true,
  approvalType: true,
  sourcePlatform: true,
  approverName: true,
  evidenceSnippet: true,
  sourceLink: true,
  occurredAt: true,
  confidence: true,
  complianceEvaluations: { select: { explanation: true, severity: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ApprovalRecordSelect;

type AlertSourceApproval = Prisma.ApprovalRecordGetPayload<{ select: typeof alertApprovalSelect }>;

function flagReasons(approval: AlertSourceApproval): string[] {
  const reasons: string[] = [];
  if (approval.riskLevel === 'critical' || approval.riskLevel === 'high') reasons.push(`${approval.riskLevel} risk level`);
  if (approval.approvalType === 'CONDITIONAL') reasons.push('Conditional approval requires verification');
  if (approval.status === 'PENDING_REVIEW') reasons.push('Pending review');
  if (approval.status === 'REJECTED') reasons.push('Rejected decision on record');
  if (!approval.evidenceSnippet || !approval.sourceLink) reasons.push('Missing evidence or source link');
  return reasons;
}

export type AlertFilters = {
  severity?: string;
  approvalType?: string;
  from?: string;
  to?: string;
};

function isApprovalType(value: string): value is ApprovalType {
  return (Object.values(ApprovalType) as string[]).includes(value);
}

export async function getApprovalAlerts(organizationId: string, filters: AlertFilters = {}) {
  const auditEvents = await prisma.auditLog.findMany({
    where: { organizationId, action: { in: [ALERT_DISMISSED_ACTION, ALERT_ESCALATED_ACTION] }, approvalRecordId: { not: null } },
    select: { approvalRecordId: true, action: true },
  });
  const dismissedIds = new Set(auditEvents.filter((e) => e.action === ALERT_DISMISSED_ACTION).map((e) => e.approvalRecordId!));
  const escalatedIds = new Set(auditEvents.filter((e) => e.action === ALERT_ESCALATED_ACTION).map((e) => e.approvalRecordId!));

  const occurredAt: Prisma.DateTimeFilter = {};
  if (filters.from) occurredAt.gte = new Date(filters.from);
  if (filters.to) occurredAt.lte = new Date(filters.to);

  const requestedApprovalType = filters.approvalType?.toUpperCase() ?? '';

  const approvals = await prisma.approvalRecord.findMany({
    where: {
      organizationId,
      id: dismissedIds.size ? { notIn: [...dismissedIds] } : undefined,
      OR: [
        { riskLevel: 'high' },
        { riskLevel: 'critical' },
        { approvalType: 'CONDITIONAL' },
        { status: 'PENDING_REVIEW' },
        { status: 'REJECTED' },
        { evidenceSnippet: null },
        { sourceLink: null },
      ],
      ...(isApprovalType(requestedApprovalType) ? { approvalType: requestedApprovalType } : {}),
      ...(filters.from || filters.to ? { occurredAt } : {}),
    },
    select: alertApprovalSelect,
    orderBy: [{ riskLevel: 'desc' }, { occurredAt: 'desc' }],
    take: 150,
  });

  const alerts: ApprovalAlert[] = approvals.map((approval) => {
    const riskScore = calculateRiskScore(approval);
    return {
      id: approval.id,
      subject: approval.subject,
      department: approval.department,
      category: approval.category,
      riskLevel: approval.riskLevel,
      status: approval.status,
      approvalType: approval.approvalType,
      sourcePlatform: approval.sourcePlatform,
      approverName: approval.approverName,
      evidenceSnippet: approval.evidenceSnippet,
      sourceLink: approval.sourceLink,
      occurredAt: approval.occurredAt,
      riskScore,
      severity: riskLabel(riskScore) as AlertSeverity,
      reasons: flagReasons(approval),
      complianceExplanation: approval.complianceEvaluations[0]?.explanation ?? null,
      complianceSeverity: approval.complianceEvaluations[0]?.severity ?? null,
      escalated: escalatedIds.has(approval.id),
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  const severityCounts: Record<AlertSeverity, number> = {
    Critical: alerts.filter((a) => a.severity === 'Critical').length,
    High: alerts.filter((a) => a.severity === 'High').length,
    Medium: alerts.filter((a) => a.severity === 'Medium').length,
    Low: alerts.filter((a) => a.severity === 'Low').length,
  };

  const filtered = filters.severity
    ? alerts.filter((a) => a.severity.toLowerCase() === filters.severity!.toLowerCase())
    : alerts;

  return { alerts: filtered, severityCounts, total: alerts.length, dismissedCount: dismissedIds.size };
}

export async function dismissApprovalAlert(input: { organizationId: string; actorUserId?: string; approvalId: string }) {
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    approvalRecordId: input.approvalId,
    action: ALERT_DISMISSED_ACTION,
  });
}

export async function escalateApprovalAlert(input: { organizationId: string; actorUserId?: string; approvalId: string }) {
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    approvalRecordId: input.approvalId,
    action: ALERT_ESCALATED_ACTION,
  });
}
