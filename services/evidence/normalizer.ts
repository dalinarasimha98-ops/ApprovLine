import { createHash, randomUUID } from 'node:crypto';
import { encryptJson } from '@/utils/encryption';
import { canonicalEvidenceInputSchema, type CanonicalEvidenceInput, type NormalizedEvidenceEvent } from '@/types/evidence';
import { normalizeProviderKey } from '@/services/evidence/provider-sdk';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function correlationTokens(input: CanonicalEvidenceInput) {
  const candidates = [
    input.threadId,
    input.parentId,
    input.object.id,
    input.externalEventId,
    input.actor?.email,
    ...input.relatedIds,
    ...(input.content?.match(/\b(?:[A-Z]{2,10}-\d+|INV-\d+|PO-\d+|REQ-\d+)\b/g) ?? []),
  ];
  return [...new Set(candidates.filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()))]
    .slice(0, 100);
}

export function normalizeEvidenceEvent(input: CanonicalEvidenceInput): NormalizedEvidenceEvent {
  const parsed = canonicalEvidenceInputSchema.parse(input);
  const providerKey = normalizeProviderKey(parsed.providerKey);
  const eventTimestamp = parsed.eventTimestamp instanceof Date ? parsed.eventTimestamp : new Date(parsed.eventTimestamp);
  const identity = parsed.externalEventId
    ? { providerKey, externalEventId: parsed.externalEventId }
    : {
        providerKey,
        providerEventType: parsed.providerEventType,
        eventTimestamp: eventTimestamp.toISOString(),
        object: parsed.object,
        actor: parsed.actor,
        content: parsed.content,
      };
  const evidenceHash = hash(identity);
  const encryptedRawPayload = parsed.rawPayload === undefined
    ? undefined
    : JSON.stringify(encryptJson(parsed.rawPayload));

  return {
    ...parsed,
    providerKey,
    eventTimestamp,
    evidenceHash,
    correlationId: parsed.correlationId ?? randomUUID(),
    correlationKeys: correlationTokens(parsed),
    encryptedRawPayload,
  };
}
