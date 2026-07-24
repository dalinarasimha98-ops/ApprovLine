import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import { evidenceProviderCatalog } from '@/services/evidence/provider-catalog';
import { listRegisteredEvidenceProviders } from '@/services/evidence/provider-sdk';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await requireEvidenceAccess('read');
  if (!access.ok) return access.response;

  try {
    const [connections, health] = await Promise.all([
      prisma.evidenceProviderConnection.findMany({
        where: { organizationId: access.organization.id },
        select: {
          id: true,
          providerKey: true,
          displayName: true,
          category: true,
          status: true,
          authenticationType: true,
          scopes: true,
          connectedAt: true,
          disconnectedAt: true,
          lastSyncAt: true,
          updatedAt: true,
        },
      }),
      prisma.evidenceProviderHealth.findMany({
        where: { organizationId: access.organization.id },
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
    ]);
    const connectionByProvider = new Map(connections.map((item) => [item.providerKey, item]));
    const healthByProvider = new Map(health.map((item) => [item.providerKey, item]));
    const registered = new Set(listRegisteredEvidenceProviders().map((item) => item.key));

    return NextResponse.json({
      providers: evidenceProviderCatalog.map((manifest) => ({
        ...manifest,
        sdkRegistered: registered.has(manifest.key),
        connection: connectionByProvider.get(manifest.key) ?? null,
        health: healthByProvider.get(manifest.key) ?? null,
      })),
    });
  } catch (error) {
    console.error('[evidence-api] provider catalog failed', error);
    return NextResponse.json(
      { error: 'Evidence provider status could not be loaded.' },
      { status: 500 },
    );
  }
}
