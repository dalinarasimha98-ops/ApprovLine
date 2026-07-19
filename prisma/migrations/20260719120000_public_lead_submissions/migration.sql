CREATE TABLE "PublicLeadSubmission" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "companySize" TEXT,
  "industry" TEXT,
  "department" TEXT,
  "tools" TEXT,
  "interest" TEXT,
  "topic" TEXT,
  "message" TEXT NOT NULL,
  "consent" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" TEXT NOT NULL,
  "duplicateKey" TEXT NOT NULL,
  "sourcePath" TEXT,
  "notificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "providerReference" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicLeadSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicLeadSubmission_idempotencyKey_key" ON "PublicLeadSubmission"("idempotencyKey");
CREATE UNIQUE INDEX "PublicLeadSubmission_duplicateKey_key" ON "PublicLeadSubmission"("duplicateKey");
CREATE INDEX "PublicLeadSubmission_kind_createdAt_idx" ON "PublicLeadSubmission"("kind", "createdAt");
CREATE INDEX "PublicLeadSubmission_email_createdAt_idx" ON "PublicLeadSubmission"("email", "createdAt");
CREATE INDEX "PublicLeadSubmission_notificationStatus_createdAt_idx" ON "PublicLeadSubmission"("notificationStatus", "createdAt");
