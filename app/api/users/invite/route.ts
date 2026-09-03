import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'AUDITOR', 'VIEWER']),
});

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) {
    return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  }
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Only admins can invite members.' }, { status: 403 });
  }

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invite data.', issues: parsed.error.issues }, { status: 400 });
  }

  const { email, name, role } = parsed.data;
  const orgId = tenant.organization.id;

  const existing = await prisma.user.findFirst({ where: { email, organizationId: orgId } });
  if (existing) {
    return NextResponse.json({ error: 'A user with that email is already a member of this workspace.' }, { status: 409 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { invitedTeamMembers: true },
  });

  const invites: { email: string; name: string; role: string; invitedAt: string; invitedByName: string }[] =
    Array.isArray(org?.invitedTeamMembers) ? (org.invitedTeamMembers as unknown as { email: string; name: string; role: string; invitedAt: string; invitedByName: string }[]) : [];

  const alreadyInvited = invites.some((i) => i.email.toLowerCase() === email.toLowerCase());
  if (alreadyInvited) {
    return NextResponse.json({ error: 'This email already has a pending invitation.' }, { status: 409 });
  }

  const newInvite = {
    email,
    name,
    role,
    invitedAt: new Date().toISOString(),
    invitedByName: tenant.user.name ?? tenant.user.email,
  };

  await prisma.organization.update({
    where: { id: orgId },
    data: { invitedTeamMembers: [...invites, newInvite] as unknown as Prisma.InputJsonValue },
  });

  await writeAuditLog({
    organizationId: orgId,
    actorUserId: tenant.user.id,
    action: 'user.invited',
    metadata: { email, name, role },
  });

  revalidateTag('users-teams');

  return NextResponse.json({ ok: true, invite: newInvite });
}
