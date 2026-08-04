-- AlterTable: add embedding provenance metadata to PlaybookChunk.
-- All new columns are nullable and additive only — no existing column is
-- dropped or renamed, and no existing "embedding" vector data is modified.
ALTER TABLE "PlaybookChunk"
  ADD COLUMN "embeddingProvider"   TEXT,
  ADD COLUMN "embeddingModel"      TEXT,
  ADD COLUMN "embeddingVersion"    TEXT,
  ADD COLUMN "embeddingDimensions" INTEGER,
  ADD COLUMN "embeddingUpdatedAt"  TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlaybookChunk_organizationId_embeddingProvider_embeddingMo_idx"
  ON "PlaybookChunk"("organizationId", "embeddingProvider", "embeddingModel");

-- Backfill: label every pre-existing embedding as legacy/unverified rather
-- than guessing which provider actually produced it. The prior embedText()
-- implementation attempted OpenAI first and only fell back to a local,
-- non-semantic hash vector on failure — with no record kept of which path
-- ran for any given row — so asserting "openai" here would be a guess, not
-- a fact. Both paths produced 96-dimension vectors, so dimensions is the
-- one thing we can state with certainty. These rows are intentionally
-- excluded from provider-matched similarity search (see
-- services/ai/embeddings.ts) until they are re-embedded by the backfill
-- script, so a legacy vector is never silently compared against a new
-- Voyage vector in the same similarity computation.
UPDATE "PlaybookChunk"
SET
  "embeddingProvider" = 'legacy-unknown',
  "embeddingVersion" = 'pre-migration',
  "embeddingDimensions" = 96,
  "embeddingUpdatedAt" = "createdAt"
WHERE "embedding" IS NOT NULL;
