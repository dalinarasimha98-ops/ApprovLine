import type { ApprovalRecord, AuditLog, MessageSource, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type InvestigationApprovalWithEvidence = ApprovalRecord & {
  messageSource: MessageSource | null;
  auditLogs: AuditLog[];
};

export function riskRank(risk?: string | null) {
  if (risk === 'critical') return 4;
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  return 1;
}

export function riskLabel(score: number) {
  if (score >= 85) return 'Critical';
  if (score >= 65) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

export function calculateRiskScore(approval: Pick<ApprovalRecord, 'riskLevel' | 'status' | 'approvalType' | 'evidenceSnippet' | 'confidence'>) {
  let score = riskRank(approval.riskLevel) * 20;
  if (approval.status === 'REJECTED') score += 10;
  if (approval.status === 'PENDING_REVIEW') score += 12;
  if (approval.approvalType === 'CONDITIONAL') score += 14;
  if (!approval.evidenceSnippet) score += 18;
  if (approval.confidence < 80) score += 8;
  return Math.min(100, score);
}

export function buildInvestigationSummary(approvals: InvestigationApprovalWithEvidence[]) {
  const primary = approvals[0];
  const departments = [...new Set(approvals.map((item) => item.department).filter(Boolean))].join(', ') || 'Unassigned';
  const sources = [...new Set(approvals.map((item) => item.sourcePlatform).filter(Boolean))].join(', ') || 'unknown sources';
  const highRisk = approvals.filter((item) => item.riskLevel === 'high' || item.riskLevel === 'critical');
  const missingEvidence = approvals.filter((item) => !item.evidenceSnippet || !item.sourceLink);
  const conditional = approvals.filter((item) => item.approvalType === 'CONDITIONAL');
  const rejected = approvals.filter((item) => item.status === 'REJECTED');
  const riskScore = approvals.length ? Math.max(...approvals.map(calculateRiskScore)) : 0;

  return {
    whatHappened: primary
      ? `${approvals.length} approval record${approvals.length === 1 ? '' : 's'} from ${sources} were grouped for investigation. The lead record is "${primary.subject}".`
      : 'No approval evidence has been attached yet.',
    whoApproved: approvals.map((item) => item.approverName ?? 'Unknown approver').filter(Boolean).join(', ') || 'No approver detected.',
    whyRisky: highRisk.length
      ? `${highRisk.length} high-risk approval${highRisk.length === 1 ? '' : 's'} involve ${departments}. Review evidence, conditions, and policy alignment before closure.`
      : 'No high-risk approval was attached, but the case should still be reviewed for evidence completeness.',
    policyApplies: policyForDepartments(departments),
    evidenceExists: approvals
      .filter((item) => item.evidenceSnippet)
      .map((item) => `${item.sourcePlatform ?? 'Source'} evidence for ${item.subject}`)
      .slice(0, 6),
    evidenceMissing: [
      ...(missingEvidence.length ? [`${missingEvidence.length} approval${missingEvidence.length === 1 ? '' : 's'} missing source evidence or link`] : []),
      ...(conditional.length ? [`${conditional.length} conditional approval${conditional.length === 1 ? '' : 's'} need condition verification`] : []),
      ...(rejected.length ? [`${rejected.length} rejection record${rejected.length === 1 ? '' : 's'} need escalation rationale`] : []),
    ],
    riskScore,
    riskLevel: riskLabel(riskScore),
  };
}

function policyForDepartments(departments: string) {
  const lower = departments.toLowerCase();
  const policies = [];
  if (lower.includes('procurement')) policies.push('Procurement Policy Section 4.2 - vendor approval and evidence requirements');
  if (lower.includes('legal')) policies.push('Legal Playbook Section 2.1 - contract redline and MSA sign-off');
  if (lower.includes('security')) policies.push('Security Exception Policy Section 3.4 - privileged access and SOC 2 evidence');
  if (lower.includes('finance')) policies.push('Finance Approval Matrix Section 1.3 - budget and payment thresholds');
  if (lower.includes('compliance')) policies.push('Compliance Governance Standard Section 5.1 - regulated evidence retention');
  return policies.length ? policies : ['Company Approval Policy - approval ownership and evidence retention'];
}

export function buildPolicyChecks(approvals: InvestigationApprovalWithEvidence[]) {
  const departments = [...new Set(approvals.map((item) => item.department ?? item.category ?? 'General'))];
  return departments.slice(0, 5).map((department) => {
    const departmentApprovals = approvals.filter((item) => item.department === department || item.category === department);
    const missingEvidence = departmentApprovals.some((item) => !item.evidenceSnippet || !item.sourceLink);
    const hasConditional = departmentApprovals.some((item) => item.approvalType === 'CONDITIONAL');
    const status = missingEvidence ? 'Partially compliant' : hasConditional ? 'Partially compliant' : 'Compliant';
    return {
      policy: `${department} policy`,
      status,
      finding: missingEvidence
        ? 'Evidence link or snippet is missing for at least one approval.'
        : hasConditional
          ? 'Approval is conditional and requires condition verification before closure.'
          : 'Required approver, timestamp, source, and evidence are present.',
    };
  });
}

export function timelineForApproval(approval: InvestigationApprovalWithEvidence) {
  const sourceTime = approval.messageSource?.receivedAt ?? approval.occurredAt;
  return [
    {
      at: sourceTime,
      type: `${approval.sourcePlatform ?? 'Source'} message`,
      title: approval.messageSource?.channel ?? approval.sourcePlatform ?? 'Source evidence',
      body: approval.evidenceSnippet ?? 'Message captured for classifier review.',
    },
    {
      at: approval.createdAt,
      type: 'Approval decision',
      title: approval.subject,
      body: `${approval.status.replaceAll('_', ' ')} with ${approval.confidence}% classifier confidence.`,
    },
    ...approval.auditLogs.map((event) => ({
      at: event.createdAt,
      type: 'Audit event',
      title: event.action.replaceAll('_', ' '),
      body: JSON.stringify(event.metadata ?? {}, null, 0).slice(0, 220),
    })),
  ];
}

export async function getInvestigationMetrics(organizationId: string) {
  const [investigationCounts, highRiskApprovals, missingApprovals, conditionalApprovals, approvalsWithoutEvidence] = await Promise.all([
    Promise.all([
      prisma.investigationCase.count({ where: { organizationId, status: 'OPEN' } }),
      prisma.investigationCase.count({ where: { organizationId, status: 'CLOSED' } }),
    ]).catch(() => [0, 0] as const),
    prisma.approvalRecord.count({ where: { organizationId, OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }] } }),
    prisma.approvalRecord.count({ where: { organizationId, status: 'PENDING_REVIEW' } }),
    prisma.approvalRecord.count({ where: { organizationId, approvalType: 'CONDITIONAL' } }),
    prisma.approvalRecord.count({ where: { organizationId, OR: [{ evidenceSnippet: null }, { sourceLink: null }] } }),
  ]);
  const [openInvestigations, closedInvestigations] = investigationCounts;

  return { openInvestigations, closedInvestigations, highRiskApprovals, missingApprovals, conditionalApprovals, approvalsWithoutEvidence };
}

export async function createInvestigationCase(input: {
  organizationId: string;
  title?: string;
  approvalIds: string[];
  department?: string;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
}) {
  const approvals = await prisma.approvalRecord.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.approvalIds.length ? { id: { in: input.approvalIds } } : {}),
      ...(input.department ? { department: input.department } : {}),
      ...(input.dateRangeStart || input.dateRangeEnd
        ? {
            occurredAt: {
              ...(input.dateRangeStart ? { gte: input.dateRangeStart } : {}),
              ...(input.dateRangeEnd ? { lte: input.dateRangeEnd } : {}),
            },
          }
        : {}),
    },
    include: { messageSource: true, auditLogs: true },
    orderBy: [{ riskLevel: 'desc' }, { occurredAt: 'desc' }],
    take: 25,
  });

  const summary = buildInvestigationSummary(approvals);
  const title = input.title?.trim() || approvals[0]?.subject || `${input.department ?? 'Approval'} investigation`;

  return prisma.investigationCase.create({
    data: {
      organizationId: input.organizationId,
      title,
      department: input.department || approvals[0]?.department,
      riskLevel: summary.riskLevel.toLowerCase(),
      summary: summary.whatHappened,
      dateRangeStart: input.dateRangeStart,
      dateRangeEnd: input.dateRangeEnd,
      metadata: {
        demo: approvals.some((item) => item.sourceLink?.includes('demo') || item.sourceLink?.includes('TDEMO')),
        aiSummary: summary,
        policyChecks: buildPolicyChecks(approvals),
      } as Prisma.InputJsonValue,
      approvals: {
        create: approvals.map((approval) => ({
          approvalRecordId: approval.id,
        })),
      },
    },
  });
}

export async function createDemoInvestigationsForOrganization(organizationId: string) {
  const existing = await prisma.investigationCase.count({
    where: {
      organizationId,
      metadata: { path: ['demo'], equals: true },
    },
  });
  if (existing > 0) return { investigationCount: existing };

  const highRiskApprovals = await prisma.approvalRecord.findMany({
    where: {
      organizationId,
      OR: [
        { sourceLink: { contains: 'demo' } },
        { sourceLink: { contains: 'TDEMO' } },
        { riskLevel: 'high' },
        { riskLevel: 'critical' },
        { approvalType: 'CONDITIONAL' },
        { status: 'REJECTED' },
      ],
    },
    take: 6,
    orderBy: { createdAt: 'desc' },
  });

  if (highRiskApprovals.length === 0) return { investigationCount: 0 };

  const procurement = highRiskApprovals.filter((item) => item.department === 'Procurement' || item.category === 'Procurement').map((item) => item.id);
  const security = highRiskApprovals.filter((item) => item.department === 'Security' || item.category === 'Security' || item.department === 'Compliance').map((item) => item.id);
  const cases = [
    { title: 'Vendor payment evidence review', approvalIds: procurement.length ? procurement : [highRiskApprovals[0].id], department: 'Procurement' },
    { title: 'Security and compliance approval exception review', approvalIds: security.length ? security : highRiskApprovals.slice(0, 2).map((item) => item.id), department: 'Compliance' },
  ];

  let created = 0;
  for (const item of cases) {
    const investigation = await createInvestigationCase({
      organizationId,
      title: item.title,
      approvalIds: item.approvalIds,
      department: item.department,
    });
    await prisma.investigationCase.update({
      where: { id: investigation.id },
      data: {
        metadata: {
          ...((investigation.metadata as Record<string, unknown> | null) ?? {}),
          demo: true,
        } as Prisma.InputJsonValue,
      },
    });
    created += 1;
  }
  return { investigationCount: created };
}
