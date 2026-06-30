import { prisma } from '@/lib/prisma';
import type { ApprovalStatus, ApprovalType, IntegrationProvider } from '@prisma/client';

type DemoApproval = {
  subject: string;
  department: string;
  category: string;
  approvalType: ApprovalType;
  status: ApprovalStatus;
  confidence: number;
  riskLevel: string;
  businessImpact: string;
  approverName: string;
  approverEmail: string;
  sourcePlatform: string;
  provider: IntegrationProvider;
  evidenceSnippet: string;
  reasoning: string;
  conditions?: string;
};

const demoApprovals: DemoApproval[] = [
  {
    subject: 'Q3 marketing budget increase to $250K',
    department: 'Finance',
    category: 'Budget Approvals',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 96,
    riskLevel: 'medium',
    businessImpact: 'Enables campaign spend for enterprise pipeline growth.',
    approverName: 'Sarah Chen',
    approverEmail: 'sarah.chen@example.com',
    sourcePlatform: 'slack',
    provider: 'SLACK',
    evidenceSnippet: 'Approved. Move forward with the Q3 marketing budget increase to $250K.',
    reasoning: 'Explicit approval language with a clear finance subject and amount.',
  },
  {
    subject: 'Vendor payment for Northstar Analytics',
    department: 'Procurement',
    category: 'Vendor Onboarding',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 91,
    riskLevel: 'high',
    businessImpact: 'Unblocks vendor payment after security documentation is attached.',
    approverName: 'Priya Sharma',
    approverEmail: 'priya.sharma@example.com',
    sourcePlatform: 'gmail',
    provider: 'GMAIL',
    evidenceSnippet: 'Approved provided the updated SOC 2 report is attached before payment.',
    reasoning: 'Approval is present but depends on a security evidence condition.',
    conditions: 'Updated SOC 2 report must be attached before payment.',
  },
  {
    subject: 'Master services agreement redlines',
    department: 'Legal',
    category: 'Contracts',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 94,
    riskLevel: 'medium',
    businessImpact: 'Allows sales to countersign customer contract.',
    approverName: 'James Okafor',
    approverEmail: 'james.okafor@example.com',
    sourcePlatform: 'gmail',
    provider: 'GMAIL',
    evidenceSnippet: 'Legal is good with these revised terms. You can send for signature.',
    reasoning: 'Legal sign-off is stated clearly for revised contract terms.',
  },
  {
    subject: 'Production database access exception',
    department: 'Security',
    category: 'Security Reviews',
    approvalType: 'REJECTION',
    status: 'REJECTED',
    confidence: 93,
    riskLevel: 'high',
    businessImpact: 'Prevents access exception until compensating controls are documented.',
    approverName: 'Maya Patel',
    approverEmail: 'maya.patel@example.com',
    sourcePlatform: 'slack',
    provider: 'SLACK',
    evidenceSnippet: 'Do not move forward with prod access until the exception is documented.',
    reasoning: 'Clear rejection language for a security-sensitive request.',
  },
  {
    subject: 'Backend release for invoice workflow',
    department: 'Engineering',
    category: 'Engineering Changes',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 89,
    riskLevel: 'low',
    businessImpact: 'Allows engineering to release invoice workflow improvements.',
    approverName: 'Daniel Lee',
    approverEmail: 'daniel.lee@example.com',
    sourcePlatform: 'slack',
    provider: 'SLACK',
    evidenceSnippet: 'Looks good from engineering. Approved for release after tests pass.',
    reasoning: 'Approval is explicit and tied to engineering release readiness.',
    conditions: 'Automated tests must pass before release.',
  },
  {
    subject: 'GDPR retention policy update',
    department: 'Compliance',
    category: 'Compliance Decisions',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 97,
    riskLevel: 'high',
    businessImpact: 'Updates retention controls for regulated customer data.',
    approverName: 'Elena Rossi',
    approverEmail: 'elena.rossi@example.com',
    sourcePlatform: 'gmail',
    provider: 'GMAIL',
    evidenceSnippet: 'Compliance approves the retention policy update for the GDPR control set.',
    reasoning: 'Explicit compliance approval with policy scope.',
  },
];

export async function createDemoDataForOrganization(organizationId: string) {
  const created = [];

  for (const [index, item] of demoApprovals.entries()) {
    const receivedAt = new Date(Date.now() - (index + 1) * 60 * 60 * 1000);
    const messageSource = await prisma.messageSource.create({
      data: {
        organizationId,
        provider: item.provider,
        externalId: `demo-${Date.now()}-${index}`,
        channel: item.sourcePlatform === 'slack' ? '#approvals' : 'approvals@example.com',
        sender: item.approverName,
        senderEmail: item.approverEmail,
        receivedAt,
        rawPayload: {
          demo: true,
          snippet: item.evidenceSnippet,
        },
      },
    });

    const approval = await prisma.approvalRecord.create({
      data: {
        organizationId,
        messageSourceId: messageSource.id,
        approverName: item.approverName,
        approverEmail: item.approverEmail,
        subject: item.subject,
        department: item.department,
        category: item.category,
        approvalType: item.approvalType,
        status: item.status,
        confidence: item.confidence,
        riskLevel: item.riskLevel,
        businessImpact: item.businessImpact,
        reasoning: item.reasoning,
        conditions: item.conditions,
        sourcePlatform: item.sourcePlatform,
        sourceLink: `https://approvline.example/demo/${messageSource.id}`,
        evidenceSnippet: item.evidenceSnippet,
        approvalTimestamp: receivedAt,
        occurredAt: receivedAt,
      },
    });

    await prisma.classifierResult.create({
      data: {
        organizationId,
        messageSourceId: messageSource.id,
        approvalRecordId: approval.id,
        model: 'demo-seed',
        promptVersion: 'demo-v1',
        inputHash: `demo-${approval.id}`,
        approvalDetected: item.status !== 'NOT_A_DECISION',
        approvalType: item.approvalType,
        confidence: item.confidence,
        normalizedJson: {
          demo: true,
          approval_detected: item.status !== 'NOT_A_DECISION',
          subject: item.subject,
          category: item.category,
        },
        latencyMs: 120,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        approvalRecordId: approval.id,
        action: 'demo.approval.created',
        metadata: {
          demo: true,
          sourcePlatform: item.sourcePlatform,
          category: item.category,
        },
      },
    });

    await prisma.event.create({
      data: {
        organizationId,
        type: 'demo.timeline.created',
        payload: {
          demo: true,
          approvalRecordId: approval.id,
          subject: item.subject,
        },
        processedAt: new Date(),
      },
    });

    created.push(approval);
  }

  return { approvalCount: created.length };
}
