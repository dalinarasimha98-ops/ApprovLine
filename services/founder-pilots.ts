import type { CustomerAccount, CustomerHealth, CustomerIntegrationStatus, CustomerSeatAllocation, FounderManagedUser } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';

export type PilotStatus = 'Prospect' | 'Demo Scheduled' | 'Pilot Active' | 'Pilot At Risk' | 'Pilot Completed' | 'Converted' | 'Lost';
export type PilotHealthLabel = 'Healthy' | 'Needs Attention' | 'At Risk' | 'Critical';

type CustomerWithFounderRelations = CustomerAccount & {
  health: CustomerHealth | null;
  seatAllocation: CustomerSeatAllocation | null;
  integrationStatuses: CustomerIntegrationStatus[];
  managedUsers: FounderManagedUser[];
};

export type PilotMetric = {
  label: string;
  value: number | string;
  detail: string;
};

export type PilotSuccessCriterion = {
  label: string;
  target: number | string;
  current: number | string;
  complete: boolean;
};

export type PilotTask = {
  title: string;
  owner: string;
  dueDate: string;
  status: 'Done' | 'In Progress' | 'Blocked' | 'Open';
};

export type PilotListItem = {
  id: string;
  companyName: string;
  industry: string;
  pilotOwner: string;
  startDate: string;
  endDate: string;
  status: PilotStatus;
  healthLabel: PilotHealthLabel;
  healthScore: number;
  successPercent: number;
  approvalsCaptured: number;
  integrationsConnected: number;
  expectedArr: number;
  probabilityToClose: number;
};

export type PilotProfile = PilotListItem & {
  domain: string;
  primaryAdminEmail: string;
  primaryAdminName: string;
  planTier: string;
  seats: number;
  successCriteria: PilotSuccessCriterion[];
  adoptionMetrics: PilotMetric[];
  roiMetrics: PilotMetric[];
  feedback: Array<{ id: string; type: string; title: string; status: string; createdAt: string }>;
  tasks: PilotTask[];
  executiveSummary: string;
  conversion: {
    expectedSeats: number;
    expectedRenewalDate: string;
    packageTarget: string;
    probabilityToClose: number;
  };
};

type PilotCommandCenter = {
  metrics: {
    totalPilots: number;
    activePilots: number;
    completedPilots: number;
    convertedCustomers: number;
    failedPilots: number;
    averagePilotHealth: number;
    pilotConversionRate: number;
  };
  pilots: PilotListItem[];
  topOpportunities: PilotListItem[];
  atRiskPilots: PilotListItem[];
  highestUsagePilots: PilotListItem[];
  readyToConvert: PilotListItem[];
  upcomingRenewals: PilotListItem[];
  aiInsights: {
    likelyToConvert: string[];
    likelyToChurn: string[];
    mostUsedFeatures: string[];
    leastUsedFeatures: string[];
    pilotRisks: string[];
    recommendedActions: string[];
  };
};

type SafeResult<T> = {
  data: T;
  migrationRequired: boolean;
  safeError?: string;
};

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown) {
  const message = safeError(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerHealth');
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function connectedIntegrationCount(integrations: CustomerIntegrationStatus[]) {
  return integrations.filter((integration) => integration.accessEnabled || integration.connectionState === 'CONNECTED').length;
}

function hasIntegration(integrations: CustomerIntegrationStatus[], provider: string) {
  return integrations.some((integration) => integration.provider === provider && (integration.accessEnabled || integration.connectionState === 'CONNECTED'));
}

function healthLabel(score: number): PilotHealthLabel {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Needs Attention';
  if (score >= 35) return 'At Risk';
  return 'Critical';
}

function arrForPlan(planTier: string, seats: number) {
  if (planTier === 'ENTERPRISE') return Math.max(25000, seats * 1200);
  if (planTier === 'GROWTH') return Math.max(6000, seats * 600);
  if (planTier === 'STARTER') return Math.max(1200, seats * 240);
  return Math.max(6000, seats * 360);
}

function derivePilotStatus(customer: CustomerAccount, score: number, successPercent: number, approvals: number, integrations: number): PilotStatus {
  if (customer.status === 'CHURNED') return 'Lost';
  if (customer.status === 'ACTIVE' && customer.planTier !== 'FREE_TRIAL') return 'Converted';
  if (customer.status === 'SUSPENDED' || score < 35) return 'Pilot At Risk';
  if (successPercent >= 85) return 'Pilot Completed';
  if (approvals > 0 || integrations > 0 || score >= 55) return 'Pilot Active';
  const daysOld = Math.floor((Date.now() - customer.createdAt.getTime()) / 86_400_000);
  return daysOld <= 14 ? 'Demo Scheduled' : 'Prospect';
}

function probabilityToClose(status: PilotStatus, healthScore: number, successPercent: number) {
  const base = status === 'Converted' ? 100 : status === 'Pilot Completed' ? 78 : status === 'Pilot Active' ? 54 : status === 'Demo Scheduled' ? 32 : status === 'Pilot At Risk' ? 18 : status === 'Lost' ? 0 : 24;
  return Math.max(0, Math.min(100, Math.round(base * 0.45 + healthScore * 0.3 + successPercent * 0.25)));
}

function successCriteria(metrics: {
  approvals: number;
  playbooks: number;
  copilotQuestions: number;
  investigations: number;
  memoryEntities: number;
  integrations: CustomerIntegrationStatus[];
}) {
  return [
    { label: 'Capture 100 approvals', target: 100, current: metrics.approvals, complete: metrics.approvals >= 100 },
    { label: 'Connect Slack', target: 'Connected', current: hasIntegration(metrics.integrations, 'SLACK') ? 'Connected' : 'Not connected', complete: hasIntegration(metrics.integrations, 'SLACK') },
    { label: 'Connect Teams', target: 'Connected', current: hasIntegration(metrics.integrations, 'MICROSOFT_TEAMS') ? 'Connected' : 'Not connected', complete: hasIntegration(metrics.integrations, 'MICROSOFT_TEAMS') },
    { label: 'Upload playbooks', target: 1, current: metrics.playbooks, complete: metrics.playbooks > 0 },
    { label: 'Run AI Copilot', target: 1, current: metrics.copilotQuestions, complete: metrics.copilotQuestions > 0 },
    { label: 'Create investigation', target: 1, current: metrics.investigations, complete: metrics.investigations > 0 },
    { label: 'Use Memory Graph', target: 1, current: metrics.memoryEntities, complete: metrics.memoryEntities > 0 },
  ];
}

async function countSafe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function buildPilotFromCustomer(customer: CustomerWithFounderRelations): Promise<PilotProfile> {
  const organizationId = customer.organizationId;
  const [
    approvals,
    highRiskApprovals,
    auditEvidence,
    playbooks,
    copilotQuestions,
    investigations,
    memoryEntities,
    executiveUsage,
    feedback,
    policyViolations,
  ] = await Promise.all([
    countSafe(prisma.approvalRecord.count({ where: { organizationId } }), 0),
    countSafe(prisma.approvalRecord.count({ where: { organizationId, riskLevel: { in: ['High', 'Critical', 'high', 'critical'] } } }), 0),
    countSafe(prisma.auditLog.count({ where: { organizationId } }), 0),
    countSafe(prisma.playbookDocument.count({ where: { organizationId } }), 0),
    countSafe(prisma.playbookQuery.count({ where: { organizationId } }), 0),
    countSafe(prisma.investigationCase.count({ where: { organizationId } }), 0),
    countSafe(prisma.memoryEntity.count({ where: { organizationId } }), 0),
    countSafe(prisma.event.count({ where: { organizationId, type: { contains: 'analytics', mode: 'insensitive' } } }), 0),
    countSafe(prisma.pilotFeedback.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 6 }), []),
    countSafe(prisma.approvalComplianceEvaluation.count({ where: { organizationId, status: { not: 'compliant' } } }), 0),
  ]);

  const integrationsConnected = connectedIntegrationCount(customer.integrationStatuses);
  const activeManagedUsers = customer.managedUsers.filter((user) => user.status === 'ACTIVE').length;
  const weeklyActiveUsers = customer.health?.activeUsers ?? activeManagedUsers;
  const healthScore = customer.health?.score ?? Math.min(100, Math.round(35 + approvals * 0.25 + integrationsConnected * 8 + playbooks * 6 + copilotQuestions * 2));
  const criteria = successCriteria({ approvals, playbooks, copilotQuestions, investigations, memoryEntities, integrations: customer.integrationStatuses });
  const successPercent = Math.round((criteria.filter((criterion) => criterion.complete).length / criteria.length) * 100);
  const status = derivePilotStatus(customer, healthScore, successPercent, approvals, integrationsConnected);
  const pilotOwner = customer.primaryAdminName || customer.primaryAdminEmail || 'Unassigned';
  const seats = customer.seatAllocation?.purchasedSeats ?? 5;
  const expectedArr = arrForPlan(customer.planTier, seats);
  const probability = probabilityToClose(status, healthScore, successPercent);
  const startDate = dateLabel(customer.createdAt);
  const endDate = dateLabel(addDays(customer.createdAt, status === 'Converted' ? 365 : 45));
  const hoursSaved = Math.round(approvals * 0.12 + investigations * 2 + playbooks * 0.5);
  const risksIdentified = highRiskApprovals + policyViolations;

  return {
    id: customer.id,
    companyName: customer.companyName,
    domain: customer.domain,
    industry: customer.industry ?? 'Unspecified',
    primaryAdminEmail: customer.primaryAdminEmail,
    primaryAdminName: customer.primaryAdminName ?? 'Unassigned',
    pilotOwner,
    startDate,
    endDate,
    status,
    healthLabel: healthLabel(healthScore),
    healthScore,
    successPercent,
    approvalsCaptured: approvals,
    integrationsConnected,
    expectedArr,
    probabilityToClose: probability,
    planTier: customer.planTier.replace('_', ' '),
    seats,
    successCriteria: criteria,
    adoptionMetrics: [
      { label: 'Weekly active users', value: weeklyActiveUsers, detail: 'Active customer users in pilot workspace' },
      { label: 'Approvals captured', value: approvals, detail: 'Approval evidence records created' },
      { label: 'Playbooks uploaded', value: playbooks, detail: 'Policy documents available to Playbook AI' },
      { label: 'Copilot questions', value: copilotQuestions, detail: 'AI policy and approval questions asked' },
      { label: 'Investigations created', value: investigations, detail: 'Risk and evidence investigations opened' },
      { label: 'Memory graph usage', value: memoryEntities, detail: 'Connected enterprise graph entities' },
      { label: 'Integrations connected', value: integrationsConnected, detail: 'Enabled or connected approval sources' },
      { label: 'Executive dashboard usage', value: executiveUsage, detail: 'Executive ROI views and events' },
    ],
    roiMetrics: [
      { label: 'Approvals captured', value: approvals, detail: 'Decisions converted into searchable evidence' },
      { label: 'Missing approvals detected', value: policyViolations, detail: 'Policy or compliance gaps identified' },
      { label: 'Risks identified', value: risksIdentified, detail: 'High-risk approvals plus policy violations' },
      { label: 'Audit evidence collected', value: auditEvidence, detail: 'Audit events and evidence trail records' },
      { label: 'Hours saved', value: hoursSaved, detail: 'Estimated manual retrieval and audit prep saved' },
      { label: 'Compliance value', value: `$${(hoursSaved * 150 + risksIdentified * 2500).toLocaleString()}`, detail: 'Estimated labor and risk value surfaced' },
    ],
    feedback: feedback.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      status: item.status,
      createdAt: dateLabel(item.createdAt),
    })),
    tasks: [
      { title: 'Follow up with pilot owner', owner: 'Founder', dueDate: dateLabel(addDays(new Date(), 2)), status: status === 'Lost' ? 'Blocked' : 'Open' },
      { title: 'Connect Slack or Gmail', owner: pilotOwner, dueDate: dateLabel(addDays(customer.createdAt, 7)), status: integrationsConnected > 0 ? 'Done' : 'In Progress' },
      { title: 'Upload first approval playbook', owner: pilotOwner, dueDate: dateLabel(addDays(customer.createdAt, 10)), status: playbooks > 0 ? 'Done' : 'Open' },
      { title: 'Run admin training', owner: 'Customer Success', dueDate: dateLabel(addDays(customer.createdAt, 14)), status: weeklyActiveUsers > 2 ? 'Done' : 'Open' },
      { title: 'Pilot review', owner: 'Founder', dueDate: dateLabel(addDays(customer.createdAt, 30)), status: successPercent >= 70 ? 'In Progress' : 'Open' },
      { title: 'Conversion discussion', owner: 'Founder', dueDate: endDate, status: probability >= 75 ? 'In Progress' : 'Open' },
    ],
    executiveSummary: `${customer.companyName} is ${status.toLowerCase()} with ${approvals} approvals captured, ${integrationsConnected} integrations enabled, ${risksIdentified} risk signals surfaced, and ${successPercent}% of pilot success criteria completed. Recommended next step: ${probability >= 75 ? 'schedule conversion discussion' : healthScore < 45 ? 'run executive rescue plan' : 'complete remaining success criteria'}.`,
    conversion: {
      expectedSeats: seats,
      expectedRenewalDate: dateLabel(addDays(customer.createdAt, status === 'Converted' ? 365 : 60)),
      packageTarget: customer.planTier === 'FREE_TRIAL' ? 'Growth' : customer.planTier.replace('_', ' '),
      probabilityToClose: probability,
    },
  };
}

function listItem(profile: PilotProfile): PilotListItem {
  return {
    id: profile.id,
    companyName: profile.companyName,
    industry: profile.industry,
    pilotOwner: profile.pilotOwner,
    startDate: profile.startDate,
    endDate: profile.endDate,
    status: profile.status,
    healthLabel: profile.healthLabel,
    healthScore: profile.healthScore,
    successPercent: profile.successPercent,
    approvalsCaptured: profile.approvalsCaptured,
    integrationsConnected: profile.integrationsConnected,
    expectedArr: profile.expectedArr,
    probabilityToClose: profile.probabilityToClose,
  };
}

export async function buildFounderPilotCommandCenter(): Promise<SafeResult<PilotCommandCenter>> {
  try {
    const customers = await prisma.customerAccount.findMany({
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: {
        health: true,
        seatAllocation: true,
        integrationStatuses: true,
        managedUsers: true,
      },
    });
    const profiles = await Promise.all(customers.map((customer) => buildPilotFromCustomer(customer)));
    const pilots = profiles.map(listItem);
    const convertedCustomers = pilots.filter((pilot) => pilot.status === 'Converted').length;
    const completedPilots = pilots.filter((pilot) => pilot.status === 'Pilot Completed' || pilot.status === 'Converted').length;
    const failedPilots = pilots.filter((pilot) => pilot.status === 'Lost').length;
    const activePilots = pilots.filter((pilot) => ['Demo Scheduled', 'Pilot Active', 'Pilot At Risk'].includes(pilot.status)).length;
    const averagePilotHealth = pilots.length ? Math.round(pilots.reduce((sum, pilot) => sum + pilot.healthScore, 0) / pilots.length) : 0;
    const topOpportunities = [...pilots].sort((a, b) => b.expectedArr * b.probabilityToClose - a.expectedArr * a.probabilityToClose).slice(0, 5);
    const atRiskPilots = pilots.filter((pilot) => pilot.healthLabel === 'At Risk' || pilot.healthLabel === 'Critical' || pilot.status === 'Pilot At Risk').slice(0, 5);
    const highestUsagePilots = [...pilots].sort((a, b) => b.approvalsCaptured - a.approvalsCaptured).slice(0, 5);
    const readyToConvert = pilots.filter((pilot) => pilot.probabilityToClose >= 70 || pilot.successPercent >= 80).slice(0, 5);
    const upcomingRenewals = [...pilots].sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(0, 5);

    return {
      data: {
        metrics: {
          totalPilots: pilots.length,
          activePilots,
          completedPilots,
          convertedCustomers,
          failedPilots,
          averagePilotHealth,
          pilotConversionRate: pilots.length ? Math.round((convertedCustomers / pilots.length) * 100) : 0,
        },
        pilots,
        topOpportunities,
        atRiskPilots,
        highestUsagePilots,
        readyToConvert,
        upcomingRenewals,
        aiInsights: {
          likelyToConvert: readyToConvert.map((pilot) => `${pilot.companyName}: ${pilot.probabilityToClose}% close probability`),
          likelyToChurn: atRiskPilots.map((pilot) => `${pilot.companyName}: ${pilot.healthLabel} health, ${pilot.successPercent}% success criteria`),
          mostUsedFeatures: ['Approval capture', 'Integration health', 'Executive ROI', 'Audit evidence'],
          leastUsedFeatures: ['Memory Graph', 'Investigation reports', 'Playbook AI uploads'],
          pilotRisks: atRiskPilots.length ? atRiskPilots.map((pilot) => `${pilot.companyName} needs success plan review`) : ['No critical pilot risks detected'],
          recommendedActions: [
            'Schedule conversion calls for pilots above 70% close probability.',
            'Ask at-risk customers to connect one more integration and upload a playbook.',
            'Generate an executive ROI report before each pilot review.',
          ],
        },
      },
      migrationRequired: false,
    };
  } catch (error) {
    const message = safeError(error);
    return {
      data: {
        metrics: { totalPilots: 0, activePilots: 0, completedPilots: 0, convertedCustomers: 0, failedPilots: 0, averagePilotHealth: 0, pilotConversionRate: 0 },
        pilots: [],
        topOpportunities: [],
        atRiskPilots: [],
        highestUsagePilots: [],
        readyToConvert: [],
        upcomingRenewals: [],
        aiInsights: { likelyToConvert: [], likelyToChurn: [], mostUsedFeatures: [], leastUsedFeatures: [], pilotRisks: [message], recommendedActions: ['Run npm run db:deploy and refresh founder readiness.'] },
      },
      migrationRequired: missingFounderStorage(error),
      safeError: message,
    };
  }
}

export async function getFounderPilotProfile(customerAccountId: string): Promise<SafeResult<PilotProfile | null>> {
  try {
    const customer = await prisma.customerAccount.findUnique({
      where: { id: customerAccountId },
      include: {
        health: true,
        seatAllocation: true,
        integrationStatuses: true,
        managedUsers: true,
      },
    });
    return { data: customer ? await buildPilotFromCustomer(customer) : null, migrationRequired: false };
  } catch (error) {
    return { data: null, migrationRequired: missingFounderStorage(error), safeError: safeError(error) };
  }
}

function escapePdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('\n', ' ');
}

function createSimplePdf(lines: string[]) {
  const content = lines.slice(0, 44).map((line, index) => `BT /F1 9 Tf 42 ${760 - index * 16} Td (${escapePdfText(line.slice(0, 118))}) Tj ET`).join('\n');
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

export async function exportFounderPilots(format: 'csv' | 'pdf', customerAccountId?: string) {
  const result = customerAccountId ? await getFounderPilotProfile(customerAccountId) : await buildFounderPilotCommandCenter();
  if (customerAccountId) {
    const profile = result.data as PilotProfile | null;
    if (!profile) return format === 'pdf' ? createSimplePdf(['ApprovLine Pilot Summary', 'Pilot not found.']) : 'company,status,health\n';
    if (format === 'pdf') {
      return createSimplePdf([
        'ApprovLine Pilot Executive Summary',
        `Company: ${profile.companyName}`,
        `Industry: ${profile.industry}`,
        `Status: ${profile.status}`,
        `Health: ${profile.healthLabel} (${profile.healthScore})`,
        `Success criteria: ${profile.successPercent}%`,
        `Expected ARR: $${profile.expectedArr.toLocaleString()}`,
        `Close probability: ${profile.probabilityToClose}%`,
        '',
        profile.executiveSummary,
        '',
        'Success Criteria:',
        ...profile.successCriteria.map((criterion) => `- ${criterion.label}: ${criterion.current}/${criterion.target}`),
      ]);
    }
    return [
      ['Company', 'Status', 'Health Score', 'Success %', 'Approvals', 'Integrations', 'Expected ARR', 'Probability'].map(csvCell).join(','),
      [profile.companyName, profile.status, profile.healthScore, profile.successPercent, profile.approvalsCaptured, profile.integrationsConnected, profile.expectedArr, profile.probabilityToClose].map(csvCell).join(','),
    ].join('\n');
  }

  const data = (result.data as PilotCommandCenter).pilots;
  if (format === 'pdf') {
    return createSimplePdf([
      'ApprovLine Pilot Command Center',
      `Generated: ${new Date().toISOString()}`,
      `Pilots: ${data.length}`,
      '',
      'Top pilots:',
      ...data.slice(0, 18).map((pilot) => `- ${pilot.companyName}: ${pilot.status}, ${pilot.healthScore} health, ${pilot.probabilityToClose}% close`),
    ]);
  }
  return [
    ['Company', 'Industry', 'Owner', 'Status', 'Health', 'Success %', 'Approvals', 'Integrations', 'Expected ARR', 'Probability', 'Start', 'End'].map(csvCell).join(','),
    ...data.map((pilot) => [pilot.companyName, pilot.industry, pilot.pilotOwner, pilot.status, pilot.healthScore, pilot.successPercent, pilot.approvalsCaptured, pilot.integrationsConnected, pilot.expectedArr, pilot.probabilityToClose, pilot.startDate, pilot.endDate].map(csvCell).join(',')),
  ].join('\n');
}
