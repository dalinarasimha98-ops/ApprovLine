import { NextRequest, NextResponse } from 'next/server';
import { distributedRateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import { authorizeGatewayRequest } from '@/lib/gateway-auth';
import { ingestGatewayArtifact } from '@/services/gateway/universalGateway';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return measure('POST /api/v1/transcripts/intelligence', async () => {
    const authorization = authorizeGatewayRequest(request);
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limit = await distributedRateLimit(`gateway-transcript:${ip}`, 60, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    let content = '';
    let sourceSystem = 'meeting-transcript';
    let name = 'Uploaded transcript';
    let tenantSlug: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      sourceSystem = String(form.get('source_system') ?? sourceSystem);
      tenantSlug = form.get('tenant_slug') ? String(form.get('tenant_slug')) : undefined;
      if (file instanceof File) {
        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json({ error: 'Transcript must be 10 MB or smaller.' }, { status: 413 });
        }
        name = file.name;
        content = await file.text();
      } else {
        content = String(form.get('transcript') ?? '');
      }
    } else {
      const body = await request.json().catch(() => ({}));
      content = typeof body.transcript === 'string' ? body.transcript : '';
      sourceSystem = typeof body.source_system === 'string' ? body.source_system : sourceSystem;
      name = typeof body.name === 'string' ? body.name : name;
      tenantSlug = typeof body.tenant_slug === 'string' ? body.tenant_slug : undefined;
    }

    if (!content.trim()) {
      return NextResponse.json({ error: 'Transcript text is required.' }, { status: 400 });
    }

    const results = await ingestGatewayArtifact({
      organizationSlug: tenantSlug,
      sourceSystem,
      artifactType: 'transcript',
      name,
      content,
      metadata: { intelligence: 'transcript', extracts: ['approvals', 'decisions', 'action_items'] },
    });

    return NextResponse.json({
      ok: true,
      transcript: name,
      extractedDecisions: results.length,
      backgroundJobIds: results.map((item) => item.backgroundJobId).filter(Boolean),
      correlationIds: results.map((item) => item.correlationId),
    });
  });
}
