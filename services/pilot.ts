import type { IntegrationProvider, Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const pilotFeatureFlags = [
  {
    key: 'demo_mode',
    label: 'Demo mode',
    description: 'Allow clearly marked sample data and demo previews for sales calls.',
    defaultEnabled: true,
  },
  {
    key: 'beta_features',
    label: 'Beta features',
    description: 'Show pilot-only surfaces such as investigations, Playbook AI, and ROI drilldowns.',
    defaultEnabled: true,
  },
  {
    key: 'slack_connector',
    label: 'Slack connector',
    description: 'Enable Slack OAuth, event ingestion, and sync controls.',
    defaultEnabled: true,
  },
  {
    key: 'gmail_connector',
    label: 'Gmail connector',
    description: 'Enable Gmail OAuth and approval-thread sync.',
    defaultEnabled: true,
  },
  {
    key: 'teams_connector',
    label: 'Microsoft Teams connector',
    description: 'Enable Microsoft Teams OAuth and read-only sync.',
    defaultEnabled: true,
  },
  {
    key: 'jira_connector',
    label: 'Jira connector',
    description: 'Enable Jira OAuth and issue evidence sync.',
    defaultEnabled: true,
  },
] as const;

export const pilotChecklist: Array<{ key: string; label: string; href: string; provider?: IntegrationProvider }> = [
  { key: 'connect_slack', label: 'Connect Slack', href: '/dashboard/settings/integrations', provider: 'SLACK' },
  { key: 'connect_gmail', label: 'Connect Gmail', href: '/dashboard/settings/integrations', provider: 'GMAIL' },
  { key: 'connect_teams', label: 'Connect Microsoft Teams', href: '/dashboard/settings/integrations', provider: 'MICROSOFT_TEAMS' },
  { key: 'connect_jira', label: 'Connect Jira', href: '/dashboard/settings/integrations', provider: 'JIRA' },
  { key: 'upload_playbook', label: 'Upload first playbook', href: '/playbooks' },
  { key: 'audit_report', label: 'Generate first audit report', href: '/dashboard/export' },
];

export async function ensurePilotFeatureFlags(organizationId: string) {
  await Promise.all(
    pilotFeatureFlags.map((flag) =>
      prisma.featureFlag.upsert({
        where: { organizationId_key: { organizationId, key: flag.key } },
        update: { description: flag.description },
        create: {
          organizationId,
          key: flag.key,
          enabled: flag.defaultEnabled,
          description: flag.description,
          metadata: { pilotManaged: true },
        },
      }),
    ),
  );
}

export async function logPilotActivity(input: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.pilotActivityLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    },
  });
}

export async function createPilotInvite(input: {
  organizationId: string;
  inviterUserId?: string | null;
  email: string;
  role: Role;
}) {
  const invite = await prisma.pilotInvite.create({
    data: {
      organizationId: input.organizationId,
      inviterUserId: input.inviterUserId ?? null,
      email: input.email,
      role: input.role,
      metadata: { betaInvite: true, emailDelivery: 'manual' },
    },
  });
  await logPilotActivity({
    organizationId: input.organizationId,
    actorUserId: input.inviterUserId,
    action: 'pilot.invite.created',
    entityType: 'PilotInvite',
    entityId: invite.id,
    metadata: { email: input.email, role: input.role },
  });
  return invite;
}

export async function createPilotFeedback(input: {
  organizationId: string;
  userId?: string | null;
  type: string;
  title: string;
  body: string;
  pageUrl?: string | null;
  screenshot?: Prisma.InputJsonValue;
}) {
  const feedback = await prisma.pilotFeedback.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      pageUrl: input.pageUrl ?? null,
      screenshot: input.screenshot ?? undefined,
    },
  });
  await logPilotActivity({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: input.type === 'issue' ? 'pilot.issue.reported' : 'pilot.feedback.submitted',
    entityType: 'PilotFeedback',
    entityId: feedback.id,
    metadata: { type: input.type, title: input.title },
  });
  return feedback;
}

export async function setPilotFeatureFlag(input: {
  organizationId: string;
  userId?: string | null;
  key: string;
  enabled: boolean;
}) {
  const known = pilotFeatureFlags.find((flag) => flag.key === input.key);
  if (!known) throw new Error('Unknown feature flag.');
  const flag = await prisma.featureFlag.upsert({
    where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
    update: {
      enabled: input.enabled,
      updatedByUserId: input.userId ?? null,
      description: known.description,
    },
    create: {
      organizationId: input.organizationId,
      key: input.key,
      enabled: input.enabled,
      description: known.description,
      updatedByUserId: input.userId ?? null,
      metadata: { pilotManaged: true },
    },
  });
  await logPilotActivity({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: 'pilot.feature_flag.updated',
    entityType: 'FeatureFlag',
    entityId: flag.id,
    metadata: { key: input.key, enabled: input.enabled },
  });
  return flag;
}

function isMissingPilotTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('FeatureFlag') ||
    message.includes('PilotInvite') ||
    message.includes('PilotFeedback') ||
    message.includes('PilotActivityLog') ||
    message.includes('does not exist in the current database') ||
    message.includes('table') && message.includes('does not exist')
  );
}

export function isPilotMigrationRequired(error: unknown) {
  return isMissingPilotTableError(error);
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 220);
  return String(error).slice(0, 220);
}

function fallbackFlags(organizationId: string) {
  return pilotFeatureFlags.map((flag) => ({
    id: flag.key,
    organizationId,
    key: flag.key,
    enabled: flag.defaultEnabled,
    description: flag.description,
    updatedByUserId: null,
    metadata: { pilotManaged: true, pendingMigration: true },
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

async function pilotTablesReady() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('FeatureFlag', 'PilotInvite', 'PilotFeedback', 'PilotActivityLog')
  `;
  const names = new Set(rows.map((row) => row.table_name));
  return ['FeatureFlag', 'PilotInvite', 'PilotFeedback', 'PilotActivityLog'].every((name) => names.has(name));
}

export async function buildPilotReadiness(organizationId: string) {
  let migrationRequired = false;
  let degraded = false;
  let safeError: string | null = null;
  let users = 0;
  let integrations: Awaited<ReturnType<typeof prisma.integration.findMany>> = [];
  let approvalsCaptured = 0;
  let openErrors = 0;
  let feedbackSubmitted = 0;
  let invites: Awaited<ReturnType<typeof prisma.pilotInvite.findMany>> = [];
  let flags: Awaited<ReturnType<typeof prisma.featureFlag.findMany>> = [];
  let activityLogs: Awaited<ReturnType<typeof prisma.pilotActivityLog.findMany>> = [];
  let playbooks = 0;

  try {
    const tablesReady = await pilotTablesReady();
    if (tablesReady) {
      await ensurePilotFeatureFlags(organizationId);
      [
        users,
        integrations,
        approvalsCaptured,
        openErrors,
        feedbackSubmitted,
        invites,
        flags,
        activityLogs,
        playbooks,
      ] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.integration.findMany({ where: { organizationId }, orderBy: { provider: 'asc' } }),
        prisma.approvalRecord.count({ where: { organizationId } }),
        prisma.integration.count({ where: { organizationId, status: 'ERROR' } }),
        prisma.pilotFeedback.count({ where: { organizationId } }),
        prisma.pilotInvite.findMany({ where: { organizationId }, orderBy: { invitedAt: 'desc' }, take: 8 }),
        prisma.featureFlag.findMany({ where: { organizationId }, orderBy: { key: 'asc' } }),
        prisma.pilotActivityLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 12 }),
        prisma.playbookDocument.count({ where: { organizationId } }),
      ]);
    } else {
      migrationRequired = true;
      [users, integrations, approvalsCaptured, openErrors, playbooks] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.integration.findMany({ where: { organizationId }, orderBy: { provider: 'asc' } }),
        prisma.approvalRecord.count({ where: { organizationId } }),
        prisma.integration.count({ where: { organizationId, status: 'ERROR' } }),
        prisma.playbookDocument.count({ where: { organizationId } }),
      ]);
      flags = fallbackFlags(organizationId);
    }
  } catch (error) {
    degraded = !isMissingPilotTableError(error);
    migrationRequired = true;
    safeError = safeErrorMessage(error);
    try {
      [users, integrations, approvalsCaptured, openErrors, playbooks] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.integration.findMany({ where: { organizationId }, orderBy: { provider: 'asc' } }),
        prisma.approvalRecord.count({ where: { organizationId } }),
        prisma.integration.count({ where: { organizationId, status: 'ERROR' } }),
        prisma.playbookDocument.count({ where: { organizationId } }),
      ]);
    } catch (coreError) {
      degraded = true;
      safeError = safeErrorMessage(coreError);
      users = 0;
      integrations = [];
      approvalsCaptured = 0;
      openErrors = 0;
      playbooks = 0;
    }
    flags = fallbackFlags(organizationId);
  }

  const connected = new Set(integrations.filter((item) => item.status === 'CONNECTED' || item.status === 'SYNCING').map((item) => item.provider));
  const connectedIntegrations = connected.size;
  const checklist = pilotChecklist.map((item) => {
    if (item.provider) {
      return { ...item, complete: connected.has(item.provider) };
    }
    if (item.key === 'upload_playbook') return { ...item, complete: playbooks > 0 };
    if (item.key === 'audit_report') return { ...item, complete: approvalsCaptured > 0 };
    return { ...item, complete: false };
  });

  return {
    metrics: {
      activeUsers: users,
      connectedIntegrations,
      approvalsCaptured,
      errors: openErrors,
      feedbackSubmitted,
    },
    integrations,
    checklist,
    invites,
    flags,
    activityLogs,
    migrationRequired,
    degraded,
    safeError,
  };
}
