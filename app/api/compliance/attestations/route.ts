import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { getComplianceAttestations, completeAttestation } from '@/services/compliance';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'AUDITOR', 'OWNER', 'MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const attestations = await getComplianceAttestations(tenant.organization.id);
  return NextResponse.json({ attestations });
}

const CompleteSchema = z.object({
  attestationId: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  const tenant = await getDashboardTenant();
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER', 'MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = CompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  await completeAttestation(
    { organizationId: tenant.organization.id, userId: tenant.user.id },
    parsed.data.attestationId,
    parsed.data.notes,
  );

  return NextResponse.json({ ok: true });
}
