import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Your workspace role cannot archive playbooks.' }, { status: 403 });
  }

  const { id } = await params;
  const document = await prisma.playbookDocument.findFirst({
    where: { id, organizationId: tenant.organization.id },
  });
  if (!document) return NextResponse.json({ error: 'Playbook not found.' }, { status: 404 });
  if (document.status === 'ARCHIVED') {
    return NextResponse.json({ error: 'Document is already archived.' }, { status: 400 });
  }

  const updated = await prisma.playbookDocument.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'playbook.document.archived',
    metadata: { documentId: id, documentName: document.name, versionNumber: document.versionNumber },
  });

  return NextResponse.json({ document: updated });
}
