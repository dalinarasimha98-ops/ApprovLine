import { auth, currentUser } from '@clerk/nextjs/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type FounderRole = 'SUPER_ADMIN' | 'FOUNDER_ADMIN' | 'SUPPORT_ADMIN';

export type FounderAccess =
  | { ok: true; userId: string; email: string; role: FounderRole; readOnly: boolean }
  | { ok: false; reason: 'unauthenticated' | 'forbidden'; email?: string | null };

export const founderFeatures = [
  { key: 'demo_mode', label: 'Demo mode', category: 'Workspace', description: 'Allow clearly marked demo records and demo reset actions.' },
  { key: 'playbook_ai', label: 'Playbook AI', category: 'AI', description: 'Policy upload, rule extraction, and approval compliance scoring.' },
  { key: 'copilot', label: 'AI Copilot', category: 'AI', description: 'Enterprise decision intelligence assistant over approvals, policies, and evidence.' },
  { key: 'investigations', label: 'Investigation Center', category: 'Compliance', description: 'Case management, evidence timelines, and risk analysis.' },
  { key: 'executive_roi', label: 'Executive ROI', category: 'Analytics', description: 'Boardroom-ready ROI, risk, and compliance analytics.' },
  { key: 'universal_gateway', label: 'Universal Gateway', category: 'Ingestion', description: 'API, webhook, import, document, and transcript approval ingestion.' },
  { key: 'pilot_readiness', label: 'Pilot Readiness', category: 'Customer Success', description: 'Pilot setup checklist, feedback, feature flags, and customer success telemetry.' },
] as const;

export const founderIntegrationCatalog = [
  { key: 'SLACK', label: 'Slack', category: 'Messaging' },
  { key: 'GMAIL', label: 'Gmail', category: 'Email' },
  { key: 'OUTLOOK', label: 'Outlook / Exchange', category: 'Email' },
  { key: 'MICROSOFT_TEAMS', label: 'Microsoft Teams', category: 'Messaging' },
  { key: 'JIRA', label: 'Jira', category: 'Project Management' },
  { key: 'SERVICENOW', label: 'ServiceNow', category: 'ITSM' },
  { key: 'ZOOM', label: 'Zoom', category: 'Meetings' },
  { key: 'UNIVERSAL_GATEWAY', label: 'Universal Gateway', category: 'Enterprise Systems' },
] as const;

type SafeResult<T> = {
  data: T;
  migrationRequired: boolean;
  safeError?: string;
};

const bootstrapSuperAdminEmails = ['dalinarasimha98@gmail.com'];

function envList(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hasEnvEmail(names: string[], email: string) {
  const normalized = email.toLowerCase();
  return names.some((name) => envList(name).includes(normalized));
}

function parseFounderRole(value: unknown): FounderRole | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'SUPER_ADMIN' || normalized === 'FOUNDER_ADMIN' || normalized === 'SUPPORT_ADMIN') {
    return normalized;
  }
  return null;
}

function envRoleForEmail(email: string): FounderRole | null {
  if (bootstrapSuperAdminEmails.includes(email.toLowerCase())) return 'SUPER_ADMIN';

  if (
    hasEnvEmail(
      [
        'APPROVLINE_SUPER_ADMIN_EMAILS',
        'APPROVLINE_FOUNDER_EMAILS',
        'FOUNDER_SUPER_ADMIN_EMAILS',
        'SUPER_ADMIN_EMAILS',
      ],
      email,
    )
  ) {
    return 'SUPER_ADMIN';
  }
  if (
    hasEnvEmail(
      [
        'APPROVLINE_FOUNDER_ADMIN_EMAILS',
        'APPROVLINE_ADMIN_EMAILS',
        'FOUNDER_ADMIN_EMAILS',
        'ADMIN_EMAILS',
      ],
      email,
    )
  ) {
    return 'FOUNDER_ADMIN';
  }
  if (
    hasEnvEmail(
      [
        'APPROVLINE_SUPPORT_ADMIN_EMAILS',
        'FOUNDER_SUPPORT_ADMIN_EMAILS',
        'SUPPORT_ADMIN_EMAILS',
      ],
      email,
    )
  ) {
    return 'SUPPORT_ADMIN';
  }
  return null;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgresql:\/\/[^ ]+/g, '[database-url-redacted]').slice(0, 260);
}

function isFounderTableMissing(error: unknown) {
  const message = safeError(error);
  return (
    message.includes('PlatformAdmin') ||
    message.includes('CustomerAccount') ||
    message.includes('CustomerWorkspace') ||
    message.includes('CustomerPlan') ||
    message.includes('CustomerSeatAllocation') ||
    message.includes('CustomerFeatureFlag') ||
    message.includes('CustomerIntegrationStatus') ||
    message.includes('FounderAuditLog') ||
    message.includes('CustomerNote') ||
    message.includes('CustomerHealth') ||
    message.includes('does not exist')
  );
}

export async function getFounderAccess(): Promise<FounderAccess> {
  const session = await auth();
  if (!session.userId) return { ok: false, reason: 'unauthenticated' };

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? null;
  if (!email) return { ok: false, reason: 'forbidden', email };

  let role =
    envRoleForEmail(email) ??
    parseFounderRole(clerkUser?.privateMetadata?.platformRole) ??
    parseFounderRole(clerkUser?.privateMetadata?.founderRole) ??
    parseFounderRole(clerkUser?.publicMetadata?.platformRole) ??
    parseFounderRole(clerkUser?.publicMetadata?.founderRole);
  try {
    const dbAdmin = await prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase() } });
    if (dbAdmin?.active) role = dbAdmin.role as FounderRole;
  } catch (error) {
    if (!isFounderTableMissing(error)) console.error('[founder] platform admin lookup failed', error);
  }

  if (!role) return { ok: false, reason: 'forbidden', email };
  return { ok: true, userId: session.userId, email, role, readOnly: role === 'SUPPORT_ADMIN' };
}

export function canWriteFounder(access: FounderAccess) {
  return access.ok && !access.readOnly;
}

export async function logFounderAction(input: {
  access: Extract<FounderAccess, { ok: true }>;
  action: string;
  targetType: string;
  targetId?: string | null;
  customerAccountId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    return await prisma.founderAuditLog.create({
      data: {
        customerAccountId: input.customerAccountId ?? null,
        actorUserId: input.access.userId,
        actorEmail: input.access.email,
        actorRole: input.access.role,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? {},
      },
    });
  } catch (error) {
    if (!isFounderTableMissing(error)) throw error;
    return null;
  }
}

export async function buildFounderOverview(): Promise<SafeResult<{
  customers: number;
  activeCustomers: number;
  trials: number;
  atRisk: number;
  approvals: number;
  integrationsConnected: number;
  playbooks: number;
  investigations: number;
  recentCustomers: Array<{ id: string; companyName: string; domain: string; status: string; planTier: string; score: number }>;
}>> {
  try {
    const [customers, activeCustomers, trials, atRisk, approvals, integrationsConnected, playbooks, investigations, recentCustomers] = await Promise.all([
      prisma.customerAccount.count(),
      prisma.customerAccount.count({ where: { status: 'ACTIVE' } }),
      prisma.customerAccount.count({ where: { status: 'TRIAL' } }),
      prisma.customerHealth.count({ where: { status: { in: ['AT_RISK', 'CRITICAL'] } } }),
      prisma.approvalRecord.count(),
      prisma.integration.count({ where: { status: 'CONNECTED' } }),
      prisma.playbookDocument.count(),
      prisma.investigationCase.count(),
      prisma.customerAccount.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { health: true },
      }),
    ]);

    return {
      migrationRequired: false,
      data: {
        customers,
        activeCustomers,
        trials,
        atRisk,
        approvals,
        integrationsConnected,
        playbooks,
        investigations,
        recentCustomers: recentCustomers.map((customer) => ({
          id: customer.id,
          companyName: customer.companyName,
          domain: customer.domain,
          status: customer.status,
          planTier: customer.planTier,
          score: customer.health?.score ?? 50,
        })),
      },
    };
  } catch (error) {
    const fallback = await fallbackOverview();
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: fallback };
  }
}

async function fallbackOverview() {
  const [organizations, approvals, integrationsConnected, playbooks, investigations] = await Promise.all([
    prisma.organization.count().catch(() => 0),
    prisma.approvalRecord.count().catch(() => 0),
    prisma.integration.count({ where: { status: 'CONNECTED' } }).catch(() => 0),
    prisma.playbookDocument.count().catch(() => 0),
    prisma.investigationCase.count().catch(() => 0),
  ]);

  return {
    customers: organizations,
    activeCustomers: organizations,
    trials: 0,
    atRisk: 0,
    approvals,
    integrationsConnected,
    playbooks,
    investigations,
    recentCustomers: [],
  };
}

export async function listFounderCustomers(query?: string): Promise<SafeResult<Array<{
  id: string;
  companyName: string;
  domain: string;
  status: string;
  planTier: string;
  primaryAdminEmail: string;
  seats: string;
  integrationsConnected: number;
  healthScore: number;
  healthStatus: string;
}>>> {
  try {
    const customers = await prisma.customerAccount.findMany({
      where: query
        ? {
            OR: [
              { companyName: { contains: query, mode: 'insensitive' } },
              { domain: { contains: query, mode: 'insensitive' } },
              { primaryAdminEmail: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: { seatAllocation: true, integrationStatuses: true, health: true },
      take: 100,
    });

    return {
      migrationRequired: false,
      data: customers.map((customer) => ({
        id: customer.id,
        companyName: customer.companyName,
        domain: customer.domain,
        status: customer.status,
        planTier: customer.planTier,
        primaryAdminEmail: customer.primaryAdminEmail,
        seats: `${customer.seatAllocation?.usedSeats ?? 0}/${customer.seatAllocation?.allocatedSeats ?? 0}`,
        integrationsConnected: customer.integrationStatuses.filter((status) => status.connectionState === 'CONNECTED').length,
        healthScore: customer.health?.score ?? 50,
        healthStatus: customer.health?.status ?? 'NEEDS_ATTENTION',
      })),
    };
  } catch (error) {
    const organizations = await prisma.organization.findMany({
      where: query ? { name: { contains: query, mode: 'insensitive' } } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { users: true, integrations: true },
      take: 50,
    }).catch(() => []);
    return {
      migrationRequired: isFounderTableMissing(error),
      safeError: safeError(error),
      data: organizations.map((organization) => ({
        id: organization.id,
        companyName: organization.name,
        domain: `${organization.slug}.workspace`,
        status: organization.onboardedAt ? 'ACTIVE' : 'TRIAL',
        planTier: 'FREE_TRIAL',
        primaryAdminEmail: organization.users[0]?.email ?? 'admin pending',
        seats: `${organization.users.length}/${Math.max(organization.users.length, 5)}`,
        integrationsConnected: organization.integrations.filter((integration) => integration.status === 'CONNECTED').length,
        healthScore: organization.onboardedAt ? 70 : 45,
        healthStatus: organization.onboardedAt ? 'HEALTHY' : 'NEEDS_ATTENTION',
      })),
    };
  }
}

export async function getFounderCustomerProfile(id: string) {
  try {
    const customer = await prisma.customerAccount.findUnique({
      where: { id },
      include: {
        organization: { include: { users: true, integrations: true } },
        workspace: true,
        seatAllocation: true,
        featureFlags: true,
        integrationStatuses: true,
        health: true,
        notes: { orderBy: { createdAt: 'desc' }, take: 8 },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 12 },
      },
    });
    if (!customer) return { migrationRequired: false, data: null };

    const [approvals, auditLogs, playbooks, investigations] = await Promise.all([
      prisma.approvalRecord.count({ where: { organizationId: customer.organizationId } }),
      prisma.auditLog.count({ where: { organizationId: customer.organizationId } }),
      prisma.playbookDocument.count({ where: { organizationId: customer.organizationId } }),
      prisma.investigationCase.count({ where: { organizationId: customer.organizationId } }),
    ]);
    return { migrationRequired: false, data: { customer, usage: { approvals, auditLogs, playbooks, investigations } } };
  } catch (error) {
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: null };
  }
}

export async function listFounderAuditLogs(): Promise<SafeResult<Array<{
  id: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  createdAt: Date;
}>>> {
  try {
    const logs = await prisma.founderAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { migrationRequired: false, data: logs };
  } catch (error) {
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: [] };
  }
}

export async function provisionFounderCustomer(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot provision customers.');

  const companyName = String(formData.get('companyName') ?? '').trim();
  const domain = String(formData.get('domain') ?? '').trim().toLowerCase();
  const primaryAdminEmail = String(formData.get('primaryAdminEmail') ?? '').trim().toLowerCase();
  const primaryAdminName = String(formData.get('primaryAdminName') ?? '').trim();
  const industry = String(formData.get('industry') ?? '').trim();
  const planTier = String(formData.get('planTier') ?? 'FREE_TRIAL') as 'FREE_TRIAL' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  const seats = Math.max(1, Number(formData.get('seats') ?? 5));
  const dataRetentionDays = Math.max(30, Number(formData.get('dataRetentionDays') ?? 365));

  if (!companyName || !domain || !primaryAdminEmail) {
    throw new Error('Company name, domain, and primary admin email are required.');
  }

  const slug = slugify(domain.replace(/\..*$/, '') || companyName);
  const enabledFeatureKeys = new Set(formData.getAll('features').map(String));
  const enabledIntegrationKeys = new Set(formData.getAll('integrations').map(String));

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.upsert({
      where: { slug },
      update: { name: companyName, onboardedAt: new Date() },
      create: {
        name: companyName,
        slug,
        departments: ['Finance', 'Legal', 'Procurement', 'Compliance'],
        approvalCategories: ['Finance', 'Procurement', 'Legal', 'Security', 'Compliance'],
        onboardedAt: new Date(),
      },
    });

    const customer = await tx.customerAccount.upsert({
      where: { domain },
      update: {
        companyName,
        primaryAdminName: primaryAdminName || null,
        primaryAdminEmail,
        industry: industry || null,
        planTier,
        dataRetentionDays,
      },
      create: {
        organizationId: organization.id,
        companyName,
        domain,
        primaryAdminName: primaryAdminName || null,
        primaryAdminEmail,
        industry: industry || null,
        planTier,
        dataRetentionDays,
      },
    });

    await tx.customerWorkspace.upsert({
      where: { customerAccountId: customer.id },
      update: { workspaceName: companyName, workspaceSlug: slug },
      create: { customerAccountId: customer.id, organizationId: organization.id, workspaceName: companyName, workspaceSlug: slug },
    });

    await tx.customerSeatAllocation.upsert({
      where: { customerAccountId: customer.id },
      update: { purchasedSeats: seats, allocatedSeats: seats },
      create: { customerAccountId: customer.id, purchasedSeats: seats, allocatedSeats: seats },
    });

    await Promise.all(founderFeatures.map((feature) =>
      tx.customerFeatureFlag.upsert({
        where: { customerAccountId_key: { customerAccountId: customer.id, key: feature.key } },
        update: { enabled: enabledFeatureKeys.has(feature.key), category: feature.category, updatedBy: access.email },
        create: { customerAccountId: customer.id, key: feature.key, enabled: enabledFeatureKeys.has(feature.key), category: feature.category, updatedBy: access.email },
      }),
    ));

    await Promise.all(founderIntegrationCatalog.map((integration) =>
      tx.customerIntegrationStatus.upsert({
        where: { customerAccountId_provider: { customerAccountId: customer.id, provider: integration.key } },
        update: {
          accessEnabled: enabledIntegrationKeys.has(integration.key),
          connectionState: enabledIntegrationKeys.has(integration.key) ? 'ACCESS_ENABLED' : 'NOT_ENABLED',
        },
        create: {
          customerAccountId: customer.id,
          provider: integration.key,
          accessEnabled: enabledIntegrationKeys.has(integration.key),
          connectionState: enabledIntegrationKeys.has(integration.key) ? 'ACCESS_ENABLED' : 'NOT_ENABLED',
        },
      }),
    ));

    await tx.customerHealth.upsert({
      where: { customerAccountId: customer.id },
      update: { score: 55, status: 'NEEDS_ATTENTION', activeUsers: 0, integrationsConnected: 0 },
      create: { customerAccountId: customer.id, score: 55, status: 'NEEDS_ATTENTION' },
    });

    await tx.founderAuditLog.create({
      data: {
        customerAccountId: customer.id,
        actorUserId: access.userId,
        actorEmail: access.email,
        actorRole: access.role,
        action: 'customer.provisioned',
        targetType: 'CustomerAccount',
        targetId: customer.id,
        metadata: { planTier, seats, enabledIntegrations: Array.from(enabledIntegrationKeys) },
      },
    });

    return customer;
  });

  return result;
}

export async function updateCustomerStatus(access: Extract<FounderAccess, { ok: true }>, customerId: string, status: string) {
  if (access.readOnly) throw new Error('Support admins cannot change customer status.');
  const customer = await prisma.customerAccount.update({
    where: { id: customerId },
    data: { status: status as 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CHURNED' },
  });
  await logFounderAction({ access, customerAccountId: customerId, action: 'customer.status.updated', targetType: 'CustomerAccount', targetId: customerId, metadata: { status } });
  return customer;
}

export async function updateCustomerFeatureFlag(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update feature flags.');
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const key = String(formData.get('key') ?? '');
  const enabled = formData.get('enabled') === 'on';
  const feature = founderFeatures.find((item) => item.key === key);
  if (!customerAccountId || !feature) throw new Error('Customer and feature are required.');
  await prisma.customerFeatureFlag.upsert({
    where: { customerAccountId_key: { customerAccountId, key } },
    update: { enabled, category: feature.category, updatedBy: access.email },
    create: { customerAccountId, key, enabled, category: feature.category, updatedBy: access.email },
  });
  await logFounderAction({ access, customerAccountId, action: 'customer.feature_flag.updated', targetType: 'CustomerFeatureFlag', targetId: key, metadata: { enabled } });
}

export async function updateCustomerIntegrationAccess(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update integration access.');
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const provider = String(formData.get('provider') ?? '');
  const accessEnabled = formData.get('accessEnabled') === 'on';
  if (!customerAccountId || !provider) throw new Error('Customer and integration provider are required.');
  await prisma.customerIntegrationStatus.upsert({
    where: { customerAccountId_provider: { customerAccountId, provider } },
    update: { accessEnabled, connectionState: accessEnabled ? 'ACCESS_ENABLED' : 'NOT_ENABLED' },
    create: { customerAccountId, provider, accessEnabled, connectionState: accessEnabled ? 'ACCESS_ENABLED' : 'NOT_ENABLED' },
  });
  await logFounderAction({ access, customerAccountId, action: 'customer.integration_access.updated', targetType: 'CustomerIntegrationStatus', targetId: provider, metadata: { accessEnabled } });
}

export async function addCustomerNote(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot create customer notes.');
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!customerAccountId || !body) throw new Error('Customer and note are required.');
  const note = await prisma.customerNote.create({ data: { customerAccountId, authorEmail: access.email, body } });
  await logFounderAction({ access, customerAccountId, action: 'customer.note.created', targetType: 'CustomerNote', targetId: note.id });
  return note;
}

export async function listCustomerAccountOptions() {
  try {
    return await prisma.customerAccount.findMany({ orderBy: { companyName: 'asc' }, select: { id: true, companyName: true, domain: true } });
  } catch {
    return [];
  }
}

export function founderInviteLink(email?: string) {
  const base = process.env.APP_URL ?? 'https://approvline.com';
  const search = email ? `?email=${encodeURIComponent(email)}` : '';
  return `${base.replace(/\/$/, '')}/sign-up${search}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `customer-${Date.now()}`;
}
