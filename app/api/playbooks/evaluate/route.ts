import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { evaluateApprovalCompliance, evaluateRecentApprovals } from '@/services/playbooks';
import { hasAnyRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Your workspace role cannot trigger compliance evaluation.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { approvalId?: string; limit?: number };
  if (body.approvalId) {
    const evaluation = await evaluateApprovalCompliance(tenant.organization.id, body.approvalId);
    return NextResponse.json({ evaluation });
  }

  const evaluations = await evaluateRecentApprovals(tenant.organization.id, Math.min(100, Math.max(1, Number(body.limit ?? 50))));
  return NextResponse.json({ evaluated: evaluations.length });
}
