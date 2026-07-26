import type { Prisma, UnifiedEvidenceMemberStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';

const publicEventSelect = {
  id: true,
  providerKey: true,
  providerEventType: true,
  occurredAt: true,
  receivedAt: true,
  actorId: true,
  actorName: true,
  actorEmail: true,
  objectType: true,
  objectId: true,
  threadId: true,
  parentId: true,
  relatedIds: true,
  participants: true,
  attachments: true,
  links: true,
  content: true,
  metadata: true,
  evidenceHash: true,
  correlationId: true,
  correlationKeys: true,
  confidence: true,
  status: true,
  lastProcessedAt: true,
} satisfies Prisma.CanonicalEvidenceEventSelect;

export async function searchUnifiedEvidence(input: {
  organizationId: string;
  query?: string;
  providerKey?: string;
  riskLevel?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const where: Prisma.UnifiedEvidenceRecordWhereInput = {
    organizationId: input.organizationId,
    riskLevel: input.riskLevel || undefined,
    events: input.providerKey ? { some: { providerKey: input.providerKey } } : undefined,
    OR: input.query ? [
      { subject: { contains: input.query, mode: 'insensitive' } },
      { approverName: { contains: input.query, mode: 'insensitive' } },
      { approverEmail: { contains: input.query, mode: 'insensitive' } },
      { department: { contains: input.query, mode: 'insensitive' } },
      { category: { contains: input.query, mode: 'insensitive' } },
    ] : undefined,
  };
  const [records, total] = await prisma.$transaction([
    prisma.unifiedEvidenceRecord.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        events: {
          select: { providerKey: true },
          distinct: ['providerKey'],
        },
        _count: { select: { events: true, members: true } },
      },
    }),
    prisma.unifiedEvidenceRecord.count({ where }),
  ]);
  return {
    records: records.map((record) => ({
      ...record,
      providers: record.events.map((event) => event.providerKey),
      events: undefined,
    })),
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
  };
}

export async function getLatestUnifiedEvidenceRecordId(organizationId: string) {
  const record = await prisma.unifiedEvidenceRecord.findFirst({
    where: { organizationId },
    orderBy: [{ lastSeenAt: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    select: { id: true },
  });

  return record?.id ?? null;
}

export async function getUnifiedEvidenceDetail(organizationId: string, id: string) {
  return prisma.unifiedEvidenceRecord.findFirst({
    where: { id, organizationId },
    include: {
      primaryApproval: true,
      events: {
        select: publicEventSelect,
        orderBy: { occurredAt: 'asc' },
      },
      members: {
        include: {
          event: { select: publicEventSelect },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

export async function getUnifiedEvidenceExperience(
  organizationId: string,
  id: string,
  eventLimit = 40,
) {
  const take = Math.min(100, Math.max(1, eventLimit));
  const record = await prisma.unifiedEvidenceRecord.findFirst({
    where: { id, organizationId },
    include: {
      primaryApproval: true,
      events: {
        select: publicEventSelect,
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: take + 1,
      },
      members: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!record) return null;

  const hasMoreEvents = record.events.length > take;
  const events = record.events.slice(0, take);
  const eventIds = new Set(events.map((event) => event.id));
  const [providerCounts, connections, latestEvent] = await Promise.all([
    prisma.canonicalEvidenceEvent.groupBy({
      by: ['providerKey'],
      where: { organizationId, unifiedRecordId: id },
      _count: { _all: true },
      _max: { occurredAt: true },
    }),
    prisma.evidenceProviderConnection.findMany({
      where: { organizationId },
      select: {
        providerKey: true,
        displayName: true,
        status: true,
        lastSyncAt: true,
        health: {
          select: {
            status: true,
            latencyMs: true,
            syncStatus: true,
            lastEventAt: true,
            lastSuccessfulSyncAt: true,
            consecutiveFailures: true,
            lastErrorCode: true,
            lastErrorMessage: true,
            checkedAt: true,
          },
        },
      },
    }),
    prisma.canonicalEvidenceEvent.findFirst({
      where: { organizationId, unifiedRecordId: id },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    }),
  ]);
  const connectionByProvider = new Map(
    connections.map((connection) => [connection.providerKey, connection]),
  );

  return {
    ...record,
    events,
    members: record.members.filter(
      (member) => eventIds.has(member.eventId) || member.status === 'SUGGESTED',
    ),
    eventPage: {
      hasMore: hasMoreEvents,
      cursor: events.at(-1)?.id ?? null,
      limit: take,
    },
    liveCursor: latestEvent?.id ?? null,
    providers: providerCounts.map((provider) => ({
      providerKey: provider.providerKey,
      eventCount: provider._count._all,
      latestEventAt: provider._max.occurredAt,
      connection: connectionByProvider.get(provider.providerKey) ?? null,
    })),
  };
}

export async function getUnifiedEvidenceEventPage(input: {
  organizationId: string;
  recordId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 40));
  let after:
    | {
        occurredAt: Date;
        id: string;
      }
    | undefined;

  if (input.cursor) {
    const cursorEvent = await prisma.canonicalEvidenceEvent.findFirst({
      where: {
        id: input.cursor,
        organizationId: input.organizationId,
        unifiedRecordId: input.recordId,
      },
      select: { id: true, occurredAt: true },
    });
    if (!cursorEvent) throw new Error('The evidence timeline cursor is no longer valid.');
    after = cursorEvent;
  }

  const events = await prisma.canonicalEvidenceEvent.findMany({
    where: {
      organizationId: input.organizationId,
      unifiedRecordId: input.recordId,
      ...(after
        ? {
            OR: [
              { occurredAt: { gt: after.occurredAt } },
              { occurredAt: after.occurredAt, id: { gt: after.id } },
            ],
          }
        : {}),
    },
    select: {
      ...publicEventSelect,
      memberships: {
        where: { unifiedRecordId: input.recordId },
        select: {
          id: true,
          status: true,
          matchConfidence: true,
          matchingReasons: true,
          reviewedAt: true,
        },
        take: 1,
      },
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });

  const hasMore = events.length > limit;
  const page = events.slice(0, limit).map((event) => ({
    ...event,
    membership: event.memberships[0] ?? null,
    memberships: undefined,
  }));

  return {
    events: page,
    page: {
      hasMore,
      cursor: page.at(-1)?.id ?? input.cursor ?? null,
      limit,
    },
  };
}

export async function reviewEvidenceSuggestion(input: {
  organizationId: string;
  memberId: string;
  reviewerUserId: string;
  decision: 'VERIFY' | 'REJECT';
  reason?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.unifiedEvidenceMember.findFirst({
      where: {
        id: input.memberId,
        unifiedRecord: { organizationId: input.organizationId },
      },
      include: { event: true, unifiedRecord: true },
    });
    if (!member) throw new Error('Evidence suggestion was not found.');
    if (member.status !== 'SUGGESTED') throw new Error('Evidence suggestion has already been reviewed.');
    const status: UnifiedEvidenceMemberStatus =
      input.decision === 'VERIFY' ? 'HUMAN_VERIFIED' : 'REJECTED';

    const reviewed = await tx.unifiedEvidenceMember.update({
      where: { id: member.id },
      data: {
        status,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        matchingReasons: input.reason
          ? [...member.matchingReasons, `reviewer: ${input.reason}`]
          : member.matchingReasons,
      },
    });

    if (status === 'HUMAN_VERIFIED') {
      const previousRecordId = member.event.unifiedRecordId;
      if (previousRecordId && previousRecordId !== member.unifiedRecordId) {
        await tx.unifiedEvidenceMember.deleteMany({
          where: {
            eventId: member.eventId,
            unifiedRecordId: previousRecordId,
            status: 'AUTO_LINKED',
          },
        });
      }
      await tx.canonicalEvidenceEvent.update({
        where: { id: member.eventId },
        data: {
          unifiedRecordId: member.unifiedRecordId,
          status: 'CORRELATED',
          lastProcessedAt: new Date(),
        },
      });
      const [eventCount, providerRows] = await Promise.all([
        tx.canonicalEvidenceEvent.count({
          where: { organizationId: input.organizationId, unifiedRecordId: member.unifiedRecordId },
        }),
        tx.canonicalEvidenceEvent.findMany({
          where: { organizationId: input.organizationId, unifiedRecordId: member.unifiedRecordId },
          select: { providerKey: true },
          distinct: ['providerKey'],
        }),
      ]);
      await tx.unifiedEvidenceRecord.update({
        where: { id: member.unifiedRecordId },
        data: {
          evidenceCount: eventCount,
          sourceCount: providerRows.length,
          verificationStatus: 'HUMAN_VERIFIED',
          lastSeenAt: member.event.occurredAt > member.unifiedRecord.lastSeenAt
            ? member.event.occurredAt
            : member.unifiedRecord.lastSeenAt,
        },
      });
      if (previousRecordId && previousRecordId !== member.unifiedRecordId) {
        const previousRecord = await tx.unifiedEvidenceRecord.findFirst({
          where: { id: previousRecordId, organizationId: input.organizationId },
          select: { id: true, _count: { select: { events: true, members: true } } },
        });
        if (previousRecord && previousRecord._count.events === 0 && previousRecord._count.members === 0) {
          await tx.unifiedEvidenceRecord.delete({ where: { id: previousRecord.id } });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.reviewerUserId,
        action: 'EVIDENCE_CORRELATION_REVIEWED',
        metadata: {
          memberId: member.id,
          eventId: member.eventId,
          unifiedRecordId: member.unifiedRecordId,
          decision: input.decision,
          reason: input.reason,
        },
      },
    });
    return reviewed;
  });
}

function eventQueueProvider(providerKey: string): IncomingMessageJob['provider'] {
  const known: Record<string, IncomingMessageJob['provider']> = {
    slack: 'SLACK',
    gmail: 'GMAIL',
    outlook: 'OUTLOOK',
    microsoft_teams: 'MICROSOFT_TEAMS',
    jira: 'JIRA',
    servicenow: 'SERVICENOW',
    zoom: 'ZOOM',
  };
  return known[providerKey] ?? 'CUSTOM';
}

export async function retryEvidenceFailure(input: {
  organizationId: string;
  failureId: string;
  actorUserId: string;
}) {
  const failure = await prisma.evidenceProcessingFailure.findFirst({
    where: {
      id: input.failureId,
      organizationId: input.organizationId,
      resolvedAt: null,
      retryable: true,
    },
    include: { event: { select: publicEventSelect } },
  });
  if (!failure?.event) throw new Error('Retryable evidence failure was not found.');
  const event = failure.event;
  const result = await enqueueIncomingMessage({
    organizationId: input.organizationId,
    provider: eventQueueProvider(event.providerKey),
    providerKey: event.providerKey,
    providerEventType: event.providerEventType,
    externalId: event.objectId ?? event.id,
    objectType: event.objectType,
    objectId: event.objectId ?? undefined,
    threadId: event.threadId ?? undefined,
    parentId: event.parentId ?? undefined,
    relatedIds: event.relatedIds,
    sender: event.actorName ?? undefined,
    senderEmail: event.actorEmail ?? undefined,
    timestamp: event.occurredAt.toISOString(),
    message: event.content ?? '',
    participants: (event.participants as IncomingMessageJob['participants']) ?? [],
    attachments: (event.attachments as IncomingMessageJob['attachments']) ?? [],
    links: (event.links as IncomingMessageJob['links']) ?? [],
    metadata: (event.metadata as Record<string, unknown> | null) ?? {},
  }, {
    sourceSystem: event.providerKey,
    sourceRecordId: event.objectId ?? event.id,
    correlationId: event.correlationId,
    idempotencyKey: `evidence-retry:${failure.id}:${failure.attemptNumber + 1}`,
  });
  if (!result.queued) throw new Error(result.reason);

  await prisma.$transaction([
    prisma.canonicalEvidenceEvent.update({
      where: { id: event.id },
      data: { status: 'RETRY_PENDING', processingAttempts: { increment: 1 }, lastError: null },
    }),
    prisma.evidenceProcessingFailure.update({
      where: { id: failure.id },
      data: { attemptNumber: { increment: 1 }, nextRetryAt: new Date(Date.now() + 60_000) },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'EVIDENCE_FAILURE_RETRIED',
        metadata: { failureId: failure.id, eventId: event.id, correlationId: event.correlationId },
      },
    }),
  ]);
  return result;
}
