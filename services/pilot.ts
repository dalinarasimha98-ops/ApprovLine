import type { IntegrationProvider, Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const pilotAuditActions = [
  'pilot.invite.created',
  'pilot.feedback.submitted',
  'pilot.issue.reported',
  'pilot.feature_flag.updated',
  'pilot.demo_workspace.generated',
  'pilot.demo_workspace.reset',
  'pilot.integration.disconnect_confirmed',
] as const;

type PilotInviteView = {
  id: string;
  email: string;
  role: Role;
  status: string;
  invitedAt: Date;
};

type PilotFlagView = {
  id: string;
  organizationId?: string;
  key: string;
  enabled: boolean;
  description: string | null;
  updatedByUserId?: string | null;
  metadata?: Prisma.JsonValue;
  createdAt?: Date;
  updatedAt?: Date;
};

type PilotActivityView = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
};

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
    key: 'outlook_connector',
    label: 'Outlook connector',
    description: 'Enable Outlook and Exchange OAuth plus read-only email sync.',
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
  {
    key: 'servicenow_connector',
    label: 'ServiceNow connector',
    description: 'Enable ServiceNow OAuth and change, CAB, procurement, and access request evidence sync.',
    defaultEnabled: true,
  },
] as const;

export const pilotChecklist: Array<{ key: string; label: string; href: string; provider?: IntegrationProvider }> = [
  { key: 'connect_slack', label: 'Connect Slack', href: '/dashboard/settings/integrations', provider: 'SLACK' },
  { key: 'connect_gmail', label: 'Connect Gmail', href: '/dashboard/settings/integrations', provider: 'GMAIL' },
  { key: 'connect_outlook', label: 'Connect Outlook or Exchange', href: '/dashboard/settings/integrations', provider: 'OUTLOOK' },
  { key: 'connect_teams', label: 'Connect Microsoft Teams', href: '/dashboard/settings/integrations', provider: 'MICROSOFT_TEAMS' },
  { key: 'connect_jira', label: 'Connect Jira', href: '/dashboard/settings/integrations', provider: 'JIRA' },
  { key: 'connect_servicenow', label: 'Connect ServiceNow', href: '/dashboard/settings/integrations', provider: 'SERVICENOW' },
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
  try {
    return await prisma.pilotActivityLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? {},
      },
    });
  } catch (error) {
    if (!isMissingPilotTableError(error)) throw error;
    return prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        metadata: {
          ...inputMetadata(input.metadata),
          pilotFallback: true,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        },
      },
    });
  }
}

export async function createPilotInvite(input: {
  organizationId: string;
  inviterUserId?: string | null;
  email: string;
  role: Role;
}) {
  let invite: PilotInviteView;
  try {
    invite = await prisma.pilotInvite.create({
      data: {
        organizationId: input.organizationId,
        inviterUserId: input.inviterUserId ?? null,
        email: input.email,
        role: input.role,
        metadata: { betaInvite: true, emailDelivery: 'manual' },
      },
    });
  } catch (error) {
    if (!isMissingPilotTableError(error)) throw error;
    invite = {
      id: `pilot-invite-${Date.now()}`,
      email: input.email,
      role: input.role,
      status: 'pending',
      invitedAt: new Date(),
    };
  }
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
  let feedback: { id: string };
  try {
    feedback = await prisma.pilotFeedback.create({
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
  } catch (error) {
    if (!isMissingPilotTableError(error)) throw error;
    feedback = { id: `pilot-feedback-${Date.now()}` };
  }
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
  let flag: PilotFlagView;
  try {
    flag = await prisma.featureFlag.upsert({
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
  } catch (error) {
    if (!isMissingPilotTableError(error)) throw error;
    flag = {
      id: input.key,
      organizationId: input.organizationId,
      key: input.key,
      enabled: input.enabled,
      description: known.description,
      updatedByUserId: input.userId ?? null,
      metadata: { pilotManaged: true, auditLogFallback: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
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

function inputMetadata(value: Prisma.InputJsonValue | undefined): Record<string, Prisma.InputJsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, Prisma.InputJsonValue>;
}

function objectMetadata(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function fallbackFlags(organizationId: string, activityLogs: PilotActivityView[] = []): PilotFlagView[] {
  const latestFlagState = new Map<string, boolean>();
  for (const log of activityLogs) {
    if (log.action !== 'pilot.feature_flag.updated') continue;
    const metadata = objectMetadata((log as PilotActivityView & { metadata?: Prisma.JsonValue }).metadata);
    const key = typeof metadata.key === 'string' ? metadata.key : null;
    const enabled = typeof metadata.enabled === 'boolean' ? metadata.enabled : null;
    if (key && enabled !== null && !latestFlagState.has(key)) latestFlagState.set(key, enabled);
  }
  return pilotFeatureFlags.map((flag) => ({
    id: flag.key,
    organizationId,
    key: flag.key,
    enabled: latestFlagState.get(flag.key) ?? flag.defaultEnabled,
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

async function getFallbackPilotLogs(organizationId: string) {
  return prisma.auditLog.findMany({
    where: {
      organizationId,
      action: { in: [...pilotAuditActions] },
    },
    orderBy: { createdAt: 'desc' },
    take: 24,
  });
}

function fallbackInvitesFromAuditLogs(logs: Awaited<ReturnType<typeof getFallbackPilotLogs>>): PilotInviteView[] {
  return logs
    .filter((log) => log.action === 'pilot.invite.created')
    .map((log) => {
      const metadata = objectMetadata(log.metadata);
      const role = typeof metadata.role === 'string' && ['ADMIN', 'MANAGER', 'EMPLOYEE', 'COMPLIANCE_OFFICER'].includes(metadata.role)
        ? metadata.role as Role
        : 'EMPLOYEE';
      return {
        id: log.id,
        email: typeof metadata.email === 'string' ? metadata.email : 'beta-user@example.com',
        role,
        status: 'pending',
        invitedAt: log.createdAt,
      };
    })
    .slice(0, 8);
}

function fallbackActivityFromAuditLogs(logs: Awaited<ReturnType<typeof getFallbackPilotLogs>>): Array<PilotActivityView & { metadata?: Prisma.JsonValue }> {
  return logs.map((log) => {
    const metadata = objectMetadata(log.metadata);
    return {
      id: log.id,
      action: log.action,
      entityType: typeof metadata.entityType === 'string' ? metadata.entityType : 'PilotActivity',
      entityId: typeof metadata.entityId === 'string' ? metadata.entityId : log.approvalRecordId,
      createdAt: log.createdAt,
      metadata: log.metadata,
    };
  });
}

export async function buildPilotReadiness(organizationId: string) {
  let migrationRequired = false;
  let storageFallback = false;
  let degraded = false;
  let safeError: string | null = null;
  let users = 0;
  let integrations: Awaited<ReturnType<typeof prisma.integration.findMany>> = [];
  let approvalsCaptured = 0;
  let openErrors = 0;
  let feedbackSubmitted = 0;
  let invites: PilotInviteView[] = [];
  let flags: PilotFlagView[] = [];
  let activityLogs: PilotActivityView[] = [];

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
      ] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.integration.findMany({ where: { organizationId }, orderBy: { provider: 'asc' } }),
        prisma.approvalRecord.count({ where: { organizationId } }),
        prisma.integration.count({ where: { organizationId, status: 'ERROR' } }),
        prisma.pilotFeedback.count({ where: { organizationId } }),
        prisma.pilotInvite.findMany({ where: { organizationId }, orderBy: { invitedAt: 'desc' }, take: 8 }),
        prisma.featureFlag.findMany({ where: { organizationId }, orderBy: { key: 'asc' } }),
        prisma.pilotActivityLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 12 }),
      ]);
    } else {
      storageFallback = true;
      const fallbackLogsPromise = getFallbackPilotLogs(organizationId);
      [users, integrations, approvalsCaptured, openErrors] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.integration.findMany({ where: { organizationId }, orderBy: { provider: 'asc' } }),
        prisma.approvalRecord.count({ where: { organizationId } }),
        prisma.integration.count({ where: { organizationId, status: 'ERROR' } }),
      ]);
      const fallbackLogs = await fallbackLogsPromise;
      feedbackSubmitted = fallbackLogs.filter((log) => log.action === 'pilot.feedback.submitted' || log.action === 'pilot.issue.reported').length;
      invites = fallbackInvitesFromAuditLogs(fallbackLogs);
      activityLogs = fallbackActivityFromAuditLogs(fallbackLogs);
      flags = fallbackFlags(organizationId, activityLogs);
    }
  } catch (error) {
    degraded = !isMissingPilotTableError(error);
    storageFallback = isMissingPilotTableError(error);
    migrationRequired = false;
    safeError = safeErrorMessage(error);
    try {
      const fallbackLogsPromise = getFallbackPilotLogs(organizationId).catch(() => []);
      [users, integrations, approvalsCaptured, openErrors] = await Promise.all([
        prisma.user.count({ where: { organizationId } }),
        prisma.integration.findMany({ where: { organizationId }, orderBy: { provider: 'asc' } }),
        prisma.approvalRecord.count({ where: { organizationId } }),
        prisma.integration.count({ where: { organizationId, status: 'ERROR' } }),
      ]);
      const fallbackLogs = await fallbackLogsPromise;
      feedbackSubmitted = fallbackLogs.filter((log) => log.action === 'pilot.feedback.submitted' || log.action === 'pilot.issue.reported').length;
      invites = fallbackInvitesFromAuditLogs(fallbackLogs);
      activityLogs = fallbackActivityFromAuditLogs(fallbackLogs);
    } catch (coreError) {
      degraded = true;
      safeError = safeErrorMessage(coreError);
      users = 0;
      integrations = [];
      approvalsCaptured = 0;
      openErrors = 0;
    }
    flags = fallbackFlags(organizationId, activityLogs);
  }

  const connected = new Set(integrations.filter((item) => item.status === 'CONNECTED' || item.status === 'SYNCING').map((item) => item.provider));
  const connectedIntegrations = connected.size;
  const checklist = pilotChecklist.map((item) => {
    if (item.provider) {
      return { ...item, complete: connected.has(item.provider) };
    }
    if (item.key === 'upload_playbook') return { ...item, complete: false };
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
    storageFallback,
    degraded,
    safeError,
  };
}
