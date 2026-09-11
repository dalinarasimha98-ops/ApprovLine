import { revalidatePath } from 'next/cache';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import {
  founderIntegrationCatalog,
  getFounderAccess,
  listCustomerAccountOptions,
  updateCustomerIntegrationAccess,
} from '@/services/founder';
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

async function updateLegacyAccess(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerIntegrationAccess(access, formData);
  revalidatePath('/founder/integrations');
}

export default async function FounderIntegrationsPage() {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;
  const canManage = access.ok && !access.readOnly;

  const [portfolioResult, customers] = await Promise.all([
    buildIntegrationCatalogPortfolio(),
    listCustomerAccountOptions(),
  ]);
  const data = portfolioResult.data;

  return (
    <div className="space-y-8">
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

      {/* Go-Live Readiness Legacy Access (compatibility) — NOT a second
          provider catalog. CustomerIntegrationStatus.accessEnabled predates
          MarketplaceProvider/TenantProviderAccess and is still the field
          Go-Live Readiness's Integrations gate (services/founder-go-live-readiness.ts)
          and Provision Customer's initial setup step read — this is the only
          Founder UI that writes it. TenantProviderAccess (managed in the
          Provider Catalog's drawer above) is the canonical, forward-looking
          model for "is this provider available to this customer" across the
          full MarketplaceProvider registry; this section is a narrower,
          8-key compatibility shim kept only because those two other locked
          modules still depend on it. Collapsed by default and rendered as a
          compact table (never provider cards) so it can never again be
          mistaken for a second, competing provider catalog. */}
      <details className="group rounded-3xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-950">Go-Live Readiness Legacy Access (compatibility)</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Not the provider catalog above. Controls a legacy per-customer access flag still read by the Go-Live Readiness Integrations gate and Provision Customer — kept only for that compatibility, and separate from Provider Catalog availability (TenantProviderAccess) managed via each provider&apos;s detail drawer.
              </p>
            </div>
            <FounderBadge tone="slate">Legacy · click to expand</FounderBadge>
          </div>
        </summary>
        <div className="border-t border-slate-100 p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">Connector</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Customer</th>
                  <th className="pb-3 pr-4">Access</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {founderIntegrationCatalog.map((integration) => (
                  <tr key={integration.key}>
                    <td className="py-3 pr-4 font-black text-slate-950">{integration.label}</td>
                    <td className="py-3 pr-4 text-slate-500">{integration.category}</td>
                    <td className="py-3 pr-4">
                      <form id={`legacy-${integration.key}`} action={updateLegacyAccess} className="contents">
                        <input type="hidden" name="provider" value={integration.key} />
                        <select
                          name="customerAccountId"
                          form={`legacy-${integration.key}`}
                          required
                          disabled={readOnly || !customers.length}
                          className="h-9 w-48 rounded-lg border border-slate-200 px-2 text-xs font-bold outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Select customer</option>
                          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
                        </select>
                      </form>
                    </td>
                    <td className="py-3 pr-4">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <input form={`legacy-${integration.key}`} name="accessEnabled" type="checkbox" defaultChecked disabled={readOnly} className="h-4 w-4" />
                        Enabled
                      </label>
                    </td>
                    <td className="py-3">
                      <button form={`legacy-${integration.key}`} disabled={readOnly || !customers.length} className="rounded-lg bg-[#2557dc] px-3 py-1.5 text-xs font-black text-white disabled:bg-slate-300">
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
