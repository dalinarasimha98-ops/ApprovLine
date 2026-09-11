import { NextRequest, NextResponse } from 'next/server';
import { distributedRateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import { authorizeGatewayRequest } from '@/lib/gateway-auth';
import { getGatewayOrganization, ingestGatewayArtifact } from '@/services/gateway/universalGateway';
import { EntitlementDeniedError, requireEntitlement } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return measure('POST /api/v1/imports/csv', async () => {
    const authorization = authorizeGatewayRequest(request);
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = await distributedRateLimit(`gateway-csv:${ip}`, 30, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Resolve the organization once, from the server-authoritative org slug
    // bound to this API key credential — never from a client-supplied
    // tenant_slug form field, which would let any caller holding the shared
    // gateway API key redirect ingestion into an arbitrary organization.
    const organization = await getGatewayOrganization(authorization.orgSlug);
    try {
      await requireEntitlement(organization.id, 'universal_gateway');
    } catch (error) {
      if (error instanceof EntitlementDeniedError) {
        return NextResponse.json({ error: error.message, code: 'ENTITLEMENT_REQUIRED' }, { status: 403 });
      }
      throw error;
    }

    const form = await request.formData();
    const file = form.get('file');
    const sourceSystem = String(form.get('source_system') ?? 'csv-import');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file is required as form field `file`.' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'CSV file must be 5 MB or smaller.' }, { status: 413 });
    }

    const content = await file.text();
    const results = await ingestGatewayArtifact({
      organizationId: organization.id,
      sourceSystem,
      artifactType: 'csv',
      name: file.name,
      content,
      metadata: { contentType: file.type, size: file.size },
    });

    return NextResponse.json({
      ok: true,
      importedRows: results.length,
      backgroundJobIds: results.map((item) => item.backgroundJobId).filter(Boolean),
      correlationIds: results.map((item) => item.correlationId),
    });
  });
}
