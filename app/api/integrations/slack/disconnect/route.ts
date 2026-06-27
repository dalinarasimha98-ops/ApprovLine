import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/services/audit';

export async function POST() {
  const tenant = await requireRole('ADMIN');
  const result = await prisma.integration.updateMany({
    where: {
      organizationId: tenant.organization.id,
      provider: 'SLACK',
      status: { not: 'DISCONNECTED' },
    },
    data: {
      status: 'DISCONNECTED',
      encryptedTokens: undefined,
      metadata: { disconnectedAt: new Date().toISOString() },
    },
  });

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'integration.slack.disconnected',
    metadata: { count: result.count },
  });

  return NextResponse.json({ ok: true, disconnected: result.count });
}
