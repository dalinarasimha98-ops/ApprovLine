import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { getComplianceTrend } from '@/services/compliance';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'AUDITOR', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10);
  const clampedDays = Math.min(Math.max(days, 7), 365);
  const points = await getComplianceTrend(tenant.organization.id, clampedDays);
  return NextResponse.json({ points });
}
