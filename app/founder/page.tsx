import Link from 'next/link';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { buildFounderOverview } from '@/services/founder';

export const dynamic = 'force-dynamic';

export default async function FounderHomePage() {
  const overview = await buildFounderOverview();
  const data = overview.data;

  return (
    <div className="space-y-6">
      {overview.migrationRequired ? <MigrationNotice message={overview.safeError} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Founder Command Center</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer operations at a glance</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Monitor accounts, provision workspaces, gate features, and review founder-side audit trails without touching customer-owned integration secrets.
            </p>
          </div>
          <Link href="/founder/provision" className="inline-flex rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#1744bb]">
            Provision customer
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FounderMetricCard label="Customers" value={data.customers} detail={`${data.activeCustomers} active accounts`} />
        <FounderMetricCard label="Trials" value={data.trials} detail="Workspaces currently validating ApprovLine" />
        <FounderMetricCard label="At risk" value={data.atRisk} detail="Customer health needs founder attention" />
        <FounderMetricCard label="Approvals captured" value={data.approvals} detail="Across all customer workspaces" />
        <FounderMetricCard label="Connected integrations" value={data.integrationsConnected} detail="Customer-owned OAuth connections" />
        <FounderMetricCard label="Playbooks" value={data.playbooks} detail="Uploaded policy intelligence documents" />
        <FounderMetricCard label="Investigations" value={data.investigations} detail="Compliance and audit cases created" />
        <FounderMetricCard label="Readiness" value={overview.migrationRequired ? 'Fallback' : 'Live'} detail="Founder operations storage mode" />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Recent customers</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Latest provisioned accounts</h3>
          </div>
          <Link href="/founder/customers" className="text-sm font-black text-[#2557dc]">View all</Link>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data.recentCustomers.length ? data.recentCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-4 py-4">
                    <p className="font-black text-slate-950">{customer.companyName}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{customer.domain}</p>
                  </td>
                  <td className="px-4 py-4 font-bold text-slate-600">{customer.planTier.replace('_', ' ')}</td>
                  <td className="px-4 py-4"><FounderBadge tone={customer.status === 'ACTIVE' ? 'green' : 'amber'}>{customer.status}</FounderBadge></td>
                  <td className="px-4 py-4 font-black text-slate-950">{customer.score}/100</td>
                  <td className="px-4 py-4 text-right"><Link className="font-black text-[#2557dc]" href={`/founder/customers/${customer.id}`}>Open</Link></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-semibold text-slate-500">
                    No dedicated customer accounts yet. Provision your first beta customer to populate this table.
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
