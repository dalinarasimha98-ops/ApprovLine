import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { classifyWithOpenAI } from '@/services/classifier/openai';
import { createRedisConnection } from '@/services/queue/connection';
import type { IncomingMessageJob } from '@/services/queue/approvalQueue';
import { persistClassificationResult } from '@/services/classifier/persistence';

new Worker<IncomingMessageJob>(
  'approval-classification',
  async (job) => {
    const payload = job.data;
    const messageSource = await prisma.messageSource.create({
      data: {
        organizationId: payload.organizationId,
        integrationId: payload.integrationId,
        provider: payload.provider,
        externalId: payload.externalId,
        channel: payload.channel,
        sender: payload.sender,
        senderEmail: payload.senderEmail,
        rawPayload: payload.rawPayload as Prisma.InputJsonValue,
      },
    });

    const input = {
      message: payload.message,
      source: payload.provider,
      channel: payload.channel,
      sender: payload.sender ?? payload.senderEmail,
      sender_email: payload.senderEmail,
      timestamp: payload.timestamp,
      metadata: payload.rawPayload && typeof payload.rawPayload === 'object' ? payload.rawPayload as Record<string, unknown> : {},
    };
    const result = await classifyWithOpenAI(input);
    return persistClassificationResult({
      organizationId: payload.organizationId,
      integrationId: payload.integrationId,
      messageSourceId: messageSource.id,
      request: input,
      result,
      sourceLink: payload.sourceLink,
      auditAction: 'approval_record.created_from_queue',
    });
  },
  { connection: createRedisConnection(), concurrency: 10 },
);
