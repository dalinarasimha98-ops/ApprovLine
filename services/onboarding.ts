import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const onboardingStepKeys = [
  'organization',
  'team',
  'departments',
  'categories',
  'integrations',
  'playbooks',
  'memory',
  'copilot',
  'validation',
  'go-live',
] as const;

export type OnboardingStepKey = (typeof onboardingStepKeys)[number];

export const onboardingStepLabels: Record<OnboardingStepKey, string> = {
  organization: 'Organization Setup',
  team: 'Team Setup',
  departments: 'Department Configuration',
  categories: 'Approval Categories',
  integrations: 'Integration Connections',
  playbooks: 'Playbook AI Setup',
  memory: 'Memory Graph Initialization',
  copilot: 'AI Copilot Readiness',
  validation: 'Workspace Validation',
  'go-live': 'Go Live',
};

export type TeamInviteDraft = {
  name: string;
  email: string;
  role: string;
};

export type IntegrationDraft = {
  provider: string;
  status: 'Not Connected' | 'Connected' | 'Requires Attention' | 'Skipped';
};

export type PlaybookDraft = {
  name: string;
  category: string;
  status: 'Ready' | 'Processing' | 'Needs Review';
  summary?: string;
};

export type CopilotSetupDraft = {
  dataSources: string[];
  permissions: string[];
  scope: string;
};

export type OnboardingPatch = {
  step?: number;
  completedStep?: OnboardingStepKey;
  organization?: {
    name?: string;
    companyDomain?: string;
    industry?: string;
    companySize?: string;
    country?: string;
    primaryAdminName?: string;
    primaryAdminEmail?: string;
  };
  invitedTeamMembers?: TeamInviteDraft[];
  departments?: string[];
  approvalCategories?: string[];
  integrationSetup?: IntegrationDraft[];
  playbookSetup?: PlaybookDraft[];
  copilotSetup?: CopilotSetupDraft;
  memoryGraphInitialized?: boolean;
  complete?: boolean;
};

export function normalizeStep(step: unknown) {
  const parsed = Number(step);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(1, Math.round(parsed)));
}

export function stepKeyForIndex(step: number): OnboardingStepKey {
  return onboardingStepKeys[normalizeStep(step) - 1] ?? 'organization';
}

function jsonArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function jsonObject<T extends Record<string, unknown>>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

export function calculateOnboardingReadiness(input: {
  name?: string | null;
  companyDomain?: string | null;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  primaryAdminName?: string | null;
  primaryAdminEmail?: string | null;
  invitedTeamMembers?: Prisma.JsonValue | null;
  departments?: string[];
  approvalCategories?: string[];
  integrationSetup?: Prisma.JsonValue | null;
  playbookSetup?: Prisma.JsonValue | null;
  copilotSetup?: Prisma.JsonValue | null;
  memoryGraphInitializedAt?: Date | null;
  onboardedAt?: Date | null;
}) {
  const invited = jsonArray<TeamInviteDraft>(input.invitedTeamMembers);
  const integrations = jsonArray<IntegrationDraft>(input.integrationSetup);
  const playbooks = jsonArray<PlaybookDraft>(input.playbookSetup);
  const copilot = jsonObject<CopilotSetupDraft>(input.copilotSetup, { dataSources: [], permissions: [], scope: '' });

  const checks = [
    {
      key: 'organization' as const,
      label: onboardingStepLabels.organization,
      complete: Boolean(input.name && input.companyDomain && input.industry && input.companySize && input.country && input.primaryAdminName && input.primaryAdminEmail),
    },
    { key: 'team' as const, label: onboardingStepLabels.team, complete: invited.length > 0 },
    { key: 'departments' as const, label: onboardingStepLabels.departments, complete: (input.departments?.length ?? 0) > 0 },
    { key: 'categories' as const, label: onboardingStepLabels.categories, complete: (input.approvalCategories?.length ?? 0) > 0 },
    {
      key: 'integrations' as const,
      label: onboardingStepLabels.integrations,
      complete: integrations.length > 0 && integrations.every((item) => item.status === 'Connected' || item.status === 'Skipped'),
    },
    { key: 'playbooks' as const, label: onboardingStepLabels.playbooks, complete: playbooks.length > 0 },
    { key: 'memory' as const, label: onboardingStepLabels.memory, complete: Boolean(input.memoryGraphInitializedAt) },
    { key: 'copilot' as const, label: onboardingStepLabels.copilot, complete: copilot.dataSources.length > 0 && copilot.permissions.length > 0 && Boolean(copilot.scope) },
  ];

  const completed = checks.filter((check) => check.complete);
  const score = Math.round((completed.length / checks.length) * 100);
  return { score: input.onboardedAt ? 100 : score, checks, completedStepKeys: completed.map((check) => check.key) };
}

export async function buildOnboardingState(organizationId: string) {
  const [organization, integrations, users, playbookDocuments] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    prisma.integration.findMany({
      where: { organizationId },
      select: { provider: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, role: true },
    }),
    prisma.playbookDocument.findMany({
      where: { organizationId },
      select: { id: true, name: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const readiness = calculateOnboardingReadiness(organization);
  return {
    organization,
    readiness,
    integrations,
    playbookDocuments,
    seatUsage: {
      used: users.length,
      admins: users.filter((user) => user.role === 'ADMIN').length,
      invited: jsonArray<TeamInviteDraft>(organization.invitedTeamMembers).length,
    },
  };
}

export async function saveOnboardingPatch(input: {
  organizationId: string;
  actorUserId?: string | null;
  patch: OnboardingPatch;
}) {
  const current = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId } });
  const now = new Date();
  const completed = new Set(current.onboardingCompletedSteps ?? []);
  if (input.patch.completedStep) completed.add(input.patch.completedStep);

  const data: Prisma.OrganizationUpdateInput = {
    onboardingLastSavedAt: now,
    onboardingStartedAt: current.onboardingStartedAt ?? now,
  };

  if (input.patch.step) data.onboardingStep = normalizeStep(input.patch.step);
  if (input.patch.organization) {
    const org = input.patch.organization;
    if (org.name !== undefined) data.name = org.name.trim() || current.name;
    if (org.companyDomain !== undefined) data.companyDomain = org.companyDomain.trim().toLowerCase();
    if (org.industry !== undefined) data.industry = org.industry.trim();
    if (org.companySize !== undefined) data.companySize = org.companySize.trim();
    if (org.country !== undefined) data.country = org.country.trim();
    if (org.primaryAdminName !== undefined) data.primaryAdminName = org.primaryAdminName.trim();
    if (org.primaryAdminEmail !== undefined) data.primaryAdminEmail = org.primaryAdminEmail.trim().toLowerCase();
  }
  if (input.patch.invitedTeamMembers) data.invitedTeamMembers = input.patch.invitedTeamMembers as unknown as Prisma.InputJsonValue;
  if (input.patch.departments) data.departments = input.patch.departments.map((item) => item.trim()).filter(Boolean);
  if (input.patch.approvalCategories) data.approvalCategories = input.patch.approvalCategories.map((item) => item.trim()).filter(Boolean);
  if (input.patch.integrationSetup) data.integrationSetup = input.patch.integrationSetup as unknown as Prisma.InputJsonValue;
  if (input.patch.playbookSetup) data.playbookSetup = input.patch.playbookSetup as unknown as Prisma.InputJsonValue;
  if (input.patch.copilotSetup) data.copilotSetup = input.patch.copilotSetup as unknown as Prisma.InputJsonValue;
  if (input.patch.memoryGraphInitialized) data.memoryGraphInitializedAt = current.memoryGraphInitializedAt ?? now;
  if (input.patch.complete) data.onboardedAt = now;

  data.onboardingCompletedSteps = [...completed];

  const updated = await prisma.organization.update({ where: { id: input.organizationId }, data });
  const readiness = calculateOnboardingReadiness(updated);

  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      onboardingReadinessScore: input.patch.complete ? 100 : readiness.score,
      onboardingStatus: {
        score: input.patch.complete ? 100 : readiness.score,
        completedSteps: readiness.completedStepKeys,
        lastAction: input.patch.complete ? 'completed' : 'saved',
        lastSavedAt: now.toISOString(),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.patch.complete ? 'onboarding.completed' : 'onboarding.step_saved',
      metadata: {
        step: input.patch.completedStep ?? stepKeyForIndex(input.patch.step ?? updated.onboardingStep),
        readinessScore: input.patch.complete ? 100 : readiness.score,
      },
    },
  });

  return buildOnboardingState(input.organizationId);
}
