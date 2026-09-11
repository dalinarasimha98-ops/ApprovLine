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

      {/* Legacy: Connector Access Gates — CustomerIntegrationStatus.accessEnabled
          is still consumed by Go-Live Readiness's Integrations gate and the
          Onboarding Pipeline, and this is the only Founder UI that manages it.
          Kept fully functional and visually distinct from the Provider
          Catalog above rather than removed or merged. */}
      <section>
        <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-black text-slate-950">Legacy: Connector Access Gates</h3>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Enable core connectors per customer. Customer admins must still complete OAuth and own all credentials.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {founderIntegrationCatalog.map((integration) => (
            <form key={integration.key} action={updateLegacyAccess} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-lg font-black text-[#2557dc]">{integration.label.slice(0, 1)}</div>
                  <h4 className="mt-4 text-xl font-black text-slate-950">{integration.label}</h4>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{integration.category}</p>
                </div>
                <FounderBadge tone="slate">Customer-owned</FounderBadge>
              </div>
              <div className="mt-5 flex gap-3">
                <input type="hidden" name="provider" value={integration.key} />
                <select name="customerAccountId" required disabled={readOnly || !customers.length} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100">
                  <option value="">Select customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
                </select>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm font-black text-slate-700">
                <input name="accessEnabled" type="checkbox" defaultChecked disabled={readOnly} className="h-4 w-4" />
                Enable access
              </label>
              <button disabled={readOnly || !customers.length} className="mt-4 w-full rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">Update access</button>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
