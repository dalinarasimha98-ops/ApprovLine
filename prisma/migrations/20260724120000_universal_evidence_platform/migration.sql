-- CreateEnum
CREATE TYPE "EvidenceEventStatus" AS ENUM (
  'RECEIVED',
  'QUEUED',
  'PROCESSING',
  'CLASSIFIED',
  'CORRELATED',
  'COMPLETED',
  'RETRY_PENDING',
  'DEAD_LETTER',
  'IGNORED_DUPLICATE'
);

-- CreateEnum
CREATE TYPE "UnifiedEvidenceMemberStatus" AS ENUM (
  'AUTO_LINKED',
  'SUGGESTED',
  'HUMAN_VERIFIED',
  'REJECTED'
);

-- CreateEnum
CREATE TYPE "EvidenceProviderConnectionStatus" AS ENUM (
  'CONNECTED',
  'SYNCING',
  'DEGRADED',
  'ERROR',
  'REAUTH_REQUIRED',
  'DISCONNECTED'
);

-- CreateTable
CREATE TABLE "EvidenceProviderConnection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" "EvidenceProviderConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "authenticationType" TEXT,
  "scopes" TEXT[] NOT NULL,
  "encryptedCredentials" JSONB,
  "configuration" JSONB,
  "connectedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvidenceProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedEvidenceRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "primaryApprovalId" TEXT,
  "subject" TEXT NOT NULL,
  "decision" TEXT,
  "outcome" TEXT,
  "category" TEXT,
  "department" TEXT,
  "approverName" TEXT,
  "approverEmail" TEXT,
  "amount" DECIMAL(18,2),
  "currency" TEXT,
  "riskLevel" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "sourceCount" INTEGER NOT NULL DEFAULT 1,
  "evidenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UnifiedEvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalEvidenceEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "connectionId" TEXT,
  "approvalRecordId" TEXT,
  "unifiedRecordId" TEXT,
  "providerKey" TEXT NOT NULL,
  "providerEventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "actorName" TEXT,
  "actorEmail" TEXT,
  "tenantExternalId" TEXT,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT,
  "threadId" TEXT,
  "parentId" TEXT,
  "relatedIds" TEXT[] NOT NULL,
  "participants" JSONB,
  "attachments" JSONB,
  "links" JSONB,
  "content" TEXT,
  "metadata" JSONB,
  "encryptedRawPayload" TEXT,
  "evidenceHash" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "correlationKeys" TEXT[] NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "status" "EvidenceEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastProcessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CanonicalEvidenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedEvidenceMember" (
  "id" TEXT NOT NULL,
  "unifiedRecordId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" "UnifiedEvidenceMemberStatus" NOT NULL DEFAULT 'SUGGESTED',
  "matchConfidence" INTEGER NOT NULL,
  "matchingReasons" TEXT[] NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UnifiedEvidenceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceProviderHealth" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "connectionId" TEXT,
  "providerKey" TEXT NOT NULL,
  "status" "EvidenceProviderConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "authenticationStatus" TEXT,
  "credentialExpiresAt" TIMESTAMP(3),
  "rateLimitRemaining" INTEGER,
  "latencyMs" INTEGER,
  "webhookStatus" TEXT,
  "syncStatus" TEXT,
  "lastEventAt" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "metadata" JSONB,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvidenceProviderHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceProcessingFailure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT,
  "providerKey" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "retryable" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL,
  "errorCode" TEXT,
  "correlationId" TEXT NOT NULL,
  "nextRetryAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvidenceProcessingFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceProviderConnection_organizationId_providerKey_key"
ON "EvidenceProviderConnection"("organizationId", "providerKey");

-- CreateIndex
CREATE INDEX "EvidenceProviderConnection_organizationId_status_idx"
ON "EvidenceProviderConnection"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EvidenceProviderConnection_providerKey_status_idx"
ON "EvidenceProviderConnection"("providerKey", "status");

-- CreateIndex
CREATE INDEX "UnifiedEvidenceRecord_organizationId_lastSeenAt_idx"
ON "UnifiedEvidenceRecord"("organizationId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "UnifiedEvidenceRecord_organizationId_subject_idx"
ON "UnifiedEvidenceRecord"("organizationId", "subject");

-- CreateIndex
CREATE INDEX "UnifiedEvidenceRecord_organizationId_riskLevel_idx"
ON "UnifiedEvidenceRecord"("organizationId", "riskLevel");

-- CreateIndex
CREATE INDEX "UnifiedEvidenceRecord_organizationId_department_idx"
ON "UnifiedEvidenceRecord"("organizationId", "department");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalEvidenceEvent_organizationId_providerKey_evidenceHash_key"
ON "CanonicalEvidenceEvent"("organizationId", "providerKey", "evidenceHash");

-- CreateIndex
CREATE INDEX "CanonicalEvidenceEvent_organizationId_occurredAt_idx"
ON "CanonicalEvidenceEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "CanonicalEvidenceEvent_organizationId_providerKey_occurredAt_idx"
ON "CanonicalEvidenceEvent"("organizationId", "providerKey", "occurredAt");

-- CreateIndex
CREATE INDEX "CanonicalEvidenceEvent_organizationId_objectType_objectId_idx"
ON "CanonicalEvidenceEvent"("organizationId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "CanonicalEvidenceEvent_organizationId_threadId_idx"
ON "CanonicalEvidenceEvent"("organizationId", "threadId");

-- CreateIndex
CREATE INDEX "CanonicalEvidenceEvent_organizationId_correlationId_idx"
ON "CanonicalEvidenceEvent"("organizationId", "correlationId");

-- CreateIndex
CREATE INDEX "CanonicalEvidenceEvent_organizationId_status_receivedAt_idx"
ON "CanonicalEvidenceEvent"("organizationId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedEvidenceMember_unifiedRecordId_eventId_key"
ON "UnifiedEvidenceMember"("unifiedRecordId", "eventId");

-- CreateIndex
CREATE INDEX "UnifiedEvidenceMember_eventId_status_idx"
ON "UnifiedEvidenceMember"("eventId", "status");

-- CreateIndex
CREATE INDEX "UnifiedEvidenceMember_unifiedRecordId_status_idx"
ON "UnifiedEvidenceMember"("unifiedRecordId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceProviderHealth_connectionId_key"
ON "EvidenceProviderHealth"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceProviderHealth_organizationId_providerKey_key"
ON "EvidenceProviderHealth"("organizationId", "providerKey");

-- CreateIndex
CREATE INDEX "EvidenceProviderHealth_organizationId_status_checkedAt_idx"
ON "EvidenceProviderHealth"("organizationId", "status", "checkedAt");

-- CreateIndex
CREATE INDEX "EvidenceProcessingFailure_organizationId_resolvedAt_createdAt_idx"
ON "EvidenceProcessingFailure"("organizationId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceProcessingFailure_organizationId_providerKey_stage_idx"
ON "EvidenceProcessingFailure"("organizationId", "providerKey", "stage");

-- CreateIndex
CREATE INDEX "EvidenceProcessingFailure_correlationId_idx"
ON "EvidenceProcessingFailure"("correlationId");

-- AddForeignKey
ALTER TABLE "EvidenceProviderConnection"
ADD CONSTRAINT "EvidenceProviderConnection_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedEvidenceRecord"
ADD CONSTRAINT "UnifiedEvidenceRecord_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedEvidenceRecord"
ADD CONSTRAINT "UnifiedEvidenceRecord_primaryApprovalId_fkey"
FOREIGN KEY ("primaryApprovalId") REFERENCES "ApprovalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalEvidenceEvent"
ADD CONSTRAINT "CanonicalEvidenceEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalEvidenceEvent"
ADD CONSTRAINT "CanonicalEvidenceEvent_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "EvidenceProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalEvidenceEvent"
ADD CONSTRAINT "CanonicalEvidenceEvent_approvalRecordId_fkey"
FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalEvidenceEvent"
ADD CONSTRAINT "CanonicalEvidenceEvent_unifiedRecordId_fkey"
FOREIGN KEY ("unifiedRecordId") REFERENCES "UnifiedEvidenceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedEvidenceMember"
ADD CONSTRAINT "UnifiedEvidenceMember_unifiedRecordId_fkey"
FOREIGN KEY ("unifiedRecordId") REFERENCES "UnifiedEvidenceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedEvidenceMember"
ADD CONSTRAINT "UnifiedEvidenceMember_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "CanonicalEvidenceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceProviderHealth"
ADD CONSTRAINT "EvidenceProviderHealth_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceProviderHealth"
ADD CONSTRAINT "EvidenceProviderHealth_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "EvidenceProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceProcessingFailure"
ADD CONSTRAINT "EvidenceProcessingFailure_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceProcessingFailure"
ADD CONSTRAINT "EvidenceProcessingFailure_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "CanonicalEvidenceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'CUSTOM';
