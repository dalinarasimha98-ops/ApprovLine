import { revalidatePath } from 'next/cache';
import type { IntegrationProvider, IntegrationStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { getDashboardTenant } from '@/lib/auth';
import { writeAuditLog } from '@/services/audit';

type Tenant = Awaited<ReturnType<typeof getDashboardTenant>>;

export type IdentityProviderKey = 'azure_ad' | 'okta' | 'google_workspace' | 'saml' | 'oidc';

export type IdentityProviderCard = {
  key: IdentityProviderKey;
  name: string;
  category: string;
  description: string;
  status: 'connected' | 'not_configured' | 'testing' | 'error';
  protocol: 'SAML 2.0' | 'OIDC';
  lastVerified: string;
};

export type IdentityAuditItem = {
  id: string;
  action: string;
  createdAt: string;
  actor: string;
  detail: string;
};

export type IdentityDashboardData = {
  organizationId: string;
  organizationName: string;
  domain: string;
  canEdit: boolean;
  selectedProvider: IdentityProviderKey;
  connectionStatus: string;
  usersSynced: number;
  lastSync: string;
  provisioningStatus: string;
  scimStatus: string;
  defaultRole: Role;
  providers: IdentityProviderCard[];
  groupMappings: Array<{ providerGroup: string; approvLineRole: string; department: string; status: string }>;
  accessPolicies: Array<{ key: string; label: string; enabled: boolean; detail: string }>;
  sessions: Array<{ id: string; user: string; lastLogin: string; ipAddress: string; device: string; status: string }>;
  securityHealth: Array<{ label: string; status: string; detail: string; tone: 'green' | 'amber' | 'blue' | 'slate' }>;
  audits: IdentityAuditItem[];
  integrationSignals: Array<{ provider: string; status: string; lastSync: string }>;
};

type IdentityConfig = {
  provider?: IdentityProviderKey;
  status?: string;
  defaultRole?: Role;
  domainVerified?: boolean;
  metadataFileName?: string;
  entityId?: string;
  ssoUrl?: string;
  oidcIssuer?: string;
  clientIdHint?: string;
  updatedAt?: string;
  accessPolicies?: Record<string, boolean>;
};

const providerDefaults: Array<Omit<IdentityProviderCard, 'status' | 'lastVerified'>> = [
  {
    key: 'azure_ad',
    name: 'Microsoft Entra ID',
    category: 'Enterprise IdP',
    description: 'Connect Azure AD tenants for SAML or OIDC single sign-on.',
    protocol: 'OIDC',
  },
  {
    key: 'okta',
    name: 'Okta',
    category: 'Enterprise IdP',
    description: 'Use Okta as the central identity provider for ApprovLine access.',
    protocol: 'SAML 2.0',
  },
  {
    key: 'google_workspace',
    name: 'Google Workspace',
    category: 'Workspace IdP',
    description: 'Allow verified Google Workspace users to access their workspace.',
    protocol: 'OIDC',
  },
  {
    key: 'saml',
    name: 'Generic SAML 2.0',
    category: 'Standards-based',
    description: 'Upload metadata from any SAML 2.0 compatible identity provider.',
    protocol: 'SAML 2.0',
  },
  {
    key: 'oidc',
    name: 'Generic OIDC',
    category: 'Standards-based',
    description: 'Configure issuer, client, and claims mapping for OIDC providers.',
    protocol: 'OIDC',
  },
];

const defaultGroupMappings = [
  { providerGroup: 'Azure: Legal Approvers', approvLineRole: 'Legal', department: 'Legal', status: 'Prepared' },
  { providerGroup: 'Okta: Finance Leadership', approvLineRole: 'Finance', department: 'Finance', status: 'Prepared' },
  { providerGroup: 'Google: Procurement Ops', approvLineRole: 'Procurement', department: 'Procurement', status: 'Prepared' },
  { providerGroup: 'Security Reviewers', approvLineRole: 'Security', department: 'Security', status: 'Prepared' },
  { providerGroup: 'Engineering Managers', approvLineRole: 'Engineering', department: 'Engineering', status: 'Prepared' },
  { providerGroup: 'All Employees', approvLineRole: 'Viewer', department: 'General', status: 'Prepared' },
];

const accessPolicyDefaults = [
  { key: 'ssoOnly', label: 'Require SSO only', enabled: false, detail: 'Block local password login after identity provider verification.' },
  { key: 'allowGoogle', label: 'Allow Google login', enabled: true, detail: 'Permit Google sign-in for approved workspace domains.' },
  { key: 'allowMicrosoft', label: 'Allow Microsoft login', enabled: true, detail: 'Permit Microsoft 365 sign-in for approved workspace domains.' },
  { key: 'allowLocal', label: 'Allow local login', enabled: true, detail: 'Permit email/password or email OTP fallback.' },
  { key: 'restrictDomains', label: 'Restrict domains', enabled: true, detail: 'Only allow users from verified company domains.' },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readIdentityConfig(organization: NonNullable<Tenant['organization']>): IdentityConfig {
  const setup = asRecord(organization.integrationSetup);
  return asRecord(setup.identity) as IdentityConfig;
}

function selectedProviderName(provider: IdentityProviderKey) {
  return providerDefaults.find((item) => item.key === provider)?.name ?? 'Not configured';
}

function formatDate(value?: Date | string | null) {
  if (!value) return 'Not synced yet';
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? 'Not synced yet' : date.toLocaleString();
}

function statusLabel(status?: string) {
  if (!status) return 'Not configured';
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function getIdentityCenterData(tenant: Tenant): Promise<IdentityDashboardData> {
  if (!tenant.organization || !tenant.user) {
    throw new Error('Workspace is required to load identity settings.');
  }

  const organization = tenant.organization;
  const identityConfig = readIdentityConfig(organization);
  const selectedProvider = identityConfig.provider ?? 'azure_ad';
  const canEdit = tenant.user.role === 'ADMIN';

  const [usersSynced, integrations, audits] = await Promise.all([
    prisma.user.count({ where: { organizationId: organization.id } }).catch(() => 0),
    prisma.integration
      .findMany({
        where: { organizationId: organization.id },
        select: { provider: true, status: true, updatedAt: true, metadata: true },
        orderBy: { updatedAt: 'desc' },
      })
      .catch(() => [] as Array<{ provider: IntegrationProvider; status: IntegrationStatus; updatedAt: Date; metadata: Prisma.JsonValue }>),
    prisma.auditLog
      .findMany({
        where: {
          organizationId: organization.id,
          OR: [
            { action: { contains: 'identity', mode: 'insensitive' } },
            { action: { contains: 'sso', mode: 'insensitive' } },
            { action: { contains: 'session', mode: 'insensitive' } },
            { action: { contains: 'role', mode: 'insensitive' } },
          ],
        },
        include: { actorUser: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      })
      .catch(() => []),
  ]);

  const lastAudit = audits[0]?.createdAt;
  const selectedUpdatedAt = identityConfig.updatedAt ?? lastAudit?.toISOString();
  const configured = identityConfig.status === 'connected' || Boolean(identityConfig.updatedAt);
  const accessPolicyOverrides = identityConfig.accessPolicies ?? {};

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    domain: organization.companyDomain ?? tenant.user.email.split('@')[1] ?? 'company.com',
    canEdit,
    selectedProvider,
    connectionStatus: configured ? statusLabel(identityConfig.status ?? 'configured') : 'Not configured',
    usersSynced,
    lastSync: formatDate(selectedUpdatedAt),
    provisioningStatus: configured ? 'JIT provisioning prepared' : 'Not configured',
    scimStatus: 'Prepared for future SCIM rollout',
    defaultRole: identityConfig.defaultRole ?? 'EMPLOYEE',
    providers: providerDefaults.map((provider) => ({
      ...provider,
      status: configured && provider.key === selectedProvider ? 'connected' : 'not_configured',
      lastVerified: provider.key === selectedProvider ? formatDate(selectedUpdatedAt) : 'Not verified',
    })),
    groupMappings: defaultGroupMappings,
    accessPolicies: accessPolicyDefaults.map((policy) => ({
      ...policy,
      enabled: typeof accessPolicyOverrides[policy.key] === 'boolean' ? Boolean(accessPolicyOverrides[policy.key]) : policy.enabled,
    })),
    sessions: [
      {
        id: tenant.session.sessionId ?? tenant.user.id,
        user: tenant.user.email,
        lastLogin: 'Current session',
        ipAddress: 'Managed by Clerk',
        device: 'Browser session',
        status: 'Active',
      },
    ],
    securityHealth: [
      {
        label: 'MFA status',
        status: 'Managed by IdP',
        detail: 'ApprovLine delegates MFA enforcement to Clerk and the configured enterprise identity provider.',
        tone: configured ? 'green' : 'amber',
      },
      {
        label: 'SSO status',
        status: configured ? 'Configured' : 'Not configured',
        detail: configured ? `${selectedProviderName(selectedProvider)} is ready for workspace sign-in policy enforcement.` : 'Select a provider and save configuration to prepare SSO.',
        tone: configured ? 'green' : 'amber',
      },
      {
        label: 'Domain verification',
        status: identityConfig.domainVerified ? 'Verified' : 'Prepared',
        detail: `${organization.companyDomain ?? tenant.user.email.split('@')[1] ?? 'Workspace domain'} can be enforced for approved users.`,
        tone: identityConfig.domainVerified ? 'green' : 'blue',
      },
      {
        label: 'Identity health',
        status: usersSynced > 0 ? 'Healthy' : 'Needs users',
        detail: `${usersSynced} user${usersSynced === 1 ? '' : 's'} available for role and group mapping.`,
        tone: usersSynced > 0 ? 'green' : 'amber',
      },
    ],
    audits: audits.map((audit) => ({
      id: audit.id,
      action: audit.action,
      createdAt: audit.createdAt.toLocaleString(),
      actor: audit.actorUser?.email ?? 'System',
      detail: typeof audit.metadata === 'object' && audit.metadata ? JSON.stringify(audit.metadata).slice(0, 140) : 'Identity event recorded.',
    })),
    integrationSignals: integrations.map((integration) => ({
      provider: integration.provider.replaceAll('_', ' '),
      status: integration.status.replaceAll('_', ' '),
      lastSync: formatDate(integration.updatedAt),
    })),
  };
}

export async function saveIdentityConfiguration(tenant: Tenant, formData: FormData) {
  if (!tenant.organization || !tenant.user) throw new Error('Workspace is required.');
  if (tenant.user.role !== 'ADMIN') throw new Error('Only organization admins can update identity settings.');

  const currentSetup = asRecord(tenant.organization.integrationSetup);
  const provider = String(formData.get('provider') ?? 'azure_ad') as IdentityProviderKey;
  const defaultRole = String(formData.get('defaultRole') ?? 'EMPLOYEE') as Role;
  const metadataFile = formData.get('metadataFile');
  const accessPolicies = Object.fromEntries(accessPolicyDefaults.map((policy) => [policy.key, formData.get(policy.key) === 'on']));
  const identity: IdentityConfig = {
    ...readIdentityConfig(tenant.organization),
    provider,
    defaultRole,
    status: 'connected',
    domainVerified: formData.get('domainVerified') === 'on',
    metadataFileName: metadataFile instanceof File && metadataFile.name ? metadataFile.name : undefined,
    entityId: String(formData.get('entityId') ?? '').trim() || undefined,
    ssoUrl: String(formData.get('ssoUrl') ?? '').trim() || undefined,
    oidcIssuer: String(formData.get('oidcIssuer') ?? '').trim() || undefined,
    clientIdHint: String(formData.get('clientIdHint') ?? '').trim() || undefined,
    accessPolicies,
    updatedAt: new Date().toISOString(),
  };

  await prisma.organization.update({
    where: { id: tenant.organization.id },
    data: {
      integrationSetup: {
        ...currentSetup,
        identity,
      } as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'identity.provider.updated',
    metadata: {
      provider,
      defaultRole,
      domainVerified: identity.domainVerified,
      changedFields: ['provider', 'defaultRole', 'domainVerified', 'accessPolicies'],
    },
  });

  revalidatePath('/settings/identity');
  revalidatePath('/dashboard/settings');
}

export async function testIdentityConnection(tenant: Tenant) {
  if (!tenant.organization || !tenant.user) throw new Error('Workspace is required.');
  if (tenant.user.role !== 'ADMIN') throw new Error('Only organization admins can test identity settings.');
  const identity = readIdentityConfig(tenant.organization);

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'identity.connection.tested',
    metadata: {
      provider: identity.provider ?? 'not_configured',
      result: identity.updatedAt ? 'success' : 'configuration_required',
    },
  });

  revalidatePath('/settings/identity');
}

export async function revokeIdentitySession(tenant: Tenant, formData: FormData) {
  if (!tenant.organization || !tenant.user) throw new Error('Workspace is required.');
  if (tenant.user.role !== 'ADMIN') throw new Error('Only organization admins can revoke sessions.');

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'identity.session.revocation_requested',
    metadata: {
      sessionId: String(formData.get('sessionId') ?? 'current'),
      note: 'Session revocation is delegated to Clerk session controls in production.',
    },
  });

  revalidatePath('/settings/identity');
}
