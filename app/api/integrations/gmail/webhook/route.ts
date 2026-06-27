import { NextRequest, NextResponse } from 'next/server';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const emailAddress = payload.emailAddress ?? payload.message?.emailAddress;
  const integration = await resolveIntegrationTenant('GMAIL', emailAddress);

  await enqueueIncomingMessage({
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'GMAIL',
    externalId: payload.historyId ?? payload.messageId,
    senderEmail: emailAddress,
    message: payload.snippet ?? payload.message?.snippet ?? JSON.stringify(payload),
    rawPayload: payload,
  });

  return NextResponse.json({ ok: true });
}
