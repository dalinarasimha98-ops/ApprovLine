-- AddPlaybookVersioning
-- Enum additions must precede column additions that reference them.
-- ALTER TYPE ADD VALUE cannot run inside a transaction on PG < 12.
-- On PG 12+ this is safe. If running on PG < 12 apply this migration in two steps.

ALTER TYPE "PlaybookStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "PlaybookStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

-- Add versioning columns to PlaybookDocument
ALTER TABLE "PlaybookDocument"
  ADD COLUMN IF NOT EXISTS "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "archivedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "replacesId"    TEXT;

-- Unique constraint: each old document can only be replaced by one successor
ALTER TABLE "PlaybookDocument"
  ADD CONSTRAINT "PlaybookDocument_replacesId_key" UNIQUE ("replacesId");

-- Self-referential FK: new document.replacesId → old document.id
-- ON DELETE SET NULL: if an old version is hard-deleted the link is cleared (not the new version)
ALTER TABLE "PlaybookDocument"
  ADD CONSTRAINT "PlaybookDocument_replacesId_fkey"
    FOREIGN KEY ("replacesId")
    REFERENCES "PlaybookDocument"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
