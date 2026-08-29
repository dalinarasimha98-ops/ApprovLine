-- AlterEnum: add IN_PROGRESS, ESCALATED, RESOLVED statuses to InvestigationStatus
-- PostgreSQL requires separate ADD VALUE statements; they cannot be in a transaction.
ALTER TYPE "InvestigationStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "InvestigationStatus" ADD VALUE 'ESCALATED';
ALTER TYPE "InvestigationStatus" ADD VALUE 'RESOLVED';

-- AlterTable: extend InvestigationCase with new columns
ALTER TABLE "InvestigationCase" ADD COLUMN "type"             TEXT;
ALTER TABLE "InvestigationCase" ADD COLUMN "assignedToUserId" TEXT;
ALTER TABLE "InvestigationCase" ADD COLUMN "createdByUserId"  TEXT;
ALTER TABLE "InvestigationCase" ADD COLUMN "resolvedAt"       TIMESTAMP(3);

-- AddForeignKey: assignedTo → User (nullable, SET NULL on user delete)
ALTER TABLE "InvestigationCase" ADD CONSTRAINT "InvestigationCase_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: createdBy → User (nullable, SET NULL on user delete)
ALTER TABLE "InvestigationCase" ADD CONSTRAINT "InvestigationCase_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: organization + type for type-filter queries
CREATE INDEX "InvestigationCase_organizationId_type_idx" ON "InvestigationCase"("organizationId", "type");

-- CreateIndex: assignedToUserId for user workload queries
CREATE INDEX "InvestigationCase_assignedToUserId_idx" ON "InvestigationCase"("assignedToUserId");

-- CreateIndex: resolvedAt for avg-resolution-time calculations
CREATE INDEX "InvestigationCase_resolvedAt_idx" ON "InvestigationCase"("resolvedAt");
