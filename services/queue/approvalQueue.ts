import { Queue } from 'bullmq';
import { createRedisConnection } from '@/services/queue/connection';

export interface IncomingMessageJob {
  organizationId: string;
  integrationId?: string;
  provider: 'SLACK' | 'GMAIL' | 'MICROSOFT_TEAMS' | 'ZOOM';
  externalId?: string;
  channel?: string;
  sender?: string;
  senderEmail?: string;
  message: string;
  sourceLink?: string;
  rawPayload?: unknown;
}

let approvalQueue: Queue<IncomingMessageJob, unknown, string> | null = null;

export function getApprovalQueue() {
  approvalQueue ??= new Queue<IncomingMessageJob, unknown, string>('approval-classification', {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  return approvalQueue;
}

export async function enqueueIncomingMessage(job: IncomingMessageJob) {
  return getApprovalQueue().add('classify-message', job, {
    jobId: job.externalId ? `${job.organizationId}:${job.provider}:${job.externalId}` : undefined,
  });
}
