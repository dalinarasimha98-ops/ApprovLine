import { revalidatePath } from 'next/cache';
import { FounderBadge } from '@/components/founder/FounderShell';
import { founderIntegrationCatalog, getFounderAccess, listCustomerAccountOptions, updateCustomerIntegrationAccess } from '@/services/founder';

export const dynamic = 'force-dynamic';

async function updateAccess(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerIntegrationAccess(access, formData);
  revalidatePath('/founder/integrations');
}

export default async function FounderIntegrationsPage() {
  const access = await getFounderAccess();
  const customers = await listCustomerAccountOptions();
  const readOnly = !access.ok || access.readOnly;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Integration Access</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Connector readiness gates</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Founder admins can enable access to connectors. Customer admins must still complete OAuth and own every Slack, Gmail, Teams, Jira, ServiceNow, Zoom, or gateway credential.
            </p>
          </div>
          {readOnly ? <FounderBadge tone="amber">Read only</FounderBadge> : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {founderIntegrationCatalog.map((integration) => (
          <form key={integration.key} action={updateAccess} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-lg font-black text-[#2557dc]">{integration.label.slice(0, 1)}</div>
                <h3 className="mt-4 text-xl font-black text-slate-950">{integration.label}</h3>
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
      </section>
    </div>
  );
}
