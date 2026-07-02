CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "updatedByUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotInvite" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "inviterUserId" TEXT,
  "email" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "PilotInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotFeedback" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "pageUrl" TEXT,
  "screenshot" JSONB,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PilotFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PilotActivityLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PilotActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_organizationId_key_key" ON "FeatureFlag"("organizationId", "key");
CREATE INDEX "FeatureFlag_organizationId_enabled_idx" ON "FeatureFlag"("organizationId", "enabled");
CREATE INDEX "PilotInvite_organizationId_status_invitedAt_idx" ON "PilotInvite"("organizationId", "status", "invitedAt");
CREATE INDEX "PilotInvite_email_idx" ON "PilotInvite"("email");
CREATE INDEX "PilotFeedback_organizationId_status_createdAt_idx" ON "PilotFeedback"("organizationId", "status", "createdAt");
CREATE INDEX "PilotFeedback_organizationId_type_idx" ON "PilotFeedback"("organizationId", "type");
CREATE INDEX "PilotActivityLog_organizationId_createdAt_idx" ON "PilotActivityLog"("organizationId", "createdAt");
CREATE INDEX "PilotActivityLog_organizationId_action_idx" ON "PilotActivityLog"("organizationId", "action");

ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotInvite" ADD CONSTRAINT "PilotInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotInvite" ADD CONSTRAINT "PilotInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PilotActivityLog" ADD CONSTRAINT "PilotActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotActivityLog" ADD CONSTRAINT "PilotActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
