import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { tenantScopedWhere, assertTenantAccess } from '@/lib/tenant-isolation';
import { writeAuditLog } from '@/services/audit';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const updateTeamSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  department: z.string().max(80).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN', 'MANAGER'])) {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  const parsed = updateTeamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data.' }, { status: 400 });

  const { teamId } = await params;
  const orgId = tenant.organization.id;

  const team = await prisma.team.findFirst({ where: tenantScopedWhere({ organizationId: orgId }, { id: teamId }) });
  assertTenantAccess({ organizationId: orgId }, team, 'team');

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: parsed.data,
  });

  await writeAuditLog({
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: 'team.updated',
    metadata: { teamId, ...parsed.data },
  });

  revalidateTag('users-teams');
  return NextResponse.json({ team: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Only admins can delete teams.' }, { status: 403 });
  }

  const { teamId } = await params;
  const orgId = tenant.organization.id;

  const team = await prisma.team.findFirst({ where: tenantScopedWhere({ organizationId: orgId }, { id: teamId }) });
  assertTenantAccess({ organizationId: orgId }, team, 'team');

  await prisma.team.delete({ where: { id: teamId } });

  await writeAuditLog({
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: 'team.deleted',
    metadata: { teamId, name: team?.name },
  });

  revalidateTag('users-teams');
  return NextResponse.json({ ok: true });
}
