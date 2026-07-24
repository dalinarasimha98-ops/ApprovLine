import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageManualApprovals, ManualApprovalTransitionError, manualApprovalInputSchema, updateManualApproval } from '@/services/manual-approvals';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(5000);
  if (!tenant.organization) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: tenant.status === 'unauthenticated' ? 401 : 503 });
  const approval = await prisma.approvalRecord.findFirst({
    where: { id, organizationId: tenant.organization.id },
    include: { manualDetail: { include: { recorder: true, secondVerifier: true } }, manualVersions: { orderBy: { version: 'desc' }, take: 25 }, evidenceAssociations: { include: { messageSource: true }, orderBy: { sourceTimestamp: 'asc' } }, confirmationRequests: { orderBy: { createdAt: 'desc' } } },
  });
  return approval ? NextResponse.json({ approval }) : NextResponse.json({ error: 'Manual approval not found.' }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(5000);
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: tenant.status === 'unauthenticated' ? 401 : 503 });
  if (!canManageManualApprovals(tenant.user.role)) return NextResponse.json({ error: 'Your role cannot edit manual approvals.' }, { status: 403 });
  const parsed = manualApprovalInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Review the required approval fields.', issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  try {
    return NextResponse.json(await updateManualApproval({ organizationId: tenant.organization.id, actorUserId: tenant.user.id, approvalId: id, input: parsed.data }));
  } catch (error) {
    if (error instanceof ManualApprovalTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('[manual-approval] update failed', error);
    return NextResponse.json({ error: error instanceof Error && error.message.includes('not found') ? error.message : 'The approval could not be updated. Its previous version is unchanged.' }, { status: 500 });
  }
}
