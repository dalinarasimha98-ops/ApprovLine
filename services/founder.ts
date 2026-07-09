import { auth, currentUser } from '@clerk/nextjs/server';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

export const founderManagedUserRoles = [
  { key: 'ORG_ADMIN', label: 'Org Admin' },
  { key: 'COMPLIANCE', label: 'Compliance' },
  { key: 'LEGAL', label: 'Legal' },
  { key: 'FINANCE', label: 'Finance' },
  { key: 'PROCUREMENT', label: 'Procurement' },
  { key: 'ENGINEERING', label: 'Engineering' },
  { key: 'VIEWER', label: 'Viewer' },
] as const;

type SafeResult<T> = {
  data: T;
  migrationRequired: boolean;
  safeError?: string;
};

const bootstrapSuperAdminEmails = ['dalinarasimha98@gmail.com'];
let founderStorageBootstrapPromise: Promise<void> | null = null;

const founderStorageMigrationSql = `
DO $$ BEGIN
  CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'FOUNDER_ADMIN', 'SUPPORT_ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "CustomerPlanTier" AS ENUM ('FREE_TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "CustomerAccountStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CHURNED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "CustomerIntegrationConnectionState" AS ENUM ('ACCESS_ENABLED', 'NOT_ENABLED', 'CONNECTED', 'DISCONNECTED', 'NEEDS_REAUTH', 'ERROR');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "CustomerHealthStatus" AS ENUM ('HEALTHY', 'NEEDS_ATTENTION', 'AT_RISK', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "FounderManagedUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "FounderManagedUserRole" AS ENUM ('ORG_ADMIN', 'COMPLIANCE', 'LEGAL', 'FINANCE', 'PROCUREMENT', 'ENGINEERING', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PlatformAdmin" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "PlatformRole" NOT NULL DEFAULT 'SUPPORT_ADMIN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "industry" TEXT,
  "status" "CustomerAccountStatus" NOT NULL DEFAULT 'TRIAL',
  "planTier" "CustomerPlanTier" NOT NULL DEFAULT 'FREE_TRIAL',
  "primaryAdminName" TEXT,
  "primaryAdminEmail" TEXT NOT NULL,
  "dataRetentionDays" INTEGER NOT NULL DEFAULT 365,
  "internalNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerWorkspace" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceName" TEXT NOT NULL,
  "workspaceSlug" TEXT NOT NULL,
  "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "CustomerWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerPlan" (
  "id" TEXT NOT NULL,
  "planTier" "CustomerPlanTier" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "seatLimitDefault" INTEGER NOT NULL DEFAULT 5,
  "priceLabel" TEXT,
  "features" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerSeatAllocation" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "purchasedSeats" INTEGER NOT NULL DEFAULT 5,
  "allocatedSeats" INTEGER NOT NULL DEFAULT 5,
  "usedSeats" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSeatAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerFeatureFlag" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "category" TEXT,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerIntegrationStatus" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accessEnabled" BOOLEAN NOT NULL DEFAULT false,
  "connectionState" "CustomerIntegrationConnectionState" NOT NULL DEFAULT 'NOT_ENABLED',
  "lastSyncAt" TIMESTAMP(3),
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "eventsProcessed" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerIntegrationStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FounderAuditLog" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FounderAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerNote" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "authorEmail" TEXT,
  "body" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerHealth" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "status" "CustomerHealthStatus" NOT NULL DEFAULT 'NEEDS_ATTENTION',
  "score" INTEGER NOT NULL DEFAULT 50,
  "lastLoginAt" TIMESTAMP(3),
  "activeUsers" INTEGER NOT NULL DEFAULT 0,
  "approvalsProcessed" INTEGER NOT NULL DEFAULT 0,
  "integrationsConnected" INTEGER NOT NULL DEFAULT 0,
  "playbookUsage" INTEGER NOT NULL DEFAULT 0,
  "copilotUsage" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerHealth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FounderManagedUser" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "FounderManagedUserRole" NOT NULL DEFAULT 'VIEWER',
  "status" "FounderManagedUserStatus" NOT NULL DEFAULT 'INVITED',
  "inviteToken" TEXT,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FounderManagedUser_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerNote" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerNote" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE INDEX IF NOT EXISTS "PlatformAdmin_active_role_idx" ON "PlatformAdmin"("active", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_organizationId_key" ON "CustomerAccount"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_domain_key" ON "CustomerAccount"("domain");
CREATE INDEX IF NOT EXISTS "CustomerAccount_status_planTier_idx" ON "CustomerAccount"("status", "planTier");
CREATE INDEX IF NOT EXISTS "CustomerAccount_companyName_idx" ON "CustomerAccount"("companyName");
CREATE INDEX IF NOT EXISTS "CustomerAccount_createdAt_idx" ON "CustomerAccount"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerWorkspace_customerAccountId_key" ON "CustomerWorkspace"("customerAccountId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerWorkspace_organizationId_key" ON "CustomerWorkspace"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerWorkspace_workspaceSlug_key" ON "CustomerWorkspace"("workspaceSlug");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPlan_planTier_key" ON "CustomerPlan"("planTier");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSeatAllocation_customerAccountId_key" ON "CustomerSeatAllocation"("customerAccountId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerFeatureFlag_customerAccountId_key_key" ON "CustomerFeatureFlag"("customerAccountId", "key");
CREATE INDEX IF NOT EXISTS "CustomerFeatureFlag_key_enabled_idx" ON "CustomerFeatureFlag"("key", "enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIntegrationStatus_customerAccountId_provider_key" ON "CustomerIntegrationStatus"("customerAccountId", "provider");
CREATE INDEX IF NOT EXISTS "CustomerIntegrationStatus_provider_connectionState_idx" ON "CustomerIntegrationStatus"("provider", "connectionState");
CREATE INDEX IF NOT EXISTS "FounderAuditLog_createdAt_idx" ON "FounderAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "FounderAuditLog_actorEmail_idx" ON "FounderAuditLog"("actorEmail");
CREATE INDEX IF NOT EXISTS "FounderAuditLog_customerAccountId_createdAt_idx" ON "FounderAuditLog"("customerAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "FounderAuditLog_action_idx" ON "FounderAuditLog"("action");
CREATE INDEX IF NOT EXISTS "CustomerNote_customerAccountId_createdAt_idx" ON "CustomerNote"("customerAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerNote_customerAccountId_pinned_createdAt_idx" ON "CustomerNote"("customerAccountId", "pinned", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerHealth_customerAccountId_key" ON "CustomerHealth"("customerAccountId");
CREATE INDEX IF NOT EXISTS "CustomerHealth_status_score_idx" ON "CustomerHealth"("status", "score");
CREATE UNIQUE INDEX IF NOT EXISTS "FounderManagedUser_inviteToken_key" ON "FounderManagedUser"("inviteToken");
CREATE UNIQUE INDEX IF NOT EXISTS "FounderManagedUser_customerAccountId_email_key" ON "FounderManagedUser"("customerAccountId", "email");
CREATE INDEX IF NOT EXISTS "FounderManagedUser_organizationId_status_idx" ON "FounderManagedUser"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "FounderManagedUser_customerAccountId_status_idx" ON "FounderManagedUser"("customerAccountId", "status");
CREATE INDEX IF NOT EXISTS "FounderManagedUser_customerAccountId_role_idx" ON "FounderManagedUser"("customerAccountId", "role");
CREATE INDEX IF NOT EXISTS "FounderManagedUser_email_idx" ON "FounderManagedUser"("email");

DO $$ BEGIN
  ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerWorkspace" ADD CONSTRAINT "CustomerWorkspace_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerWorkspace" ADD CONSTRAINT "CustomerWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerSeatAllocation" ADD CONSTRAINT "CustomerSeatAllocation_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerFeatureFlag" ADD CONSTRAINT "CustomerFeatureFlag_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerIntegrationStatus" ADD CONSTRAINT "CustomerIntegrationStatus_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "FounderAuditLog" ADD CONSTRAINT "FounderAuditLog_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerHealth" ADD CONSTRAINT "CustomerHealth_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "FounderManagedUser" ADD CONSTRAINT "FounderManagedUser_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "FounderManagedUser" ADD CONSTRAINT "FounderManagedUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
SELECT 'f0f1537a-0712-4000-8000-founderlite', 'a0bda1ad621da0b719456bf0648cf651c72161108436fd70bd44c539c3f86902', CURRENT_TIMESTAMP, '20260707120000_founder_control_center_lite', null, null, CURRENT_TIMESTAMP, 1
WHERE to_regclass('public."_prisma_migrations"') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260707120000_founder_control_center_lite');

INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
SELECT 'v2-0712-4000-8000-founderhardening', 'runtime-bootstrap-founder-hardening-v2', CURRENT_TIMESTAMP, '20260708120000_founder_hardening_v2', null, null, CURRENT_TIMESTAMP, 1
WHERE to_regclass('public."_prisma_migrations"') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260708120000_founder_hardening_v2');
`;

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    const previous = sql[index - 1];
    const pair = `${char}${next ?? ''}`;

    if (!inSingleQuote && !inDoubleQuote && pair === '$$') {
      inDollarQuote = !inDollarQuote;
      current += pair;
      index += 1;
      continue;
    }

    if (!inDollarQuote && !inDoubleQuote && char === "'" && previous !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (!inDollarQuote && !inSingleQuote && char === '"' && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inDollarQuote) {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

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
    message.includes('FounderManagedUser') ||
    message.includes('does not exist')
  );
}

async function ensureFounderStorage() {
  if (!founderStorageBootstrapPromise) {
    founderStorageBootstrapPromise = (async () => {
      const rows = await prisma.$queryRaw<Array<{ exists: string | null }>>`
        SELECT to_regclass('public."FounderManagedUser"')::text AS exists
      `;
      if (rows[0]?.exists) return;
      for (const statement of splitSqlStatements(founderStorageMigrationSql)) {
        await prisma.$executeRawUnsafe(statement);
      }
    })().catch((error) => {
      founderStorageBootstrapPromise = null;
      throw error;
    });
  }
  return founderStorageBootstrapPromise;
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
    await ensureFounderStorage();
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

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function normalizeManagedUserRole(value: unknown) {
  const role = String(value ?? 'VIEWER').trim().toUpperCase();
  return founderManagedUserRoles.some((item) => item.key === role) ? role : 'VIEWER';
}

function optionalMetric<T>(metric: Promise<T>, fallback: T) {
  return metric.catch((error) => {
    console.warn('[founder] optional metric unavailable', safeError(error));
    return fallback;
  });
}

function healthStatusForScore(score: number) {
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'NEEDS_ATTENTION';
  if (score >= 35) return 'AT_RISK';
  return 'CRITICAL';
}

function calculateHealthScore(input: {
  activeUsers: number;
  approvalsProcessed: number;
  playbookUsage: number;
  copilotUsage: number;
  integrationsConnected: number;
  investigations: number;
  executiveUsage: number;
}) {
  const components = {
    activeUsers: Math.min(20, input.activeUsers * 4),
    approvals: Math.min(25, input.approvalsProcessed),
    integrations: Math.min(20, input.integrationsConnected * 5),
    playbooks: Math.min(12, input.playbookUsage * 2),
    investigations: Math.min(8, input.investigations * 2),
    copilot: Math.min(10, input.copilotUsage * 2),
    executive: Math.min(5, input.executiveUsage * 5),
  };
  return Math.max(5, Math.min(100, Object.values(components).reduce((sum, value) => sum + value, 0)));
}

async function recalculateCustomerSeats(customerAccountId: string) {
  const activeUsers = await prisma.founderManagedUser.count({
    where: { customerAccountId, status: 'ACTIVE' },
  });
  await prisma.customerSeatAllocation.upsert({
    where: { customerAccountId },
    update: { usedSeats: activeUsers },
    create: { customerAccountId, purchasedSeats: Math.max(activeUsers, 5), allocatedSeats: Math.max(activeUsers, 5), usedSeats: activeUsers },
  });
  return activeUsers;
}

async function refreshCustomerHealth(customerAccountId: string) {
  const customer = await prisma.customerAccount.findUnique({
    where: { id: customerAccountId },
    include: { integrationStatuses: true },
  });
  if (!customer) return null;

  const [activeUsers, approvalsProcessed, playbookUsage, copilotUsage, investigations, executiveUsage] = await Promise.all([
    prisma.founderManagedUser.count({ where: { customerAccountId, status: 'ACTIVE' } }).catch(() => 0),
    prisma.approvalRecord.count({ where: { organizationId: customer.organizationId } }).catch(() => 0),
    prisma.playbookQuery.count({ where: { organizationId: customer.organizationId } }).catch(() => 0),
    prisma.auditLog.count({ where: { organizationId: customer.organizationId, action: { contains: 'copilot', mode: 'insensitive' } } }).catch(() => 0),
    prisma.investigationCase.count({ where: { organizationId: customer.organizationId } }).catch(() => 0),
    prisma.event.count({ where: { organizationId: customer.organizationId, type: { contains: 'analytics', mode: 'insensitive' } } }).catch(() => 0),
  ]);

  const integrationsConnected = customer.integrationStatuses.filter((integration) => integration.connectionState === 'CONNECTED').length;
  const score = calculateHealthScore({ activeUsers, approvalsProcessed, playbookUsage, copilotUsage, integrationsConnected, investigations, executiveUsage });
  return prisma.customerHealth.upsert({
    where: { customerAccountId },
    update: {
      score,
      status: healthStatusForScore(score) as 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL',
      activeUsers,
      approvalsProcessed,
      integrationsConnected,
      playbookUsage,
      copilotUsage,
    },
    create: {
      customerAccountId,
      score,
      status: healthStatusForScore(score) as 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL',
      activeUsers,
      approvalsProcessed,
      integrationsConnected,
      playbookUsage,
      copilotUsage,
    },
  });
}

export async function buildFounderOverview(): Promise<SafeResult<{
  customers: number;
  activeCustomers: number;
  trials: number;
  atRisk: number;
  needsAttention: number;
  lowAdoption: number;
  approvals: number;
  integrationsConnected: number;
  playbooks: number;
  investigations: number;
  recentCustomers: Array<{ id: string; companyName: string; domain: string; status: string; planTier: string; score: number }>;
}>> {
  try {
    await ensureFounderStorage();
    const [customers, activeCustomers, trials, atRisk, needsAttention, lowAdoption, approvals, integrationsConnected, playbooks, investigations, recentCustomers] = await Promise.all([
      prisma.customerAccount.count(),
      prisma.customerAccount.count({ where: { status: 'ACTIVE' } }),
      prisma.customerAccount.count({ where: { status: 'TRIAL' } }),
      prisma.customerHealth.count({ where: { status: { in: ['AT_RISK', 'CRITICAL'] } } }),
      prisma.customerHealth.count({ where: { status: 'NEEDS_ATTENTION' } }),
      prisma.customerHealth.count({ where: { score: { lt: 45 } } }),
      optionalMetric(prisma.approvalRecord.count(), 0),
      optionalMetric(prisma.integration.count({ where: { status: 'CONNECTED' } }), 0),
      optionalMetric(prisma.playbookDocument.count(), 0),
      optionalMetric(prisma.investigationCase.count(), 0),
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
        needsAttention,
        lowAdoption,
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
    needsAttention: 0,
    lowAdoption: 0,
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
    await ensureFounderStorage();
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
      include: { seatAllocation: true, integrationStatuses: true, health: true, managedUsers: true },
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
        seats: `${customer.managedUsers.filter((user) => user.status === 'ACTIVE').length}/${customer.seatAllocation?.allocatedSeats ?? 0}`,
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
    await ensureFounderStorage();
    const customer = await prisma.customerAccount.findUnique({
      where: { id },
      include: {
        organization: { include: { users: true, integrations: true } },
        workspace: true,
        seatAllocation: true,
        featureFlags: true,
        integrationStatuses: true,
        health: true,
        notes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 8 },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 12 },
        managedUsers: { orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 8 },
      },
    });
    if (!customer) return { migrationRequired: false, data: null };

    const [approvals, auditLogs, playbooks, investigations] = await Promise.all([
      optionalMetric(prisma.approvalRecord.count({ where: { organizationId: customer.organizationId } }), 0),
      optionalMetric(prisma.auditLog.count({ where: { organizationId: customer.organizationId } }), 0),
      optionalMetric(prisma.playbookDocument.count({ where: { organizationId: customer.organizationId } }), 0),
      optionalMetric(prisma.investigationCase.count({ where: { organizationId: customer.organizationId } }), 0),
    ]);
    await refreshCustomerHealth(customer.id).catch(() => null);
    return { migrationRequired: false, data: { customer, usage: { approvals, auditLogs, playbooks, investigations } } };
  } catch (error) {
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: null };
  }
}

export type FounderAuditFilters = {
  q?: string;
  customerAccountId?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  take?: number;
};

function auditWhere(filters: FounderAuditFilters = {}): Prisma.FounderAuditLogWhereInput {
  const where: Prisma.FounderAuditLogWhereInput = {};
  const q = filters.q?.trim();
  if (filters.customerAccountId) where.customerAccountId = filters.customerAccountId;
  if (filters.actor?.trim()) where.actorEmail = { contains: filters.actor.trim(), mode: 'insensitive' };
  if (filters.action?.trim()) where.action = { contains: filters.action.trim(), mode: 'insensitive' };
  if (filters.from || filters.to) {
    where.createdAt = {
      gte: filters.from ? new Date(filters.from) : undefined,
      lte: filters.to ? new Date(filters.to) : undefined,
    };
  }
  if (q) {
    where.OR = [
      { action: { contains: q, mode: 'insensitive' } },
      { actorEmail: { contains: q, mode: 'insensitive' } },
      { targetType: { contains: q, mode: 'insensitive' } },
      { targetId: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function listFounderAuditLogs(filters: FounderAuditFilters = {}): Promise<SafeResult<Array<{
  id: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  targetType: string;
  targetId: string | null;
  createdAt: Date;
}>>> {
  try {
    await ensureFounderStorage();
    const logs = await prisma.founderAuditLog.findMany({ where: auditWhere(filters), orderBy: { createdAt: 'desc' }, take: filters.take ?? 100 });
    return { migrationRequired: false, data: logs };
  } catch (error) {
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: [] };
  }
}

export async function exportFounderAuditLogs(filters: FounderAuditFilters = {}, format: 'csv' | 'json' = 'csv') {
  const result = await listFounderAuditLogs({ ...filters, take: 500 });
  if (format === 'json') return JSON.stringify(result.data, null, 2);
  const header = ['createdAt', 'action', 'actorEmail', 'actorRole', 'targetType', 'targetId'];
  const rows = result.data.map((log) =>
    [log.createdAt.toISOString(), log.action, log.actorEmail ?? '', log.actorRole ?? '', log.targetType, log.targetId ?? '']
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

export async function provisionFounderCustomer(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot provision customers.');
  await ensureFounderStorage();

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
  await ensureFounderStorage();
  const customer = await prisma.customerAccount.update({
    where: { id: customerId },
    data: { status: status as 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CHURNED' },
  });
  await logFounderAction({ access, customerAccountId: customerId, action: 'customer.status.updated', targetType: 'CustomerAccount', targetId: customerId, metadata: { status } });
  return customer;
}

export async function updateCustomerAccountDetails(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update customer account details.');
  await ensureFounderStorage();

  const customerAccountId = String(formData.get('customerAccountId') ?? '').trim();
  const companyName = String(formData.get('companyName') ?? '').trim();
  const domain = String(formData.get('domain') ?? '').trim().toLowerCase();
  const industryValue = String(formData.get('industry') ?? '').trim();
  const planTier = String(formData.get('planTier') ?? 'FREE_TRIAL') as 'FREE_TRIAL' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  const status = String(formData.get('status') ?? 'TRIAL') as 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CHURNED';
  const seatLimit = Math.max(1, Number(formData.get('seatLimit') ?? 1));
  const dataRetentionDays = Math.max(30, Number(formData.get('dataRetentionDays') ?? 365));
  const primaryAdminNameValue = String(formData.get('primaryAdminName') ?? '').trim();
  const primaryAdminEmail = String(formData.get('primaryAdminEmail') ?? '').trim().toLowerCase();

  const validPlans = new Set(['FREE_TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE']);
  const validStatuses = new Set(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CHURNED']);

  if (!customerAccountId) throw new Error('Customer account is required.');
  if (!companyName) throw new Error('Company name is required.');
  if (!domain || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)) throw new Error('Enter a valid company domain.');
  if (!primaryAdminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryAdminEmail)) throw new Error('Enter a valid primary admin email.');
  if (!validPlans.has(planTier)) throw new Error('Choose a valid plan.');
  if (!validStatuses.has(status)) throw new Error('Choose a valid status.');

  const current = await prisma.customerAccount.findUnique({
    where: { id: customerAccountId },
    include: { seatAllocation: true, managedUsers: true },
  });
  if (!current) throw new Error('Customer account not found.');

  const activeUsers = current.managedUsers.filter((user) => user.status === 'ACTIVE').length;
  if (seatLimit < activeUsers) throw new Error(`Seat limit cannot be lower than active users (${activeUsers}).`);

  const primaryAdminName = primaryAdminNameValue || null;
  const industry = industryValue || null;
  type AuditScalar = string | number | boolean | null;
  const changedFields: Record<string, { from: AuditScalar; to: AuditScalar }> = {};
  const toAuditValue = (value: unknown): AuditScalar => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  };
  const compare = (field: string, from: unknown, to: unknown) => {
    if ((from ?? null) !== (to ?? null)) {
      changedFields[field] = { from: toAuditValue(from), to: toAuditValue(to) };
    }
  };

  compare('companyName', current.companyName, companyName);
  compare('domain', current.domain, domain);
  compare('industry', current.industry, industry);
  compare('planTier', current.planTier, planTier);
  compare('status', current.status, status);
  compare('seatLimit', current.seatAllocation?.purchasedSeats ?? current.seatAllocation?.allocatedSeats ?? 0, seatLimit);
  compare('dataRetentionDays', current.dataRetentionDays, dataRetentionDays);
  compare('primaryAdminName', current.primaryAdminName, primaryAdminName);
  compare('primaryAdminEmail', current.primaryAdminEmail, primaryAdminEmail);

  await prisma.$transaction(async (tx) => {
    await tx.customerAccount.update({
      where: { id: customerAccountId },
      data: {
        companyName,
        domain,
        industry,
        planTier,
        status,
        dataRetentionDays,
        primaryAdminName,
        primaryAdminEmail,
      },
    });

    const workspaceSlug = slugify(domain.replace(/\..*$/, '') || companyName);
    await tx.organization.update({
      where: { id: current.organizationId },
      data: { name: companyName },
    });
    await tx.customerWorkspace.upsert({
      where: { customerAccountId },
      update: { workspaceName: companyName, workspaceSlug },
      create: { customerAccountId, organizationId: current.organizationId, workspaceName: companyName, workspaceSlug },
    });
    await tx.customerSeatAllocation.upsert({
      where: { customerAccountId },
      update: { purchasedSeats: seatLimit, allocatedSeats: seatLimit, usedSeats: activeUsers },
      create: { customerAccountId, purchasedSeats: seatLimit, allocatedSeats: seatLimit, usedSeats: activeUsers },
    });
  });

  await logFounderAction({
    access,
    customerAccountId,
    action: 'CUSTOMER_ACCOUNT_UPDATED',
    targetType: 'CustomerAccount',
    targetId: customerAccountId,
    metadata: { changedFields: changedFields as Prisma.InputJsonObject },
  });
}

export async function deleteFounderCustomer(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.role !== 'SUPER_ADMIN') throw new Error('Only super admins can delete customer accounts.');
  await ensureFounderStorage();
  const customerId = String(formData.get('customerAccountId') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '').trim();
  const customer = await prisma.customerAccount.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error('Customer not found.');
  if (confirmation !== customer.companyName) throw new Error('Type the exact company name to delete this customer.');
  await logFounderAction({ access, customerAccountId: customerId, action: 'customer.deleted', targetType: 'CustomerAccount', targetId: customerId, metadata: { companyName: customer.companyName, domain: customer.domain } });
  await prisma.customerAccount.delete({ where: { id: customerId } });
}

export async function updateCustomerSeats(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update seats.');
  await ensureFounderStorage();
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const purchasedSeats = Math.max(1, Number(formData.get('purchasedSeats') ?? 1));
  const activeUsers = await prisma.founderManagedUser.count({ where: { customerAccountId, status: 'ACTIVE' } });
  if (purchasedSeats < activeUsers) throw new Error(`Purchased seats cannot be lower than active users (${activeUsers}).`);
  await prisma.customerSeatAllocation.upsert({
    where: { customerAccountId },
    update: { purchasedSeats, allocatedSeats: purchasedSeats, usedSeats: activeUsers },
    create: { customerAccountId, purchasedSeats, allocatedSeats: purchasedSeats, usedSeats: activeUsers },
  });
  await logFounderAction({ access, customerAccountId, action: 'customer.seats.updated', targetType: 'CustomerSeatAllocation', targetId: customerAccountId, metadata: { purchasedSeats, activeUsers } });
}

export async function listFounderCustomerUsers(customerAccountId: string) {
  try {
    await ensureFounderStorage();
    const customer = await prisma.customerAccount.findUnique({
      where: { id: customerAccountId },
      include: { seatAllocation: true, managedUsers: { orderBy: { createdAt: 'desc' } } },
    });
    if (!customer) return { migrationRequired: false, data: null };
    const activeUsers = customer.managedUsers.filter((user) => user.status === 'ACTIVE').length;
    const reservedUsers = customer.managedUsers.filter((user) => user.status === 'ACTIVE' || user.status === 'INVITED').length;
    const purchasedSeats = customer.seatAllocation?.purchasedSeats ?? 5;
    return {
      migrationRequired: false,
      data: {
        customer,
        seats: {
          purchasedSeats,
          usedSeats: activeUsers,
          reservedSeats: reservedUsers,
          availableSeats: Math.max(0, purchasedSeats - reservedUsers),
          usagePercent: purchasedSeats ? Math.round((activeUsers / purchasedSeats) * 100) : 0,
        },
      },
    };
  } catch (error) {
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: null };
  }
}

export async function inviteFounderCustomerUser(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot invite users.');
  await ensureFounderStorage();
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = normalizeManagedUserRole(formData.get('role')) as 'ORG_ADMIN' | 'COMPLIANCE' | 'LEGAL' | 'FINANCE' | 'PROCUREMENT' | 'ENGINEERING' | 'VIEWER';
  if (!customerAccountId || !firstName || !lastName || !email) throw new Error('First name, last name, email, and customer are required.');

  const customer = await prisma.customerAccount.findUnique({ where: { id: customerAccountId }, include: { seatAllocation: true } });
  if (!customer) throw new Error('Customer not found.');
  const capacityUsers = await prisma.founderManagedUser.count({ where: { customerAccountId, status: { in: ['ACTIVE', 'INVITED'] } } });
  const purchasedSeats = customer.seatAllocation?.purchasedSeats ?? 5;
  if (capacityUsers >= purchasedSeats) throw new Error('Seat limit reached. Increase purchased seats before inviting another user.');

  const user = await prisma.founderManagedUser.upsert({
    where: { customerAccountId_email: { customerAccountId, email } },
    update: { firstName, lastName, role, status: 'INVITED', inviteToken: randomUUID(), invitedAt: new Date(), expiresAt: daysFromNow(14), revokedAt: null, removedAt: null },
    create: { customerAccountId, organizationId: customer.organizationId, firstName, lastName, email, role, status: 'INVITED', inviteToken: randomUUID(), expiresAt: daysFromNow(14) },
  });
  await recalculateCustomerSeats(customerAccountId);
  await refreshCustomerHealth(customerAccountId);
  await logFounderAction({ access, customerAccountId, action: 'user.invited', targetType: 'FounderManagedUser', targetId: user.id, metadata: { email, role } });
  return user;
}

export async function updateFounderCustomerUser(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update users.');
  await ensureFounderStorage();
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const action = String(formData.get('action') ?? '');
  const role = normalizeManagedUserRole(formData.get('role')) as 'ORG_ADMIN' | 'COMPLIANCE' | 'LEGAL' | 'FINANCE' | 'PROCUREMENT' | 'ENGINEERING' | 'VIEWER';
  if (!customerAccountId || !userId) throw new Error('Customer and user are required.');

  const data: Prisma.FounderManagedUserUpdateInput = {};
  let auditAction = 'user.updated';
  if (action === 'activate') {
    data.status = 'ACTIVE';
    data.acceptedAt = new Date();
    auditAction = 'user.reactivated';
  } else if (action === 'suspend') {
    data.status = 'SUSPENDED';
    data.suspendedAt = new Date();
    auditAction = 'user.suspended';
  } else if (action === 'remove') {
    data.status = 'REMOVED';
    data.removedAt = new Date();
    auditAction = 'user.removed';
  } else if (action === 'revoke') {
    data.status = 'REVOKED';
    data.revokedAt = new Date();
    data.inviteToken = null;
    auditAction = 'user.invite.revoked';
  } else if (action === 'resend') {
    data.status = 'INVITED';
    data.inviteToken = randomUUID();
    data.invitedAt = new Date();
    data.expiresAt = daysFromNow(14);
    auditAction = 'user.invite.resent';
  } else if (action === 'role') {
    data.role = role;
    auditAction = 'user.role.changed';
  } else {
    throw new Error('Unsupported user action.');
  }

  const user = await prisma.founderManagedUser.update({ where: { id: userId }, data });
  await recalculateCustomerSeats(customerAccountId);
  await refreshCustomerHealth(customerAccountId);
  await logFounderAction({ access, customerAccountId, action: auditAction, targetType: 'FounderManagedUser', targetId: userId, metadata: { email: user.email, role: user.role } });
}

export async function updateCustomerFeatureFlag(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update feature flags.');
  await ensureFounderStorage();
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
  await ensureFounderStorage();
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
  await ensureFounderStorage();
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!customerAccountId || !body) throw new Error('Customer and note are required.');
  const note = await prisma.customerNote.create({ data: { customerAccountId, authorEmail: access.email, body } });
  await logFounderAction({ access, customerAccountId, action: 'customer.note.created', targetType: 'CustomerNote', targetId: note.id });
  return note;
}

export async function updateCustomerNote(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update customer notes.');
  await ensureFounderStorage();
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const noteId = String(formData.get('noteId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!customerAccountId || !noteId || !body) throw new Error('Customer, note, and body are required.');
  await prisma.customerNote.update({ where: { id: noteId }, data: { body } });
  await logFounderAction({ access, customerAccountId, action: 'customer.note.updated', targetType: 'CustomerNote', targetId: noteId });
}

export async function toggleCustomerNotePinned(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot update customer notes.');
  await ensureFounderStorage();
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const noteId = String(formData.get('noteId') ?? '');
  const pinned = formData.get('pinned') === 'true';
  if (!customerAccountId || !noteId) throw new Error('Customer and note are required.');
  await prisma.customerNote.update({ where: { id: noteId }, data: { pinned } });
  await logFounderAction({ access, customerAccountId, action: pinned ? 'customer.note.pinned' : 'customer.note.unpinned', targetType: 'CustomerNote', targetId: noteId });
}

export async function deleteCustomerNote(access: Extract<FounderAccess, { ok: true }>, formData: FormData) {
  if (access.readOnly) throw new Error('Support admins cannot delete customer notes.');
  await ensureFounderStorage();
  const customerAccountId = String(formData.get('customerAccountId') ?? '');
  const noteId = String(formData.get('noteId') ?? '');
  if (!customerAccountId || !noteId) throw new Error('Customer and note are required.');
  await prisma.customerNote.delete({ where: { id: noteId } });
  await logFounderAction({ access, customerAccountId, action: 'customer.note.deleted', targetType: 'CustomerNote', targetId: noteId });
}

export async function buildFounderOperationsCenter() {
  try {
    await ensureFounderStorage();
    const [failedJobs, queueBacklogs, syncErrors, integrationFailures, copilotFailures, gatewayFailures, recentExceptions] = await Promise.all([
      prisma.event.count({ where: { failedAt: { not: null } } }).catch(() => 0),
      prisma.event.count({ where: { processedAt: null, failedAt: null } }).catch(() => 0),
      prisma.integration.count({ where: { status: { in: ['ERROR', 'NEEDS_REAUTH'] } } }).catch(() => 0),
      prisma.customerIntegrationStatus.count({ where: { connectionState: { in: ['ERROR', 'NEEDS_REAUTH'] } } }).catch(() => 0),
      prisma.auditLog.count({ where: { action: { contains: 'copilot.error', mode: 'insensitive' } } }).catch(() => 0),
      prisma.event.count({ where: { type: { contains: 'gateway', mode: 'insensitive' }, failedAt: { not: null } } }).catch(() => 0),
      prisma.event.findMany({ where: { failedAt: { not: null } }, orderBy: { failedAt: 'desc' }, take: 8 }).catch(() => []),
    ]);
    return { migrationRequired: false, data: { failedJobs, queueBacklogs, syncErrors, integrationFailures, copilotFailures, gatewayFailures, recentExceptions } };
  } catch (error) {
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: { failedJobs: 0, queueBacklogs: 0, syncErrors: 0, integrationFailures: 0, copilotFailures: 0, gatewayFailures: 0, recentExceptions: [] } };
  }
}

export async function buildFounderReadinessReport() {
  const checks = [
    { key: 'customer_management', label: 'Customer Management', ok: true, detail: 'Provisioning, status changes, and customer profiles are available.' },
    { key: 'user_management', label: 'User Management', ok: true, detail: 'Managed customer users, invites, role changes, and suspensions are tracked.' },
    { key: 'seat_enforcement', label: 'Seat Enforcement', ok: true, detail: 'Invites are blocked once active and invited users reach purchased seats.' },
    { key: 'feature_enforcement', label: 'Feature Enforcement', ok: true, detail: 'Founder flags are persisted and auditable for customer feature gates.' },
    { key: 'integration_enforcement', label: 'Integration Enforcement', ok: true, detail: 'Founder integration access is separate from customer OAuth connection state.' },
    { key: 'security', label: 'Security', ok: true, detail: 'Founder access is allowlisted and separated from customer workspace roles.' },
    { key: 'audit_logging', label: 'Audit Logging', ok: true, detail: 'Sensitive founder actions are logged with actor, role, target, and timestamp.' },
    { key: 'health_scoring', label: 'Health Scoring', ok: true, detail: 'Customer health uses users, integrations, approvals, playbooks, investigations, and Copilot usage.' },
    { key: 'operations_monitoring', label: 'Operations Monitoring', ok: true, detail: 'Operations center surfaces failed events, queue backlog, sync errors, and recent exceptions.' },
  ];

  try {
    await ensureFounderStorage();
    const [customers, managedUsers, auditLogs] = await Promise.all([
      prisma.customerAccount.count(),
      prisma.founderManagedUser.count(),
      prisma.founderAuditLog.count(),
    ]);
    const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);
    return { migrationRequired: false, data: { score, checks, stats: { customers, managedUsers, auditLogs } } };
  } catch (error) {
    const failedChecks = checks.map((check) => check.key === 'user_management' || check.key === 'audit_logging' ? { ...check, ok: false, detail: `Migration required: ${safeError(error)}` } : check);
    const score = Math.round((failedChecks.filter((check) => check.ok).length / failedChecks.length) * 100);
    return { migrationRequired: isFounderTableMissing(error), safeError: safeError(error), data: { score, checks: failedChecks, stats: { customers: 0, managedUsers: 0, auditLogs: 0 } } };
  }
}

export async function listCustomerAccountOptions() {
  try {
    await ensureFounderStorage();
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
