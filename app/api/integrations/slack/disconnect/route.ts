import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/services/audit';
import { isPilotMigrationRequired, logPilotActivity } from '@/services/pilot';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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
  try {
    await logPilotActivity({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'pilot.integration.disconnect_confirmed',
      entityType: 'Integration',
      metadata: { provider: 'SLACK', count: result.count },
    });
  } catch (error) {
    if (!isPilotMigrationRequired(error)) throw error;
  }

  // 303, not a bare redirect() (defaults to 307): triggered by a plain HTML
  // form POST ("Disconnect" on /dashboard/settings/integrations) - 307
  // would make the browser replay POST against a GET-only page route and
  // 405.
  return NextResponse.redirect(new URL('/dashboard/settings/integrations?slack=disconnected', request.url), { status: 303 });
}
