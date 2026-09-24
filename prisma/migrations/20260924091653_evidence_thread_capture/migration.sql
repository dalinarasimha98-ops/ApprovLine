-- CreateEnum
CREATE TYPE "EvidenceEntryKind" AS ENUM ('MESSAGE', 'COMMENT', 'REVIEW', 'STATUS_CHANGE', 'APPROVAL', 'ATTACHMENT', 'TRANSCRIPT_SEGMENT');

-- CreateTable
CREATE TABLE "EvidenceThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalThreadId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "title" TEXT,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "firstEntryAt" TIMESTAMP(3),
    "lastEntryAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "hashAlgorithm" TEXT,
    "hashedAt" TIMESTAMP(3),
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "authorHandle" TEXT,
    "authorUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "kind" "EvidenceEntryKind" NOT NULL,
    "body" TEXT,
    "bodyRaw" TEXT,
    "providerMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceThread_organizationId_capturedAt_idx" ON "EvidenceThread"("organizationId", "capturedAt");

-- CreateIndex
CREATE INDEX "EvidenceThread_organizationId_complete_idx" ON "EvidenceThread"("organizationId", "complete");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceThread_organizationId_provider_externalThreadId_ver_key" ON "EvidenceThread"("organizationId", "provider", "externalThreadId", "version");

-- CreateIndex
CREATE INDEX "EvidenceEntry_organizationId_at_idx" ON "EvidenceEntry"("organizationId", "at");

-- CreateIndex
CREATE INDEX "EvidenceEntry_organizationId_authorUserId_idx" ON "EvidenceEntry"("organizationId", "authorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceEntry_threadId_sequence_key" ON "EvidenceEntry"("threadId", "sequence");

-- AddForeignKey
ALTER TABLE "EvidenceThread" ADD CONSTRAINT "EvidenceThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceEntry" ADD CONSTRAINT "EvidenceEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceEntry" ADD CONSTRAINT "EvidenceEntry_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EvidenceThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceEntry" ADD CONSTRAINT "EvidenceEntry_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
