ALTER TABLE "ApprovalRecord"
  ADD COLUMN "approverEmail" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "riskLevel" TEXT,
  ADD COLUMN "businessImpact" TEXT,
  ADD COLUMN "sourcePlatform" TEXT,
  ADD COLUMN "approvalTimestamp" TIMESTAMP(3);

CREATE INDEX "ApprovalRecord_organizationId_approverEmail_idx" ON "ApprovalRecord"("organizationId", "approverEmail");
CREATE INDEX "ApprovalRecord_organizationId_category_idx" ON "ApprovalRecord"("organizationId", "category");
CREATE INDEX "ApprovalRecord_organizationId_riskLevel_idx" ON "ApprovalRecord"("organizationId", "riskLevel");
