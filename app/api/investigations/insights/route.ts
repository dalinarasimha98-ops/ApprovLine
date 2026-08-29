import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { getInvestigationInsights } from '@/services/investigations';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

export async function GET() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...ALLOWED_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const insights = await withTimeout(
    'investigation insights',
    getInvestigationInsights(tenant.organization.id),
    2000,
  ).catch(() => null);

  if (!insights) return NextResponse.json({ error: 'Insights unavailable' }, { status: 503 });

  return NextResponse.json(insights);
}
