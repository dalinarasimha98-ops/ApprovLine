import { NextRequest, NextResponse } from 'next/server';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const tenantId = payload.tenantId ?? payload.resourceData?.tenantId;
  const integration = await resolveIntegrationTenant('MICROSOFT_TEAMS', tenantId);

  await enqueueIncomingMessage({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'MICROSOFT_TEAMS',
    externalId: payload.id ?? payload.resourceData?.id,
    channel: payload.channelId,
    sender: payload.from?.user?.displayName,
    message: payload.body?.content ?? payload.text ?? JSON.stringify(payload),
    rawPayload: payload,
  });

  return NextResponse.json({ ok: true });
}
