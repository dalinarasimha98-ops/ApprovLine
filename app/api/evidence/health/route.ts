import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import { isEvidenceStorageUnavailable } from '@/services/evidence/pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const access = await requireEvidenceAccess('read');
  if (!access.ok) return access.response;

  try {
    const organizationId = access.organization.id;
    const [providers, eventStatuses, unresolvedFailures, recentFailures] = await Promise.all([
      prisma.evidenceProviderHealth.findMany({
        where: { organizationId },
        orderBy: { checkedAt: 'desc' },
        select: {
          providerKey: true,
          status: true,
          authenticationStatus: true,
          credentialExpiresAt: true,
          rateLimitRemaining: true,
          latencyMs: true,
          webhookStatus: true,
          syncStatus: true,
          lastEventAt: true,
          lastSuccessfulSyncAt: true,
          consecutiveFailures: true,
          nextRetryAt: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          checkedAt: true,
        },
      }),
      prisma.canonicalEvidenceEvent.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      prisma.evidenceProcessingFailure.count({
        where: { organizationId, resolvedAt: null },
      }),
      prisma.evidenceProcessingFailure.findMany({
        where: { organizationId, resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          eventId: true,
          providerKey: true,
          stage: true,
          attemptNumber: true,
          retryable: true,
          reason: true,
          errorCode: true,
          correlationId: true,
          nextRetryAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      healthy: providers.every((provider) => !['ERROR', 'REAUTH_REQUIRED'].includes(provider.status)),
      providers,
      events: Object.fromEntries(eventStatuses.map((row) => [row.status, row._count._all])),
      failures: { unresolved: unresolvedFailures, recent: recentFailures },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        healthy: false,
        error: isEvidenceStorageUnavailable(error)
          ? 'Evidence storage is not ready. Apply the universal evidence platform migration.'
          : 'Evidence health could not be loaded.',
      },
      { status: 503 },
    );
  }
}
