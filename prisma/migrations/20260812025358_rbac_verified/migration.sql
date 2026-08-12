-- AlterTable
ALTER TABLE "ApprovalEvidenceAssociation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BackgroundJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CustomerNote" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DeadLetterJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IdempotencyRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ManualApprovalDetail" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "departments" DROP DEFAULT,
ALTER COLUMN "approvalCategories" DROP DEFAULT,
ALTER COLUMN "onboardingCompletedSteps" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OutboxEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkerHeartbeat" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "ApprovalComplianceEvaluation_organizationId_status_createdAt_id" RENAME TO "ApprovalComplianceEvaluation_organizationId_status_createdA_idx";

-- RenameIndex
ALTER INDEX "ApprovalConfirmationRequest_organizationId_approvalRecordId_cre" RENAME TO "ApprovalConfirmationRequest_organizationId_approvalRecordId_idx";

-- RenameIndex
ALTER INDEX "ApprovalEvidenceAssociation_approvalRecordId_messageSourceId_ke" RENAME TO "ApprovalEvidenceAssociation_approvalRecordId_messageSourceI_key";

-- RenameIndex
ALTER INDEX "CanonicalEvidenceEvent_organizationId_providerKey_evidenceHash_" RENAME TO "CanonicalEvidenceEvent_organizationId_providerKey_evidenceH_key";

-- RenameIndex
ALTER INDEX "CanonicalEvidenceEvent_organizationId_providerKey_occurredAt_id" RENAME TO "CanonicalEvidenceEvent_organizationId_providerKey_occurredA_idx";

-- RenameIndex
ALTER INDEX "EvidenceProcessingFailure_organizationId_resolvedAt_createdAt_i" RENAME TO "EvidenceProcessingFailure_organizationId_resolvedAt_created_idx";

-- RenameIndex
ALTER INDEX "ManualApprovalDetail_organizationId_relatedEntityType_relatedEn" RENAME TO "ManualApprovalDetail_organizationId_relatedEntityType_relat_idx";

-- RenameIndex
ALTER INDEX "MemoryRelationship_organizationId_fromEntityId_toEntityId_relat" RENAME TO "MemoryRelationship_organizationId_fromEntityId_toEntityId_r_key";

-- RenameIndex
ALTER INDEX "PlaybookChunk_organizationId_embeddingProvider_embeddingMo_idx" RENAME TO "PlaybookChunk_organizationId_embeddingProvider_embeddingMod_idx";
