import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageManualApprovals } from '@/services/manual-approvals';

export const dynamic = 'force-dynamic';
const schema = z.object({ status: z.enum(['CONFIRMED', 'REJECTED']), reason: z.string().trim().max(1000).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; associationId: string }> }) {
  const { id, associationId } = await params;
  const tenant = await getDashboardTenant(5000);
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: tenant.status === 'unauthenticated' ? 401 : 503 });
  if (!canManageManualApprovals(tenant.user.role)) return NextResponse.json({ error: 'Your role cannot verify evidence.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Select confirm or reject.' }, { status: 422 });
  const association = await prisma.approvalEvidenceAssociation.findFirst({ where: { id: associationId, approvalRecordId: id, organizationId: tenant.organization.id } });
  if (!association) return NextResponse.json({ error: 'Evidence association not found.' }, { status: 404 });
  const confirmed = parsed.data.status === 'CONFIRMED';
  await prisma.$transaction([
    prisma.approvalEvidenceAssociation.update({ where: { id: association.id }, data: confirmed ? { status: 'CONFIRMED', origin: 'HUMAN_VERIFIED', verifiedByUserId: tenant.user.id, verifiedAt: new Date(), rejectedByUserId: null, rejectedAt: null, rejectionReason: null } : { status: 'REJECTED', rejectedByUserId: tenant.user.id, rejectedAt: new Date(), rejectionReason: parsed.data.reason || 'Not related to this approval.', verifiedByUserId: null, verifiedAt: null } }),
    prisma.auditLog.create({ data: { organizationId: tenant.organization.id, actorUserId: tenant.user.id, approvalRecordId: id, action: confirmed ? 'MANUAL_EVIDENCE_CONFIRMED' : 'MANUAL_EVIDENCE_REJECTED', metadata: { associationId, messageSourceId: association.messageSourceId, reason: parsed.data.reason ?? null } } }),
  ]);
  return NextResponse.json({ status: parsed.data.status });
}
