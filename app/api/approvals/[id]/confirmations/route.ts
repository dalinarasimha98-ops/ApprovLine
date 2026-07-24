import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageManualApprovals, createConfirmationToken } from '@/services/manual-approvals';
import { deliverApprovalConfirmation } from '@/services/confirmation-delivery';

export const dynamic = 'force-dynamic';
const schema = z.object({ approverEmail: z.string().email(), expiresInDays: z.coerce.number().int().min(1).max(30).default(7) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(5000);
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: tenant.status === 'unauthenticated' ? 401 : 503 });
  if (!canManageManualApprovals(tenant.user.role)) return NextResponse.json({ error: 'Your role cannot request confirmation.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid approver email.' }, { status: 422 });
  const approval = await prisma.approvalRecord.findFirst({ where: { id, organizationId: tenant.organization.id }, include: { manualDetail: true } });
  if (!approval?.manualDetail) return NextResponse.json({ error: 'Manual approval not found.' }, { status: 404 });
  const { token, tokenHash } = createConfirmationToken();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000);
  const [confirmationRequest] = await prisma.$transaction([
    prisma.approvalConfirmationRequest.create({ data: { organizationId: tenant.organization.id, approvalRecordId: id, tokenHash, approverName: approval.approverName ?? 'Approver', approverEmail: parsed.data.approverEmail, requestedByUserId: tenant.user.id, expiresAt } }),
    prisma.auditLog.create({ data: { organizationId: tenant.organization.id, actorUserId: tenant.user.id, approvalRecordId: id, action: 'APPROVER_CONFIRMATION_REQUESTED', metadata: { approverEmail: parsed.data.approverEmail, expiresAt: expiresAt.toISOString() } } }),
  ]);
  const origin = process.env.APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
  const confirmationUrl = `${origin}/confirm-approval/${token}`;
  const deliveryResult = await deliverApprovalConfirmation({
    to: parsed.data.approverEmail,
    approverName: approval.approverName ?? 'Approver',
    subject: approval.subject,
    confirmationUrl,
    expiresAt,
    conditions: approval.conditions,
    approvalTimestamp: approval.approvalTimestamp,
    recorderName: tenant.user.name ?? tenant.user.email,
  });
  await prisma.auditLog.create({
    data: {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      approvalRecordId: id,
      action: deliveryResult.delivery === 'email'
        ? 'APPROVER_CONFIRMATION_DELIVERED'
        : 'APPROVER_CONFIRMATION_DELIVERY_FALLBACK',
      metadata: {
        confirmationRequestId: confirmationRequest.id,
        delivery: deliveryResult.delivery,
        providerMessageId: deliveryResult.providerMessageId ?? null,
        reason: deliveryResult.reason ?? null,
      },
    },
  });
  return NextResponse.json({ confirmationUrl, expiresAt, ...deliveryResult });
}
