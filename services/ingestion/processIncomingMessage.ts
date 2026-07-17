import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { classifyWithOpenAI } from '@/services/classifier/openai';
import { persistClassificationResult } from '@/services/classifier/persistence';
import type { IncomingMessageJob } from '@/services/queue/approvalQueue';
import type { StandardJobEnvelope } from '@/services/queue/jobRegistry';
import { hashPayload } from '@/services/queue/reliability';
import type { ClassifyResponse } from '@/types/classifier';

export async function processIncomingMessage(
  job: IncomingMessageJob,
  input?: { auditAction?: string; envelope?: StandardJobEnvelope<IncomingMessageJob> },
) {
  const correlationId = input?.envelope?.correlationId;
  const idempotencyKey = input?.envelope?.idempotencyKey;
  const sourceSystem = input?.envelope?.sourceSystem ?? job.provider.toLowerCase();
  const sourceRecordId = input?.envelope?.sourceRecordId ?? job.externalId;
  const contentHash = hashPayload({
    message: job.message,
    provider: job.provider,
    externalId: job.externalId,
    senderEmail: job.senderEmail,
    timestamp: job.timestamp,
  });

  const messageSourcePayload = {
    organizationId: job.organizationId,
    integrationId: job.integrationId,
    provider: job.provider,
    externalId: job.externalId,
    threadId: job.channel,
    eventId: job.externalId,
    channel: job.channel,
    sender: job.sender,
    senderEmail: job.senderEmail,
    contentHash,
    correlationId,
    idempotencyKey,
    rawPayload: {
      payload: job.rawPayload ?? {},
      queue: input?.envelope
        ? {
            jobType: input.envelope.jobType,
            traceId: input.envelope.traceId,
            metadata: input.envelope.metadata ?? {},
          }
        : undefined,
    } as Prisma.InputJsonValue,
    receivedAt: job.timestamp ? new Date(job.timestamp) : undefined,
  } satisfies Prisma.MessageSourceUncheckedCreateInput;

  const messageSource =
    job.externalId
      ? await prisma.messageSource.upsert({
          where: {
            organizationId_provider_externalId: {
              organizationId: job.organizationId,
              provider: job.provider,
              externalId: job.externalId,
            },
          },
          update: messageSourcePayload,
          create: messageSourcePayload,
        })
      : await prisma.messageSource.create({ data: messageSourcePayload });

  const request = {
    message: job.message,
    source: job.provider,
    channel: job.channel,
    sender: job.sender ?? job.senderEmail,
    sender_email: job.senderEmail,
    timestamp: job.timestamp,
    metadata: job.rawPayload && typeof job.rawPayload === 'object' ? job.rawPayload as Record<string, unknown> : {},
  };
  let result: ClassifyResponse;
  try {
    result = await classifyWithOpenAI(request);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Classifier failed';
    if (job.integrationId) {
      const integration = await prisma.integration.findUnique({
        where: { id: job.integrationId },
        select: { metadata: true },
      });
      await prisma.integration.update({
        where: { id: job.integrationId },
        data: {
          status: 'ERROR',
          metadata: {
            ...(integration?.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
            lastError: reason,
            lastErrorAt: new Date().toISOString(),
          },
        },
      }).catch(() => null);
      await prisma.event.create({
        data: {
          organizationId: job.organizationId,
          integrationId: job.integrationId,
          type: `${job.provider.toLowerCase()}.event.classifier_error`,
          sourceSystem,
          sourceRecordId,
          correlationId,
          idempotencyKey,
          payload: {
            provider: job.provider,
            externalId: job.externalId,
            channel: job.channel,
            sender: job.sender,
          } as Prisma.InputJsonValue,
          failedAt: new Date(),
          failureReason: reason,
        },
      }).catch(() => null);
    }
    throw error;
  }
  if (job.integrationId) {
    const integration = await prisma.integration.findUnique({
      where: { id: job.integrationId },
      select: { metadata: true },
    });
    await prisma.integration.update({
      where: { id: job.integrationId },
      data: {
        status: 'CONNECTED',
        metadata: {
          ...(integration?.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
          lastSyncAt: new Date().toISOString(),
          lastMessageAt: job.timestamp ?? new Date().toISOString(),
        },
      },
    }).catch(() => null);
  }

  return persistClassificationResult({
    organizationId: job.organizationId,
    integrationId: job.integrationId,
    messageSourceId: messageSource.id,
    request,
    result,
    sourceLink: job.sourceLink,
    auditAction: input?.auditAction ?? 'approval_record.created_from_ingestion',
    sourceSystem,
    sourceRecordId,
    correlationId,
    idempotencyKey,
    contentHash,
  });
}
