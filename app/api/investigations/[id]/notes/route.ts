import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...ALLOWED_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { body?: string };
  const text = (body.body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Note body is required' }, { status: 400 });

  // Verify tenant ownership
  const investigation = await prisma.investigationCase.findFirst({
    where: { id, organizationId: tenant.organization.id },
    select: { id: true },
  });
  if (!investigation) return NextResponse.json({ error: 'Investigation not found' }, { status: 404 });

  const note = await prisma.investigationNote.create({
    data: {
      organizationId: tenant.organization.id,
      investigationId: id,
      authorUserId: tenant.user.id,
      body: text,
    },
    include: { authorUser: { select: { id: true, name: true, email: true } } },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'investigation.note_added',
      metadata: { investigationId: id, noteLength: text.length } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ note }, { status: 201 });
}
