import { Worker } from 'bullmq';
import { createRedisConnection } from '@/services/queue/connection';
import { approvalQueueName, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';

const connection = createRedisConnection('approval-worker');

if (!connection) {
  console.warn(`[queue:${approvalQueueName}] Worker disabled because Redis is not configured.`);
} else {
  const worker = new Worker<IncomingMessageJob>(
    approvalQueueName,
    async (job) => {
      return processIncomingMessage(job.data, { auditAction: 'approval_record.created_from_queue' });
    },
    { connection, concurrency: 10 },
  );

  worker.on('error', (error) => {
    console.error(`[queue:${approvalQueueName}] Worker error: ${error.message}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[queue:${approvalQueueName}] Job ${job?.id ?? 'unknown'} failed: ${error.message}`);
  });
}
