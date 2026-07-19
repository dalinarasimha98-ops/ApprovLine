import { NextRequest, NextResponse } from 'next/server';
import { distributedRateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import { authorizeGatewayRequest } from '@/lib/gateway-auth';
import { ingestGatewayArtifact } from '@/services/gateway/universalGateway';

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

    const form = await request.formData();
    const file = form.get('file');
    const sourceSystem = String(form.get('source_system') ?? 'csv-import');
    const tenantSlug = form.get('tenant_slug') ? String(form.get('tenant_slug')) : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file is required as form field `file`.' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'CSV file must be 5 MB or smaller.' }, { status: 413 });
    }

    const content = await file.text();
    const results = await ingestGatewayArtifact({
      organizationSlug: tenantSlug,
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
