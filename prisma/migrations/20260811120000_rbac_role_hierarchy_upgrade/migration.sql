-- Expand the Role enum from {ADMIN, MANAGER, EMPLOYEE, COMPLIANCE_OFFICER}
-- to {OWNER, ADMIN, MANAGER, MEMBER, AUDITOR, VIEWER} and remap existing
-- data: EMPLOYEE -> MEMBER, COMPLIANCE_OFFICER -> AUDITOR. ADMIN/MANAGER
-- keep their names. Postgres can't rename/remove enum values with data in
-- place, so this creates a new type, migrates both columns that use it
-- (User.role, PilotInvite.role) via a USING/CASE cast, then swaps the type
-- in. No existing row can natively be OWNER or VIEWER (those are new
-- concepts) - the backfill below promotes one OWNER per organization so
-- pre-existing orgs don't end up with zero owners after this migration.

CREATE TYPE "Role_new" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'AUDITOR', 'VIEWER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'EMPLOYEE' THEN 'MEMBER'
    WHEN 'COMPLIANCE_OFFICER' THEN 'AUDITOR'
    ELSE "role"::text
  END
)::"Role_new";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

ALTER TABLE "PilotInvite" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "PilotInvite" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'EMPLOYEE' THEN 'MEMBER'
    WHEN 'COMPLIANCE_OFFICER' THEN 'AUDITOR'
    ELSE "role"::text
  END
)::"Role_new";
ALTER TABLE "PilotInvite" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Backfill: every organization keeps at least one OWNER. Promote the
-- earliest-created ADMIN per organization (ties broken by id) to OWNER, so
-- existing orgs aren't left with no one able to perform OWNER-only actions
-- (granting OWNER to someone else, being immune to the "last owner" guard).
WITH first_admin AS (
  SELECT DISTINCT ON ("organizationId") "id"
  FROM "User"
  WHERE "role" = 'ADMIN'
  ORDER BY "organizationId", "createdAt" ASC, "id" ASC
)
UPDATE "User"
SET "role" = 'OWNER'
WHERE "id" IN (SELECT "id" FROM first_admin);
