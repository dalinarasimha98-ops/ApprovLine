DO $$ BEGIN
  CREATE TYPE "ManualApprovalKind" AS ENUM ('VERBAL', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ManualApprovalVerificationStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED_BY_APPROVER', 'DISPUTED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalEvidenceOrigin" AS ENUM ('AUTOMATIC_CAPTURE', 'MANUAL_ENTRY', 'VERBAL_APPROVAL', 'APPROVER_CONFIRMATION', 'AI_SUGGESTION', 'HUMAN_VERIFIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EvidenceAssociationStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalConfirmationDecision" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CORRECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManualApprovalDetail" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "approvalRecordId" TEXT NOT NULL,
  "kind" "ManualApprovalKind" NOT NULL,
  "approverRole" TEXT NOT NULL,
  "communicationChannel" TEXT NOT NULL,
  "location" TEXT,
  "recorderUserId" TEXT NOT NULL,
  "businessContext" TEXT NOT NULL,
  "relatedEntityType" TEXT,
  "relatedEntityId" TEXT,
  "supportingNotes" TEXT,
  "verificationStatus" "ManualApprovalVerificationStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "confidenceLevel" INTEGER NOT NULL DEFAULT 50,
  "secondPersonRequired" BOOLEAN NOT NULL DEFAULT false,
  "secondVerifierUserId" TEXT,
  "secondVerifiedAt" TIMESTAMP(3),
  "secondVerificationNote" TEXT,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualApprovalDetail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManualApprovalVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "approvalRecordId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "previousValues" JSONB,
  "changeReason" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualApprovalVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApprovalEvidenceAssociation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "approvalRecordId" TEXT NOT NULL,
  "messageSourceId" TEXT NOT NULL,
  "origin" "ApprovalEvidenceOrigin" NOT NULL DEFAULT 'AI_SUGGESTION',
  "status" "EvidenceAssociationStatus" NOT NULL DEFAULT 'SUGGESTED',
  "confidence" INTEGER NOT NULL,
  "matchingReasons" TEXT[] NOT NULL,
  "immutableSnapshot" JSONB NOT NULL,
  "sourceTimestamp" TIMESTAMP(3) NOT NULL,
  "verifiedByUserId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "rejectedByUserId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalEvidenceAssociation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApprovalConfirmationRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "approvalRecordId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "approverName" TEXT NOT NULL,
  "approverEmail" TEXT NOT NULL,
  "decision" "ApprovalConfirmationDecision" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "responseNote" TEXT,
  "correction" JSONB,
  "immutableResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalConfirmationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManualApprovalDetail_approvalRecordId_key" ON "ManualApprovalDetail"("approvalRecordId");
CREATE INDEX IF NOT EXISTS "ManualApprovalDetail_organizationId_verificationStatus_idx" ON "ManualApprovalDetail"("organizationId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "ManualApprovalDetail_organizationId_relatedEntityType_relatedEntityId_idx" ON "ManualApprovalDetail"("organizationId", "relatedEntityType", "relatedEntityId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManualApprovalVersion_approvalRecordId_version_key" ON "ManualApprovalVersion"("approvalRecordId", "version");
CREATE INDEX IF NOT EXISTS "ManualApprovalVersion_organizationId_createdAt_idx" ON "ManualApprovalVersion"("organizationId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalEvidenceAssociation_approvalRecordId_messageSourceId_key" ON "ApprovalEvidenceAssociation"("approvalRecordId", "messageSourceId");
CREATE INDEX IF NOT EXISTS "ApprovalEvidenceAssociation_organizationId_status_createdAt_idx" ON "ApprovalEvidenceAssociation"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalConfirmationRequest_tokenHash_key" ON "ApprovalConfirmationRequest"("tokenHash");
CREATE INDEX IF NOT EXISTS "ApprovalConfirmationRequest_organizationId_approvalRecordId_createdAt_idx" ON "ApprovalConfirmationRequest"("organizationId", "approvalRecordId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApprovalConfirmationRequest_expiresAt_decision_idx" ON "ApprovalConfirmationRequest"("expiresAt", "decision");

DO $$ BEGIN
  ALTER TABLE "ManualApprovalDetail" ADD CONSTRAINT "ManualApprovalDetail_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManualApprovalDetail" ADD CONSTRAINT "ManualApprovalDetail_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManualApprovalDetail" ADD CONSTRAINT "ManualApprovalDetail_recorderUserId_fkey" FOREIGN KEY ("recorderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManualApprovalDetail" ADD CONSTRAINT "ManualApprovalDetail_secondVerifierUserId_fkey" FOREIGN KEY ("secondVerifierUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManualApprovalVersion" ADD CONSTRAINT "ManualApprovalVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManualApprovalVersion" ADD CONSTRAINT "ManualApprovalVersion_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManualApprovalVersion" ADD CONSTRAINT "ManualApprovalVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalEvidenceAssociation" ADD CONSTRAINT "ApprovalEvidenceAssociation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalEvidenceAssociation" ADD CONSTRAINT "ApprovalEvidenceAssociation_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalEvidenceAssociation" ADD CONSTRAINT "ApprovalEvidenceAssociation_messageSourceId_fkey" FOREIGN KEY ("messageSourceId") REFERENCES "MessageSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalEvidenceAssociation" ADD CONSTRAINT "ApprovalEvidenceAssociation_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalEvidenceAssociation" ADD CONSTRAINT "ApprovalEvidenceAssociation_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalConfirmationRequest" ADD CONSTRAINT "ApprovalConfirmationRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalConfirmationRequest" ADD CONSTRAINT "ApprovalConfirmationRequest_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ApprovalConfirmationRequest" ADD CONSTRAINT "ApprovalConfirmationRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
