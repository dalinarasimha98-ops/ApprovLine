import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { encryptJson } from '@/utils/encryption';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { getEvidenceProviderManifest } from '@/services/evidence/provider-catalog';
import { getEvidenceProvider, normalizeProviderKey } from '@/services/evidence/provider-sdk';
import { recordProviderHealth } from '@/services/evidence/pipeline';

function queueProvider(providerKey: string): IncomingMessageJob['provider'] {
  const provider = normalizeProviderKey(providerKey);
  const known: Record<string, IncomingMessageJob['provider']> = {
    slack: 'SLACK',
    gmail: 'GMAIL',
    outlook: 'OUTLOOK',
    microsoft_teams: 'MICROSOFT_TEAMS',
    jira: 'JIRA',
    servicenow: 'SERVICENOW',
    zoom: 'ZOOM',
  };
  return known[provider] ?? 'CUSTOM';
}

export async function authenticateEvidenceProvider(input: {
  organizationId: string;
  providerKey: string;
  credentials: unknown;
}) {
  const providerKey = normalizeProviderKey(input.providerKey);
  const plugin = getEvidenceProvider(providerKey);
  if (!plugin) throw new Error(`Provider ${providerKey} has not registered an SDK plugin.`);

  const manifest = getEvidenceProviderManifest(providerKey);
  const connection = await prisma.evidenceProviderConnection.upsert({
    where: { organizationId_providerKey: { organizationId: input.organizationId, providerKey } },
    create: {
      organizationId: input.organizationId,
      providerKey,
      displayName: manifest.displayName,
      category: manifest.category,
      status: 'SYNCING',
      authenticationType: manifest.authenticationType,
      scopes: [],
    },
    update: { status: 'SYNCING', disconnectedAt: null },
  });

  try {
    const result = await plugin.Authenticate(
      { organizationId: input.organizationId, connectionId: connection.id },
      input.credentials,
    );
    const encryptedCredentials = encryptJson(result);
    const updated = await prisma.evidenceProviderConnection.update({
      where: { id: connection.id },
      data: {
        status: 'CONNECTED',
        encryptedCredentials: encryptedCredentials as unknown as Prisma.InputJsonValue,
        connectedAt: new Date(),
        disconnectedAt: null,
      },
    });
    await recordProviderHealth({
      organizationId: input.organizationId,
      connectionId: connection.id,
      providerKey,
      status: 'CONNECTED',
      authenticationStatus: 'VALID',
    });
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider authentication failed.';
    await recordProviderHealth({
      organizationId: input.organizationId,
      connectionId: connection.id,
      providerKey,
      status: 'ERROR',
      authenticationStatus: 'INVALID',
      error: message,
    });
    throw error;
  }
}

export async function syncEvidenceProvider(input: {
  organizationId: string;
  providerKey: string;
  cursor?: string;
}) {
  const providerKey = normalizeProviderKey(input.providerKey);
  const plugin = getEvidenceProvider(providerKey);
  if (!plugin) throw new Error(`Provider ${providerKey} has not registered an SDK plugin.`);
  const connection = await prisma.evidenceProviderConnection.findUnique({
    where: { organizationId_providerKey: { organizationId: input.organizationId, providerKey } },
  });
  if (!connection || connection.status === 'DISCONNECTED') {
    throw new Error(`${providerKey} is not connected for this organization.`);
  }

  const startedAt = Date.now();
  await prisma.evidenceProviderConnection.update({
    where: { id: connection.id },
    data: { status: 'SYNCING' },
  });
  try {
    const fetched = await plugin.Fetch(
      { organizationId: input.organizationId, connectionId: connection.id },
      input.cursor,
    );
    let accepted = 0;
    let duplicates = 0;
    for (const providerEvent of fetched.events) {
      const event = await plugin.Normalize(providerEvent, {
        organizationId: input.organizationId,
        connectionId: connection.id,
      });
      const result = await enqueueIncomingMessage({
        organizationId: input.organizationId,
        integrationId: connection.id,
        provider: queueProvider(providerKey),
        providerKey,
        providerEventType: event.providerEventType,
        externalId: event.externalEventId ?? event.object.id,
        objectType: event.object.type,
        objectId: event.object.id,
        threadId: event.threadId,
        parentId: event.parentId,
        relatedIds: event.relatedIds,
        sender: event.actor?.name,
        senderEmail: event.actor?.email,
        timestamp: event.eventTimestamp instanceof Date
          ? event.eventTimestamp.toISOString()
          : event.eventTimestamp,
        message: event.content ?? '',
        sourceLink: event.links[0]?.url,
        participants: event.participants,
        attachments: event.attachments,
        links: event.links,
        metadata: event.metadata,
        rawPayload: event.rawPayload ?? providerEvent,
      }, {
        sourceSystem: providerKey,
        sourceRecordId: event.externalEventId ?? event.object.id,
        correlationId: event.correlationId,
      });
      if (result.queued && result.duplicate) duplicates += 1;
      else if (result.queued) accepted += 1;
    }

    const finishedAt = new Date();
    await prisma.evidenceProviderConnection.update({
      where: { id: connection.id },
      data: {
        status: 'CONNECTED',
        lastSyncAt: finishedAt,
        configuration: {
          ...((connection.configuration as Record<string, unknown> | null) ?? {}),
          cursor: fetched.cursor,
        } as Prisma.InputJsonValue,
      },
    });
    await recordProviderHealth({
      organizationId: input.organizationId,
      connectionId: connection.id,
      providerKey,
      status: 'CONNECTED',
      latencyMs: Date.now() - startedAt,
      syncStatus: 'COMPLETED',
      lastSuccessfulSyncAt: finishedAt,
      metadata: { accepted, duplicates, cursor: fetched.cursor },
    });
    return { accepted, duplicates, cursor: fetched.cursor };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider synchronization failed.';
    await prisma.evidenceProviderConnection.update({
      where: { id: connection.id },
      data: { status: 'ERROR' },
    });
    await recordProviderHealth({
      organizationId: input.organizationId,
      connectionId: connection.id,
      providerKey,
      status: 'ERROR',
      latencyMs: Date.now() - startedAt,
      syncStatus: 'FAILED',
      error: message,
    });
    throw error;
  }
}

export async function checkEvidenceProviderHealth(organizationId: string, providerKeyInput: string) {
  const providerKey = normalizeProviderKey(providerKeyInput);
  const plugin = getEvidenceProvider(providerKey);
  if (!plugin) throw new Error(`Provider ${providerKey} has not registered an SDK plugin.`);
  const connection = await prisma.evidenceProviderConnection.findUnique({
    where: { organizationId_providerKey: { organizationId, providerKey } },
  });
  if (!connection) throw new Error(`${providerKey} is not configured for this organization.`);
  const startedAt = Date.now();
  const result = await plugin.HealthCheck({ organizationId, connectionId: connection.id });
  await recordProviderHealth({
    organizationId,
    connectionId: connection.id,
    providerKey,
    ...result,
    latencyMs: result.latencyMs ?? Date.now() - startedAt,
    error: result.errorMessage,
  });
  return result;
}

export async function disconnectEvidenceProvider(organizationId: string, providerKeyInput: string) {
  const providerKey = normalizeProviderKey(providerKeyInput);
  const connection = await prisma.evidenceProviderConnection.findUnique({
    where: { organizationId_providerKey: { organizationId, providerKey } },
  });
  if (!connection) return;
  const plugin = getEvidenceProvider(providerKey);
  if (plugin) await plugin.Disconnect({ organizationId, connectionId: connection.id });
  await prisma.evidenceProviderConnection.update({
    where: { id: connection.id },
    data: {
      status: 'DISCONNECTED',
      encryptedCredentials: Prisma.JsonNull,
      disconnectedAt: new Date(),
    },
  });
  await recordProviderHealth({
    organizationId,
    connectionId: connection.id,
    providerKey,
    status: 'DISCONNECTED',
    authenticationStatus: 'REVOKED',
  });
}
