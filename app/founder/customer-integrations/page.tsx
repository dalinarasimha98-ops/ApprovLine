import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';
import { buildCustomerIntegrationsPortfolio } from '@/services/founder-customer-integrations';
import { CustomerIntegrationsClient, type MutationResult } from '@/components/founder/CustomerIntegrationsClient';
import type { CustomerIntegrationConnectionState, CustomerIntegrationHealthState } from '@/lib/founder-customer-integrations';
import { enableProviderForTenant, disableProviderForTenant } from '../integrations/actions';
import { triggerIntegrationSync, getCustomerIntegrationDetail } from './actions';

export const dynamic = 'force-dynamic';

async function enableAccessAction(input: { providerSlug: string; organizationId: string }): Promise<MutationResult> {
  'use server';
  const result = await enableProviderForTenant(input.providerSlug, input.organizationId);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed to grant access.' };
}

async function disableAccessAction(input: { providerSlug: string; organizationId: string }): Promise<MutationResult> {
  'use server';
  const result = await disableProviderForTenant(input.providerSlug, input.organizationId);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed to revoke access.' };
}

async function triggerSyncAction(input: { integrationId: string }): Promise<MutationResult> {
  'use server';
  const result = await triggerIntegrationSync(input.integrationId);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed to trigger sync.' };
}

export default async function FounderCustomerIntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; provider?: string; connection?: string; health?: string; page?: string }>;
}) {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;
  const canManage = access.ok && !access.readOnly;
  const params = (await searchParams) ?? {};
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const portfolioResult = await buildCustomerIntegrationsPortfolio({
    query: params.q,
    providerSlug: params.provider,
    connectionStatus: params.connection as CustomerIntegrationConnectionState | undefined,
    healthStatus: params.health as CustomerIntegrationHealthState | undefined,
    page,
    take: 20,
  });
  const data = portfolioResult.data;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customer Operations</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer Integrations</h1>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Monitor customer integration connections, sync status, evidence ingestion, and overall health across all customers.
            </p>
          </div>
          {readOnly ? <FounderBadge tone="amber">Read only</FounderBadge> : null}
        </div>

        {!portfolioResult.migrationRequired ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Connected Integrations', value: data.kpis.connectedIntegrations },
              { label: 'Healthy', value: data.kpis.healthy, color: 'text-emerald-600' },
              { label: 'Needs Attention', value: data.kpis.needsAttention, color: data.kpis.needsAttention > 0 ? 'text-amber-600' : 'text-slate-600' },
              { label: 'Failed', value: data.kpis.failed, color: data.kpis.failed > 0 ? 'text-rose-600' : 'text-slate-600' },
              { label: 'Pending Connections', value: data.kpis.pendingConnections, color: 'text-blue-600' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                <p className={`text-2xl font-black ${kpi.color ?? 'text-slate-950'}`}>{kpi.value}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{kpi.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {portfolioResult.migrationRequired ? (
        <MigrationNotice message={portfolioResult.safeError} />
      ) : (
        <CustomerIntegrationsClient
          rows={data.rows}
          providerOptions={data.providerOptions}
          page={data.page}
          totalPages={data.totalPages}
          totalCustomers={data.totalCustomers}
          hasAnyCustomerIntegrations={data.hasAnyCustomerIntegrations}
          filters={{ q: params.q ?? '', provider: params.provider ?? '', connection: params.connection ?? '', health: params.health ?? '' }}
          canManage={canManage}
          onEnableAccess={enableAccessAction}
          onDisableAccess={disableAccessAction}
          onTriggerSync={triggerSyncAction}
          onLoadDetail={getCustomerIntegrationDetail}
        />
      )}
    </div>
  );
}
