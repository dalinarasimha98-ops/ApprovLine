import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess, updateCustomerSeats } from '@/services/founder';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function updateSeats(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerSeats(access, formData).catch((error) => {
    console.error('[founder-billing] seat update failed', error);
  });
  revalidatePath('/founder/billing');
}

type BillingRow = {
  id: string;
  companyName: string;
  domain: string;
  status: string;
  planTier: string;
  createdAt: Date;
  seatAllocation: { purchasedSeats: number; usedSeats: number; allocatedSeats: number } | null;
};

function planTone(tier: string): 'green' | 'blue' | 'amber' | 'slate' {
  if (tier === 'ENTERPRISE') return 'green';
  if (tier === 'GROWTH') return 'blue';
  if (tier === 'STARTER') return 'amber';
  return 'slate';
}

function statusTone(status: string): 'green' | 'blue' | 'amber' | 'red' | 'slate' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'TRIAL') return 'blue';
  if (status === 'SUSPENDED') return 'red';
  return 'slate';
}

export default async function FounderBillingPage() {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;

  let customers: BillingRow[] = [];
  let migrationRequired = false;
  let safeError: string | undefined;
  let totalSeats = 0;
  let usedSeats = 0;
  let enterpriseCount = 0;
  let activeCount = 0;

  try {
    [customers, enterpriseCount, activeCount] = await Promise.all([
      prisma.customerAccount.findMany({
        orderBy: { createdAt: 'desc' },
        include: { seatAllocation: true },
      }) as Promise<BillingRow[]>,
      prisma.customerAccount.count({ where: { planTier: 'ENTERPRISE' } }),
      prisma.customerAccount.count({ where: { status: 'ACTIVE' } }),
    ]);
    totalSeats = customers.reduce((sum, c) => sum + (c.seatAllocation?.purchasedSeats ?? 0), 0);
    usedSeats = customers.reduce((sum, c) => sum + (c.seatAllocation?.usedSeats ?? 0), 0);
  } catch (error) {
    migrationRequired = true;
    safeError = (error instanceof Error ? error.message : String(error)).slice(0, 220);
  }

  return (
    <div className="space-y-6">
      {migrationRequired ? <MigrationNotice message={safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Plans & Billing</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Seat allocation and plans</h2>
          <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
            Manage purchased seat counts and plan tiers. Revenue collection happens outside this console — this controls access only.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <FounderMetricCard label="Total accounts" value={customers.length} detail={`${activeCount} active`} />
        <FounderMetricCard label="Enterprise" value={enterpriseCount} detail="Enterprise plan customers" />
        <FounderMetricCard label="Total seats" value={totalSeats} detail="Purchased across all customers" />
        <FounderMetricCard label="Used seats" value={usedSeats} detail={`${totalSeats ? Math.round((usedSeats / totalSeats) * 100) : 0}% utilization`} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">All accounts</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Plan and seat summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Purchased</th>
                <th className="px-5 py-3">Used</th>
                <th className="px-5 py-3">Available</th>
                <th className="px-5 py-3">Provisioned</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length ? (
                customers.map((customer) => {
                  const purchased = customer.seatAllocation?.purchasedSeats ?? 0;
                  const used = customer.seatAllocation?.usedSeats ?? 0;
                  const available = Math.max(0, purchased - used);
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-950">{customer.companyName}</p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">{customer.domain}</p>
                      </td>
                      <td className="px-5 py-4">
                        <FounderBadge tone={planTone(customer.planTier)}>{customer.planTier.replace('_', ' ')}</FounderBadge>
                      </td>
                      <td className="px-5 py-4">
                        <FounderBadge tone={statusTone(customer.status)}>{customer.status}</FounderBadge>
                      </td>
                      <td className="px-5 py-4 font-black text-slate-950">{purchased}</td>
                      <td className="px-5 py-4 font-bold text-slate-700">{used}</td>
                      <td className="px-5 py-4">
                        <span className={`font-bold ${available === 0 ? 'text-rose-600' : 'text-slate-700'}`}>{available}</span>
                      </td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-500">
                        {customer.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link href={`/founder/customers/${customer.id}`} className="font-black text-[#2557dc] hover:text-blue-700 text-sm">
                            Open →
                          </Link>
                          {!readOnly ? (
                            <form action={updateSeats} className="flex gap-1">
                              <input type="hidden" name="customerAccountId" value={customer.id} />
                              <input
                                type="number"
                                name="purchasedSeats"
                                defaultValue={purchased}
                                min={1}
                                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold outline-none focus:border-[#2557dc]"
                              />
                              <button className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-black text-slate-700 hover:bg-slate-50">
                                Save
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <p className="font-black text-slate-950">No customer accounts yet</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      <Link href="/founder/provision" className="text-[#2557dc]">Provision a customer</Link> to see their plan and seat allocation.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
