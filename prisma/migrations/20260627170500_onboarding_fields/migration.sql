ALTER TABLE "Organization"
  ADD COLUMN "departments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "approvalCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "onboardedAt" TIMESTAMP(3);
