import { revalidatePath } from 'next/cache';
import { FounderBadge } from '@/components/founder/FounderShell';
import {
  founderIntegrationCatalog,
  getFounderAccess,
  listCustomerAccountOptions,
  updateCustomerIntegrationAccess,
} from '@/services/founder';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { updateProviderStatusFromForm, updateRequestStatusFromForm } from './actions';

export const dynamic = 'force-dynamic';

async function updateAccess(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerIntegrationAccess(access, formData);
  revalidatePath('/founder/integrations');
}

const PROVIDER_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'BETA', label: 'Beta' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'COMING_SOON', label: 'Coming Soon' },
  { value: 'DEPRECATED', label: 'Deprecated' },
] as const;

const REQUEST_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_DEVELOPMENT', label: 'In Development' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

function statusBadgeClass(status: string) {
  switch (status) {
    case 'AVAILABLE': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'BETA': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'COMING_SOON': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'DEPRECATED': return 'border-slate-200 bg-slate-100 text-slate-500';
    case 'DRAFT': return 'border-slate-200 bg-slate-50 text-slate-400';
    case 'PENDING': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'UNDER_REVIEW': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'PLANNED': return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'IN_DEVELOPMENT': return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'REJECTED': return 'border-rose-200 bg-rose-50 text-rose-700';
    default: return 'border-slate-200 bg-slate-100 text-slate-500';
  }
}

export default async function FounderIntegrationsPage() {
  const access = await getFounderAccess();
  const customers = await listCustomerAccountOptions();
  const readOnly = !access.ok || access.readOnly;

  // Load marketplace data (with fallback for pre-migration environments)
  let marketplaceProviders: Array<{
    id: string;
    slug: string;
    displayName: string;
    category: string;
    status: string;
    isNative: boolean;
    requestCount: number;
    sortOrder: number;
  }> = [];
  let integrationRequests: Array<{
    id: string;
    providerName: string;
    providerSlug: string | null;
    category: string | null;
    priority: string;
    status: string;
    createdAt: Date;
    founderNotes: string | null;
    organization: { name: string; slug: string };
  }> = [];
  let marketplaceMigrationRequired = false;

  try {
    const [providers, requests] = await withTimeout(
      'founder-integrations-marketplace',
      Promise.all([
        prisma.marketplaceProvider.findMany({
          orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
        }),
        prisma.integrationRequest.findMany({
          orderBy: [{ createdAt: 'desc' }],
          take: 100,
          include: { organization: { select: { name: true, slug: true } } },
        }),
      ]),
      3000,
    );
    marketplaceProviders = providers;
    integrationRequests = requests;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('does not exist') || message.includes('relation') || message.includes('column')) {
      marketplaceMigrationRequired = true;
    } else {
      console.error('[founder-integrations] marketplace load failed', error);
    }
  }

  // KPI counts
  const totalProviders = marketplaceProviders.length;
  const availableCount = marketplaceProviders.filter((p) => p.status === 'AVAILABLE').length;
  const betaCount = marketplaceProviders.filter((p) => p.status === 'BETA').length;
  const comingSoonCount = marketplaceProviders.filter((p) => p.status === 'COMING_SOON').length;
  const pendingRequests = integrationRequests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-8">
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Marketplace</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Integration Marketplace</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Manage provider lifecycle statuses, review customer integration requests, and control tenant-level access gates.
              Customer credentials remain customer-owned — this controls what is visible and requestable.
            </p>
          </div>
          {readOnly ? <FounderBadge tone="amber">Read only</FounderBadge> : null}
        </div>

        {/* KPI strip */}
        {!marketplaceMigrationRequired ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Total Providers', value: totalProviders },
              { label: 'Available', value: availableCount, color: 'text-emerald-600' },
              { label: 'Beta', value: betaCount, color: 'text-amber-600' },
              { label: 'Coming Soon', value: comingSoonCount, color: 'text-blue-600' },
              { label: 'Pending Requests', value: pendingRequests, color: pendingRequests > 0 ? 'text-rose-600' : 'text-slate-600' },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                <p className={`text-2xl font-black ${kpi.color ?? 'text-slate-950'}`}>{kpi.value}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{kpi.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── Migration Notice ─────────────────────────────────────────────────── */}
      {marketplaceMigrationRequired ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="font-black text-amber-900">Database migration required</h3>
          <p className="mt-2 text-sm font-semibold text-amber-700">
            The Integration Marketplace tables (<code className="font-mono">MarketplaceProvider</code>,{' '}
            <code className="font-mono">TenantProviderAccess</code>,{' '}
            <code className="font-mono">IntegrationRequest</code>) have not been applied to the production database yet.
            Run <code className="font-mono">npm run db:deploy</code> with the production <code className="font-mono">DATABASE_URL</code> to apply migration{' '}
            <code className="font-mono">20260830000000_integration_marketplace</code>.
            Then seed the provider registry: <code className="font-mono">npx tsx prisma/seeds/integration-providers.ts</code>.
          </p>
        </section>
      ) : null}

      {/* ── Marketplace Provider Table ───────────────────────────────────────── */}
      {!marketplaceMigrationRequired && marketplaceProviders.length > 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-xl font-black text-slate-950">Provider Registry</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Provider</th>
                  <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Category</th>
                  <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Status</th>
                  <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Native</th>
                  <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Requests</th>
                  {!readOnly ? <th className="pb-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">Change Status</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {marketplaceProviders.map((provider) => (
                  <tr key={provider.id} className="group hover:bg-slate-50/50">
                    <td className="py-3 pr-4 font-black text-slate-950">{provider.displayName}</td>
                    <td className="py-3 pr-4 text-slate-600">{provider.category}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusBadgeClass(provider.status)}`}>
                        {provider.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-black ${provider.isNative ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {provider.isNative ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-sm font-black ${provider.requestCount > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                        {provider.requestCount}
                      </span>
                    </td>
                    {!readOnly ? (
                      <td className="py-3">
                        <form action={updateProviderStatusFromForm} className="flex items-center gap-2">
                          <input type="hidden" name="slug" value={provider.slug} />
                          <select
                            name="status"
                            defaultValue={provider.status}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                          >
                            {PROVIDER_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-lg bg-[#2557dc] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#1a44be]"
                          >
                            Save
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── Integration Request Queue ─────────────────────────────────────────── */}
      {!marketplaceMigrationRequired ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-950">Integration Requests</h3>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${pendingRequests > 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
              {pendingRequests} pending
            </span>
          </div>

          {integrationRequests.length === 0 ? (
            <p className="text-sm font-semibold text-slate-500">No integration requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Provider</th>
                    <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Customer</th>
                    <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Category</th>
                    <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Priority</th>
                    <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Status</th>
                    <th className="pb-3 pr-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">Requested</th>
                    {!readOnly ? <th className="pb-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">Update</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {integrationRequests.map((req) => (
                    <tr key={req.id} className="group hover:bg-slate-50/50">
                      <td className="py-3 pr-4 font-black text-slate-950">{req.providerName}</td>
                      <td className="py-3 pr-4 text-slate-600">{req.organization.name}</td>
                      <td className="py-3 pr-4 text-slate-500">{req.category ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-black ${req.priority === 'HIGH' ? 'text-rose-600' : req.priority === 'MEDIUM' ? 'text-amber-600' : 'text-slate-500'}`}>
                          {req.priority}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusBadgeClass(req.status)}`}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-500">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </td>
                      {!readOnly ? (
                        <td className="py-3">
                          <form action={updateRequestStatusFromForm} className="flex items-center gap-2">
                            <input type="hidden" name="requestId" value={req.id} />
                            <select
                              name="status"
                              defaultValue={req.status}
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                            >
                              {REQUEST_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-lg bg-[#2557dc] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#1a44be]"
                            >
                              Save
                            </button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ── Legacy: Connector Access Gates ─────────────────────────────────── */}
      <section>
        <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-black text-slate-950">Connector Access Gates</h3>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Enable connectors per customer. Customer admins must still complete OAuth and own all credentials.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {founderIntegrationCatalog.map((integration) => (
            <form key={integration.key} action={updateAccess} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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
