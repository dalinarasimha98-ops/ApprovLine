DO $$ BEGIN
  CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTERED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "QueueFailureCategory" AS ENUM ('TRANSIENT', 'PERMANENT', 'TIMEOUT', 'RATE_LIMIT', 'AUTHENTICATION', 'VALIDATION', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "duplicateReason" TEXT,
  "metadata" JSONB,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BackgroundJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "queueName" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourceSystem" TEXT,
  "sourceRecordId" TEXT,
  "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 50,
  "attemptNumber" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
  "payload" JSONB NOT NULL,
  "metadata" JSONB,
  "processingStartedAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCategory" "QueueFailureCategory",
  "failureReason" TEXT,
  "nextRetryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeadLetterJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "backgroundJobId" TEXT,
  "queueName" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourceSystem" TEXT,
  "sourceRecordId" TEXT,
  "attemptCount" INTEGER NOT NULL,
  "retryEligible" BOOLEAN NOT NULL DEFAULT false,
  "failureCategory" "QueueFailureCategory" NOT NULL DEFAULT 'UNKNOWN',
  "failureReason" TEXT NOT NULL,
  "redactedPayload" JSONB NOT NULL,
  "metadata" JSONB,
  "firstFailedAt" TIMESTAMP(3) NOT NULL,
  "lastFailedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OutboxEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "queueName" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourceSystem" TEXT,
  "sourceRecordId" TEXT,
  "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  "metadata" JSONB,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "queueName" TEXT NOT NULL,
  "hostname" TEXT,
  "processId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'online',
  "currentJobType" TEXT,
  "currentJobId" TEXT,
  "metadata" JSONB,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT,
  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_organizationId_key_key" ON "IdempotencyRecord"("organizationId", "key");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_organizationId_status_idx" ON "IdempotencyRecord"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_correlationId_idx" ON "IdempotencyRecord"("correlationId");

CREATE UNIQUE INDEX IF NOT EXISTS "BackgroundJob_queueName_idempotencyKey_key" ON "BackgroundJob"("queueName", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "BackgroundJob_organizationId_status_createdAt_idx" ON "BackgroundJob"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "BackgroundJob_organizationId_jobType_status_idx" ON "BackgroundJob"("organizationId", "jobType", "status");
CREATE INDEX IF NOT EXISTS "BackgroundJob_correlationId_idx" ON "BackgroundJob"("correlationId");
CREATE INDEX IF NOT EXISTS "BackgroundJob_lastHeartbeatAt_idx" ON "BackgroundJob"("lastHeartbeatAt");

CREATE INDEX IF NOT EXISTS "DeadLetterJob_organizationId_createdAt_idx" ON "DeadLetterJob"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeadLetterJob_organizationId_failureCategory_idx" ON "DeadLetterJob"("organizationId", "failureCategory");
CREATE INDEX IF NOT EXISTS "DeadLetterJob_correlationId_idx" ON "DeadLetterJob"("correlationId");
CREATE INDEX IF NOT EXISTS "DeadLetterJob_backgroundJobId_idx" ON "DeadLetterJob"("backgroundJobId");

CREATE UNIQUE INDEX IF NOT EXISTS "OutboxEvent_organizationId_idempotencyKey_key" ON "OutboxEvent"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_organizationId_status_createdAt_idx" ON "OutboxEvent"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_correlationId_idx" ON "OutboxEvent"("correlationId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkerHeartbeat_workerId_key" ON "WorkerHeartbeat"("workerId");
CREATE INDEX IF NOT EXISTS "WorkerHeartbeat_queueName_lastSeenAt_idx" ON "WorkerHeartbeat"("queueName", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "WorkerHeartbeat_status_lastSeenAt_idx" ON "WorkerHeartbeat"("status", "lastSeenAt");

DO $$ BEGIN
  ALTER TABLE "IdempotencyRecord"
    ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BackgroundJob"
    ADD CONSTRAINT "BackgroundJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeadLetterJob"
    ADD CONSTRAINT "DeadLetterJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OutboxEvent"
    ADD CONSTRAINT "OutboxEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkerHeartbeat"
    ADD CONSTRAINT "WorkerHeartbeat_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
