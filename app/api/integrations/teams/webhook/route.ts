import { NextRequest, NextResponse } from 'next/server';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const tenantId = payload.tenantId ?? payload.resourceData?.tenantId;
  const integration = await resolveIntegrationTenant('MICROSOFT_TEAMS', tenantId);
  const teamId = payload.teamId ?? payload.resourceData?.teamId;
  const channelId = payload.channelId ?? payload.resourceData?.channelId;
  const messageId = payload.id ?? payload.resourceData?.id;
  const timestamp = payload.createdDateTime ?? payload.timestamp;
  const sourceLink = payload.webUrl ?? (teamId && channelId && messageId
    ? `https://teams.microsoft.com/l/message/${encodeURIComponent(channelId)}/${encodeURIComponent(messageId)}?groupId=${encodeURIComponent(teamId)}`
    : undefined);

  const job = {
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'MICROSOFT_TEAMS' as const,
    externalId: messageId,
    channel: payload.channelName ?? channelId,
    sender: payload.from?.user?.displayName,
    timestamp,
    sourceLink,
    message: payload.body?.content ?? payload.text ?? JSON.stringify(payload),
    rawPayload: {
      ...payload,
      sourcePlatform: 'teams',
      microsoftTenantId: tenantId,
      microsoftTeamId: teamId,
      microsoftChannelId: channelId,
      microsoftMessageId: messageId,
      sourceLink,
    },
  };
  const queued = await enqueueIncomingMessage(job);
  if (!queued.queued) {
    const processed = await processIncomingMessage(job, { auditAction: 'integration.teams.webhook_processed_without_queue' });
    return NextResponse.json({ ok: true, queued: false, processed: Boolean(processed?.classifier), warning: queued.reason }, { status: 202 });
  }

  return NextResponse.json({ ok: true, queued: true });
}
