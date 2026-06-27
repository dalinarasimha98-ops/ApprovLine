import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { classifyWithOpenAI } from '@/services/classifier/openai';
import { persistClassificationResult } from '@/services/classifier/persistence';
import type { IncomingMessageJob } from '@/services/queue/approvalQueue';

export async function processIncomingMessage(job: IncomingMessageJob, input?: { auditAction?: string }) {
  const messageSource = await prisma.messageSource.create({
    data: {
      organizationId: job.organizationId,
      integrationId: job.integrationId,
      provider: job.provider,
      externalId: job.externalId,
      channel: job.channel,
      sender: job.sender,
      senderEmail: job.senderEmail,
      rawPayload: job.rawPayload as Prisma.InputJsonValue,
      receivedAt: job.timestamp ? new Date(job.timestamp) : undefined,
    },
  });

  const request = {
    message: job.message,
    source: job.provider,
    channel: job.channel,
    sender: job.sender ?? job.senderEmail,
    sender_email: job.senderEmail,
    timestamp: job.timestamp,
    metadata: job.rawPayload && typeof job.rawPayload === 'object' ? job.rawPayload as Record<string, unknown> : {},
  };
  const result = await classifyWithOpenAI(request);

  return persistClassificationResult({
    organizationId: job.organizationId,
    integrationId: job.integrationId,
    messageSourceId: messageSource.id,
    request,
    result,
    sourceLink: job.sourceLink,
    auditAction: input?.auditAction ?? 'approval_record.created_from_ingestion',
  });
}
