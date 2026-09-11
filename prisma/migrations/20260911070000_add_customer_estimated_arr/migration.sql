-- AlterTable
-- Founder-entered internal planning estimate (whole USD), captured at
-- provisioning. Nullable so every existing CustomerAccount row remains
-- valid with no backfill required. Distinct from calculated pipeline/
-- expected ARR elsewhere in the app, and never becomes actual revenue.
ALTER TABLE "CustomerAccount" ADD COLUMN "estimatedArrUsd" INTEGER;
