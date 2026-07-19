import { NextRequest, NextResponse } from 'next/server';
import { authorizeGatewayRequest } from '@/lib/gateway-auth';
import { distributedRateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import { ingestUniversalApproval, universalApprovalSchema } from '@/services/gateway/universalGateway';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return measure('POST /api/v1/approvals', async () => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = await distributedRateLimit(`gateway-api:${ip}`, 120, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const authorization = authorizeGatewayRequest(request);
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }

    const parsed = universalApprovalSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid approval payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await ingestUniversalApproval(parsed.data, {
      receivedVia: 'api',
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        duplicate: result.duplicate,
        processingMode: result.processingMode,
        backgroundJobId: result.backgroundJobId ?? null,
        correlationId: result.correlationId,
        idempotencyKey: result.idempotencyKey,
        organizationId: result.organizationId,
      },
      { status: 202 },
    );
  });
}
