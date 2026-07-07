import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess, listFounderCustomers, updateCustomerStatus } from '@/services/founder';

export const dynamic = 'force-dynamic';

async function updateStatus(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerStatus(access, String(formData.get('customerId')), String(formData.get('status')));
  revalidatePath('/founder/customers');
}

export default async function FounderCustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params?.q?.trim();
  const access = await getFounderAccess();
  const result = await listFounderCustomers(query);

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customers</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer accounts</h2>
            <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
              Search, review, suspend, reactivate, and open customer operations profiles.
            </p>
          </div>
          <Link href="/founder/provision" className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">Provision customer</Link>
        </div>
        <form className="mt-6 flex max-w-xl gap-3">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search company, domain, or admin email"
            className="min-h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100"
          />
          <button className="rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700">Search</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Plan</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Seats</th>
                <th className="px-5 py-4">Integrations</th>
                <th className="px-5 py-4">Health</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.data.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-5 py-5">
                    <p className="font-black text-slate-950">{customer.companyName}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{customer.domain} · {customer.primaryAdminEmail}</p>
                  </td>
                  <td className="px-5 py-5 font-bold text-slate-600">{customer.planTier.replace('_', ' ')}</td>
                  <td className="px-5 py-5"><FounderBadge tone={customer.status === 'ACTIVE' ? 'green' : customer.status === 'SUSPENDED' ? 'red' : 'amber'}>{customer.status}</FounderBadge></td>
                  <td className="px-5 py-5 font-bold text-slate-700">{customer.seats}</td>
                  <td className="px-5 py-5 font-bold text-slate-700">{customer.integrationsConnected}</td>
                  <td className="px-5 py-5">
                    <p className="font-black text-slate-950">{customer.healthScore}/100</p>
                    <p className="text-xs font-bold text-slate-500">{customer.healthStatus.replace('_', ' ')}</p>
                  </td>
                  <td className="px-5 py-5">
                    <div className="flex justify-end gap-2">
                      <Link href={`/founder/customers/${customer.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Open</Link>
                      {access.ok && !access.readOnly ? (
                        <form action={updateStatus}>
                          <input type="hidden" name="customerId" value={customer.id} />
                          <input type="hidden" name="status" value={customer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'} />
                          <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">
                            {customer.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!result.data.length ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center font-semibold text-slate-500">
                    No customer accounts found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
