import { getFounderAccess } from '@/services/founder';
import { buildIntegrationHealthPortfolio } from '@/services/founder-integration-health';
import { HEALTH_STATUS_FILTER_OPTIONS } from '@/lib/founder-integration-health';
import { IntegrationHealthClient } from '@/components/founder/IntegrationHealthClient';
import { getCustomerIntegrationDetail } from '../customer-integrations/actions';
import { MigrationNotice } from '@/components/founder/FounderShell';

export const dynamic = 'force-dynamic';

const VALID_HEALTH_STATES = new Set<string>(HEALTH_STATUS_FILTER_OPTIONS);

export default async function FounderIntegrationHealthPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; provider?: string; health?: string; page?: string }>;
}) {
  await getFounderAccess();
  const params = (await searchParams) ?? {};
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const healthStatus = VALID_HEALTH_STATES.has(params.health ?? '') && params.health !== 'HEALTHY' ? (params.health as 'ATTENTION' | 'CRITICAL') : undefined;

  const result = await buildIntegrationHealthPortfolio({
    query: params.q,
    providerSlug: params.provider,
    healthStatus,
    page,
    take: 20,
  });

  if (result.migrationRequired || result.safeError) {
    return <MigrationNotice message={result.safeError} />;
  }

  const data = result.data;

  return (
    <IntegrationHealthClient
      generatedAt={new Date().toISOString()}
      kpis={data.kpis}
      attentionRows={data.attentionRows}
      attentionPage={data.attentionPage}
      attentionTotalPages={data.attentionTotalPages}
      attentionTotalRows={data.attentionTotalRows}
      providerOverview={data.providerOverview}
      customerImpact={data.customerImpact}
      providerOptions={data.providerOptions}
      hasAnyIntegrationData={data.hasAnyIntegrationData}
      filters={{ q: params.q ?? '', provider: params.provider ?? '', health: params.health ?? '' }}
      onLoadDetail={getCustomerIntegrationDetail}
    />
  );
}
