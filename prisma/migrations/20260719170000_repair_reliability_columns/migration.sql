-- Repair schema drift introduced when reliability metadata was added to existing
-- models without corresponding ALTER TABLE statements in the Week 3 migration.

ALTER TABLE "MessageSource"
  ADD COLUMN IF NOT EXISTS "threadId" TEXT,
  ADD COLUMN IF NOT EXISTS "eventId" TEXT,
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT,
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "ApprovalRecord"
  ADD COLUMN IF NOT EXISTS "duplicateDisposition" TEXT,
  ADD COLUMN IF NOT EXISTS "duplicateReason" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRecordId" TEXT,
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT,
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "ClassifierResult"
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRecordId" TEXT,
  ADD COLUMN IF NOT EXISTS "duplicateDisposition" TEXT,
  ADD COLUMN IF NOT EXISTS "duplicateReason" TEXT;

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRecordId" TEXT,
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE INDEX IF NOT EXISTS "MessageSource_organizationId_provider_threadId_idx"
  ON "MessageSource"("organizationId", "provider", "threadId");
CREATE INDEX IF NOT EXISTS "MessageSource_organizationId_provider_eventId_idx"
  ON "MessageSource"("organizationId", "provider", "eventId");
CREATE INDEX IF NOT EXISTS "MessageSource_organizationId_contentHash_idx"
  ON "MessageSource"("organizationId", "contentHash");
CREATE INDEX IF NOT EXISTS "MessageSource_organizationId_idempotencyKey_idx"
  ON "MessageSource"("organizationId", "idempotencyKey");

-- Preserve every source record while removing only duplicate lookup keys from
-- older rows, allowing the tenant/provider/external-id invariant to be enforced.
WITH "rankedMessageSources" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "provider", "externalId"
      ORDER BY "receivedAt" DESC, "id" DESC
    ) AS "duplicateRank"
  FROM "MessageSource"
  WHERE "externalId" IS NOT NULL
)
UPDATE "MessageSource" AS "source"
SET "externalId" = NULL
FROM "rankedMessageSources" AS "ranked"
WHERE "source"."id" = "ranked"."id"
  AND "ranked"."duplicateRank" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "MessageSource_organizationId_provider_externalId_key"
  ON "MessageSource"("organizationId", "provider", "externalId");

CREATE INDEX IF NOT EXISTS "ApprovalRecord_organizationId_idempotencyKey_idx"
  ON "ApprovalRecord"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ApprovalRecord_organizationId_correlationId_idx"
  ON "ApprovalRecord"("organizationId", "correlationId");
CREATE INDEX IF NOT EXISTS "ApprovalRecord_organizationId_sourceSystem_sourceRecordId_idx"
  ON "ApprovalRecord"("organizationId", "sourceSystem", "sourceRecordId");
CREATE INDEX IF NOT EXISTS "ApprovalRecord_organizationId_contentHash_idx"
  ON "ApprovalRecord"("organizationId", "contentHash");

CREATE INDEX IF NOT EXISTS "ClassifierResult_organizationId_idempotencyKey_idx"
  ON "ClassifierResult"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ClassifierResult_organizationId_correlationId_idx"
  ON "ClassifierResult"("organizationId", "correlationId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassifierResult_organizationId_idempotencyKey_key"
  ON "ClassifierResult"("organizationId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "Event_organizationId_correlationId_idx"
  ON "Event"("organizationId", "correlationId");
CREATE INDEX IF NOT EXISTS "Event_organizationId_idempotencyKey_idx"
  ON "Event"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "Event_organizationId_sourceSystem_sourceRecordId_idx"
  ON "Event"("organizationId", "sourceSystem", "sourceRecordId");
