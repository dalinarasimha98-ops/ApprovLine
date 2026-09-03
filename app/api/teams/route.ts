import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { writeAuditLog } from '@/services/audit';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });

  const teams = await prisma.team.findMany({
    where: tenantScopedWhere({ organizationId: tenant.organization.id }),
    include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ teams });
}

const createTeamSchema = z.object({
  name: z.string().min(1).max(80),
  department: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN', 'MANAGER'])) {
    return NextResponse.json({ error: 'Insufficient permissions to create teams.' }, { status: 403 });
  }

  const parsed = createTeamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid team data.' }, { status: 400 });

  const orgId = tenant.organization.id;
  const { name, department } = parsed.data;

  const existing = await prisma.team.findUnique({ where: { organizationId_name: { organizationId: orgId, name } } });
  if (existing) return NextResponse.json({ error: 'A team with that name already exists.' }, { status: 409 });

  const team = await prisma.team.create({
    data: { organizationId: orgId, name, department },
  });

  await writeAuditLog({
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: 'team.created',
    metadata: { teamId: team.id, name, department },
  });

  revalidateTag('users-teams');
  return NextResponse.json({ team }, { status: 201 });
}
