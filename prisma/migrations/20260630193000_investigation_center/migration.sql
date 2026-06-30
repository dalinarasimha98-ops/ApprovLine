-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "InvestigationCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "department" TEXT,
    "riskLevel" TEXT,
    "summary" TEXT,
    "dateRangeStart" TIMESTAMP(3),
    "dateRangeEnd" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestigationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationApproval" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "approvalRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestigationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestigationNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestigationCase_organizationId_status_createdAt_idx" ON "InvestigationCase"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "InvestigationCase_organizationId_department_idx" ON "InvestigationCase"("organizationId", "department");

-- CreateIndex
CREATE INDEX "InvestigationCase_organizationId_riskLevel_idx" ON "InvestigationCase"("organizationId", "riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationApproval_investigationId_approvalRecordId_key" ON "InvestigationApproval"("investigationId", "approvalRecordId");

-- CreateIndex
CREATE INDEX "InvestigationApproval_approvalRecordId_idx" ON "InvestigationApproval"("approvalRecordId");

-- CreateIndex
CREATE INDEX "InvestigationNote_organizationId_investigationId_createdAt_idx" ON "InvestigationNote"("organizationId", "investigationId", "createdAt");

-- AddForeignKey
ALTER TABLE "InvestigationCase" ADD CONSTRAINT "InvestigationCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationApproval" ADD CONSTRAINT "InvestigationApproval_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "InvestigationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationApproval" ADD CONSTRAINT "InvestigationApproval_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationNote" ADD CONSTRAINT "InvestigationNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationNote" ADD CONSTRAINT "InvestigationNote_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "InvestigationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationNote" ADD CONSTRAINT "InvestigationNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
