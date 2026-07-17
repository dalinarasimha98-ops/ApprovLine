import { Worker } from 'bullmq';
import { createRedisConnection } from '@/services/queue/connection';
import { approvalQueueName, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';
import type { StandardJobEnvelope } from '@/services/queue/jobRegistry';
import {
  heartbeatBackgroundJob,
  markBackgroundJobCompleted,
  markBackgroundJobFailed,
  markBackgroundJobProcessing,
  moveToDeadLetter,
} from '@/services/queue/reliability';

const connection = createRedisConnection('approval-worker');

function classifyFailure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown queue failure';
  const normalized = message.toLowerCase();
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return { category: 'RATE_LIMIT' as const, retryDelayMs: 30_000 };
  }
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return { category: 'TIMEOUT' as const, retryDelayMs: 20_000 };
  }
  if (normalized.includes('tempor') || normalized.includes('provider') || normalized.includes('network')) {
    return { category: 'TRANSIENT' as const, retryDelayMs: 15_000 };
  }
  if (normalized.includes('credential') || normalized.includes('oauth') || normalized.includes('reauth') || normalized.includes('unauthor')) {
    return { category: 'AUTHENTICATION' as const, retryDelayMs: undefined };
  }
  if (normalized.includes('validation') || normalized.includes('invalid') || normalized.includes('missing')) {
    return { category: 'VALIDATION' as const, retryDelayMs: undefined };
  }
  return { category: 'UNKNOWN' as const, retryDelayMs: 20_000 };
}

if (!connection) {
  console.warn(`[queue:${approvalQueueName}] Worker disabled because Redis is not configured.`);
} else {
  const worker = new Worker<StandardJobEnvelope<IncomingMessageJob>>(
    approvalQueueName,
    async (job) => {
      const envelope = job.data;
      const registryMaxAttempts = job.opts.attempts ?? 5;
      await markBackgroundJobProcessing({
        queueName: approvalQueueName,
        idempotencyKey: envelope.idempotencyKey,
        attemptNumber: job.attemptsMade + 1,
        currentJobId: typeof job.id === 'string' ? job.id : undefined,
        currentJobType: envelope.jobType,
        organizationId: envelope.organizationId,
      });

      const heartbeatTimer = setInterval(() => {
        void heartbeatBackgroundJob({
          queueName: approvalQueueName,
          idempotencyKey: envelope.idempotencyKey,
          organizationId: envelope.organizationId,
          currentJobId: typeof job.id === 'string' ? job.id : undefined,
          currentJobType: envelope.jobType,
        });
      }, 5_000);

      try {
        const result = await processIncomingMessage(envelope.payload, {
          auditAction: 'approval_record.created_from_queue',
          envelope,
        });
        await markBackgroundJobCompleted({
          queueName: approvalQueueName,
          idempotencyKey: envelope.idempotencyKey,
        });
        return result;
      } catch (error) {
        const failure = classifyFailure(error);
        await markBackgroundJobFailed({
          queueName: approvalQueueName,
          idempotencyKey: envelope.idempotencyKey,
          attemptNumber: job.attemptsMade + 1,
          maxAttempts: registryMaxAttempts,
          failureCategory: failure.category,
          failureReason: error instanceof Error ? error.message : 'Unknown worker failure',
          retryDelayMs: failure.retryDelayMs,
        });

        const exhausted =
          job.attemptsMade + 1 >= registryMaxAttempts ||
          ['AUTHENTICATION', 'VALIDATION', 'PERMANENT'].includes(failure.category);

        if (exhausted) {
          await moveToDeadLetter({
            envelope,
            queueName: approvalQueueName,
            attemptCount: job.attemptsMade + 1,
            failureCategory: failure.category,
            failureReason: error instanceof Error ? error.message : 'Unknown worker failure',
            retryEligible: ['TRANSIENT', 'RATE_LIMIT', 'TIMEOUT'].includes(failure.category),
          });
        }

        throw error;
      } finally {
        clearInterval(heartbeatTimer);
      }
    },
    { connection, concurrency: 10, lockDuration: 30_000 },
  );

  worker.on('error', (error) => {
    console.error(`[queue:${approvalQueueName}] Worker error: ${error.message}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[queue:${approvalQueueName}] Job ${job?.id ?? 'unknown'} failed: ${error.message}`);
  });
}
