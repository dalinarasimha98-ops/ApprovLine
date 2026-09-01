import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { getComplianceControls, updateControlStatus } from '@/services/compliance';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'AUDITOR', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const frameworkId = req.nextUrl.searchParams.get('frameworkId') ?? undefined;
  const controls = await getComplianceControls(tenant.organization.id, frameworkId);
  return NextResponse.json({ controls });
}

const PatchSchema = z.object({
  controlId: z.string().min(1),
  status: z.enum(['EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE', 'NOT_ASSESSED']),
  effectiveness: z.number().min(0).max(100).optional(),
});

export async function PATCH(req: NextRequest) {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  await updateControlStatus(
    { organizationId: tenant.organization.id, userId: tenant.user.id },
    parsed.data.controlId,
    parsed.data.status,
    parsed.data.effectiveness,
  );

  return NextResponse.json({ ok: true });
}
