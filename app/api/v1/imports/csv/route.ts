import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import { ingestGatewayArtifact } from '@/services/gateway/universalGateway';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return measure('POST /api/v1/imports/csv', async () => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = rateLimit(`gateway-csv:${ip}`, 30, 60_000);
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
      approvalRecordIds: results.map((item) => item?.approval?.id).filter(Boolean),
    });
  });
}
