import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { tenantScopedWhere, assertTenantAccess } from '@/lib/tenant-isolation';
import { writeAuditLog } from '@/services/audit';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const addMemberSchema = z.object({ userId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN', 'MANAGER'])) {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const parsed = addMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'userId required.' }, { status: 400 });

  const { teamId } = await params;
  const orgId = tenant.organization.id;

  const [team, targetUser] = await Promise.all([
    prisma.team.findFirst({ where: tenantScopedWhere({ organizationId: orgId }, { id: teamId }) }),
    prisma.user.findFirst({ where: tenantScopedWhere({ organizationId: orgId }, { id: parsed.data.userId }) }),
  ]);

  assertTenantAccess({ organizationId: orgId }, team, 'team');
  assertTenantAccess({ organizationId: orgId }, targetUser, 'user');

  const member = await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId: parsed.data.userId } },
    create: { teamId, userId: parsed.data.userId },
    update: {},
  });

  await writeAuditLog({
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: 'team.member.added',
    metadata: { teamId, teamName: team?.name, targetUserId: parsed.data.userId, targetEmail: targetUser?.email },
  });

  revalidateTag('users-teams');
  return NextResponse.json({ member }, { status: 201 });
}
