import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

const plans = [
  {
    name: 'Free Trial',
    price: '$0',
    audience: 'Pilot validation',
    limits: '14 days, demo-ready workspace',
    features: ['Core approvals', 'Slack/Gmail/Jira pilots', 'ROI preview'],
  },
  {
    name: 'Starter',
    price: '$49/mo',
    audience: 'Small teams',
    limits: '5 users, 2 integrations',
    features: ['Approval history', 'CSV export', 'Basic health score'],
  },
  {
    name: 'Growth',
    price: '$199/mo',
    audience: 'Scaling compliance teams',
    limits: '25 users, 5 integrations',
    features: ['Playbook AI', 'Investigations', 'Executive ROI reports'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    audience: 'Regulated organizations',
    limits: 'Unlimited users, custom controls',
    features: ['SSO placeholders', 'Security center', 'Retention controls'],
  },
] as const;

type CustomerSuccessAction =
  | 'customer_success.feedback_submitted'
  | 'customer_success.nps_submitted'
  | 'customer_success.plan_selected'
  | 'customer_success.case_study_generated'
  | 'customer_success.retention_updated';

async function safeMetric<T>(label: string, query: Promise<T>, fallback: T) {
  try {
    return await withTimeout(label, query, 1400);
  } catch (error) {
    console.warn(`[customer-success] ${label} unavailable`, error);
    return fallback;
  }
}

function auditMetadata(value: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue {
  return value ?? {};
}

export async function logCustomerSuccessAction(input: {
  organizationId: string;
  actorUserId?: string | null;
  action: CustomerSuccessAction;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      metadata: auditMetadata(input.metadata),
    },
  });
}

export async function submitCustomerFeedback(input: {
  organizationId: string;
  userId?: string | null;
  type: string;
  title: string;
  body: string;
}) {
  return logCustomerSuccessAction({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'customer_success.feedback_submitted',
    metadata: {
      type: input.type,
      title: input.title,
      body: input.body,
      status: 'open',
      source: 'customer_success_module',
    },
  });
}

export async function submitNpsScore(input: {
  organizationId: string;
  userId?: string | null;
  score: number;
  comment?: string | null;
}) {
  return logCustomerSuccessAction({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'customer_success.nps_submitted',
    metadata: {
      score: Math.max(0, Math.min(10, input.score)),
      comment: input.comment ?? null,
      source: 'customer_success_module',
    },
  });
}

export async function selectCustomerPlan(input: {
  organizationId: string;
  userId?: string | null;
  plan: string;
}) {
  await logCustomerSuccessAction({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'customer_success.plan_selected',
    metadata: { plan: input.plan, source: 'customer_success_module' },
  });
}

export async function buildCustomerSuccessDashboard(organizationId: string) {
  const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    subscription,
    users,
    weeklyActiveUsers,
    integrations,
    connectedIntegrations,
    approvalVolume,
    monthlyApprovals,
    investigations,
    playbooks,
    playbookQueries,
    exportsGenerated,
    feedbackEvents,
    errorEvents,
    highRiskApprovals,
    conditionalApprovals,
  ] = await Promise.all([
    safeMetric(
      'subscription',
      prisma.subscription.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
      null,
    ),
    safeMetric('users', prisma.user.count({ where: { organizationId } }), 0),
    safeMetric(
      'weekly active users',
      prisma.auditLog.groupBy({
        by: ['actorUserId'],
        where: { organizationId, actorUserId: { not: null }, createdAt: { gte: sinceWeek } },
      }),
      [],
    ),
    safeMetric('integrations', prisma.integration.count({ where: { organizationId } }), 0),
    safeMetric('connected integrations', prisma.integration.count({ where: { organizationId, status: { in: ['CONNECTED', 'SYNCING'] } } }), 0),
    safeMetric('approval volume', prisma.approvalRecord.count({ where: { organizationId } }), 0),
    safeMetric('monthly approvals', prisma.approvalRecord.count({ where: { organizationId, createdAt: { gte: sinceMonth } } }), 0),
    safeMetric('investigations', prisma.investigationCase.count({ where: { organizationId } }), 0),
    safeMetric('playbooks', prisma.playbookDocument.count({ where: { organizationId } }), 0),
    safeMetric('playbook queries', prisma.playbookQuery.count({ where: { organizationId } }), 0),
    safeMetric('exports generated', prisma.auditLog.count({ where: { organizationId, action: { contains: 'export' } } }), 0),
    safeMetric(
      'feedback events',
      prisma.auditLog.findMany({
        where: {
          organizationId,
          action: { in: ['pilot.feedback.submitted', 'pilot.issue.reported', 'customer_success.feedback_submitted', 'customer_success.nps_submitted'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      [],
    ),
    safeMetric(
      'error events',
      prisma.auditLog.count({
        where: {
          organizationId,
          OR: [
            { action: { contains: 'error' } },
            { action: { contains: 'failed' } },
          ],
        },
      }),
      0,
    ),
    safeMetric('high risk approvals', prisma.approvalRecord.count({ where: { organizationId, riskLevel: { in: ['high', 'critical', 'HIGH', 'CRITICAL'] } } }), 0),
    safeMetric('conditional approvals', prisma.approvalRecord.count({ where: { organizationId, approvalType: 'CONDITIONAL' } }), 0),
  ]);

  const weeklyActiveUserCount = weeklyActiveUsers.length;
  const estimatedHoursSaved = Math.round((approvalVolume * 0.18 + investigations * 1.5 + playbookQueries * 0.12) * 10) / 10;
  const auditEffortReduced = Math.round((exportsGenerated * 1.25 + monthlyApprovals * 0.08) * 10) / 10;
  const complianceImprovement = Math.min(98, 45 + connectedIntegrations * 10 + Math.min(30, playbooks * 6) + Math.min(15, approvalVolume));
  const financialImpact = Math.round((estimatedHoursSaved * 95 + highRiskApprovals * 850 + conditionalApprovals * 250));

  const healthInputs = {
    weeklyActiveUsers: Math.min(30, weeklyActiveUserCount * 8),
    integrations: Math.min(25, connectedIntegrations * 8),
    approvalVolume: Math.min(25, monthlyApprovals * 2),
    playbookUsage: Math.min(20, playbookQueries * 4 + playbooks * 3),
  };
  const healthScore = Math.min(100, Object.values(healthInputs).reduce((sum, value) => sum + value, 0));
  const healthLabel = healthScore >= 75 ? 'Healthy' : healthScore >= 45 ? 'Needs attention' : 'At risk';

  const trialEndsAt = subscription?.currentPeriodEnd ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const daysUntilTrialEnds = Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const notifications = [
    ...(daysUntilTrialEnds <= 5 ? [{ tone: 'warning', title: 'Trial ending soon', body: `${Math.max(0, daysUntilTrialEnds)} days left in the current trial window.` }] : []),
    ...(connectedIntegrations === 0 ? [{ tone: 'error', title: 'No integrations connected', body: 'Connect Slack, Gmail, Teams, or Jira before inviting pilot customers.' }] : []),
    ...(monthlyApprovals < 5 ? [{ tone: 'warning', title: 'Low usage detected', body: 'Generate demo data or connect an integration to show customer value.' }] : []),
    ...(errorEvents > 0 ? [{ tone: 'error', title: 'Errors detected', body: `${errorEvents} error-related audit events need review.` }] : []),
  ];

  const roiSummary = `ApprovLine has captured ${approvalVolume} approvals, reduced audit preparation by an estimated ${auditEffortReduced} hours, and created roughly $${financialImpact.toLocaleString()} in measurable operational value.`;

  return {
    plans,
    subscription: {
      plan: subscription?.plan ?? 'Free Trial',
      status: subscription?.status ?? 'TRIALING',
      seats: subscription?.seats ?? (users || 1),
      currentPeriodEnd: trialEndsAt,
    },
    billing: {
      users,
      integrations,
      connectedIntegrations,
      playbooks,
      approvalVolume,
    },
    usage: {
      approvalsCaptured: approvalVolume,
      investigationsCreated: investigations,
      playbookQueries,
      exportsGenerated,
    },
    roi: {
      estimatedHoursSaved,
      auditEffortReduced,
      complianceImprovement,
      financialImpact,
      summary: roiSummary,
    },
    health: {
      score: healthScore,
      label: healthLabel,
      inputs: healthInputs,
    },
    notifications,
    feedbackEvents,
    enterprise: {
      sso: 'Placeholder ready',
      securityCenter: 'Read-only connectors, encryption, audit logging',
      retention: 'Default retention active; enterprise policy controls staged',
    },
  };
}
