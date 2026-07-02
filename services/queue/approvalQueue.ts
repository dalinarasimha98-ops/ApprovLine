import { Queue } from 'bullmq';
import { createRedisConnection, getRedisConfigurationStatus } from '@/services/queue/connection';

export interface IncomingMessageJob {
  organizationId: string;
  integrationId?: string;
  provider: 'SLACK' | 'GMAIL' | 'OUTLOOK' | 'MICROSOFT_TEAMS' | 'JIRA' | 'ZOOM';
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

let approvalQueue: Queue<IncomingMessageJob, unknown, string> | null = null;

export function getApprovalQueue() {
  if (approvalQueue) return approvalQueue;

  const connection = createRedisConnection('approval-queue');
  if (!connection) return null;

  approvalQueue = new Queue<IncomingMessageJob, unknown, string>(approvalQueueName, {
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

export type EnqueueIncomingMessageResult =
  | { queued: true; id?: string }
  | { queued: false; reason: string };

export async function enqueueIncomingMessage(job: IncomingMessageJob): Promise<EnqueueIncomingMessageResult> {
  const queue = getApprovalQueue();
  if (!queue) {
    const status = getRedisConfigurationStatus();
    return { queued: false, reason: status.message };
  }

  try {
    const queued = await queue.add('classify-message', job, {
      jobId: job.externalId ? `${job.organizationId}:${job.provider}:${job.externalId}` : undefined,
    });
    return { queued: true, id: queued.id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Approval queue is unavailable.';
    console.error(`[queue:${approvalQueueName}] Unable to enqueue ${job.provider} message: ${reason}`);
    return { queued: false, reason };
  }
}
