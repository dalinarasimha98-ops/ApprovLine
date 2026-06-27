import { NextRequest, NextResponse } from 'next/server';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { slackMessageLink, verifySlackSignature } from '@/services/integrations/slack';

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

  const payload = JSON.parse(rawBody);

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const event = payload.event ?? {};
  if (
    !event.text ||
    event.bot_id ||
    event.bot_profile ||
    event.subtype === 'bot_message' ||
    event.subtype === 'message_deleted' ||
    event.subtype === 'message_changed'
  ) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const teamId = payload.team_id ?? payload.authorizations?.[0]?.team_id ?? event.team;
  const integration = await resolveIntegrationTenant('SLACK', teamId);
  const channel = event.channel;
  const messageTs = event.ts;
  const sourceLink = slackMessageLink(teamId, channel, messageTs);

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: 'SYNCING',
      metadata: {
        ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
        lastEventAt: new Date().toISOString(),
        lastSlackEventId: payload.event_id,
      },
    },
  });

  await enqueueIncomingMessage({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'SLACK',
    externalId: payload.event_id ?? event.client_msg_id ?? messageTs,
    channel,
    sender: event.user_profile?.real_name ?? event.user,
    senderEmail: event.user_profile?.email,
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
        senderUserId: event.user,
        senderName: event.user_profile?.real_name,
        senderEmail: event.user_profile?.email,
        sourceLink,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
