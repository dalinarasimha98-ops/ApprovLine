import { prisma } from '@/lib/prisma';

const requiredMemoryGraphTables = [
  'MemoryEntity',
  'MemoryRelationship',
  'MemoryGraphEvent',
  'MemoryTimelineEvent',
] as const;

let memoryStorageBootstrapPromise: Promise<void> | null = null;

const memoryStorageMigrationSql = `
DO $$ BEGIN
  CREATE TYPE "MemoryEntityType" AS ENUM (
    'VENDOR',
    'CONTRACT',
    'APPROVAL',
    'APPROVER',
    'DEPARTMENT',
    'PROJECT',
    'POLICY',
    'INVESTIGATION',
    'RISK',
    'EMAIL',
    'OUTLOOK_EMAIL',
    'TEAMS_MESSAGE',
    'SLACK_MESSAGE',
    'ZOOM_DECISION',
    'JIRA_TICKET',
    'SERVICENOW_RECORD',
    'GATEWAY_RECORD',
    'EMPLOYEE',
    'MEETING',
    'TICKET',
    'DECISION',
    'MESSAGE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "MemoryEntity" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" "MemoryEntityType" NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "summary" TEXT,
  "externalType" TEXT,
  "externalId" TEXT,
  "sourceSystem" TEXT,
  "riskScore" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemoryEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MemoryRelationship" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fromEntityId" TEXT NOT NULL,
  "toEntityId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "evidenceSnippet" TEXT,
  "sourceSystem" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemoryRelationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MemoryGraphEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "sourceSystem" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryGraphEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MemoryTimelineEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "eventType" TEXT NOT NULL,
  "sourceSystem" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "sourceLink" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryTimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MemoryEntity_organizationId_type_externalId_key" ON "MemoryEntity"("organizationId", "type", "externalId");
CREATE INDEX IF NOT EXISTS "MemoryEntity_organizationId_type_updatedAt_idx" ON "MemoryEntity"("organizationId", "type", "updatedAt");
CREATE INDEX IF NOT EXISTS "MemoryEntity_organizationId_title_idx" ON "MemoryEntity"("organizationId", "title");
CREATE INDEX IF NOT EXISTS "MemoryEntity_organizationId_riskScore_idx" ON "MemoryEntity"("organizationId", "riskScore");

CREATE UNIQUE INDEX IF NOT EXISTS "MemoryRelationship_organizationId_fromEntityId_toEntityId_relationshipType_key" ON "MemoryRelationship"("organizationId", "fromEntityId", "toEntityId", "relationshipType");
CREATE INDEX IF NOT EXISTS "MemoryRelationship_organizationId_relationshipType_idx" ON "MemoryRelationship"("organizationId", "relationshipType");
CREATE INDEX IF NOT EXISTS "MemoryRelationship_organizationId_fromEntityId_idx" ON "MemoryRelationship"("organizationId", "fromEntityId");
CREATE INDEX IF NOT EXISTS "MemoryRelationship_organizationId_toEntityId_idx" ON "MemoryRelationship"("organizationId", "toEntityId");

CREATE INDEX IF NOT EXISTS "MemoryGraphEvent_organizationId_createdAt_idx" ON "MemoryGraphEvent"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "MemoryGraphEvent_organizationId_action_idx" ON "MemoryGraphEvent"("organizationId", "action");
CREATE INDEX IF NOT EXISTS "MemoryGraphEvent_entityId_idx" ON "MemoryGraphEvent"("entityId");

CREATE INDEX IF NOT EXISTS "MemoryTimelineEvent_organizationId_occurredAt_idx" ON "MemoryTimelineEvent"("organizationId", "occurredAt");
CREATE INDEX IF NOT EXISTS "MemoryTimelineEvent_organizationId_eventType_idx" ON "MemoryTimelineEvent"("organizationId", "eventType");
CREATE INDEX IF NOT EXISTS "MemoryTimelineEvent_entityId_occurredAt_idx" ON "MemoryTimelineEvent"("entityId", "occurredAt");

DO $$ BEGIN
  ALTER TABLE "MemoryEntity" ADD CONSTRAINT "MemoryEntity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MemoryRelationship" ADD CONSTRAINT "MemoryRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MemoryRelationship" ADD CONSTRAINT "MemoryRelationship_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "MemoryEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MemoryRelationship" ADD CONSTRAINT "MemoryRelationship_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "MemoryEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MemoryGraphEvent" ADD CONSTRAINT "MemoryGraphEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MemoryGraphEvent" ADD CONSTRAINT "MemoryGraphEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "MemoryEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MemoryTimelineEvent" ADD CONSTRAINT "MemoryTimelineEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "MemoryTimelineEvent" ADD CONSTRAINT "MemoryTimelineEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "MemoryEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
SELECT 'memory-graph-v1-runtime-bootstrap', 'runtime-bootstrap-memory-graph-v1', CURRENT_TIMESTAMP, '20260710090000_memory_graph_v1', null, null, CURRENT_TIMESTAMP, 1
WHERE to_regclass('public."_prisma_migrations"') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260710090000_memory_graph_v1');
`;

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    const previous = sql[index - 1];
    const pair = `${char}${next ?? ''}`;

    if (!inSingleQuote && !inDoubleQuote && pair === '$$') {
      inDollarQuote = !inDollarQuote;
      current += pair;
      index += 1;
      continue;
    }

    if (!inDollarQuote && !inDoubleQuote && char === "'" && previous !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (!inDollarQuote && !inSingleQuote && char === '"' && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inDollarQuote) {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

async function getMissingMemoryGraphTables() {
  const tableNames = requiredMemoryGraphTables.map((table) => `public."${table}"`);
  const rows = await prisma.$queryRaw<Array<{ table_name: string; exists: string | null }>>`
    SELECT table_name, to_regclass(table_name)::text AS exists
    FROM unnest(${tableNames}::text[]) AS table_name
  `;
  return rows.filter((row) => !row.exists).map((row) => row.table_name.replace(/^public\."|"$/g, ''));
}

export async function ensureMemoryStorage() {
  if (!memoryStorageBootstrapPromise) {
    memoryStorageBootstrapPromise = (async () => {
      const missingTables = await getMissingMemoryGraphTables();
      if (missingTables.length === 0) return;

      console.warn(`[memory] bootstrapping missing Memory Graph storage: ${missingTables.join(', ')}`);
      for (const statement of splitSqlStatements(memoryStorageMigrationSql)) {
        await prisma.$executeRawUnsafe(statement);
      }

      const stillMissingTables = await getMissingMemoryGraphTables();
      if (stillMissingTables.length > 0) {
        throw new Error(`Memory Graph storage bootstrap incomplete. Missing tables: ${stillMissingTables.join(', ')}`);
      }
    })().catch((error) => {
      memoryStorageBootstrapPromise = null;
      throw error;
    });
  }
  return memoryStorageBootstrapPromise;
}
