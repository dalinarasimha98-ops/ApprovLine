import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { slackMessageLink, verifySlackSignature } from '@/services/integrations/slack';

function eventSummary(payload: Record<string, unknown>, event: Record<string, unknown>) {
  return {
    eventId: payload.event_id,
    teamId: payload.team_id ?? (payload.authorizations as Array<{ team_id?: string }> | undefined)?.[0]?.team_id ?? event.team,
    type: event.type,
    subtype: event.subtype,
    channel: event.channel,
    user: event.user,
    ts: event.ts,
  };
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function writeSlackEvent(input: {
  organizationId: string;
  integrationId?: string;
  type: string;
  payload: Record<string, unknown>;
  failedAt?: Date;
  failureReason?: string;
  processedAt?: Date;
}) {
  return prisma.event.create({
    data: {
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
      failedAt: input.failedAt,
      failureReason: input.failureReason,
      processedAt: input.processedAt,
    },
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verified = verifySlackSignature({
    signingSecret: env.SLACK_SIGNING_SECRET,
    rawBody,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
  });

  if (!verified) {
    return NextResponse.json({ error: 'Invalid Slack signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid Slack JSON payload' }, { status: 400 });
  }

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const event = (payload.event && typeof payload.event === 'object' ? payload.event : {}) as Record<string, unknown>;
  const authorizations = Array.isArray(payload.authorizations)
    ? (payload.authorizations as Array<{ team_id?: string }>)
    : [];
  const teamId = optionalString(payload.team_id) ?? authorizations[0]?.team_id ?? optionalString(event.team);
  let integration;
  try {
    integration = await resolveIntegrationTenant('SLACK', teamId);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Slack workspace is not connected',
        reason: error instanceof Error ? error.message : 'Unknown Slack tenant resolution failure',
      },
      { status: 404 },
    );
  }

  await writeSlackEvent({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    type: 'slack.event.received',
    payload: eventSummary(payload, event),
  });

  if (
    typeof event.text !== 'string' || !event.text ||
    event.bot_id ||
    event.bot_profile ||
    event.subtype === 'bot_message' ||
    event.subtype === 'message_deleted' ||
    event.subtype === 'message_changed'
  ) {
    await writeSlackEvent({
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'slack.event.skipped',
      payload: {
        ...eventSummary(payload, event),
        reason: !event.text ? 'empty_message' : event.subtype ?? 'bot_message',
      },
      processedAt: new Date(),
    });
    return NextResponse.json({ ok: true, skipped: true });
  }

  const channel = optionalString(event.channel);
  const messageTs = optionalString(event.ts);
  const eventId = optionalString(payload.event_id);
  const clientMessageId = optionalString(event.client_msg_id);
  const userId = optionalString(event.user);
  const userProfile = event.user_profile && typeof event.user_profile === 'object'
    ? event.user_profile as Record<string, unknown>
    : {};
  const senderName = optionalString(userProfile.real_name) ?? userId;
  const senderEmail = optionalString(userProfile.email);
  const sourceLink = slackMessageLink(teamId, channel, messageTs);

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: 'SYNCING',
      metadata: {
        ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
        lastEventAt: new Date().toISOString(),
        lastSlackEventId: eventId ?? null,
      },
    },
  });

  const queued = await enqueueIncomingMessage({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'SLACK',
    externalId: eventId ?? clientMessageId ?? messageTs,
    channel,
    sender: senderName,
    senderEmail,
    timestamp: messageTs ? new Date(Number(messageTs.split('.')[0]) * 1000).toISOString() : undefined,
    message: event.text,
    sourceLink,
    rawPayload: {
      ...payload,
      evidence: {
        teamId,
        channel,
        channelName: event.channel_name ?? channel,
        messageTs,
        senderUserId: userId,
        senderName,
        senderEmail,
        sourceLink,
      },
    },
  });

  if (!queued.queued) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'ERROR',
        metadata: {
          ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
          lastError: queued.reason,
          lastErrorAt: new Date().toISOString(),
        },
      },
    });
    await writeSlackEvent({
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'slack.event.queue_error',
      payload: eventSummary(payload, event),
      failedAt: new Date(),
      failureReason: queued.reason,
    });
    return NextResponse.json({ ok: true, queued: false, warning: queued.reason }, { status: 202 });
  }

  await writeSlackEvent({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    type: 'slack.event.enqueued',
    payload: eventSummary(payload, event),
    processedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
