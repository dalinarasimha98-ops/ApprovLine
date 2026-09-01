import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { getComplianceFrameworks } from '@/services/compliance';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'AUDITOR', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const frameworks = await getComplianceFrameworks(tenant.organization.id);
  return NextResponse.json({ frameworks });
}
