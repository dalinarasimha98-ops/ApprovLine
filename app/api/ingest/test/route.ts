import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { buildSimulationJob } from '@/services/integrations/simulation';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';

const testIngestSchema = z.object({
  source_platform: z.enum(['slack', 'gmail', 'teams', 'zoom']),
  message: z.string().min(1).max(4000),
  sender_name: z.string().optional(),
  sender_email: z.string().email().optional(),
  timestamp: z.string().datetime().optional(),
  organization_slug: z.string().optional(),
  process_inline: z.boolean().default(true),
});

async function getDemoOrganization(slug = 'public-demo') {
  return prisma.organization.upsert({
    where: { slug },
    update: {},
    create: {
      name: slug === 'public-demo' ? 'Public Demo' : slug,
      slug,
    },
  });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = rateLimit(`ingest-test:${ip}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const parsed = testIngestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid ingestion payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const organization = await getDemoOrganization(parsed.data.organization_slug);
  const job = buildSimulationJob(organization.id, parsed.data);
  let queueStatus: 'queued' | 'queue_unavailable' = 'queued';
  let jobId: string | undefined;

  const queued = await enqueueIncomingMessage(job);
  if (queued.queued) {
    jobId = queued.id;
  } else {
    queueStatus = 'queue_unavailable';
  }

  const processed = parsed.data.process_inline
    ? await processIncomingMessage(job, { auditAction: 'approval_record.created_from_test_ingest' })
    : null;

  return NextResponse.json({
    ok: true,
    queueStatus,
    jobId,
    processedInline: Boolean(processed),
    classifierResultId: processed?.classifier.id ?? null,
    approvalRecordId: processed?.approval?.id ?? null,
  });
}
