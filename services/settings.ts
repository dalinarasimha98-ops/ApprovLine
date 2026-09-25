import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { buildHealthPageReport, type ReadinessCheck } from '@/services/readiness';
import { commercialPlans, planDisplayName, formatPlanPrice } from '@/lib/plans';
import { jsonArray, type PendingInvite } from '@/services/users';
import { getIntegrationSummary } from '@/services/integrations/summary';

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
    brandColor: string | null;
    logoUrl: string | null;
    customDomain: string | null;
    customDomainStatus: string;
    defaultTimeZone: string | null;
    defaultDateFormat: string | null;
    defaultWorkspaceView: string | null;
    defaultRiskLevel: string | null;
    autoCategorizationEnabled: boolean;
    riskDetectionEnabled: boolean;
    defaultDueDateDays: number | null;
  };
  stats: {
    totalUsers: number;
    /** Tenant-scoped count of OWNER + ADMIN role members. */
    adminUsers: number;
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
  /**
   * Real plan/seat data, sourced the same safe way DashboardShell's
   * sidebar widget already reads it (CustomerAccount + its
   * CustomerSeatAllocation) - null when this organization has no
   * CustomerAccount yet (not yet provisioned in the Founder Console),
   * which is an honest, real state, not an error.
   *
   * Deliberately excludes CustomerAccount.estimatedArrUsd: per that
   * column's own schema doc comment it's a founder-entered internal
   * planning estimate that "never automatically becomes actual/
   * recognized revenue" - not an authoritative, customer-facing number,
   * so it has no business being shown to the customer as "your ARR."
   *
   * Deliberately does NOT read CustomerHealth.activeUsers as a stand-in
   * for usedSeats - those are two different, non-equivalent metrics
   * (engagement vs. seat consumption) with no architectural definition
   * making one interchangeable with the other.
   */
  billing: {
    accountStatus: string;
    planLabel: string;
    planPrice: string;
    purchasedSeats: number;
    allocatedSeats: number;
    usedSeats: number;
  } | null;
  /**
   * Organization Settings Overview KPI strip. Every count here is a real
   * tenant-scoped aggregate against an existing model - none are derived
   * from a second/duplicate engine:
   *  - pendingInvites reuses Organization.invitedTeamMembers via the same
   *    jsonArray() parser services/users.ts already uses for Users & Teams,
   *    so both surfaces report the identical number.
   *  - connectedIntegrations matches the definition the real Integrations
   *    page (app/dashboard/settings/integrations/page.tsx) uses for its
   *    own "Connected" stat pill (CONNECTED or SYNCING), not just CONNECTED.
   *  - both connectedIntegrations and integrationsInCatalog come from
   *    services/integrations/summary.ts's getIntegrationSummary(), the
   *    single shared computation also used by the real Integrations
   *    management page (app/dashboard/settings/integrations/page.tsx) for
   *    its own "Connected" stat pill - the two surfaces can no longer
   *    report different numbers, because they now call the same function.
   *    integrationsInCatalog is catalog size (native, publicly-available
   *    MarketplaceProvider rows), not "available to connect" - it is not
   *    reduced by already-connected providers, so it is labeled "in
   *    catalog" everywhere it is shown.
   *  - workflows* reuses PlaybookDocument, the actual configured-workflow
   *    concept in this codebase (there is no separate Workflow model).
   *  - dataSources* reuses EvidenceProviderConnection, the modeled
   *    "capturing evidence" connection concept.
   *  - approvalsThisMonth counts real ApprovalRecord rows created since the
   *    start of the current calendar month. There is no monthly-approval
   *    plan limit anywhere in lib/plans.ts, so the Overview UI must render
   *    this as an honest "no plan limit configured" state rather than
   *    inventing a denominator.
   */
  kpis: {
    pendingInvites: number;
    connectedIntegrations: number;
    integrationsInCatalog: number;
    workflowsTotal: number;
    workflowsActive: number;
    dataSourcesTotal: number;
    dataSourcesCapturing: number;
    approvalsThisMonth: number;
  };
  /**
   * Real, tenant-scoped compliance framework rows (ComplianceFramework
   * model). isEnabled reflects only whether the organization has this
   * framework turned on in ApprovLine's Compliance Hub - it is never a
   * claim of actual SOC 2/GDPR/etc. certification.
   */
  complianceFrameworks: { slug: string; name: string; isEnabled: boolean; lastAssessmentAt: string | null }[];
  /**
   * CustomerAccount.dataRetentionDays - founder-provisioned, not
   * customer-editable in the current architecture, so Settings renders it
   * as informational only. null when this org has no CustomerAccount yet.
   */
  dataRetentionDays: number | null;
};

/** Exported (alongside the cached getSettingsOverview()) so tests and
 *  scripts can exercise the real query logic directly without needing
 *  Next's unstable_cache runtime, which is unavailable outside a request. */
export async function fetchSettingsOverview(organizationId: string): Promise<SettingsOverview> {
  const scope = { organizationId };
  const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [
    org, userCount, adminCount, integrationSummary, teamCount, playbookCount, playbookActiveCount,
    recentLogs, healthReport, customerAccount,
    dataSourcesTotal, dataSourcesCapturing, approvalsThisMonth, complianceFrameworkRows,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true, name: true, slug: true, companyDomain: true, industry: true,
        companySize: true, country: true, departments: true, approvalCategories: true,
        onboardedAt: true, primaryAdminName: true, primaryAdminEmail: true,
        invitedTeamMembers: true,
        brandColor: true, logoUrl: true, customDomain: true, customDomainStatus: true,
        defaultTimeZone: true, defaultDateFormat: true, defaultWorkspaceView: true,
        defaultRiskLevel: true, autoCategorizationEnabled: true, riskDetectionEnabled: true,
        defaultDueDateDays: true,
      },
    }),
    prisma.user.count({ where: tenantScopedWhere(scope) }),
    prisma.user.count({ where: tenantScopedWhere(scope, { role: { in: ['OWNER', 'ADMIN'] } }) }),
    getIntegrationSummary(organizationId),
    prisma.team.count({ where: tenantScopedWhere(scope) }),
    prisma.playbookDocument.count({ where: tenantScopedWhere(scope) }),
    prisma.playbookDocument.count({ where: tenantScopedWhere(scope, { status: 'READY' }) }),
    prisma.auditLog.findMany({
      where: {
        ...tenantScopedWhere(scope),
        action: {
          in: [
            'team.member.role_changed', 'team.created', 'team.deleted',
            'user.invited', 'security_request_submitted',
            'onboarding.organization_updated', 'onboarding.completed',
            'settings.organization_updated', 'settings.preferences_updated',
            'BRANDING_UPDATED', 'DEFAULT_SETTINGS_UPDATED', 'APPROVAL_POLICY_UPDATED', 'DOMAIN_UPDATED',
          ],
        },
      },
      select: { id: true, action: true, actorUserId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    buildHealthPageReport().catch(() => null),
    prisma.customerAccount.findUnique({
      where: { organizationId },
      select: { status: true, planTier: true, dataRetentionDays: true, seatAllocation: { select: { purchasedSeats: true, allocatedSeats: true, usedSeats: true } } },
    }).catch(() => null),
    prisma.evidenceProviderConnection.count({ where: tenantScopedWhere(scope) }),
    prisma.evidenceProviderConnection.count({ where: tenantScopedWhere(scope, { status: { in: ['CONNECTED', 'SYNCING'] } }) }),
    prisma.approvalRecord.count({ where: tenantScopedWhere(scope, { createdAt: { gte: startOfMonth } }) }),
    prisma.complianceFramework.findMany({
      where: tenantScopedWhere(scope),
      select: { slug: true, name: true, isEnabled: true, lastAssessmentAt: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  // getIntegrationSummary() (services/integrations/summary.ts) is the single
  // shared computation the Integrations management page itself now also
  // calls for its "Connected" stat pill, so this KPI and that page can
  // never disagree about what "connected" means.
  const activeIntegrations = integrationSummary.connectedCount;
  const integrationsInCatalog = integrationSummary.nativeCatalogSize;
  const pendingInvites = jsonArray<PendingInvite>(org?.invitedTeamMembers).length;

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
      brandColor: org?.brandColor ?? null,
      logoUrl: org?.logoUrl ?? null,
      customDomain: org?.customDomain ?? null,
      customDomainStatus: org?.customDomainStatus ?? 'NOT_CONFIGURED',
      defaultTimeZone: org?.defaultTimeZone ?? null,
      defaultDateFormat: org?.defaultDateFormat ?? null,
      defaultWorkspaceView: org?.defaultWorkspaceView ?? null,
      defaultRiskLevel: org?.defaultRiskLevel ?? null,
      autoCategorizationEnabled: org?.autoCategorizationEnabled ?? true,
      riskDetectionEnabled: org?.riskDetectionEnabled ?? true,
      defaultDueDateDays: org?.defaultDueDateDays ?? null,
    },
    stats: {
      totalUsers: userCount,
      adminUsers: adminCount,
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
    billing: customerAccount
      ? {
          accountStatus: customerAccount.status,
          planLabel: planDisplayName(customerAccount.planTier),
          planPrice: formatPlanPrice(commercialPlans[customerAccount.planTier].pricing),
          purchasedSeats: customerAccount.seatAllocation?.purchasedSeats ?? 0,
          allocatedSeats: customerAccount.seatAllocation?.allocatedSeats ?? 0,
          usedSeats: customerAccount.seatAllocation?.usedSeats ?? 0,
        }
      : null,
    kpis: {
      pendingInvites,
      connectedIntegrations: activeIntegrations,
      integrationsInCatalog,
      workflowsTotal: playbookCount,
      workflowsActive: playbookActiveCount,
      dataSourcesTotal,
      dataSourcesCapturing,
      approvalsThisMonth,
    },
    complianceFrameworks: complianceFrameworkRows.map((f) => ({
      slug: f.slug,
      name: f.name,
      isEnabled: f.isEnabled,
      lastAssessmentAt: f.lastAssessmentAt?.toISOString() ?? null,
    })),
    dataRetentionDays: customerAccount?.dataRetentionDays ?? null,
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
