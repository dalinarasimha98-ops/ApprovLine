import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });

  const { id } = await params;
  const document = await prisma.playbookDocument.findFirst({
    where: {
      id,
      organizationId: tenant.organization.id,
    },
  });
  if (!document) return NextResponse.json({ error: 'Playbook not found.' }, { status: 404 });

  await prisma.playbookDocument.delete({ where: { id: document.id } });
  await prisma.auditLog.create({
    data: {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user?.id,
      action: 'playbook.document.deleted',
      metadata: {
        documentId: document.id,
        name: document.name,
      },
    },
  });

  return NextResponse.json({ deleted: true });
}
