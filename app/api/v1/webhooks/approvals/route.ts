import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { distributedRateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import {
  ingestUniversalApproval,
  normalizeWebhookApproval,
  universalWebhookSchema,
} from '@/services/gateway/universalGateway';
import { verifyWebhookSignature } from '@/services/queue/reliability';

// Server-authoritative org slug bound to this webhook secret — never trusts
// tenant_slug supplied by the caller.
const BOUND_ORG_SLUG = env.UNIVERSAL_GATEWAY_ORG_SLUG;

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return measure('POST /api/v1/webhooks/approvals', async () => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = await distributedRateLimit(`gateway-webhook:${ip}`, 240, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const rawBody = await request.text();
    if (!env.UNIVERSAL_GATEWAY_WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Universal Gateway webhook is not configured.' }, { status: 503 });
    }
    if (env.UNIVERSAL_GATEWAY_WEBHOOK_SECRET) {
      const signature = request.headers.get('x-approvline-signature');
      const verified = verifyWebhookSignature({
        secret: env.UNIVERSAL_GATEWAY_WEBHOOK_SECRET,
        body: rawBody,
        signature,
      });
      if (!verified.ok) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    // Org binding must be present — fail closed rather than falling back to
    // client-supplied tenant_slug in the webhook payload.
    if (!BOUND_ORG_SLUG) {
      return NextResponse.json(
        { error: 'Universal Gateway organization binding is not configured.' },
        { status: 503 },
      );
    }

    const parsed = universalWebhookSchema.safeParse(JSON.parse(rawBody || 'null'));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid webhook payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const approval = normalizeWebhookApproval(parsed.data);
    const result = await ingestUniversalApproval(approval, {
      receivedVia: 'webhook',
      // Use the server-authoritative slug; never trust tenant_slug from
      // the webhook payload as the authorization source.
      tenantSlug: BOUND_ORG_SLUG,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        system: parsed.data.system,
        duplicate: result.duplicate,
        processingMode: result.processingMode,
        backgroundJobId: result.backgroundJobId ?? null,
        correlationId: result.correlationId,
        idempotencyKey: result.idempotencyKey,
      },
      { status: 202 },
    );
  });
}
