import { prisma } from '@/lib/prisma';
import type { ApprovalStatus, ApprovalType, IntegrationProvider } from '@prisma/client';
import { createDemoInvestigationsForOrganization } from '@/services/investigations';
import { evaluateRecentApprovals, seedDemoPlaybooks } from '@/services/playbooks';

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
  sourcePlatform: 'slack' | 'gmail' | 'outlook' | 'teams' | 'jira' | 'servicenow' | 'zoom';
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
    subject: 'Exchange Online renewal approval',
    department: 'Finance',
    category: 'Finance',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 95,
    riskLevel: 'medium',
    businessImpact: 'Renews the Microsoft 365 and Exchange Online agreement before service expiration.',
    approverName: 'Monica Reyes',
    approverEmail: 'monica.reyes@acme.example',
    sourcePlatform: 'outlook',
    provider: 'OUTLOOK',
    channel: 'Outlook / Finance Approvals',
    sourceLink: 'https://outlook.office.com/mail/inbox/id/demo-outlook-finance-renewal',
    externalId: 'demo-outlook-finance-renewal',
    evidenceSnippet: 'Approved. Please proceed with the Exchange Online renewal at the quoted annual amount.',
    reasoning: 'Explicit finance approval was captured from an Outlook email thread with renewal context.',
    receivedHoursAgo: 9,
  },
  {
    subject: 'Contract amendment for regional distributor',
    department: 'Legal',
    category: 'Legal',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 93,
    riskLevel: 'high',
    businessImpact: 'Allows the distributor amendment to move forward once the indemnity language is attached.',
    approverName: 'Harper Singh',
    approverEmail: 'harper.singh@acme.example',
    sourcePlatform: 'outlook',
    provider: 'OUTLOOK',
    channel: 'Exchange / Legal Approvals',
    sourceLink: 'https://outlook.office.com/mail/inbox/id/demo-exchange-legal-amendment',
    externalId: 'demo-exchange-legal-amendment',
    evidenceSnippet: 'Legal approves provided the revised indemnity clause from yesterday is included before signature.',
    reasoning: 'Legal approval is conditional because the email requires a revised contract clause before signature.',
    conditions: 'Revised indemnity clause must be included before signature.',
    receivedHoursAgo: 14,
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
    subject: 'EU data processing addendum approval',
    department: 'Legal',
    category: 'Legal',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 95,
    riskLevel: 'high',
    businessImpact: 'Allows enterprise customer contract execution with GDPR evidence retained.',
    approverName: 'Nora Ellis',
    approverEmail: 'nora.ellis@acme.example',
    sourcePlatform: 'teams',
    provider: 'MICROSOFT_TEAMS',
    channel: 'Legal Review / Customer Contracts',
    sourceLink: 'https://teams.microsoft.com/l/message/demo-legal-channel/demo-teams-legal-dpa?groupId=TDEMO-TEAMS',
    externalId: 'demo-teams-legal-dpa',
    evidenceSnippet: 'Approved from Legal. The EU DPA language is acceptable for signature.',
    reasoning: 'Explicit Legal approval captured from a Teams channel with contract context.',
    receivedHoursAgo: 20,
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
  {
    subject: 'Vendor security questionnaire exception',
    department: 'Security',
    category: 'Security',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 91,
    riskLevel: 'critical',
    businessImpact: 'Allows vendor onboarding only if missing security evidence is received.',
    approverName: 'Victor Lane',
    approverEmail: 'victor.lane@acme.example',
    sourcePlatform: 'teams',
    provider: 'MICROSOFT_TEAMS',
    channel: 'Security Council / Vendor Risk',
    sourceLink: 'https://teams.microsoft.com/l/message/demo-security-channel/demo-teams-security-exception?groupId=TDEMO-TEAMS',
    externalId: 'demo-teams-security-exception',
    evidenceSnippet: 'Approved only if the updated penetration test summary is attached before go-live.',
    reasoning: 'Conditional security approval with missing evidence requirement and high business risk.',
    conditions: 'Updated penetration test summary must be attached before go-live.',
    receivedHoursAgo: 42,
  },
  {
    subject: 'CRM rollout scope change sign-off',
    department: 'Engineering',
    category: 'Engineering',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 93,
    riskLevel: 'medium',
    businessImpact: 'Approves a Jira-tracked scope change for the CRM rollout milestone.',
    approverName: 'Isha Nair',
    approverEmail: 'isha.nair@acme.example',
    sourcePlatform: 'jira',
    provider: 'JIRA',
    channel: 'CRM / CRM-248',
    sourceLink: 'https://acme-demo.atlassian.net/browse/CRM-248',
    externalId: 'demo-jira-crm-scope-change',
    evidenceSnippet: 'Approved. Move CRM-248 to Done and proceed with the revised rollout scope.',
    reasoning: 'Jira comment contains explicit approval and a status-change instruction for a scoped engineering ticket.',
    receivedHoursAgo: 10,
  },
  {
    subject: 'Procurement exception for implementation partner',
    department: 'Procurement',
    category: 'Procurement',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 91,
    riskLevel: 'high',
    businessImpact: 'Allows partner onboarding only after finance confirms the revised purchase order.',
    approverName: 'Rafael Costa',
    approverEmail: 'rafael.costa@acme.example',
    sourcePlatform: 'jira',
    provider: 'JIRA',
    channel: 'PROC / PROC-117',
    sourceLink: 'https://acme-demo.atlassian.net/browse/PROC-117',
    externalId: 'demo-jira-procurement-exception',
    evidenceSnippet: 'Approved provided Finance confirms the revised PO before vendor kickoff.',
    reasoning: 'Jira evidence contains conditional procurement approval with a Finance dependency.',
    conditions: 'Finance must confirm the revised purchase order before vendor kickoff.',
    receivedHoursAgo: 16,
  },
  {
    subject: 'Emergency change request for payment service failover',
    department: 'Engineering',
    category: 'Security',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 94,
    riskLevel: 'critical',
    businessImpact: 'Allows a ServiceNow emergency change to protect payment availability after CAB approval evidence is attached.',
    approverName: 'Kavya Menon',
    approverEmail: 'kavya.menon@acme.example',
    sourcePlatform: 'servicenow',
    provider: 'SERVICENOW',
    channel: 'Change Requests / CHG0042187',
    sourceLink: 'https://acme-demo.service-now.com/nav_to.do?uri=change_request.do?sys_id=demo-chg0042187',
    externalId: 'demo-servicenow-emergency-change',
    evidenceSnippet: 'CAB approves CHG0042187 provided rollback evidence and monitoring owner are attached before implementation.',
    reasoning: 'ServiceNow CAB approval is conditional because implementation depends on rollback and monitoring evidence.',
    conditions: 'Rollback evidence and monitoring owner must be attached before implementation.',
    receivedHoursAgo: 6,
  },
  {
    subject: 'Privileged access request for production incident',
    department: 'Security',
    category: 'Security',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 93,
    riskLevel: 'high',
    businessImpact: 'Approves time-boxed privileged access for an active production incident with audit trail.',
    approverName: 'Owen Miller',
    approverEmail: 'owen.miller@acme.example',
    sourcePlatform: 'servicenow',
    provider: 'SERVICENOW',
    channel: 'Access Requests / RITM0098842',
    sourceLink: 'https://acme-demo.service-now.com/nav_to.do?uri=sc_req_item.do?sys_id=demo-ritm0098842',
    externalId: 'demo-servicenow-access-request',
    evidenceSnippet: 'Approved for 4 hours only. Grant production database read access for incident INC0018921.',
    reasoning: 'Explicit ServiceNow access approval includes a clear time limit and incident context.',
    conditions: 'Access expires after 4 hours.',
    receivedHoursAgo: 11,
  },
  {
    subject: 'Executive approval for Q4 infrastructure budget',
    department: 'Finance',
    category: 'Finance',
    approvalType: 'EXPLICIT',
    status: 'APPROVED',
    confidence: 95,
    riskLevel: 'medium',
    businessImpact: 'Approves infrastructure spend discussed in an executive Zoom meeting with searchable transcript evidence.',
    approverName: 'Finance Leadership Team',
    approverEmail: 'finance-leadership@acme.example',
    sourcePlatform: 'zoom',
    provider: 'ZOOM',
    channel: 'Zoom / Executive Budget Review',
    sourceLink: 'https://zoom.us/rec/share/demo-executive-budget-review',
    externalId: 'demo-zoom-executive-budget-review',
    evidenceSnippet: 'Transcript 00:18:43 - Finance approves the Q4 infrastructure budget increase. Engineering can proceed.',
    reasoning: 'Zoom transcript contains explicit approval language, budget context, and owner department.',
    receivedHoursAgo: 4,
  },
  {
    subject: 'Vendor contract review from procurement meeting',
    department: 'Procurement',
    category: 'Procurement',
    approvalType: 'CONDITIONAL',
    status: 'PENDING_REVIEW',
    confidence: 92,
    riskLevel: 'high',
    businessImpact: 'Allows procurement to continue vendor onboarding only after Legal and CFO evidence is captured.',
    approverName: 'Procurement Review Committee',
    approverEmail: 'procurement-committee@acme.example',
    sourcePlatform: 'zoom',
    provider: 'ZOOM',
    channel: 'Zoom / Vendor Risk Review',
    sourceLink: 'https://zoom.us/rec/share/demo-vendor-risk-review',
    externalId: 'demo-zoom-vendor-risk-review',
    evidenceSnippet: 'Transcript 00:32:10 - Let’s move forward with the vendor contract provided Legal and the CFO sign off before signature.',
    reasoning: 'Meeting transcript includes conditional approval and missing cross-functional approvers.',
    conditions: 'Legal and CFO must sign off before signature.',
    receivedHoursAgo: 7,
  },
  {
    subject: 'Security review decision for public launch',
    department: 'Security',
    category: 'Security',
    approvalType: 'REJECTION',
    status: 'REJECTED',
    confidence: 93,
    riskLevel: 'critical',
    businessImpact: 'Prevents product launch until missing security evidence is reviewed.',
    approverName: 'Security Council',
    approverEmail: 'security-council@acme.example',
    sourcePlatform: 'zoom',
    provider: 'ZOOM',
    channel: 'Zoom / Launch Readiness Review',
    sourceLink: 'https://zoom.us/rec/share/demo-launch-security-review',
    externalId: 'demo-zoom-launch-security-review',
    evidenceSnippet: 'Transcript 00:41:02 - Not approved for launch today. We need more review on the penetration test findings.',
    reasoning: 'Zoom transcript contains direct rejection language and a clear missing evidence reason.',
    conditions: 'Penetration test findings must be reviewed before launch approval.',
    receivedHoursAgo: 13,
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
  const outlookIntegration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId,
        provider: 'OUTLOOK',
        externalAccount: 'approvals@acme.example',
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: ['offline_access', 'User.Read', 'Mail.Read'],
      metadata: demoMetadata({ account: 'approvals@acme.example', tenantId: 'TDEMO-M365', health: 'healthy', emailsProcessed: 28, approvalsFound: 2, mailboxType: 'Exchange Online' }),
    },
    create: {
      organizationId,
      provider: 'OUTLOOK',
      status: 'CONNECTED',
      externalAccount: 'approvals@acme.example',
      scopes: ['offline_access', 'User.Read', 'Mail.Read'],
      metadata: demoMetadata({ account: 'approvals@acme.example', tenantId: 'TDEMO-M365', health: 'healthy', emailsProcessed: 28, approvalsFound: 2, mailboxType: 'Exchange Online' }),
    },
  });
  const teamsIntegration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId,
        provider: 'MICROSOFT_TEAMS',
        externalAccount: 'Acme Demo Microsoft 365',
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: ['offline_access', 'User.Read', 'Team.ReadBasic.All', 'Channel.ReadBasic.All', 'ChannelMessage.Read.All'],
      metadata: demoMetadata({
        tenantId: 'TDEMO-TEAMS',
        workspace: 'Acme Demo Microsoft 365',
        health: 'healthy',
        teamsProcessed: 4,
        channelsProcessed: 12,
        messagesProcessed: 27,
        approvalsFound: 2,
      }),
    },
    create: {
      organizationId,
      provider: 'MICROSOFT_TEAMS',
      status: 'CONNECTED',
      externalAccount: 'Acme Demo Microsoft 365',
      scopes: ['offline_access', 'User.Read', 'Team.ReadBasic.All', 'Channel.ReadBasic.All', 'ChannelMessage.Read.All'],
      metadata: demoMetadata({
        tenantId: 'TDEMO-TEAMS',
        workspace: 'Acme Demo Microsoft 365',
        health: 'healthy',
        teamsProcessed: 4,
        channelsProcessed: 12,
        messagesProcessed: 27,
        approvalsFound: 2,
      }),
    },
  });
  const jiraIntegration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId,
        provider: 'JIRA',
        externalAccount: 'Acme Demo Jira',
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: ['read:jira-work', 'read:jira-user'],
      metadata: demoMetadata({
        cloudId: 'JIRA-DEMO-CLOUD',
        siteName: 'Acme Demo Jira',
        siteUrl: 'https://acme-demo.atlassian.net',
        health: 'healthy',
        issuesProcessed: 12,
        commentsProcessed: 21,
        approvalsFound: 2,
      }),
    },
    create: {
      organizationId,
      provider: 'JIRA',
      status: 'CONNECTED',
      externalAccount: 'Acme Demo Jira',
      scopes: ['read:jira-work', 'read:jira-user'],
      metadata: demoMetadata({
        cloudId: 'JIRA-DEMO-CLOUD',
        siteName: 'Acme Demo Jira',
        siteUrl: 'https://acme-demo.atlassian.net',
        health: 'healthy',
        issuesProcessed: 12,
        commentsProcessed: 21,
        approvalsFound: 2,
      }),
    },
  });
  const serviceNowIntegration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId,
        provider: 'SERVICENOW',
        externalAccount: 'Acme Demo ServiceNow',
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: ['useraccount', 'openid', 'profile', 'email'],
      metadata: demoMetadata({
        instanceHost: 'acme-demo.service-now.com',
        instanceUrl: 'https://acme-demo.service-now.com',
        health: 'healthy',
        changeRequestsProcessed: 8,
        catalogRequestsProcessed: 14,
        approvalsFound: 2,
      }),
    },
    create: {
      organizationId,
      provider: 'SERVICENOW',
      status: 'CONNECTED',
      externalAccount: 'Acme Demo ServiceNow',
      scopes: ['useraccount', 'openid', 'profile', 'email'],
      metadata: demoMetadata({
        instanceHost: 'acme-demo.service-now.com',
        instanceUrl: 'https://acme-demo.service-now.com',
        health: 'healthy',
        changeRequestsProcessed: 8,
        catalogRequestsProcessed: 14,
        approvalsFound: 2,
      }),
    },
  });
  const zoomIntegration = await prisma.integration.upsert({
    where: {
      organizationId_provider_externalAccount: {
        organizationId,
        provider: 'ZOOM',
        externalAccount: 'Acme Demo Zoom',
      },
    },
    update: {
      status: 'CONNECTED',
      scopes: ['user:read', 'meeting:read', 'recording:read', 'report:read'],
      metadata: demoMetadata({
        accountId: 'ZOOM-DEMO-ACCOUNT',
        userId: 'ZOOM-DEMO-HOST',
        workspace: 'Acme Demo Zoom',
        health: 'healthy',
        meetingsProcessed: 6,
        transcriptsProcessed: 3,
        approvalsFound: 3,
      }),
    },
    create: {
      organizationId,
      provider: 'ZOOM',
      status: 'CONNECTED',
      externalAccount: 'Acme Demo Zoom',
      scopes: ['user:read', 'meeting:read', 'recording:read', 'report:read'],
      metadata: demoMetadata({
        accountId: 'ZOOM-DEMO-ACCOUNT',
        userId: 'ZOOM-DEMO-HOST',
        workspace: 'Acme Demo Zoom',
        health: 'healthy',
        meetingsProcessed: 6,
        transcriptsProcessed: 3,
        approvalsFound: 3,
      }),
    },
  });

  for (const [index, item] of demoApprovals.entries()) {
    const receivedAt = new Date(Date.now() - item.receivedHoursAgo * 60 * 60 * 1000);
    const integrationByProvider = {
      SLACK: slackIntegration.id,
      GMAIL: gmailIntegration.id,
      OUTLOOK: outlookIntegration.id,
      MICROSOFT_TEAMS: teamsIntegration.id,
      JIRA: jiraIntegration.id,
      SERVICENOW: serviceNowIntegration.id,
      ZOOM: zoomIntegration.id,
      CUSTOM: undefined,
    } satisfies Partial<Record<IntegrationProvider, string | undefined>>;
    const integrationId = integrationByProvider[item.provider];

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
        journey: 'Slack/Gmail/Teams message -> approval detected -> timeline -> audit log -> CSV/PDF export',
      }),
    },
  });

  const playbooks = await seedDemoPlaybooks(organizationId);
  const evaluations = await evaluateRecentApprovals(organizationId, 50);
  const investigations = await createDemoInvestigationsForOrganization(organizationId);
  return { approvalCount: created.length, investigationCount: investigations.investigationCount, playbookCount: playbooks.created, evaluationCount: evaluations.length };
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
    prisma.investigationNote.deleteMany({
      where: {
        organizationId,
        OR: [
          { investigation: { metadata: { path: ['demo'], equals: true } } },
          { investigation: { approvals: { some: { approvalRecordId: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] } } } } },
        ],
      },
    }),
    prisma.investigationCase.deleteMany({
      where: {
        organizationId,
        OR: [
          { metadata: { path: ['demo'], equals: true } },
          { approvals: { some: { approvalRecordId: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] } } } },
        ],
      },
    }),
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
