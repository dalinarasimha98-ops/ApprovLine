-- CreateTable
CREATE TABLE "PlaybookRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredApprovers" TEXT[],
    "requiredDepartments" TEXT[],
    "escalationChain" TEXT[],
    "spendingLimit" INTEGER,
    "riskTriggers" TEXT[],
    "evidenceRequired" TEXT[],
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "sourceSection" TEXT,
    "sourceExcerpt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalComplianceEvaluation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "approvalRecordId" TEXT NOT NULL,
    "ruleId" TEXT,
    "status" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "missingApprovers" TEXT[],
    "missingDepartments" TEXT[],
    "missingEscalationSteps" TEXT[],
    "missingEvidence" TEXT[],
    "triggeredRule" TEXT,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalComplianceEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaybookRule_organizationId_category_idx" ON "PlaybookRule"("organizationId", "category");

-- CreateIndex
CREATE INDEX "PlaybookRule_organizationId_severity_idx" ON "PlaybookRule"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "PlaybookRule_organizationId_documentId_idx" ON "PlaybookRule"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "ApprovalComplianceEvaluation_organizationId_status_createdAt_idx" ON "ApprovalComplianceEvaluation"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalComplianceEvaluation_organizationId_severity_idx" ON "ApprovalComplianceEvaluation"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "ApprovalComplianceEvaluation_approvalRecordId_idx" ON "ApprovalComplianceEvaluation"("approvalRecordId");

-- CreateIndex
CREATE INDEX "ApprovalComplianceEvaluation_ruleId_idx" ON "ApprovalComplianceEvaluation"("ruleId");

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PlaybookDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComplianceEvaluation" ADD CONSTRAINT "ApprovalComplianceEvaluation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComplianceEvaluation" ADD CONSTRAINT "ApprovalComplianceEvaluation_approvalRecordId_fkey" FOREIGN KEY ("approvalRecordId") REFERENCES "ApprovalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComplianceEvaluation" ADD CONSTRAINT "ApprovalComplianceEvaluation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PlaybookRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
