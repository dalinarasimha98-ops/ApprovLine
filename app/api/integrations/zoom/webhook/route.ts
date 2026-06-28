import { NextRequest, NextResponse } from 'next/server';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';

export async function POST(request: NextRequest) {
  const payload = await request.json();

  if (payload.event === 'endpoint.url_validation') {
    return NextResponse.json({ plainToken: payload.payload?.plainToken });
  }

  const accountId = payload.payload?.account_id;
  const integration = await resolveIntegrationTenant('ZOOM', accountId);

  const queued = await enqueueIncomingMessage({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'ZOOM',
    externalId: payload.payload?.object?.uuid ?? payload.event_ts,
    channel: payload.payload?.object?.topic,
    message:
      payload.payload?.object?.transcript ??
      payload.payload?.object?.summary ??
      JSON.stringify(payload),
    rawPayload: payload,
  });

  return NextResponse.json(queued.queued ? { ok: true, queued: true } : { ok: true, queued: false, warning: queued.reason }, {
    status: queued.queued ? 200 : 202,
  });
}
