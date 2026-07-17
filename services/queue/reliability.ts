import { createHash, createHmac, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { Prisma, QueueFailureCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getJobRegistryEntry, type StandardJobEnvelope } from '@/services/queue/jobRegistry';

export const reliabilityWorkerId = `${hostname()}:${process.pid}`;

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toOptionalJsonValue(value?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return toInputJsonValue(value);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

export function hashPayload(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function createCorrelationId() {
  return randomUUID();
}

export function createTraceId() {
  return `trace_${randomUUID()}`;
}

export function sanitizeTenantSlug(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') || undefined;
}

export function buildGatewayIdempotencyKey(input: {
  organizationId?: string;
  organizationSlug?: string;
  sourceSystem: string;
  sourceRecordId?: string | null;
  subject?: string | null;
  approverEmail?: string | null;
  timestamp?: string | null;
  decision: string;
}) {
  const seed = [
    input.organizationId?.trim() ?? '',
    sanitizeTenantSlug(input.organizationSlug) ?? 'public-demo',
    input.sourceSystem.trim().toLowerCase(),
    input.sourceRecordId?.trim() ?? '',
    input.subject?.trim().toLowerCase() ?? '',
    input.approverEmail?.trim().toLowerCase() ?? '',
    input.timestamp?.trim() ?? '',
    input.decision.trim().toLowerCase(),
  ].join('|');

  return hashPayload(seed);
}

export function buildIncomingMessageIdempotencyKey(input: {
  organizationId: string;
  provider: string;
  externalId?: string;
  senderEmail?: string;
  timestamp?: string;
  message: string;
}) {
  const seed = [
    input.organizationId,
    input.provider,
    input.externalId ?? '',
    input.senderEmail?.toLowerCase() ?? '',
    input.timestamp ?? '',
    input.message.trim().toLowerCase(),
  ].join('|');
  return hashPayload(seed);
}

export async function claimIdempotencyRecord(input: {
  organizationId: string;
  key: string;
  requestHash: string;
  correlationId: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
}) {
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
  });

  if (existing) {
    return {
      status: 'duplicate' as const,
      record: existing,
      sameRequest: existing.requestHash === input.requestHash,
    };
  }

  const record = await prisma.idempotencyRecord.create({
    data: {
      organizationId: input.organizationId,
      key: input.key,
      requestHash: input.requestHash,
      status: 'accepted',
      correlationId: input.correlationId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: toOptionalJsonValue(input.metadata),
      expiresAt: input.expiresAt ?? undefined,
    },
  });

  return { status: 'new' as const, record, sameRequest: true };
}

export async function completeIdempotencyRecord(input: {
  organizationId: string;
  key: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.idempotencyRecord.update({
    where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
    data: {
      status: 'completed',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: toOptionalJsonValue(input.metadata),
    },
  }).catch(() => null);
}

export async function failIdempotencyRecord(input: {
  organizationId: string;
  key: string;
  failureReason: string;
  duplicateReason?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.idempotencyRecord.update({
    where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
    data: {
      status: 'failed',
      duplicateReason: input.duplicateReason,
      metadata: toInputJsonValue({
        ...(input.metadata ?? {}),
        failureReason: input.failureReason,
      }),
    },
  }).catch(() => null);
}

export async function registerBackgroundJob<TPayload>(envelope: StandardJobEnvelope<TPayload>) {
  const registry = getJobRegistryEntry(envelope.jobType);
  return prisma.backgroundJob.upsert({
    where: {
      queueName_idempotencyKey: {
        queueName: registry?.queueName ?? envelope.jobType,
        idempotencyKey: envelope.idempotencyKey,
      },
    },
    update: {
      correlationId: envelope.correlationId,
      sourceSystem: envelope.sourceSystem,
      sourceRecordId: envelope.sourceRecordId,
      priority: envelope.priority,
      payload: toInputJsonValue(envelope.payload),
      metadata: toOptionalJsonValue(envelope.metadata),
      timeoutMs: registry?.timeoutMs ?? 15_000,
      maxAttempts: registry?.maxAttempts ?? 3,
      status: 'QUEUED',
      nextRetryAt: null,
      failureCategory: null,
      failureReason: null,
      failedAt: null,
      completedAt: null,
    },
    create: {
      organizationId: envelope.organizationId,
      queueName: registry?.queueName ?? envelope.jobType,
      jobName: envelope.jobType,
      jobType: envelope.jobType,
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      sourceSystem: envelope.sourceSystem,
      sourceRecordId: envelope.sourceRecordId,
      priority: envelope.priority,
      payload: toInputJsonValue(envelope.payload),
      metadata: toOptionalJsonValue(envelope.metadata),
      timeoutMs: registry?.timeoutMs ?? 15_000,
      maxAttempts: registry?.maxAttempts ?? 3,
    },
  });
}

export async function markBackgroundJobProcessing(input: {
  queueName: string;
  idempotencyKey: string;
  attemptNumber: number;
  currentJobId?: string;
  currentJobType?: string;
  organizationId: string;
}) {
  const now = new Date();
  await prisma.backgroundJob.update({
    where: {
      queueName_idempotencyKey: {
        queueName: input.queueName,
        idempotencyKey: input.idempotencyKey,
      },
    },
    data: {
      status: 'PROCESSING',
      attemptNumber: input.attemptNumber,
      processingStartedAt: now,
      lastHeartbeatAt: now,
      nextRetryAt: null,
    },
  }).catch(() => null);

  await prisma.workerHeartbeat.upsert({
    where: { workerId: reliabilityWorkerId },
    update: {
      queueName: input.queueName,
      processId: String(process.pid),
      hostname: hostname(),
      currentJobId: input.currentJobId,
      currentJobType: input.currentJobType,
      organizationId: input.organizationId,
      lastSeenAt: now,
      status: 'online',
    },
    create: {
      workerId: reliabilityWorkerId,
      queueName: input.queueName,
      processId: String(process.pid),
      hostname: hostname(),
      currentJobId: input.currentJobId,
      currentJobType: input.currentJobType,
      organizationId: input.organizationId,
      lastSeenAt: now,
      status: 'online',
    },
  }).catch(() => null);
}

export async function heartbeatBackgroundJob(input: {
  queueName: string;
  idempotencyKey: string;
  organizationId: string;
  currentJobId?: string;
  currentJobType?: string;
}) {
  const now = new Date();
  await prisma.backgroundJob.update({
    where: {
      queueName_idempotencyKey: {
        queueName: input.queueName,
        idempotencyKey: input.idempotencyKey,
      },
    },
    data: { lastHeartbeatAt: now },
  }).catch(() => null);

  await prisma.workerHeartbeat.update({
    where: { workerId: reliabilityWorkerId },
    data: {
      lastSeenAt: now,
      currentJobId: input.currentJobId,
      currentJobType: input.currentJobType,
      organizationId: input.organizationId,
      status: 'online',
    },
  }).catch(() => null);
}

export async function markBackgroundJobCompleted(input: {
  queueName: string;
  idempotencyKey: string;
}) {
  const now = new Date();
  await prisma.backgroundJob.update({
    where: {
      queueName_idempotencyKey: {
        queueName: input.queueName,
        idempotencyKey: input.idempotencyKey,
      },
    },
    data: {
      status: 'COMPLETED',
      completedAt: now,
      lastHeartbeatAt: now,
      failureCategory: null,
      failureReason: null,
    },
  }).catch(() => null);

  await prisma.workerHeartbeat.update({
    where: { workerId: reliabilityWorkerId },
    data: {
      currentJobId: null,
      currentJobType: null,
      lastSeenAt: now,
      status: 'online',
    },
  }).catch(() => null);
}

export async function markBackgroundJobFailed(input: {
  queueName: string;
  idempotencyKey: string;
  attemptNumber: number;
  maxAttempts: number;
  failureCategory: QueueFailureCategory;
  failureReason: string;
  retryDelayMs?: number;
}) {
  const now = new Date();
  const exhausted =
    input.attemptNumber >= input.maxAttempts ||
    ['PERMANENT', 'VALIDATION', 'AUTHENTICATION'].includes(input.failureCategory);
  await prisma.backgroundJob.update({
    where: {
      queueName_idempotencyKey: {
        queueName: input.queueName,
        idempotencyKey: input.idempotencyKey,
      },
    },
    data: {
      status: exhausted ? 'FAILED' : 'QUEUED',
      failedAt: now,
      lastHeartbeatAt: now,
      failureCategory: input.failureCategory,
      failureReason: input.failureReason,
      nextRetryAt: exhausted ? null : new Date(now.getTime() + (input.retryDelayMs ?? 15_000)),
    },
  }).catch(() => null);

  await prisma.workerHeartbeat.update({
    where: { workerId: reliabilityWorkerId },
    data: {
      currentJobId: null,
      currentJobType: null,
      lastSeenAt: now,
      status: 'online',
    },
  }).catch(() => null);
}

export async function moveToDeadLetter<TPayload>(input: {
  envelope: StandardJobEnvelope<TPayload>;
  queueName: string;
  attemptCount: number;
  failureCategory: QueueFailureCategory;
  failureReason: string;
  retryEligible?: boolean;
  metadata?: Record<string, unknown>;
}) {
  await prisma.backgroundJob.update({
    where: {
      queueName_idempotencyKey: {
        queueName: input.queueName,
        idempotencyKey: input.envelope.idempotencyKey,
      },
    },
    data: {
      status: 'DEAD_LETTERED',
      failedAt: new Date(),
      lastHeartbeatAt: new Date(),
      failureCategory: input.failureCategory,
      failureReason: input.failureReason,
      nextRetryAt: null,
    },
  }).catch(() => null);

  return prisma.deadLetterJob.create({
    data: {
      organizationId: input.envelope.organizationId,
      queueName: input.queueName,
      jobName: input.envelope.jobType,
      jobType: input.envelope.jobType,
      correlationId: input.envelope.correlationId,
      idempotencyKey: input.envelope.idempotencyKey,
      sourceSystem: input.envelope.sourceSystem,
      sourceRecordId: input.envelope.sourceRecordId,
      attemptCount: input.attemptCount,
      retryEligible: input.retryEligible ?? false,
      failureCategory: input.failureCategory,
      failureReason: input.failureReason,
      redactedPayload: toInputJsonValue({
        ...input.envelope,
        payload: {
          ...(typeof input.envelope.payload === 'object' && input.envelope.payload ? input.envelope.payload as Record<string, unknown> : {}),
          rawPayload: '[redacted]',
        },
      }),
      metadata: toOptionalJsonValue(input.metadata),
      firstFailedAt: new Date(),
      lastFailedAt: new Date(),
    },
  }).catch(() => null);
}

export async function createOutboxEvent<TPayload>(input: {
  organizationId: string;
  eventType: string;
  queueName: string;
  correlationId: string;
  idempotencyKey: string;
  sourceSystem?: string;
  sourceRecordId?: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
}) {
  return prisma.outboxEvent.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    update: {
      status: 'PENDING',
      payload: toInputJsonValue(input.payload),
      metadata: toOptionalJsonValue(input.metadata),
      sourceSystem: input.sourceSystem,
      sourceRecordId: input.sourceRecordId,
      availableAt: new Date(),
      failureReason: null,
      failedAt: null,
    },
    create: {
      organizationId: input.organizationId,
      eventType: input.eventType,
      queueName: input.queueName,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      sourceSystem: input.sourceSystem,
      sourceRecordId: input.sourceRecordId,
      payload: toInputJsonValue(input.payload),
      metadata: toOptionalJsonValue(input.metadata),
    },
  });
}

export function verifyWebhookSignature(input: {
  secret?: string;
  signature?: string | null;
  timestamp?: string | null;
  body: string;
  toleranceSeconds?: number;
}) {
  if (!input.secret) {
    return { ok: true as const, reason: null };
  }

  if (!input.signature || !input.timestamp) {
    return { ok: false as const, reason: 'missing_signature' };
  }

  const issuedAt = Number(input.timestamp);
  if (!Number.isFinite(issuedAt)) {
    return { ok: false as const, reason: 'invalid_timestamp' };
  }

  const toleranceSeconds = input.toleranceSeconds ?? 300;
  if (Math.abs(Date.now() - issuedAt * 1000) > toleranceSeconds * 1000) {
    return { ok: false as const, reason: 'expired_timestamp' };
  }

  const digest = createHmac('sha256', input.secret).update(`${input.timestamp}.${input.body}`).digest('hex');
  const expected = `sha256=${digest}`;
  return { ok: input.signature === expected, reason: input.signature === expected ? null : 'invalid_signature' };
}
