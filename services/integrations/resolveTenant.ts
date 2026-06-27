import { prisma } from '@/lib/prisma';
import type { IntegrationProvider } from '@prisma/client';

export async function resolveIntegrationTenant(provider: IntegrationProvider, externalAccount?: string | null) {
  const integration = await prisma.integration.findFirst({
    where: {
      provider,
      ...(externalAccount ? { externalAccount } : {}),
      status: 'CONNECTED',
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!integration) {
    throw new Error(`No connected ${provider} integration found`);
  }

  return integration;
}
