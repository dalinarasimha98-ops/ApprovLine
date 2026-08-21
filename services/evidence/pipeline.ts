import type {
  ApprovalRecord,
  ClassifierResult,
  Prisma,
  UnifiedEvidenceMemberStatus,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addMemoryTimelineEvent, invalidateMemoryCache, linkMemoryEntities, upsertMemoryEntity } from '@/services/memory';
import { invalidateUnifiedEvidenceCache } from '@/services/evidence/records';
import { normalizeEvidenceEvent } from '@/services/evidence/normalizer';
import { getEvidenceProviderManifest } from '@/services/evidence/provider-catalog';
import { normalizeProviderKey } from '@/services/evidence/provider-sdk';
import type { CanonicalEvidenceInput, NormalizedEvidenceEvent } from '@/types/evidence';
import { createHash } from 'node:crypto';

const AUTO_LINK_THRESHOLD = 80;
const SUGGESTION_THRESHOLD = 55;

type ClassificationPersistence = {
  approval: ApprovalRecord | null;
  classifier: ClassifierResult;
} | null;

type CaptureResult = {
  eventId: string;
  duplicate: boolean;
  correlationId: string;
};

function json(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : value as Prisma.InputJsonValue;
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1_500) : 'Unknown evidence processing error';
}

export function isEvidenceStorageUnavailable(error: unknown) {
  const message = safeMessage(error).toLowerCase();
  return message.includes('does not exist') ||
    message.includes('unknown argument') ||
    message.includes('canonicalevidenceevent') ||
    message.includes('evidenceproviderconnection');
}

function tokenize(value?: string | null) {
  return new Set(
    (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9$.-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .slice(0, 80),
  );
}

function overlapScore(left?: string | null, right?: string | null) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let matches = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) matches += 1;
  return Math.round((matches / Math.max(leftTokens.size, rightTokens.size)) * 30);
}

export function scoreEvidenceCandidate(
  event: NormalizedEvidenceEvent,
  candidate: {
    subject: string;
    approverEmail: string | null;
    approverName: string | null;
    events: Array<{
      providerKey: string;
      objectId: string | null;
      threadId: string | null;
      relatedIds: string[];
      correlationKeys: string[];
    }>;
  },
) {
  let score = overlapScore(event.content, candidate.subject);
  const reasons: string[] = [];
  const eventKeys = new Set(event.correlationKeys);

  if (event.actor?.email && candidate.approverEmail?.toLowerCase() === event.actor.email.toLowerCase()) {
    score += 20;
    reasons.push('same approver email');
  } else if (event.actor?.name && candidate.approverName?.toLowerCase() === event.actor.name.toLowerCase()) {
    score += 12;
    reasons.push('same approver name');
  }

  for (const related of candidate.events) {
    if (event.threadId && related.threadId === event.threadId) {
      score += 35;
      reasons.push('same conversation thread');
    }
    if (event.object.id && related.objectId === event.object.id) {
      score += 25;
      reasons.push('same source object');
    }
    const relatedKeys = new Set([...related.relatedIds, ...related.correlationKeys]);
    if ([...eventKeys].some((key) => relatedKeys.has(key))) {
      score += 25;
      reasons.push('shared business reference');
    }
  }

  const contentOverlap = overlapScore(event.content, candidate.subject);
  if (contentOverlap >= 10) reasons.push('matching decision subject');
  return { score: Math.min(100, score), reasons: [...new Set(reasons)] };
}

async function upsertConnection(organizationId: string, normalized: NormalizedEvidenceEvent) {
  const manifest = getEvidenceProviderManifest(normalized.providerKey);
  return prisma.evidenceProviderConnection.upsert({
    where: {
      organizationId_providerKey: {
        organizationId,
        providerKey: normalized.providerKey,
      },
    },
    create: {
      organizationId,
      providerKey: normalized.providerKey,
      displayName: manifest.displayName,
      category: manifest.category,
      status: 'CONNECTED',
      authenticationType: manifest.authenticationType,
      scopes: [],
      connectedAt: new Date(),
    },
    update: {
      displayName: manifest.displayName,
      category: manifest.category,
      status: 'CONNECTED',
      disconnectedAt: null,
    },
    select: { id: true },
  });
}

export async function recordProviderHealth(input: {
  organizationId: string;
  connectionId?: string;
  providerKey: string;
  status: 'CONNECTED' | 'SYNCING' | 'DEGRADED' | 'ERROR' | 'REAUTH_REQUIRED' | 'DISCONNECTED';
  eventAt?: Date;
  latencyMs?: number;
  error?: string;
  authenticationStatus?: string;
  credentialExpiresAt?: Date;
  rateLimitRemaining?: number;
  webhookStatus?: string;
  syncStatus?: string;
  lastSuccessfulSyncAt?: Date;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.evidenceProviderHealth.upsert({
    where: {
      organizationId_providerKey: {
        organizationId: input.organizationId,
        providerKey: input.providerKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      providerKey: input.providerKey,
      status: input.status,
      authenticationStatus: input.authenticationStatus,
      credentialExpiresAt: input.credentialExpiresAt,
      rateLimitRemaining: input.rateLimitRemaining,
      latencyMs: input.latencyMs,
      webhookStatus: input.webhookStatus,
      syncStatus: input.syncStatus,
      lastEventAt: input.eventAt,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? (input.status === 'CONNECTED' ? new Date() : undefined),
      consecutiveFailures: input.error ? 1 : 0,
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.error,
      metadata: json(input.metadata),
      checkedAt: new Date(),
    },
    update: {
      connectionId: input.connectionId,
      status: input.status,
      authenticationStatus: input.authenticationStatus,
      credentialExpiresAt: input.credentialExpiresAt,
      rateLimitRemaining: input.rateLimitRemaining,
      latencyMs: input.latencyMs,
      webhookStatus: input.webhookStatus,
      syncStatus: input.syncStatus,
      lastEventAt: input.eventAt,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? (input.status === 'CONNECTED' ? new Date() : undefined),
      consecutiveFailures: input.error ? { increment: 1 } : 0,
      lastErrorCode: input.errorCode ?? null,
      lastErrorMessage: input.error ?? null,
      metadata: json(input.metadata),
      nextRetryAt: input.error ? new Date(Date.now() + 60_000) : null,
      checkedAt: new Date(),
    },
  });
}

export async function captureCanonicalEvidence(
  organizationId: string,
  input: CanonicalEvidenceInput,
): Promise<CaptureResult> {
  const startedAt = Date.now();
  const normalized = normalizeEvidenceEvent(input);
  const connection = await upsertConnection(organizationId, normalized);
  const existing = await prisma.canonicalEvidenceEvent.findUnique({
    where: {
      organizationId_providerKey_evidenceHash: {
        organizationId,
        providerKey: normalized.providerKey,
        evidenceHash: normalized.evidenceHash,
      },
    },
    select: { id: true, correlationId: true },
  });

  if (existing) {
    await recordProviderHealth({
      organizationId,
      connectionId: connection.id,
      providerKey: normalized.providerKey,
      status: 'CONNECTED',
      eventAt: normalized.eventTimestamp,
      latencyMs: Date.now() - startedAt,
    }).catch(() => null);
    return { eventId: existing.id, duplicate: true, correlationId: existing.correlationId };
  }

  const event = await prisma.canonicalEvidenceEvent.create({
    data: {
      organizationId,
      connectionId: connection.id,
      providerKey: normalized.providerKey,
      providerEventType: normalized.providerEventType,
      occurredAt: normalized.eventTimestamp,
      actorId: normalized.actor?.id,
      actorName: normalized.actor?.name,
      actorEmail: normalized.actor?.email,
      tenantExternalId: normalized.tenantExternalId,
      objectType: normalized.object.type,
      objectId: normalized.object.id ?? normalized.externalEventId,
      threadId: normalized.threadId,
      parentId: normalized.parentId,
      relatedIds: normalized.relatedIds,
      participants: json(normalized.participants),
      attachments: json(normalized.attachments),
      links: json(normalized.links),
      content: normalized.content,
      metadata: json(normalized.metadata),
      encryptedRawPayload: normalized.encryptedRawPayload,
      evidenceHash: normalized.evidenceHash,
      correlationId: normalized.correlationId,
      correlationKeys: normalized.correlationKeys,
      confidence: normalized.confidence,
      status: 'RECEIVED',
    },
    select: { id: true, correlationId: true },
  });

  await recordProviderHealth({
    organizationId,
    connectionId: connection.id,
    providerKey: normalized.providerKey,
    status: 'CONNECTED',
    eventAt: normalized.eventTimestamp,
    latencyMs: Date.now() - startedAt,
  }).catch(() => null);

  return { eventId: event.id, duplicate: false, correlationId: event.correlationId };
}

async function correlateEvent(
  organizationId: string,
  eventId: string,
  approval: ApprovalRecord | null,
) {
  const event = await prisma.canonicalEvidenceEvent.findFirst({
    where: { id: eventId, organizationId },
  });
  if (!event) throw new Error('Canonical evidence event was not found in this organization.');

  const normalized = {
    providerKey: event.providerKey,
    providerEventType: event.providerEventType,
    eventTimestamp: event.occurredAt,
    actor: event.actorId || event.actorName || event.actorEmail
      ? { id: event.actorId ?? undefined, name: event.actorName ?? undefined, email: event.actorEmail ?? undefined }
      : undefined,
    object: { type: event.objectType, id: event.objectId ?? undefined },
    threadId: event.threadId ?? undefined,
    parentId: event.parentId ?? undefined,
    relatedIds: event.relatedIds,
    participants: [],
    attachments: [],
    links: [],
    content: event.content ?? undefined,
    metadata: {},
    confidence: event.confidence,
    evidenceHash: event.evidenceHash,
    correlationId: event.correlationId,
    correlationKeys: event.correlationKeys,
  } satisfies NormalizedEvidenceEvent;

  const candidates = await prisma.unifiedEvidenceRecord.findMany({
    where: {
      organizationId,
      lastSeenAt: { gte: new Date(event.occurredAt.getTime() - 30 * 24 * 60 * 60 * 1_000) },
    },
    include: {
      events: {
        select: {
          providerKey: true,
          objectId: true,
          threadId: true,
          relatedIds: true,
          correlationKeys: true,
        },
        take: 20,
      },
    },
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
  });

  const ranked = candidates
    .map((candidate) => ({ candidate, ...scoreEvidenceCandidate(normalized, candidate) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const subject = approval?.subject || event.content?.slice(0, 180) || `${event.providerKey} evidence`;

  if (best && best.score >= SUGGESTION_THRESHOLD) {
    const status: UnifiedEvidenceMemberStatus =
      best.score >= AUTO_LINK_THRESHOLD ? 'AUTO_LINKED' : 'SUGGESTED';
    await prisma.unifiedEvidenceMember.upsert({
      where: { unifiedRecordId_eventId: { unifiedRecordId: best.candidate.id, eventId } },
      create: {
        unifiedRecordId: best.candidate.id,
        eventId,
        status,
        matchConfidence: best.score,
        matchingReasons: best.reasons,
      },
      update: {
        status,
        matchConfidence: best.score,
        matchingReasons: best.reasons,
      },
    });

    if (status === 'AUTO_LINKED') {
      const sourceCount = new Set([
        ...best.candidate.events.map((candidateEvent) => candidateEvent.providerKey),
        event.providerKey,
      ]).size;
      await prisma.$transaction([
        prisma.canonicalEvidenceEvent.update({
          where: { id: eventId },
          data: {
            unifiedRecordId: best.candidate.id,
            approvalRecordId: approval?.id,
            status: 'CORRELATED',
            lastProcessedAt: new Date(),
          },
        }),
        prisma.unifiedEvidenceRecord.update({
          where: { id: best.candidate.id },
          data: {
            primaryApprovalId: best.candidate.primaryApprovalId ?? approval?.id,
            subject: approval?.subject ?? best.candidate.subject,
            decision: approval?.approvalType ?? best.candidate.decision,
            outcome: approval?.status ?? best.candidate.outcome,
            category: approval?.category ?? best.candidate.category,
            department: approval?.department ?? best.candidate.department,
            approverName: approval?.approverName ?? best.candidate.approverName,
            approverEmail: approval?.approverEmail ?? best.candidate.approverEmail,
            riskLevel: approval?.riskLevel ?? best.candidate.riskLevel,
            confidence: Math.max(best.candidate.confidence, best.score),
            evidenceCount: { increment: 1 },
            sourceCount: Math.max(best.candidate.sourceCount, sourceCount),
            firstSeenAt: event.occurredAt < best.candidate.firstSeenAt ? event.occurredAt : best.candidate.firstSeenAt,
            lastSeenAt: event.occurredAt > best.candidate.lastSeenAt ? event.occurredAt : best.candidate.lastSeenAt,
          },
        }),
      ]);
      invalidateUnifiedEvidenceCache(organizationId);
      return best.candidate.id;
    }
  }

  const record = await prisma.unifiedEvidenceRecord.create({
    data: {
      organizationId,
      primaryApprovalId: approval?.id,
      subject,
      decision: approval?.approvalType,
      outcome: approval?.status,
      category: approval?.category,
      department: approval?.department,
      approverName: approval?.approverName ?? event.actorName,
      approverEmail: approval?.approverEmail ?? event.actorEmail,
      riskLevel: approval?.riskLevel,
      confidence: approval?.confidence ?? event.confidence,
      firstSeenAt: event.occurredAt,
      lastSeenAt: event.occurredAt,
      metadata: { correlationId: event.correlationId },
      members: {
        create: {
          eventId,
          status: 'AUTO_LINKED',
          matchConfidence: 100,
          matchingReasons: ['initial evidence for unified record'],
        },
      },
    },
  });
  await prisma.canonicalEvidenceEvent.update({
    where: { id: eventId },
    data: {
      unifiedRecordId: record.id,
      approvalRecordId: approval?.id,
      status: 'CORRELATED',
      lastProcessedAt: new Date(),
    },
  });
  invalidateUnifiedEvidenceCache(organizationId);
  return record.id;
}

async function projectToMemoryGraph(
  organizationId: string,
  eventId: string,
  unifiedRecordId: string,
  approval: ApprovalRecord | null,
) {
  const event = await prisma.canonicalEvidenceEvent.findFirst({
    where: { id: eventId, organizationId },
  });
  if (!event) return;
  const record = await prisma.unifiedEvidenceRecord.findFirst({
    where: { id: unifiedRecordId, organizationId },
  });
  if (!record) return;

  const decision = await upsertMemoryEntity({
    organizationId,
    type: approval ? 'APPROVAL' : 'DECISION',
    title: record.subject,
    subtitle: `${event.providerKey} evidence`,
    summary: event.content,
    externalType: 'unified_evidence_record',
    externalId: `unified-evidence:${record.id}`,
    sourceSystem: event.providerKey,
    riskScore: record.riskLevel?.toLowerCase() === 'high' ? 82 : 20,
    metadata: {
      unifiedEvidenceRecordId: record.id,
      canonicalEvidenceEventId: event.id,
      confidence: record.confidence,
    },
    seenAt: event.occurredAt,
  });
  const source = await upsertMemoryEntity({
    organizationId,
    type: event.providerKey === 'slack'
      ? 'SLACK_MESSAGE'
      : event.providerKey === 'microsoft_teams'
        ? 'TEAMS_MESSAGE'
        : event.providerKey === 'jira'
          ? 'JIRA_TICKET'
          : event.providerKey === 'zoom'
            ? 'ZOOM_DECISION'
            : event.providerKey === 'servicenow'
              ? 'SERVICENOW_RECORD'
              : event.providerKey === 'gmail'
                ? 'EMAIL'
                : event.providerKey === 'outlook'
                  ? 'OUTLOOK_EMAIL'
                  : 'MESSAGE',
    title: `${event.providerKey}: ${record.subject}`,
    summary: event.content,
    externalType: event.objectType,
    externalId: `canonical-event:${event.id}`,
    sourceSystem: event.providerKey,
    metadata: { evidenceHash: event.evidenceHash },
    seenAt: event.occurredAt,
  });
  await linkMemoryEntities({
    organizationId,
    fromEntityId: decision.id,
    toEntityId: source.id,
    relationshipType: 'CREATED_FROM',
    confidence: event.confidence,
    evidenceSnippet: event.content,
    sourceSystem: event.providerKey,
  });
  await addMemoryTimelineEvent({
    organizationId,
    entityId: decision.id,
    title: `${event.providerKey} evidence captured`,
    description: event.content,
    eventType: 'EVIDENCE_CAPTURED',
    sourceSystem: event.providerKey,
    occurredAt: event.occurredAt,
    sourceLink: (event.links as Array<{ url?: string }> | null)?.[0]?.url,
    metadata: { canonicalEvidenceEventId: event.id },
  });
}

export async function completeCanonicalEvidence(
  organizationId: string,
  eventId: string,
  persistence: ClassificationPersistence,
) {
  const unifiedRecordId = await correlateEvent(organizationId, eventId, persistence?.approval ?? null);
  await projectToMemoryGraph(organizationId, eventId, unifiedRecordId, persistence?.approval ?? null)
    .then(() => invalidateMemoryCache(organizationId))
    .catch((error) => console.error('[evidence] Memory Graph projection failed:', safeMessage(error)));
  await prisma.canonicalEvidenceEvent.update({
    where: { id: eventId },
    data: { status: 'COMPLETED', lastProcessedAt: new Date(), lastError: null },
  });
  return { eventId, unifiedRecordId };
}

export async function failCanonicalEvidence(input: {
  organizationId: string;
  eventId?: string;
  providerKey: string;
  correlationId: string;
  stage: string;
  error: unknown;
  retryable?: boolean;
}) {
  const reason = safeMessage(input.error);
  await prisma.$transaction(async (tx) => {
    if (input.eventId) {
      await tx.canonicalEvidenceEvent.updateMany({
        where: { id: input.eventId, organizationId: input.organizationId },
        data: {
          status: input.retryable === false ? 'DEAD_LETTER' : 'RETRY_PENDING',
          processingAttempts: { increment: 1 },
          lastError: reason,
          lastProcessedAt: new Date(),
        },
      });
    }
    await tx.evidenceProcessingFailure.create({
      data: {
        organizationId: input.organizationId,
        eventId: input.eventId,
        providerKey: input.providerKey,
        stage: input.stage,
        retryable: input.retryable ?? true,
        reason,
        correlationId: input.correlationId,
        nextRetryAt: input.retryable === false ? null : new Date(Date.now() + 60_000),
      },
    });
  });
  await recordProviderHealth({
    organizationId: input.organizationId,
    providerKey: input.providerKey,
    status: 'DEGRADED',
    error: reason,
  }).catch(() => null);
}

export async function runEvidenceSidecar<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[evidence:${context}] ${safeMessage(error)}`);
    return null;
  }
}

function deterministicApprovalEvidenceHash(approvalId: string, occurredAt: Date): string {
  return createHash('sha256').update(`approval-backfill:${approvalId}:${occurredAt.toISOString()}`).digest('hex');
}

/**
 * Creates a 1:1 UnifiedEvidenceRecord (+ CanonicalEvidenceEvent +
 * UnifiedEvidenceMember) directly from an ApprovalRecord that was created
 * outside the normal capture pipeline above (captureCanonicalEvidence() +
 * completeCanonicalEvidence()) - e.g. direct-DB-write paths like demo/seed
 * data or manual approval recording. /evidence (Unified Evidence) only ever
 * reads UnifiedEvidenceRecord, never ApprovalRecord directly (see
 * services/evidence/records.ts), so an approval created without going
 * through either this or the real capture pipeline is invisible there even
 * though it's fully visible on /dashboard/approvals - originally identified
 * via scripts/backfill-unified-evidence-from-approvals.ts, which backfills
 * existing gaps; this is the same logic, extracted so new writes can avoid
 * creating the gap in the first place instead of only fixing it after the
 * fact. Fabricates no content - every field is copied from the approval.
 *
 * Idempotent: the CanonicalEvidenceEvent's evidenceHash is deterministic
 * (approval id + occurredAt), and the create goes through the schema's
 * existing @@unique([organizationId, providerKey, evidenceHash]) constraint
 * via upsert, so calling this twice for the same approval is a no-op the
 * second time rather than a duplicate.
 *
 * Callers decide the transaction boundary: pass a `tx` from
 * prisma.$transaction() for atomicity with the approval's own creation, or
 * the top-level `prisma` client when the caller's approval-creation flow
 * isn't itself transactional (matches the style already used by
 * lib/demo-data.ts's seed loop, which does sequential un-transacted
 * creates for its other rows too).
 */
export async function backfillUnifiedEvidenceForApproval(
  client: Prisma.TransactionClient,
  approval: ApprovalRecord,
): Promise<void> {
  const providerKey = approval.sourcePlatform ? (normalizeProviderKey(approval.sourcePlatform) || 'custom') : 'custom';
  const occurredAt = approval.occurredAt;
  const evidenceHash = deterministicApprovalEvidenceHash(approval.id, occurredAt);

  // UnifiedEvidenceRecord created first, then CanonicalEvidenceEvent with
  // unifiedRecordId already set on create - cuts this from 4 sequential round
  // trips to 3 by avoiding a separate .update() to backfill that link
  // afterward (the record's own fields never depend on the event's id, so
  // this order works fine and the two could never be created in parallel
  // anyway). Matters more here than it would elsewhere: this runs once per
  // approval inside HTTP-request-bound seed loops (app/api/demo/seed/route.ts
  // via lib/demo-data.ts), where every extra sequential write adds real risk
  // of pushing an already latency-sensitive request toward its timeout.
  const record = await client.unifiedEvidenceRecord.create({
    data: {
      organizationId: approval.organizationId,
      primaryApprovalId: approval.id,
      subject: approval.subject,
      decision: approval.status,
      outcome: approval.approvalType,
      category: approval.category,
      department: approval.department,
      approverName: approval.approverName,
      approverEmail: approval.approverEmail,
      riskLevel: approval.riskLevel,
      confidence: approval.confidence,
      verificationStatus: 'UNVERIFIED',
      sourceCount: 1,
      evidenceCount: 1,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
      metadata: {
        backfilledFromApprovalId: approval.id,
        backfilledAt: new Date().toISOString(),
        backfillSource: 'services/evidence/pipeline.ts#backfillUnifiedEvidenceForApproval',
      },
    },
  });

  const event = await client.canonicalEvidenceEvent.upsert({
    where: { organizationId_providerKey_evidenceHash: { organizationId: approval.organizationId, providerKey, evidenceHash } },
    update: {},
    create: {
      organizationId: approval.organizationId,
      approvalRecordId: approval.id,
      unifiedRecordId: record.id,
      providerKey,
      providerEventType: 'approval_decision',
      occurredAt,
      receivedAt: approval.createdAt,
      actorName: approval.approverName,
      actorEmail: approval.approverEmail,
      objectType: 'approval_record',
      objectId: approval.id,
      relatedIds: [],
      content: approval.evidenceSnippet ?? approval.reasoning,
      metadata: {
        backfilledFromApprovalId: approval.id,
        status: approval.status,
        approvalType: approval.approvalType,
        category: approval.category,
        department: approval.department,
      },
      evidenceHash,
      correlationId: approval.correlationId ?? approval.id,
      correlationKeys: [approval.id],
      confidence: approval.confidence,
      status: 'COMPLETED',
    },
  });

  await client.unifiedEvidenceMember.create({
    data: {
      unifiedRecordId: record.id,
      eventId: event.id,
      status: 'AUTO_LINKED',
      matchConfidence: 100,
      matchingReasons: ['Backfilled directly from its own ApprovalRecord (1:1, not a correlation match).'],
    },
  });
}
