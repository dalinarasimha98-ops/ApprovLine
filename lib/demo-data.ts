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
  sourcePlatform: 'slack' | 'gmail';
  provider: IntegrationProvider;
  channel: string;
  sourceLink: string;
  externalId: string;
  evidenceSnippet: string;
  reasoning: string;
  conditions?: string;
  receivedHoursAgo: number;
};

const demoRunId = 'approvline-demo-workspace-v2';

const demoApprovals: DemoApproval[] = [
  {
    subject: 'Q3 marketing budget increase to $250K',
    department: 'Finance',
    category: 'Finance',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 96,
    riskLevel: 'medium',
    businessImpact: 'Enables enterprise pipeline campaigns while preserving a finance approval trail.',
    approverName: 'Sarah Chen',
    approverEmail: 'sarah.chen@acme.example',
    sourcePlatform: 'slack',
    provider: 'SLACK',
    channel: '#finance-approvals',
    sourceLink: 'https://app.slack.com/client/TDEMO/CDEMO/p1719572401000000',
    externalId: 'demo-slack-finance-budget',
    evidenceSnippet: 'Approved. Move forward with the Q3 marketing budget increase to $250K.',
    reasoning: 'Explicit approval language, clear owner, financial amount, and action to proceed.',
    receivedHoursAgo: 2,
  },
  {
    subject: 'Northstar Analytics vendor payment',
    department: 'Procurement',
    category: 'Procurement',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 92,
    riskLevel: 'high',
    businessImpact: 'Unblocks vendor payment after security documentation is verified.',
    approverName: 'Priya Sharma',
    approverEmail: 'priya.sharma@acme.example',
    sourcePlatform: 'gmail',
    provider: 'GMAIL',
    channel: 'procurement@acme.example',
    sourceLink: 'https://mail.google.com/mail/u/0/#inbox/demo-procurement-thread',
    externalId: 'demo-gmail-procurement-payment',
    evidenceSnippet: 'Approved provided the updated SOC 2 report is attached before payment.',
    reasoning: 'Approval is present, but it includes a security evidence condition.',
    conditions: 'Updated SOC 2 report must be attached before payment release.',
    receivedHoursAgo: 5,
  },
  {
    subject: 'Enterprise MSA redlines',
    department: 'Legal',
    category: 'Legal',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 94,
    riskLevel: 'medium',
    businessImpact: 'Allows sales to send the revised enterprise contract for signature.',
    approverName: 'James Okafor',
    approverEmail: 'james.okafor@acme.example',
    sourcePlatform: 'gmail',
    provider: 'GMAIL',
    channel: 'legal@acme.example',
    sourceLink: 'https://mail.google.com/mail/u/0/#inbox/demo-legal-thread',
    externalId: 'demo-gmail-legal-msa',
    evidenceSnippet: 'Legal is good with these revised terms. You can send for signature.',
    reasoning: 'Legal sign-off is stated clearly for revised contract terms.',
    receivedHoursAgo: 8,
  },
  {
    subject: 'Production database access exception',
    department: 'Security',
    category: 'Security',
    approvalType: 'REJECTION',
    status: 'REJECTED',
    confidence: 95,
    riskLevel: 'high',
    businessImpact: 'Blocks privileged production access until the exception is documented.',
    approverName: 'Maya Patel',
    approverEmail: 'maya.patel@acme.example',
    sourcePlatform: 'slack',
    provider: 'SLACK',
    channel: '#security-review',
    sourceLink: 'https://app.slack.com/client/TDEMO/CSECURITY/p1719565201000000',
    externalId: 'demo-slack-security-rejection',
    evidenceSnippet: 'Do not move forward with prod access until the exception is documented.',
    reasoning: 'Clear rejection language on a security-sensitive request.',
    conditions: 'Access may be reconsidered after exception documentation is complete.',
    receivedHoursAgo: 12,
  },
  {
    subject: 'Invoice workflow backend release',
    department: 'Engineering',
    category: 'Engineering',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 89,
    riskLevel: 'low',
    businessImpact: 'Allows engineering to release invoice workflow improvements after test verification.',
    approverName: 'Daniel Lee',
    approverEmail: 'daniel.lee@acme.example',
    sourcePlatform: 'slack',
    provider: 'SLACK',
    channel: '#eng-release',
    sourceLink: 'https://app.slack.com/client/TDEMO/CENG/p1719558001000000',
    externalId: 'demo-slack-engineering-release',
    evidenceSnippet: 'Looks good from engineering. Approved for release after tests pass.',
    reasoning: 'Approval is explicit and tied to engineering release readiness.',
    conditions: 'Automated regression tests must pass before release.',
    receivedHoursAgo: 18,
  },
  {
    subject: 'GDPR retention policy update',
    department: 'Compliance',
    category: 'Compliance',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 97,
    riskLevel: 'high',
    businessImpact: 'Updates retention controls for regulated customer data.',
    approverName: 'Elena Rossi',
    approverEmail: 'elena.rossi@acme.example',
    sourcePlatform: 'gmail',
    provider: 'GMAIL',
    channel: 'compliance@acme.example',
    sourceLink: 'https://mail.google.com/mail/u/0/#inbox/demo-compliance-thread',
    externalId: 'demo-gmail-compliance-retention',
    evidenceSnippet: 'Compliance approves the retention policy update for the GDPR control set.',
    reasoning: 'Explicit compliance approval with policy scope and regulated data context.',
    receivedHoursAgo: 24,
  },
  {
    subject: 'Candidate offer compensation band',
    department: 'HR',
    category: 'HR',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 90,
    riskLevel: 'medium',
    businessImpact: 'Approves compensation band for a priority hiring decision.',
    approverName: 'Avery Brooks',
    approverEmail: 'avery.brooks@acme.example',
    sourcePlatform: 'gmail',
    provider: 'GMAIL',
    channel: 'people@acme.example',
    sourceLink: 'https://mail.google.com/mail/u/0/#inbox/demo-hr-thread',
    externalId: 'demo-gmail-hr-offer',
    evidenceSnippet: 'Approved for the senior engineer offer at band E5. Please proceed.',
    reasoning: 'Explicit HR approval with candidate compensation scope.',
    receivedHoursAgo: 30,
  },
  {
    subject: 'Customer data export exception',
    department: 'Compliance',
    category: 'Compliance',
    approvalType: 'REJECTION',
    status: 'REJECTED',
    confidence: 93,
    riskLevel: 'high',
    businessImpact: 'Prevents export of customer data without documented legal basis.',
    approverName: 'Omar Hassan',
    approverEmail: 'omar.hassan@acme.example',
    sourcePlatform: 'slack',
    provider: 'SLACK',
    channel: '#privacy-review',
    sourceLink: 'https://app.slack.com/client/TDEMO/CPRIVACY/p1719543601000000',
    externalId: 'demo-slack-compliance-rejection',
    evidenceSnippet: 'Do not approve the customer export until legal basis is documented.',
    reasoning: 'Direct rejection of a compliance-sensitive data export request.',
    conditions: 'Legal basis and customer request ID must be documented before approval.',
    receivedHoursAgo: 36,
  },
];

function demoMetadata(extra: Record<string, unknown> = {}) {
  return {
    demo: true,
    demoRunId,
    ...extra,
  };
}

export async function createDemoDataForOrganization(organizationId: string) {
  await resetDemoDataForOrganization(organizationId);

  const created = [];

  const slackIntegration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId,
        provider: 'SLACK',
        externalAccount: 'Acme Demo Slack',
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: ['channels:history', 'groups:history', 'im:history', 'users:read'],
      metadata: demoMetadata({ workspace: 'Acme Demo Slack', health: 'healthy', messagesProcessed: 14, approvalsFound: 5 }),
    },
    create: {
      organizationId,
      provider: 'SLACK',
      status: 'CONNECTED',
      externalAccount: 'Acme Demo Slack',
      scopes: ['channels:history', 'groups:history', 'im:history', 'users:read'],
      metadata: demoMetadata({ workspace: 'Acme Demo Slack', health: 'healthy', messagesProcessed: 14, approvalsFound: 5 }),
    },
  });

  const gmailIntegration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId,
        provider: 'GMAIL',
        externalAccount: 'approvals@acme.example',
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: ['gmail.readonly', 'profile', 'email'],
      metadata: demoMetadata({ account: 'approvals@acme.example', health: 'healthy', emailsProcessed: 32, approvalsFound: 4 }),
    },
    create: {
      organizationId,
      provider: 'GMAIL',
      status: 'CONNECTED',
      externalAccount: 'approvals@acme.example',
      scopes: ['gmail.readonly', 'profile', 'email'],
      metadata: demoMetadata({ account: 'approvals@acme.example', health: 'healthy', emailsProcessed: 32, approvalsFound: 4 }),
    },
  });

  for (const [index, item] of demoApprovals.entries()) {
    const receivedAt = new Date(Date.now() - item.receivedHoursAgo * 60 * 60 * 1000);
    const integrationId = item.provider === 'SLACK' ? slackIntegration.id : gmailIntegration.id;

    const messageSource = await prisma.messageSource.create({
      data: {
        organizationId,
        integrationId,
        provider: item.provider,
        externalId: item.externalId,
        channel: item.channel,
        sender: item.approverName,
        senderEmail: item.approverEmail,
        receivedAt,
        rawPayload: demoMetadata({
          sourcePlatform: item.sourcePlatform,
          snippet: item.evidenceSnippet,
          originalLink: item.sourceLink,
        }),
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
        sourceLink: item.sourceLink,
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
        model: 'demo-classifier',
        promptVersion: 'demo-v2',
        inputHash: `${demoRunId}-${index}`,
        approvalDetected: item.status !== 'NOT_A_DECISION',
        approvalType: item.approvalType,
        confidence: item.confidence,
        normalizedJson: demoMetadata({
          approval_detected: item.status !== 'NOT_A_DECISION',
          approver_name: item.approverName,
          approver_email: item.approverEmail,
          approval_timestamp: receivedAt.toISOString(),
          source_platform: item.sourcePlatform,
          subject: item.subject,
          department: item.department,
          category: item.category,
          risk_level: item.riskLevel,
          business_impact: item.businessImpact,
          conditions: item.conditions ?? null,
        }),
        latencyMs: 180 + index * 9,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        approvalRecordId: approval.id,
        action: item.status === 'REJECTED' ? 'demo.rejection.detected' : 'demo.approval.detected',
        metadata: demoMetadata({
          sourcePlatform: item.sourcePlatform,
          category: item.category,
          journey: 'message_to_classifier_to_timeline_to_export',
          evidenceLink: item.sourceLink,
        }),
      },
    });

    await prisma.event.create({
      data: {
        organizationId,
        integrationId,
        type: 'demo.timeline.recorded',
        payload: demoMetadata({
          approvalRecordId: approval.id,
          subject: item.subject,
          sourcePlatform: item.sourcePlatform,
          auditAction: item.status === 'REJECTED' ? 'demo.rejection.detected' : 'demo.approval.detected',
        }),
        processedAt: new Date(),
      },
    });

    created.push(approval);
  }

  await prisma.auditLog.create({
    data: {
      organizationId,
      action: 'demo.workspace.generated',
      metadata: demoMetadata({
        approvalCount: created.length,
        journey: 'Slack/Gmail message -> approval detected -> timeline -> audit log -> CSV/PDF export',
      }),
    },
  });

  return { approvalCount: created.length };
}

export async function resetDemoDataForOrganization(organizationId: string) {
  const demoSources = await prisma.messageSource.findMany({
    where: {
      organizationId,
      externalId: { startsWith: 'demo-' },
    },
    select: { id: true },
  });
  const demoSourceIds = demoSources.map((source) => source.id);
  const demoApprovals = await prisma.approvalRecord.findMany({
    where: {
      organizationId,
      OR: [
        { sourceLink: { contains: '/demo-' } },
        { sourceLink: { contains: 'TDEMO' } },
        { messageSourceId: { in: demoSourceIds.length ? demoSourceIds : ['__none__'] } },
      ],
    },
    select: { id: true },
  });
  const demoApprovalIds = demoApprovals.map((approval) => approval.id);

  await prisma.$transaction([
    prisma.classifierResult.deleteMany({
      where: {
        organizationId,
        OR: [
          { inputHash: { startsWith: demoRunId } },
          { approvalRecordId: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] } },
          { messageSourceId: { in: demoSourceIds.length ? demoSourceIds : ['__none__'] } },
        ],
      },
    }),
    prisma.auditLog.deleteMany({
      where: {
        organizationId,
        OR: [
          { action: { startsWith: 'demo.' } },
          { approvalRecordId: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] } },
        ],
      },
    }),
    prisma.event.deleteMany({
      where: {
        organizationId,
        type: { startsWith: 'demo.' },
      },
    }),
    prisma.approvalRecord.deleteMany({
      where: {
        organizationId,
        id: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] },
      },
    }),
    prisma.messageSource.deleteMany({
      where: {
        organizationId,
        id: { in: demoSourceIds.length ? demoSourceIds : ['__none__'] },
      },
    }),
    prisma.integration.deleteMany({
      where: {
        organizationId,
        metadata: {
          path: ['demo'],
          equals: true,
        },
      },
    }),
  ]);

  return { reset: true };
}
