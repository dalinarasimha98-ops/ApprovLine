import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { tenantScopedWhere, assertTenantAccess } from '@/lib/tenant-isolation';
import { writeAuditLog } from '@/services/audit';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; userId: string }> },
) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN', 'MANAGER'])) {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const { teamId, userId } = await params;
  const orgId = tenant.organization.id;

  const team = await prisma.team.findFirst({ where: tenantScopedWhere({ organizationId: orgId }, { id: teamId }) });
  assertTenantAccess({ organizationId: orgId }, team, 'team');

  const targetUser = await prisma.user.findFirst({ where: tenantScopedWhere({ organizationId: orgId }, { id: userId }) });
  assertTenantAccess({ organizationId: orgId }, targetUser, 'user');

  await prisma.teamMember.deleteMany({ where: { teamId, userId } });

  await writeAuditLog({
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: 'team.member.removed',
    metadata: { teamId, teamName: team?.name, targetUserId: userId, targetEmail: targetUser?.email },
  });

  revalidateTag('users-teams');
  return NextResponse.json({ ok: true });
}
