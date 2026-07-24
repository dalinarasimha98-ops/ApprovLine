import assert from 'node:assert/strict';
import test from 'node:test';
import type { EvidenceProviderPlugin } from '@/types/evidence';

process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);

test('provider catalog is read-only and future-provider compatible', async () => {
  const { evidenceProviderCatalog, getEvidenceProviderManifest } = await import(
    '@/services/evidence/provider-catalog'
  );

  assert.ok(evidenceProviderCatalog.length >= 20);
  assert.ok(evidenceProviderCatalog.every((provider) => provider.readOnly));

  const custom = getEvidenceProviderManifest('Example ERP');
  assert.equal(custom.key, 'example_erp');
  assert.equal(custom.category, 'CUSTOM');
  assert.equal(custom.authenticationType, 'CUSTOM');
});

test('normalization creates stable hashes, correlation keys, and encrypted raw payloads', async () => {
  const { normalizeEvidenceEvent } = await import('@/services/evidence/normalizer');
  const input = {
    providerKey: 'Example ERP',
    providerEventType: 'approval.updated',
    eventTimestamp: '2026-07-24T10:00:00.000Z',
    externalEventId: 'event-42',
    actor: { name: 'Priya Sharma', email: 'priya@example.com' },
    object: { type: 'purchase_order', id: 'PO-1002', name: 'Cloud renewal' },
    threadId: 'thread-9',
    relatedIds: ['VENDOR-7'],
    participants: [],
    attachments: [],
    links: [{ type: 'source', url: 'https://example.com/events/42' }],
    content: 'Approved PO-1002 for the cloud renewal.',
    metadata: { department: 'Procurement' },
    rawPayload: { secret: 'provider-payload' },
    confidence: 96,
  };

  const first = normalizeEvidenceEvent(input);
  const second = normalizeEvidenceEvent({ ...input, metadata: { ignoredForIdentity: true } });

  assert.equal(first.providerKey, 'example_erp');
  assert.equal(first.evidenceHash, second.evidenceHash);
  assert.ok(first.correlationKeys.includes('thread-9'));
  assert.ok(first.correlationKeys.includes('po-1002'));
  assert.ok(first.encryptedRawPayload);
  assert.equal(first.encryptedRawPayload?.includes('provider-payload'), false);
});

test('provider SDK registers the complete provider contract', async () => {
  const {
    getEvidenceProvider,
    listRegisteredEvidenceProviders,
    registerEvidenceProvider,
  } = await import('@/services/evidence/provider-sdk');

  const plugin: EvidenceProviderPlugin = {
    manifest: {
      key: 'test-provider',
      displayName: 'Test Provider',
      category: 'CUSTOM' as const,
      authenticationType: 'API_KEY' as const,
      capabilities: [
        'AUTHENTICATE',
        'SUBSCRIBE',
        'FETCH',
        'NORMALIZE',
        'HEALTH_CHECK',
        'DISCONNECT',
      ],
      readOnly: true,
      version: '1.0',
    },
    async Authenticate() {
      return { authenticated: true };
    },
    async Subscribe() {
      return { subscribed: true };
    },
    async Fetch() {
      return { events: [] };
    },
    async Normalize() {
      return {
        providerKey: 'test-provider',
        providerEventType: 'test',
        eventTimestamp: new Date('2026-07-24T10:00:00.000Z'),
        object: { type: 'test' },
        relatedIds: [],
        participants: [],
        attachments: [],
        links: [],
        metadata: {},
        confidence: 100,
      };
    },
    async HealthCheck() {
      return { status: 'CONNECTED' as const };
    },
    async Disconnect() {},
  };

  registerEvidenceProvider(plugin);
  const registered = getEvidenceProvider('TEST-PROVIDER');

  assert.equal(registered, plugin);
  assert.ok(listRegisteredEvidenceProviders().some((provider) => provider.key === 'test-provider'));
  assert.equal(typeof registered?.Authenticate, 'function');
  assert.equal(typeof registered?.Subscribe, 'function');
  assert.equal(typeof registered?.Fetch, 'function');
  assert.equal(typeof registered?.Normalize, 'function');
  assert.equal(typeof registered?.HealthCheck, 'function');
  assert.equal(typeof registered?.Disconnect, 'function');
});

test('correlation scoring strongly favors the same thread and business reference', async () => {
  const { normalizeEvidenceEvent } = await import('@/services/evidence/normalizer');
  const { scoreEvidenceCandidate } = await import('@/services/evidence/pipeline');

  const event = normalizeEvidenceEvent({
    providerKey: 'slack',
    providerEventType: 'message',
    eventTimestamp: '2026-07-24T10:00:00.000Z',
    actor: { email: 'cfo@example.com' },
    object: { type: 'message', id: 'message-2' },
    threadId: 'budget-thread',
    relatedIds: ['PO-1002'],
    participants: [],
    attachments: [],
    links: [],
    content: 'Approved the cloud renewal budget.',
    metadata: {},
    confidence: 95,
  });

  const result = scoreEvidenceCandidate(event, {
    subject: 'Cloud renewal budget approval',
    approverEmail: 'cfo@example.com',
    approverName: null,
    events: [{
      providerKey: 'gmail',
      objectId: 'email-1',
      threadId: 'budget-thread',
      relatedIds: ['po-1002'],
      correlationKeys: [],
    }],
  });

  assert.ok(result.score >= 80);
  assert.ok(result.reasons.includes('same conversation thread'));
  assert.ok(result.reasons.includes('same approver email'));
  assert.ok(result.reasons.includes('shared business reference'));
});
