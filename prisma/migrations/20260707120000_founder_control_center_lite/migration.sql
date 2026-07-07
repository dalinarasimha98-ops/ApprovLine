CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'FOUNDER_ADMIN', 'SUPPORT_ADMIN');
CREATE TYPE "CustomerPlanTier" AS ENUM ('FREE_TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE');
CREATE TYPE "CustomerAccountStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CHURNED');
CREATE TYPE "CustomerIntegrationConnectionState" AS ENUM ('ACCESS_ENABLED', 'NOT_ENABLED', 'CONNECTED', 'DISCONNECTED', 'NEEDS_REAUTH', 'ERROR');
CREATE TYPE "CustomerHealthStatus" AS ENUM ('HEALTHY', 'NEEDS_ATTENTION', 'AT_RISK', 'CRITICAL');

CREATE TABLE "PlatformAdmin" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "PlatformRole" NOT NULL DEFAULT 'SUPPORT_ADMIN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerAccount" (
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

CREATE TABLE "CustomerWorkspace" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceName" TEXT NOT NULL,
  "workspaceSlug" TEXT NOT NULL,
  "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "CustomerWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerPlan" (
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

CREATE TABLE "CustomerSeatAllocation" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "purchasedSeats" INTEGER NOT NULL DEFAULT 5,
  "allocatedSeats" INTEGER NOT NULL DEFAULT 5,
  "usedSeats" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSeatAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerFeatureFlag" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "category" TEXT,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerIntegrationStatus" (
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

CREATE TABLE "FounderAuditLog" (
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

CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "authorEmail" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerHealth" (
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

CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE INDEX "PlatformAdmin_active_role_idx" ON "PlatformAdmin"("active", "role");

CREATE UNIQUE INDEX "CustomerAccount_organizationId_key" ON "CustomerAccount"("organizationId");
CREATE UNIQUE INDEX "CustomerAccount_domain_key" ON "CustomerAccount"("domain");
CREATE INDEX "CustomerAccount_status_planTier_idx" ON "CustomerAccount"("status", "planTier");
CREATE INDEX "CustomerAccount_companyName_idx" ON "CustomerAccount"("companyName");
CREATE INDEX "CustomerAccount_createdAt_idx" ON "CustomerAccount"("createdAt");

CREATE UNIQUE INDEX "CustomerWorkspace_customerAccountId_key" ON "CustomerWorkspace"("customerAccountId");
CREATE UNIQUE INDEX "CustomerWorkspace_organizationId_key" ON "CustomerWorkspace"("organizationId");
CREATE UNIQUE INDEX "CustomerWorkspace_workspaceSlug_key" ON "CustomerWorkspace"("workspaceSlug");

CREATE UNIQUE INDEX "CustomerPlan_planTier_key" ON "CustomerPlan"("planTier");
CREATE UNIQUE INDEX "CustomerSeatAllocation_customerAccountId_key" ON "CustomerSeatAllocation"("customerAccountId");
CREATE UNIQUE INDEX "CustomerFeatureFlag_customerAccountId_key_key" ON "CustomerFeatureFlag"("customerAccountId", "key");
CREATE INDEX "CustomerFeatureFlag_key_enabled_idx" ON "CustomerFeatureFlag"("key", "enabled");
CREATE UNIQUE INDEX "CustomerIntegrationStatus_customerAccountId_provider_key" ON "CustomerIntegrationStatus"("customerAccountId", "provider");
CREATE INDEX "CustomerIntegrationStatus_provider_connectionState_idx" ON "CustomerIntegrationStatus"("provider", "connectionState");
CREATE INDEX "FounderAuditLog_createdAt_idx" ON "FounderAuditLog"("createdAt");
CREATE INDEX "FounderAuditLog_actorEmail_idx" ON "FounderAuditLog"("actorEmail");
CREATE INDEX "FounderAuditLog_customerAccountId_createdAt_idx" ON "FounderAuditLog"("customerAccountId", "createdAt");
CREATE INDEX "FounderAuditLog_action_idx" ON "FounderAuditLog"("action");
CREATE INDEX "CustomerNote_customerAccountId_createdAt_idx" ON "CustomerNote"("customerAccountId", "createdAt");
CREATE UNIQUE INDEX "CustomerHealth_customerAccountId_key" ON "CustomerHealth"("customerAccountId");
CREATE INDEX "CustomerHealth_status_score_idx" ON "CustomerHealth"("status", "score");

ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWorkspace" ADD CONSTRAINT "CustomerWorkspace_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerWorkspace" ADD CONSTRAINT "CustomerWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSeatAllocation" ADD CONSTRAINT "CustomerSeatAllocation_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFeatureFlag" ADD CONSTRAINT "CustomerFeatureFlag_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerIntegrationStatus" ADD CONSTRAINT "CustomerIntegrationStatus_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FounderAuditLog" ADD CONSTRAINT "FounderAuditLog_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerHealth" ADD CONSTRAINT "CustomerHealth_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
