import { Queue } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { createRedisConnection, getRedisConfigurationStatus } from '@/services/queue/connection';
import { getJobRegistryEntry, type StandardJobEnvelope } from '@/services/queue/jobRegistry';
import {
  buildIncomingMessageIdempotencyKey,
  claimIdempotencyRecord,
  createCorrelationId,
  createOutboxEvent,
  createTraceId,
  hashPayload,
  registerBackgroundJob,
} from '@/services/queue/reliability';

export interface IncomingMessageJob {
  organizationId: string;
  integrationId?: string;
  provider: 'SLACK' | 'GMAIL' | 'OUTLOOK' | 'MICROSOFT_TEAMS' | 'JIRA' | 'SERVICENOW' | 'ZOOM';
  externalId?: string;
  channel?: string;
  sender?: string;
  senderEmail?: string;
  timestamp?: string;
  message: string;
  sourceLink?: string;
  rawPayload?: unknown;
}

export const approvalQueueName = 'approval-classification';
export const gatewayOutboxFlushJobType = 'gateway.outbox.flush';

type ApprovalEnvelope = StandardJobEnvelope<IncomingMessageJob>;

let approvalQueue: Queue<ApprovalEnvelope, unknown, string> | null = null;

export function getApprovalQueue() {
  if (approvalQueue) return approvalQueue;

  const connection = createRedisConnection('approval-queue');
  if (!connection) return null;

  approvalQueue = new Queue<ApprovalEnvelope, unknown, string>(approvalQueueName, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  approvalQueue.on('error', (error) => {
    console.error(`[queue:${approvalQueueName}] ${error.message}`);
  });
  return approvalQueue;
}

export interface EnqueueIncomingMessageOptions {
  jobType?: string;
  workspaceId?: string;
  sourceSystem?: string;
  sourceRecordId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId?: string;
  priority?: number;
}

export type EnqueueIncomingMessageResult =
  | {
      queued: true;
      id?: string;
      correlationId: string;
      idempotencyKey: string;
      duplicate: boolean;
      processingMode: 'queue' | 'outbox';
      backgroundJobId?: string;
    }
  | { queued: false; reason: string; correlationId?: string; idempotencyKey?: string };

function buildJobEnvelope(
  job: IncomingMessageJob,
  options?: EnqueueIncomingMessageOptions,
): ApprovalEnvelope {
  const registry = getJobRegistryEntry(options?.jobType ?? 'approval.classify');
  const correlationId = options?.correlationId ?? createCorrelationId();
  const idempotencyKey =
    options?.idempotencyKey ??
    buildIncomingMessageIdempotencyKey({
      organizationId: job.organizationId,
      provider: job.provider,
      externalId: job.externalId,
      senderEmail: job.senderEmail,
      timestamp: job.timestamp,
      message: job.message,
    });

  return {
    jobType: registry?.jobType ?? 'approval.classify',
    organizationId: job.organizationId,
    workspaceId: options?.workspaceId ?? job.organizationId,
    correlationId,
    idempotencyKey,
    sourceSystem: options?.sourceSystem ?? job.provider.toLowerCase(),
    sourceRecordId: options?.sourceRecordId ?? job.externalId,
    attemptNumber: 0,
    createdAt: new Date().toISOString(),
    traceId: createTraceId(),
    priority: options?.priority ?? registry?.priority ?? 50,
    metadata: options?.metadata,
    payload: job,
  };
}

export async function enqueueIncomingMessage(
  job: IncomingMessageJob,
  options?: EnqueueIncomingMessageOptions,
): Promise<EnqueueIncomingMessageResult> {
  const envelope = buildJobEnvelope(job, options);
  const requestHash = hashPayload({
    payload: envelope.payload,
    sourceSystem: envelope.sourceSystem,
    sourceRecordId: envelope.sourceRecordId,
  });
  const idempotency = await claimIdempotencyRecord({
    organizationId: envelope.organizationId,
    key: envelope.idempotencyKey,
    requestHash,
    correlationId: envelope.correlationId,
    resourceType: 'background_job',
    metadata: {
      jobType: envelope.jobType,
      sourceSystem: envelope.sourceSystem,
      sourceRecordId: envelope.sourceRecordId,
    },
  });

  if (idempotency.status === 'duplicate') {
    const existingJob = await prisma.backgroundJob.findUnique({
      where: {
        queueName_idempotencyKey: {
          queueName: approvalQueueName,
          idempotencyKey: envelope.idempotencyKey,
        },
      },
      select: { id: true, status: true },
    }).catch(() => null);

    return {
      queued: true,
      id: existingJob?.id,
      correlationId: idempotency.record.correlationId || envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      duplicate: true,
      processingMode: existingJob?.status === 'QUEUED' || existingJob?.status === 'PROCESSING' ? 'queue' : 'outbox',
      backgroundJobId: existingJob?.id,
    };
  }

  const backgroundJob = await registerBackgroundJob(envelope);
  const queue = getApprovalQueue();
  if (!queue) {
    const status = getRedisConfigurationStatus();
    await createOutboxEvent({
      organizationId: envelope.organizationId,
      eventType: envelope.jobType,
      queueName: approvalQueueName,
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      sourceSystem: envelope.sourceSystem,
      sourceRecordId: envelope.sourceRecordId,
      payload: envelope,
      metadata: {
        degradedReason: status.message,
        ...envelope.metadata,
      },
    });

    return {
      queued: true,
      id: backgroundJob.id,
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      duplicate: false,
      processingMode: 'outbox',
      backgroundJobId: backgroundJob.id,
    };
  }

  try {
    const queued = await queue.add(envelope.jobType, envelope, {
      jobId: `${approvalQueueName}:${envelope.idempotencyKey}`,
      priority: Math.max(1, 100 - envelope.priority),
    });
    return {
      queued: true,
      id: queued.id,
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      duplicate: false,
      processingMode: 'queue',
      backgroundJobId: backgroundJob.id,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Approval queue is unavailable.';
    console.error(`[queue:${approvalQueueName}] Unable to enqueue ${job.provider} message: ${reason}`);
    await createOutboxEvent({
      organizationId: envelope.organizationId,
      eventType: envelope.jobType,
      queueName: approvalQueueName,
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      sourceSystem: envelope.sourceSystem,
      sourceRecordId: envelope.sourceRecordId,
      payload: envelope,
      metadata: {
        degradedReason: reason,
        ...envelope.metadata,
      },
    }).catch(() => null);

    return {
      queued: true,
      id: backgroundJob.id,
      correlationId: envelope.correlationId,
      idempotencyKey: envelope.idempotencyKey,
      duplicate: false,
      processingMode: 'outbox',
      backgroundJobId: backgroundJob.id,
    };
  }
}

export async function flushPendingOutboxEvents(limit = 25) {
  const queue = getApprovalQueue();
  if (!queue) return { flushed: 0, reason: getRedisConfigurationStatus().message };

  const pending = await prisma.outboxEvent.findMany({
    where: {
      queueName: approvalQueueName,
      status: { in: ['PENDING', 'FAILED'] },
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let flushed = 0;
  for (const event of pending) {
    const envelope = event.payload as unknown as ApprovalEnvelope;
    try {
      await queue.add(envelope.jobType, envelope, {
        jobId: `${approvalQueueName}:${envelope.idempotencyKey}`,
        priority: Math.max(1, 100 - envelope.priority),
      });
      flushed += 1;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 },
          failureReason: null,
        },
      }).catch(() => null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Outbox replay failed';
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 },
          failureReason: reason,
        },
      }).catch(() => null);
    }
  }

  return { flushed, reason: null };
}
