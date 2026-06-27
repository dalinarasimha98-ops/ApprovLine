import { Worker } from 'bullmq';
import { createRedisConnection } from '@/services/queue/connection';
import { approvalQueueName, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';

new Worker<IncomingMessageJob>(
  approvalQueueName,
  async (job) => {
    return processIncomingMessage(job.data, { auditAction: 'approval_record.created_from_queue' });
  },
  { connection: createRedisConnection(), concurrency: 10 },
);
