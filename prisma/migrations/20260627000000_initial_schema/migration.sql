CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE', 'COMPLIANCE_OFFICER');
CREATE TYPE "IntegrationProvider" AS ENUM ('SLACK', 'GMAIL', 'MICROSOFT_TEAMS', 'ZOOM');
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'NEEDS_REAUTH', 'ERROR');
CREATE TYPE "ApprovalType" AS ENUM ('EXPLICIT', 'IMPLICIT', 'CONDITIONAL', 'REJECTION', 'ESCALATION', 'NOT_APPROVAL');
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'PENDING_REVIEW', 'REJECTED', 'NOT_A_DECISION');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "clerkOrgId" TEXT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clerkUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "department" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Integration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
  "externalAccount" TEXT,
  "scopes" TEXT[],
  "encryptedTokens" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageSource" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "integrationId" TEXT,
  "provider" "IntegrationProvider" NOT NULL,
  "externalId" TEXT,
  "channel" TEXT,
  "sender" TEXT,
  "senderEmail" TEXT,
  "rawPayload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "messageSourceId" TEXT,
  "approverUserId" TEXT,
  "approverName" TEXT,
  "subject" TEXT NOT NULL,
  "department" TEXT,
  "approvalType" "ApprovalType" NOT NULL,
  "status" "ApprovalStatus" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "reasoning" TEXT NOT NULL,
  "conditions" TEXT,
  "sourceLink" TEXT,
  "evidenceSnippet" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassifierResult" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "messageSourceId" TEXT,
  "approvalRecordId" TEXT,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "approvalDetected" BOOLEAN NOT NULL,
  "approvalType" "ApprovalType" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "normalizedJson" JSONB NOT NULL,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassifierResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "approvalRecordId" TEXT,
  "action" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "plan" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 1,
  "currentPeriodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "integrationId" TEXT,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "Team"("organizationId", "name");
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE UNIQUE INDEX "Integration_organizationId_provider_externalAccount_key" ON "Integration"("organizationId", "provider", "externalAccount");
CREATE INDEX "Integration_organizationId_provider_idx" ON "Integration"("organizationId", "provider");
CREATE INDEX "MessageSource_organizationId_provider_receivedAt_idx" ON "MessageSource"("organizationId", "provider", "receivedAt");
CREATE INDEX "MessageSource_externalId_idx" ON "MessageSource"("externalId");
CREATE INDEX "ApprovalRecord_organizationId_occurredAt_idx" ON "ApprovalRecord"("organizationId", "occurredAt");
CREATE INDEX "ApprovalRecord_organizationId_department_idx" ON "ApprovalRecord"("organizationId", "department");
CREATE INDEX "ApprovalRecord_organizationId_approverName_idx" ON "ApprovalRecord"("organizationId", "approverName");
CREATE INDEX "ClassifierResult_organizationId_createdAt_idx" ON "ClassifierResult"("organizationId", "createdAt");
CREATE INDEX "ClassifierResult_inputHash_idx" ON "ClassifierResult"("inputHash");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");
CREATE INDEX "Event_organizationId_type_createdAt_idx" ON "Event"("organizationId", "type", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageSource" ADD CONSTRAINT "MessageSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageSource" ADD CONSTRAINT "MessageSource_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_messageSourceId_fkey" FOREIGN KEY ("messageSourceId") REFERENCES "MessageSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassifierResult" ADD CONSTRAINT "ClassifierResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassifierResult" ADD CONSTRAINT "ClassifierResult_messageSourceId_fkey" FOREIGN KEY ("messageSourceId") REFERENCES "MessageSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassifierResult" ADD CONSTRAINT "ClassifierResult_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
