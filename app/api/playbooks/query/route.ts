import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDashboardTenant } from '@/lib/auth';
import { queryPlaybooks } from '@/services/playbooks';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  question: z.string().min(5).max(1000),
});

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });

  const parsed = querySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ask a clear approval policy question.' }, { status: 400 });
  }

  const answer = await queryPlaybooks({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user?.id,
    question: parsed.data.question,
  });

  return NextResponse.json(answer);
}
