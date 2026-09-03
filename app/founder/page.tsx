import { auth, currentUser } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { isFounderIdentity } from '@/lib/founder-identity';
import { buildFounderOverview } from '@/services/founder';

export const dynamic = 'force-dynamic';

function statusTone(status: string): 'green' | 'blue' | 'amber' | 'red' | 'slate' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'TRIAL') return 'blue';
  if (status === 'SUSPENDED') return 'red';
  if (status === 'CHURNED') return 'slate';
  return 'slate';
}

function healthTone(score: number): 'green' | 'amber' | 'red' | 'slate' {
  if (score >= 75) return 'green';
  if (score >= 45) return 'amber';
  return 'red';
}

export default async function FounderHomePage() {
  // Triple-checked: middleware + layout + page
  const session = await auth();
  if (!session.userId) redirect('/dashboard');
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? null;
  if (!isFounderIdentity(session.userId, email)) redirect('/dashboard');

  const overview = await buildFounderOverview();
  const data = overview.data;

  return (
    <div className="space-y-6">
      {overview.migrationRequired ? <MigrationNotice message={overview.safeError} /> : null}

      {/* Attention queue */}
      {data && (data.atRisk > 0 || data.needsAttention > 0) ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Needs attention</p>
              <p className="mt-1 text-sm font-bold text-amber-900">
                {data.atRisk > 0 ? `${data.atRisk} customer${data.atRisk > 1 ? 's' : ''} at risk` : ''}
                {data.atRisk > 0 && data.needsAttention > 0 ? ' · ' : ''}
                {data.needsAttention > 0 ? `${data.needsAttention} need${data.needsAttention > 1 ? '' : 's'} attention` : ''}
              </p>
            </div>
            <Link href="/founder/health" className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">
              Review health
            </Link>
          </div>
        </section>
      ) : null}

      {/* Key metrics */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FounderMetricCard label="Total customers" value={data?.customers ?? 0} detail={`${data?.activeCustomers ?? 0} active · ${data?.trials ?? 0} trial`} />
        <FounderMetricCard label="At risk" value={data?.atRisk ?? 0} detail="Health score below threshold" />
        <FounderMetricCard label="Approvals captured" value={data?.approvals ?? 0} detail="Across all customer workspaces" />
        <FounderMetricCard label="Connected integrations" value={data?.integrationsConnected ?? 0} detail="Customer-owned OAuth connections" />
        <FounderMetricCard label="Playbooks" value={data?.playbooks ?? 0} detail="Uploaded policy intelligence documents" />
        <FounderMetricCard label="Investigations" value={data?.investigations ?? 0} detail="Compliance and audit cases" />
        <FounderMetricCard label="Low adoption" value={data?.lowAdoption ?? 0} detail="Score below 45 — needs intervention" />
        <FounderMetricCard label="Storage" value={overview.migrationRequired ? 'Fallback' : 'Live'} detail="Founder operations storage mode" />
      </section>

      {/* Quick actions */}
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { href: '/founder/provision', label: 'Provision customer', tone: 'primary' as const },
          { href: '/founder/customers', label: 'Customer directory', tone: 'secondary' as const },
          { href: '/founder/audit', label: 'Audit logs', tone: 'secondary' as const },
          { href: '/founder/operations', label: 'System health', tone: 'secondary' as const },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`rounded-xl px-4 py-3 text-center text-sm font-black transition ${
              action.tone === 'primary'
                ? 'bg-[#2557dc] text-white hover:bg-blue-700 shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {action.label}
          </Link>
        ))}
      </section>

      {/* Recent customers */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Recent customers</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Latest provisioned accounts</h3>
          </div>
          <Link href="/founder/customers" className="text-sm font-black text-[#2557dc] hover:text-blue-700">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Health</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.recentCustomers.length ? (
                data.recentCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950">{customer.companyName}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{customer.domain}</p>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-600">{customer.planTier.replace('_', ' ')}</td>
                    <td className="px-5 py-4">
                      <FounderBadge tone={statusTone(customer.status)}>{customer.status}</FounderBadge>
                    </td>
                    <td className="px-5 py-4">
                      <FounderBadge tone={healthTone(customer.score)}>{customer.score}/100</FounderBadge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/founder/customers/${customer.id}`} className="font-black text-[#2557dc] hover:text-blue-700">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <p className="font-black text-slate-950">No customer accounts yet</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      <Link href="/founder/provision" className="text-[#2557dc]">Provision your first customer</Link> to populate this table.
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
