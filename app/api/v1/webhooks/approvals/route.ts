import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import {
  ingestUniversalApproval,
  normalizeWebhookApproval,
  universalWebhookSchema,
} from '@/services/gateway/universalGateway';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return measure('POST /api/v1/webhooks/approvals', async () => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = rateLimit(`gateway-webhook:${ip}`, 240, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const parsed = universalWebhookSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid webhook payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const approval = normalizeWebhookApproval(parsed.data);
    const result = await ingestUniversalApproval(approval, {
      receivedVia: 'webhook',
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      system: parsed.data.system,
      classifierResultId: result?.classifier.id ?? null,
      approvalRecordId: result?.approval?.id ?? null,
      approvalDetected: result?.approval !== null,
    });
  });
}
