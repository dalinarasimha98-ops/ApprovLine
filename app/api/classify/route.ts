import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDashboardTenant } from '@/lib/auth';
import { distributedRateLimit } from '@/lib/rate-limit';
import { measure } from '@/lib/performance';
import { classifyWithOpenAI } from '@/services/classifier/openai';
import { persistClassificationResult } from '@/services/classifier/persistence';
import { hasMinimumRole } from '@/lib/rbac';

const classifyRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  source: z.string().optional(),
  channel: z.string().optional(),
  sender: z.string().optional(),
  sender_email: z.string().email().optional(),
  senderEmail: z.string().email().optional(),
  slack_user: z.string().optional(),
  teams_user: z.string().optional(),
  zoom_participant: z.string().optional(),
  timestamp: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  organizationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return measure('POST /api/classify', async () => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = await distributedRateLimit(`classify:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const parsed = classifyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Every classification request must have an authenticated session and a
    // server-derived organizationId. organizationId from the request body is
    // intentionally ignored — the session is the only authorization source.
    const tenant = await getDashboardTenant(4000);
    if (tenant.status === 'unauthenticated') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!tenant.organization || !tenant.user) {
      return NextResponse.json({ error: 'Workspace not configured' }, { status: 403 });
    }
    if (!hasMinimumRole(tenant.user.role, 'MEMBER')) {
      return NextResponse.json({ error: 'Your workspace role cannot create approval records.' }, { status: 403 });
    }
    const organizationId = tenant.organization.id;

    const result = await classifyWithOpenAI(parsed.data);

    await persistClassificationResult({
      organizationId,
      request: parsed.data,
      result,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Classification failed' },
      { status: error instanceof Response ? error.status : 500 },
    );
  }
  });
}
