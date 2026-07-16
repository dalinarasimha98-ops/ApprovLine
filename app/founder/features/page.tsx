import { revalidatePath } from 'next/cache';
import { FounderBadge } from '@/components/founder/FounderShell';
import { founderFeatures, getFounderAccess, listCustomerAccountOptions, updateCustomerFeatureFlag } from '@/services/founder';

export const dynamic = 'force-dynamic';

function categoryTone(category: string): 'blue' | 'green' | 'amber' | 'slate' {
  if (category === 'AI') return 'blue';
  if (category === 'Compliance') return 'green';
  if (category === 'Analytics' || category === 'Customer Success') return 'amber';
  return 'slate';
}

function featureInitial(label: string) {
  return label
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

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
  const categories = Array.from(new Set(founderFeatures.map((feature) => feature.category)));

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-sm">
        <div className="relative p-6 text-white lg:p-8">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#2557dc]/30 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-24 w-24 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-200">Feature Catalog</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Customer feature gates</h2>
              <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-slate-300">
                Control which ApprovLine modules are available for each customer workspace, without changing customer code,
                credentials, or production deployments.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FounderBadge tone={readOnly ? 'amber' : 'green'}>{readOnly ? 'Read only' : 'Founder editable'}</FounderBadge>
              <FounderBadge tone="blue">{customers.length} customers</FounderBadge>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Feature gates', value: founderFeatures.length, detail: 'Founder-controlled modules' },
          { label: 'Categories', value: categories.length, detail: 'Workspace, AI, analytics, and success' },
          { label: 'Customer accounts', value: customers.length, detail: customers.length ? 'Ready for gating' : 'Provision customers first' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{metric.value}</p>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-600">{metric.detail}</p>
          </div>
        ))}
      </section>

      {!customers.length ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">No customers yet</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Provision a customer before applying feature gates</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-amber-900">
            Feature cards are visible, but Apply is disabled until at least one customer account exists in Founder Control Center.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Gate workflow</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Apply capabilities per customer</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              Select a customer, choose whether the module is enabled, then apply the gate.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {['Select a customer workspace', 'Review the feature capability', 'Apply the gate and audit it'].map((step, index) => (
            <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2557dc] text-sm font-black text-white">
                {index + 1}
              </div>
              <p className="mt-3 text-sm font-black text-slate-950">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {founderFeatures.map((feature) => (
          <form
            key={feature.key}
            action={updateFeature}
            className="flex min-h-[320px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-[#2557dc]">
                  {featureInitial(feature.label)}
                </div>
                <div>
                  <FounderBadge tone={categoryTone(feature.category)}>{feature.category}</FounderBadge>
                  <h3 className="mt-3 text-xl font-black text-slate-950">{feature.label}</h3>
                </div>
              </div>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-600">
                <input name="enabled" type="checkbox" defaultChecked disabled={readOnly} className="peer sr-only" />
                <span className="relative h-6 w-11 rounded-full bg-slate-200 transition after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-[#2557dc] peer-checked:after:translate-x-5 peer-disabled:opacity-60" />
                Enabled
              </label>
            </div>

            <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">{feature.description}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Scope</p>
                <p className="mt-1 text-sm font-black text-slate-950">Customer level</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Control</p>
                <p className="mt-1 text-sm font-black text-slate-950">Founder managed</p>
              </div>
            </div>

            <div className="mt-auto pt-5">
              <input type="hidden" name="key" value={feature.key} />
              <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Customer account</label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <select
                  name="customerAccountId"
                  required
                  disabled={readOnly || !customers.length}
                  className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName} · {customer.domain}
                    </option>
                  ))}
                </select>
                <button
                  disabled={readOnly || !customers.length}
                  className="min-h-11 rounded-xl bg-[#2557dc] px-5 py-2 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  Apply
                </button>
              </div>
            </div>
          </form>
        ))}
      </section>
    </div>
  );
}
