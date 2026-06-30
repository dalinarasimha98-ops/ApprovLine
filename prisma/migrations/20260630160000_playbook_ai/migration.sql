-- CreateEnum
CREATE TYPE "PlaybookStatus" AS ENUM ('UPLOADED', 'INDEXING', 'READY', 'ERROR');

-- CreateTable
CREATE TABLE "PlaybookDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "status" "PlaybookStatus" NOT NULL DEFAULT 'UPLOADED',
    "contentHash" TEXT NOT NULL,
    "metadata" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookChunk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "sectionTitle" TEXT,
    "tokenEstimate" INTEGER NOT NULL,
    "embedding" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookQuery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "question" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "sourceChunkIds" TEXT[],
    "confidence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaybookDocument_organizationId_status_uploadedAt_idx" ON "PlaybookDocument"("organizationId", "status", "uploadedAt");

-- CreateIndex
CREATE INDEX "PlaybookDocument_organizationId_contentHash_idx" ON "PlaybookDocument"("organizationId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybookChunk_documentId_chunkIndex_key" ON "PlaybookChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "PlaybookChunk_organizationId_documentId_idx" ON "PlaybookChunk"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "PlaybookQuery_organizationId_createdAt_idx" ON "PlaybookQuery"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlaybookDocument" ADD CONSTRAINT "PlaybookDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookChunk" ADD CONSTRAINT "PlaybookChunk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookChunk" ADD CONSTRAINT "PlaybookChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PlaybookDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookQuery" ADD CONSTRAINT "PlaybookQuery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
