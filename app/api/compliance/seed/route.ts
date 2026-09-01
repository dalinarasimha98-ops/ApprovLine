import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { seedComplianceFrameworks } from '@/services/compliance';

export const dynamic = 'force-dynamic';

export async function POST() {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await seedComplianceFrameworks(tenant.organization.id);
  return NextResponse.json({ ok: true });
}
