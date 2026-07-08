CREATE TYPE "FounderManagedUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'REMOVED');

CREATE TYPE "FounderManagedUserRole" AS ENUM ('ORG_ADMIN', 'COMPLIANCE', 'LEGAL', 'FINANCE', 'PROCUREMENT', 'ENGINEERING', 'VIEWER');

ALTER TABLE "CustomerNote" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerNote" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "FounderManagedUser" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "FounderManagedUserRole" NOT NULL DEFAULT 'VIEWER',
  "status" "FounderManagedUserStatus" NOT NULL DEFAULT 'INVITED',
  "inviteToken" TEXT,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FounderManagedUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FounderManagedUser_inviteToken_key" ON "FounderManagedUser"("inviteToken");
CREATE UNIQUE INDEX "FounderManagedUser_customerAccountId_email_key" ON "FounderManagedUser"("customerAccountId", "email");
CREATE INDEX "FounderManagedUser_organizationId_status_idx" ON "FounderManagedUser"("organizationId", "status");
CREATE INDEX "FounderManagedUser_customerAccountId_status_idx" ON "FounderManagedUser"("customerAccountId", "status");
CREATE INDEX "FounderManagedUser_customerAccountId_role_idx" ON "FounderManagedUser"("customerAccountId", "role");
CREATE INDEX "FounderManagedUser_email_idx" ON "FounderManagedUser"("email");
CREATE INDEX "CustomerNote_customerAccountId_pinned_createdAt_idx" ON "CustomerNote"("customerAccountId", "pinned", "createdAt");

ALTER TABLE "FounderManagedUser" ADD CONSTRAINT "FounderManagedUser_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FounderManagedUser" ADD CONSTRAINT "FounderManagedUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
