import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';
import { buildIntegrationCatalogPortfolio } from '@/services/founder-integrations';
import { IntegrationCatalogClient, type MutationResult } from '@/components/founder/IntegrationCatalogClient';
import type { ProviderLifecycle } from '@/lib/founder-integrations';
import { updateProviderStatus, updateRequestStatus, enableProviderForTenant, disableProviderForTenant } from './actions';
import type { MarketplaceProviderStatus, IntegrationRequestStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Every mutation below independently re-checks Founder access and read-only
// mode server-side (inside the ./actions.ts functions themselves) — the UI
// disables controls for a read-only Founder, but that is a convenience,
// never the actual gate.
async function updateProviderStatusAction(input: { providerSlug: string; status: ProviderLifecycle }): Promise<MutationResult> {
  'use server';
  const result = await updateProviderStatus(input.providerSlug, input.status as MarketplaceProviderStatus);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed to update provider status.' };
}

async function updateRequestStatusAction(input: { requestId: string; status: string; founderNotes?: string }): Promise<MutationResult> {
  'use server';
  const result = await updateRequestStatus(input.requestId, input.status as IntegrationRequestStatus, input.founderNotes);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed to update request status.' };
}

async function enableProviderAccessAction(input: { providerSlug: string; organizationId: string }): Promise<MutationResult> {
  'use server';
  const result = await enableProviderForTenant(input.providerSlug, input.organizationId);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed to grant access.' };
}

async function disableProviderAccessAction(input: { providerSlug: string; organizationId: string }): Promise<MutationResult> {
  'use server';
  const result = await disableProviderForTenant(input.providerSlug, input.organizationId);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed to revoke access.' };
}

export default async function FounderIntegrationsPage() {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;
  const canManage = access.ok && !access.readOnly;

  const portfolioResult = await buildIntegrationCatalogPortfolio();
  const data = portfolioResult.data;

  // grid grid-cols-1 (Tailwind's default minmax(0,1fr) track) + min-w-0
  // establishes the same bounded-intrinsic-width boundary Customer Health
  // already uses (components/founder/CustomerHealthClient.tsx's
  // grid-cols-[minmax(0,1fr)_360px] + min-w-0) — without it, a wide
  // min-w-[…px] table anywhere below can grow this page's <main> flex item
  // (the frozen components/founder/FounderNavClient.tsx, not edited here)
  // past the viewport, causing real page-level horizontal overflow instead
  // of the intended internal overflow-x-auto scroll on each table wrapper.
  return (
    <div className="grid min-w-0 grid-cols-1 gap-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Product Control</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Integration Catalog</h1>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Manage the ApprovLine integration registry, provider lifecycle, customer availability, capabilities, and integration requests.
            </p>
          </div>
          {readOnly ? <FounderBadge tone="amber">Read only</FounderBadge> : null}
        </div>

        {!portfolioResult.migrationRequired ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total Providers', value: data.totalProviders },
              { label: 'Available', value: data.availableCount, color: 'text-emerald-600' },
              { label: 'Native', value: data.nativeCount, color: 'text-blue-600' },
              { label: 'Beta', value: data.betaCount, color: 'text-amber-600' },
              { label: 'Customer Requests', value: data.requestCount, color: data.requestCount > 0 ? 'text-rose-600' : 'text-slate-600' },
              { label: 'Customers With Access', value: data.customersWithAccessCount },
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
        <IntegrationCatalogClient
          providers={data.providers}
          requests={data.requests}
          customers={data.customers}
          canManage={canManage}
          onUpdateProviderStatus={updateProviderStatusAction}
          onEnableProviderAccess={enableProviderAccessAction}
          onDisableProviderAccess={disableProviderAccessAction}
          onUpdateRequestStatus={updateRequestStatusAction}
        />
      )}
    </div>
  );
}
