ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "companyDomain" TEXT,
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "companySize" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryAdminName" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryAdminEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "onboardingStatus" JSONB,
  ADD COLUMN IF NOT EXISTS "onboardingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingLastSavedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingCompletedSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "onboardingReadinessScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "invitedTeamMembers" JSONB,
  ADD COLUMN IF NOT EXISTS "integrationSetup" JSONB,
  ADD COLUMN IF NOT EXISTS "playbookSetup" JSONB,
  ADD COLUMN IF NOT EXISTS "copilotSetup" JSONB,
  ADD COLUMN IF NOT EXISTS "memoryGraphInitializedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Organization_onboardedAt_idx" ON "Organization"("onboardedAt");
CREATE INDEX IF NOT EXISTS "Organization_onboardingStep_idx" ON "Organization"("onboardingStep");
CREATE INDEX IF NOT EXISTS "Organization_industry_idx" ON "Organization"("industry");
