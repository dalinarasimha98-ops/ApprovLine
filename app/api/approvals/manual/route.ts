import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { canManageManualApprovals, createManualApproval, ManualApprovalTransitionError, manualApprovalInputSchema } from '@/services/manual-approvals';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(5000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: 503 });
  if (!canManageManualApprovals(tenant.user.role)) return NextResponse.json({ error: 'Your role cannot record manual approvals.' }, { status: 403 });

  const parsed = manualApprovalInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Review the required approval fields.', issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  try {
    const approval = await createManualApproval({ organizationId: tenant.organization.id, actorUserId: tenant.user.id, input: parsed.data });
    return NextResponse.json({ approvalId: approval.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ManualApprovalTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('[manual-approval] create failed', error);
    return NextResponse.json({ error: 'The manual approval could not be recorded. No partial record was saved.' }, { status: 500 });
  }
}
