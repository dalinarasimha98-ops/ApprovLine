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

CREATE TABLE "MemoryEntity" (
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

CREATE TABLE "MemoryRelationship" (
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

CREATE TABLE "MemoryGraphEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "sourceSystem" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryGraphEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryTimelineEvent" (
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

CREATE UNIQUE INDEX "MemoryEntity_organizationId_type_externalId_key" ON "MemoryEntity"("organizationId", "type", "externalId");
CREATE INDEX "MemoryEntity_organizationId_type_updatedAt_idx" ON "MemoryEntity"("organizationId", "type", "updatedAt");
CREATE INDEX "MemoryEntity_organizationId_title_idx" ON "MemoryEntity"("organizationId", "title");
CREATE INDEX "MemoryEntity_organizationId_riskScore_idx" ON "MemoryEntity"("organizationId", "riskScore");

CREATE UNIQUE INDEX "MemoryRelationship_organizationId_fromEntityId_toEntityId_relationshipType_key" ON "MemoryRelationship"("organizationId", "fromEntityId", "toEntityId", "relationshipType");
CREATE INDEX "MemoryRelationship_organizationId_relationshipType_idx" ON "MemoryRelationship"("organizationId", "relationshipType");
CREATE INDEX "MemoryRelationship_organizationId_fromEntityId_idx" ON "MemoryRelationship"("organizationId", "fromEntityId");
CREATE INDEX "MemoryRelationship_organizationId_toEntityId_idx" ON "MemoryRelationship"("organizationId", "toEntityId");

CREATE INDEX "MemoryGraphEvent_organizationId_createdAt_idx" ON "MemoryGraphEvent"("organizationId", "createdAt");
CREATE INDEX "MemoryGraphEvent_organizationId_action_idx" ON "MemoryGraphEvent"("organizationId", "action");
CREATE INDEX "MemoryGraphEvent_entityId_idx" ON "MemoryGraphEvent"("entityId");

CREATE INDEX "MemoryTimelineEvent_organizationId_occurredAt_idx" ON "MemoryTimelineEvent"("organizationId", "occurredAt");
CREATE INDEX "MemoryTimelineEvent_organizationId_eventType_idx" ON "MemoryTimelineEvent"("organizationId", "eventType");
CREATE INDEX "MemoryTimelineEvent_entityId_occurredAt_idx" ON "MemoryTimelineEvent"("entityId", "occurredAt");

ALTER TABLE "MemoryEntity" ADD CONSTRAINT "MemoryEntity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryRelationship" ADD CONSTRAINT "MemoryRelationship_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryRelationship" ADD CONSTRAINT "MemoryRelationship_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "MemoryEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryRelationship" ADD CONSTRAINT "MemoryRelationship_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "MemoryEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryGraphEvent" ADD CONSTRAINT "MemoryGraphEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryGraphEvent" ADD CONSTRAINT "MemoryGraphEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "MemoryEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemoryTimelineEvent" ADD CONSTRAINT "MemoryTimelineEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryTimelineEvent" ADD CONSTRAINT "MemoryTimelineEvent_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "MemoryEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
