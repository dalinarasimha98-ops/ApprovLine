import { NextRequest, NextResponse } from 'next/server';
import { authorizeGatewayRequest } from '@/lib/gateway-auth';
import { distributedRateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import { getGatewayOrganization, ingestUniversalApproval, universalApprovalSchema } from '@/services/gateway/universalGateway';
import { EntitlementDeniedError, requireEntitlement } from '@/lib/entitlements';

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

    // Resolve the organization once, from the server-authoritative org slug
    // bound to this API key credential — never from client-supplied input —
    // so the entitlement check below and the ingestion call afterward agree
    // on exactly the same organization.
    const organization = await getGatewayOrganization(authorization.orgSlug);
    try {
      await requireEntitlement(organization.id, 'universal_gateway');
    } catch (error) {
      if (error instanceof EntitlementDeniedError) {
        return NextResponse.json({ error: error.message, code: 'ENTITLEMENT_REQUIRED' }, { status: 403 });
      }
      throw error;
    }

    const parsed = universalApprovalSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid approval payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await ingestUniversalApproval(parsed.data, {
      receivedVia: 'api',
      organizationId: organization.id,
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
