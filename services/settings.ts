import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { buildHealthPageReport, type ReadinessCheck } from '@/services/readiness';

export type SettingsOverview = {
  organization: {
    id: string;
    name: string;
    slug: string;
    companyDomain: string | null;
    industry: string | null;
    companySize: string | null;
    country: string | null;
    departments: string[];
    approvalCategories: string[];
    onboardedAt: string | null;
    primaryAdminName: string | null;
    primaryAdminEmail: string | null;
  };
  stats: {
    totalUsers: number;
    activeIntegrations: number;
    totalTeams: number;
    totalPlaybooks: number;
  };
  systemStatus: {
    postgresql: ReadinessCheck;
    redis: ReadinessCheck;
    anthropic: ReadinessCheck;
    openai: ReadinessCheck;
    ready: boolean;
  };
  recentActivity: {
    id: string;
    action: string;
    actorUserId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }[];
};

async function fetchSettingsOverview(organizationId: string): Promise<SettingsOverview> {
  const scope = { organizationId };

  const [org, userCount, integrations, teamCount, playbookCount, recentLogs, healthReport] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true, name: true, slug: true, companyDomain: true, industry: true,
        companySize: true, country: true, departments: true, approvalCategories: true,
        onboardedAt: true, primaryAdminName: true, primaryAdminEmail: true,
      },
    }),
    prisma.user.count({ where: tenantScopedWhere(scope) }),
    prisma.integration.findMany({
      where: tenantScopedWhere(scope),
      select: { id: true, status: true, provider: true },
    }),
    prisma.team.count({ where: tenantScopedWhere(scope) }),
    prisma.playbookDocument.count({ where: tenantScopedWhere(scope) }),
    prisma.auditLog.findMany({
      where: {
        ...tenantScopedWhere(scope),
        action: {
          in: [
            'team.member.role_changed', 'team.created', 'team.deleted',
            'user.invited', 'security_request_submitted',
            'onboarding.organization_updated', 'onboarding.completed',
            'settings.organization_updated', 'settings.preferences_updated',
          ],
        },
      },
      select: { id: true, action: true, actorUserId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    buildHealthPageReport().catch(() => null),
  ]);

  const activeIntegrations = integrations.filter((i) => i.status === 'CONNECTED').length;

  return {
    organization: {
      id: org?.id ?? organizationId,
      name: org?.name ?? 'Unknown',
      slug: org?.slug ?? '',
      companyDomain: org?.companyDomain ?? null,
      industry: org?.industry ?? null,
      companySize: org?.companySize ?? null,
      country: org?.country ?? null,
      departments: org?.departments ?? [],
      approvalCategories: org?.approvalCategories ?? [],
      onboardedAt: org?.onboardedAt?.toISOString() ?? null,
      primaryAdminName: org?.primaryAdminName ?? null,
      primaryAdminEmail: org?.primaryAdminEmail ?? null,
    },
    stats: {
      totalUsers: userCount,
      activeIntegrations,
      totalTeams: teamCount,
      totalPlaybooks: playbookCount,
    },
    systemStatus: {
      postgresql: healthReport?.checks.postgresql ?? { status: 'missing', message: 'Unknown' },
      redis: healthReport?.checks.redis ?? { status: 'missing', message: 'Unknown' },
      anthropic: healthReport?.checks.anthropic ?? { status: 'missing', message: 'Unknown' },
      openai: healthReport?.checks.openai ?? { status: 'missing', message: 'Unknown' },
      ready: healthReport?.ready ?? false,
    },
    recentActivity: recentLogs.map((l) => ({
      id: l.id,
      action: l.action,
      actorUserId: l.actorUserId,
      metadata: (l.metadata as Record<string, unknown>) ?? {},
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

const getCachedSettingsOverview = (organizationId: string) =>
  unstable_cache(
    () => fetchSettingsOverview(organizationId),
    [`settings-overview-${organizationId}`],
    { revalidate: 30, tags: [`settings-${organizationId}`] },
  )();

export const getSettingsOverview = cache(
  async (organizationId: string) => getCachedSettingsOverview(organizationId),
);

export function settingsCacheTag(organizationId: string) {
  return `settings-${organizationId}`;
}
