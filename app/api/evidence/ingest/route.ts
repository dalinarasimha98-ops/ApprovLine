import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import {
  captureCanonicalEvidence,
  failCanonicalEvidence,
  isEvidenceStorageUnavailable,
} from '@/services/evidence/pipeline';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { canonicalEvidenceInputSchema } from '@/types/evidence';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function queueProvider(providerKey: string): IncomingMessageJob['provider'] {
  const providers: Record<string, IncomingMessageJob['provider']> = {
    slack: 'SLACK',
    gmail: 'GMAIL',
    outlook: 'OUTLOOK',
    microsoft_teams: 'MICROSOFT_TEAMS',
    jira: 'JIRA',
    servicenow: 'SERVICENOW',
    zoom: 'ZOOM',
  };
  return providers[providerKey] ?? 'CUSTOM';
}

export async function POST(request: Request) {
  const access = await requireEvidenceAccess('write');
  if (!access.ok) return access.response;

  const parsed = canonicalEvidenceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid canonical evidence event.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let eventId: string | undefined;
  try {
    const captured = await captureCanonicalEvidence(access.organization.id, parsed.data);
    eventId = captured.eventId;
    if (captured.duplicate) {
      return NextResponse.json({
        accepted: true,
        duplicate: true,
        eventId: captured.eventId,
        correlationId: captured.correlationId,
        processingMode: 'existing',
      });
    }

    const sourceLink = parsed.data.links.find((link) => link.url)?.url;
    const occurredAt = parsed.data.eventTimestamp instanceof Date
      ? parsed.data.eventTimestamp
      : new Date(parsed.data.eventTimestamp);
    const queued = await enqueueIncomingMessage(
      {
        organizationId: access.organization.id,
        provider: queueProvider(parsed.data.providerKey),
        providerKey: parsed.data.providerKey,
        providerEventType: parsed.data.providerEventType,
        externalId: parsed.data.externalEventId ?? parsed.data.object.id,
        sender: parsed.data.actor?.name,
        senderEmail: parsed.data.actor?.email,
        timestamp: occurredAt.toISOString(),
        message: parsed.data.content ?? `${parsed.data.providerEventType}: ${parsed.data.object.name ?? parsed.data.object.id ?? parsed.data.object.type}`,
        sourceLink,
        objectType: parsed.data.object.type,
        objectId: parsed.data.object.id,
        threadId: parsed.data.threadId,
        parentId: parsed.data.parentId,
        relatedIds: parsed.data.relatedIds,
        participants: parsed.data.participants,
        attachments: parsed.data.attachments,
        links: parsed.data.links,
        metadata: {
          ...parsed.data.metadata,
          canonicalEvidenceEventId: captured.eventId,
          evidenceCorrelationId: captured.correlationId,
        },
      },
      {
        correlationId: captured.correlationId,
        sourceSystem: parsed.data.providerKey,
        sourceRecordId: parsed.data.externalEventId ?? parsed.data.object.id ?? captured.eventId,
        idempotencyKey: `evidence:${access.organization.id}:${captured.eventId}`,
        metadata: { canonicalEvidenceEventId: captured.eventId },
      },
    );

    await prisma.canonicalEvidenceEvent.update({
      where: { id: captured.eventId },
      data: {
        status: queued.queued ? 'QUEUED' : 'RETRY_PENDING',
        lastError: queued.queued ? null : queued.reason,
      },
    });

    if (!queued.queued) {
      await failCanonicalEvidence({
        organizationId: access.organization.id,
        eventId: captured.eventId,
        providerKey: parsed.data.providerKey,
        stage: 'QUEUE',
        correlationId: captured.correlationId,
        error: queued.reason,
      });
    }

    return NextResponse.json(
      {
        accepted: queued.queued,
        duplicate: false,
        eventId: captured.eventId,
        correlationId: captured.correlationId,
        processingMode: queued.queued ? queued.processingMode : 'retry',
      },
      { status: queued.queued ? 202 : 503 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evidence ingestion failed.';
    if (eventId) {
      await prisma.canonicalEvidenceEvent.update({
        where: { id: eventId },
        data: { status: 'RETRY_PENDING', lastError: message.slice(0, 1_500) },
      }).catch(() => null);
    }
    return NextResponse.json(
      {
        error: isEvidenceStorageUnavailable(error)
          ? 'Evidence storage is not ready. Apply the universal evidence platform migration.'
          : 'Evidence ingestion could not complete.',
      },
      { status: isEvidenceStorageUnavailable(error) ? 503 : 500 },
    );
  }
}
