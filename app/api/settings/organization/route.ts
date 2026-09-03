import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';
import { revalidateTag } from 'next/cache';
import { settingsCacheTag } from '@/services/settings';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyDomain: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  companySize: z.string().max(50).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  departments: z.array(z.string()).optional(),
  approvalCategories: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest) {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Organization unavailable' }, { status: 403 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const updates = parsed.data;
  const organizationId = tenant.organization.id;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.companyDomain !== undefined ? { companyDomain: updates.companyDomain } : {}),
      ...(updates.industry !== undefined ? { industry: updates.industry } : {}),
      ...(updates.companySize !== undefined ? { companySize: updates.companySize } : {}),
      ...(updates.country !== undefined ? { country: updates.country } : {}),
      ...(updates.departments !== undefined ? { departments: updates.departments } : {}),
      ...(updates.approvalCategories !== undefined ? { approvalCategories: updates.approvalCategories } : {}),
    },
  });

  await writeAuditLog({
    organizationId,
    actorUserId: tenant.user.id,
    action: 'settings.organization_updated',
    metadata: { updatedFields: Object.keys(updates) },
  });

  revalidateTag(settingsCacheTag(organizationId));

  return NextResponse.json({ ok: true });
}
