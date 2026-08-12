import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDashboardTenant } from '@/lib/auth';
import { TeamRoleChangeError, updateMemberRole } from '@/services/team';

export const dynamic = 'force-dynamic';

const roleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'AUDITOR', 'VIEWER']),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) {
    return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });
  }

  const parsed = roleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a valid role.' }, { status: 400 });
  }

  const { userId } = await params;

  try {
    const updated = await updateMemberRole({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      actorRole: tenant.user.role,
      targetUserId: userId,
      newRole: parsed.data.role,
    });
    return NextResponse.json({ id: updated.id, role: updated.role });
  } catch (error) {
    if (error instanceof TeamRoleChangeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[team] role change failed', error);
    return NextResponse.json({ error: 'Could not update the member role. Retry in a moment.' }, { status: 503 });
  }
}
