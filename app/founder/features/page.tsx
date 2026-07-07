import { revalidatePath } from 'next/cache';
import { FounderBadge } from '@/components/founder/FounderShell';
import { founderFeatures, getFounderAccess, listCustomerAccountOptions, updateCustomerFeatureFlag } from '@/services/founder';

export const dynamic = 'force-dynamic';

async function updateFeature(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerFeatureFlag(access, formData);
  revalidatePath('/founder/features');
}

export default async function FounderFeaturesPage() {
  const access = await getFounderAccess();
  const customers = await listCustomerAccountOptions();
  const readOnly = !access.ok || access.readOnly;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Feature Catalog</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer feature gates</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Enable or disable founder-controlled modules without changing customer code or credentials.
            </p>
          </div>
          {readOnly ? <FounderBadge tone="amber">Read only</FounderBadge> : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {founderFeatures.map((feature) => (
          <form key={feature.key} action={updateFeature} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <FounderBadge tone="blue">{feature.category}</FounderBadge>
                <h3 className="mt-3 text-xl font-black text-slate-950">{feature.label}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{feature.description}</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
                Enabled
                <input name="enabled" type="checkbox" defaultChecked disabled={readOnly} className="h-4 w-4" />
              </label>
            </div>
            <div className="mt-5 flex gap-3">
              <input type="hidden" name="key" value={feature.key} />
              <select name="customerAccountId" required disabled={readOnly || !customers.length} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100">
                <option value="">Select customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} · {customer.domain}</option>)}
              </select>
              <button disabled={readOnly || !customers.length} className="rounded-xl bg-[#2557dc] px-4 py-2 text-sm font-black text-white disabled:bg-slate-300">Apply</button>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}
