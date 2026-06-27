import { NextRequest, NextResponse } from 'next/server';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';

export async function POST(request: NextRequest) {
  const payload = await request.json();

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const integration = await resolveIntegrationTenant('SLACK', payload.team_id);
  const event = payload.event ?? {};
  if (!event.text) return NextResponse.json({ ok: true, skipped: true });

  await enqueueIncomingMessage({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'SLACK',
    externalId: event.client_msg_id ?? event.ts,
    channel: event.channel,
    sender: event.user,
    message: event.text,
    rawPayload: payload,
  });

  return NextResponse.json({ ok: true });
}
