import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Only admins can cancel invitations.' }, { status: 403 });
  }

  const { email } = await params;
  const decodedEmail = decodeURIComponent(email);
  const orgId = tenant.organization.id;

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { invitedTeamMembers: true } });
  const invites = Array.isArray(org?.invitedTeamMembers)
    ? (org.invitedTeamMembers as unknown as { email: string }[])
    : [];

  const filtered = invites.filter((i) => i.email.toLowerCase() !== decodedEmail.toLowerCase());

  await prisma.organization.update({
    where: { id: orgId },
    data: { invitedTeamMembers: filtered as unknown as Prisma.InputJsonValue },
  });

  await writeAuditLog({
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: 'user.invite_cancelled',
    metadata: { email: decodedEmail },
  });

  revalidateTag('users-teams');
  return NextResponse.json({ ok: true });
}
