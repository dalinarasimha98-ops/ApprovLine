import { auth, currentUser } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { isFounderIdentity } from '@/lib/founder-identity';
import { buildFounderOverview, listFounderAuditLogs } from '@/services/founder';

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

function healthLabel(score: number) {
  if (score >= 75) return 'Healthy';
  if (score >= 45) return 'Needs Attention';
  return 'At Risk';
}

function formatAction(action: string) {
  return action
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(date: Date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border px-5 py-4 ${accent ? 'border-[#2557dc]/20 bg-[#2557dc]/5' : 'border-slate-200 bg-white'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${accent ? 'text-[#2557dc]' : 'text-slate-950'}`}>{value}</p>
      {sub ? <p className="text-xs font-semibold text-slate-400">{sub}</p> : null}
    </div>
  );
}

export default async function FounderHomePage() {
  // Triple-checked: middleware + layout + page
  const session = await auth();
  if (!session.userId) redirect('/dashboard');
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? null;
  if (!isFounderIdentity(session.userId, email)) redirect('/dashboard');

  const [overview, auditResult] = await Promise.all([
    buildFounderOverview(),
    listFounderAuditLogs({ take: 8 }),
  ]);

  const data = overview.data;
  const recentLogs = auditResult.data ?? [];

  const healthy = data ? Math.max(0, data.customers - data.atRisk - data.needsAttention) : 0;

  return (
    <div className="space-y-6">
      {overview.migrationRequired ? <MigrationNotice message={overview.safeError} /> : null}

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Customers" value={data?.customers ?? 0} sub={`${data?.activeCustomers ?? 0} live`} accent />
        <KpiCard label="Trials" value={data?.trials ?? 0} sub="onboarding" />
        <KpiCard label="Healthy" value={healthy} sub="score ≥ 75" />
        <KpiCard label="Needs Attention" value={data?.needsAttention ?? 0} sub="score 45–74" />
        <KpiCard label="At Risk" value={data?.atRisk ?? 0} sub="score &lt; 45" />
        <KpiCard label="Approvals Captured" value={(data?.approvals ?? 0).toLocaleString()} sub="all workspaces" />
      </section>

      {/* Attention queue */}
      {data && (data.atRisk > 0 || data.needsAttention > 0) ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8 6.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
              </svg>
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Needs attention</p>
              <p className="text-sm font-bold text-amber-900">
                {data.atRisk > 0 ? `${data.atRisk} customer${data.atRisk > 1 ? 's' : ''} at risk` : ''}
                {data.atRisk > 0 && data.needsAttention > 0 ? ' · ' : ''}
                {data.needsAttention > 0 ? `${data.needsAttention} need${data.needsAttention > 1 ? '' : 's'} attention` : ''}
                {data.lowAdoption > 0 ? ` · ${data.lowAdoption} low adoption` : ''}
              </p>
            </div>
          </div>
          <Link
            href="/founder/health"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white transition hover:bg-amber-700"
          >
            Review health →
          </Link>
        </section>
      ) : null}

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Customer table — takes 2 columns on xl */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recent customers</p>
              <h2 className="mt-0.5 text-base font-black text-slate-950">Latest provisioned accounts</h2>
            </div>
            <Link href="/founder/customers" className="text-sm font-black text-[#2557dc] hover:text-blue-700">
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Company', 'Plan', 'Status', 'Health', ''].map((col) => (
                    <th key={col} className="px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recentCustomers.length ? (
                  data.recentCustomers.map((customer) => (
                    <tr key={customer.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-950">{customer.companyName}</p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-400">{customer.domain}</p>
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-600">
                        {customer.planTier.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-4">
                        <FounderBadge tone={statusTone(customer.status)}>{customer.status}</FounderBadge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${customer.score >= 75 ? 'bg-emerald-500' : customer.score >= 45 ? 'bg-amber-400' : 'bg-red-500'}`}
                              style={{ width: `${customer.score}%` }}
                            />
                          </div>
                          <FounderBadge tone={healthTone(customer.score)}>{healthLabel(customer.score)}</FounderBadge>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/founder/customers/${customer.id}`}
                          className="font-black text-[#2557dc] transition hover:text-blue-700"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center">
                      <p className="font-black text-slate-950">No customer accounts yet</p>
                      <p className="mt-1 text-sm font-semibold text-slate-400">
                        <Link href="/founder/provision" className="text-[#2557dc] hover:text-blue-700">
                          Provision your first customer
                        </Link>{' '}
                        to populate this table.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right column: Quick actions + Stats + Recent activity */}
        <div className="flex flex-col gap-6">
          {/* Quick actions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Quick actions</p>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/founder/provision"
                className="flex items-center gap-3 rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 5.5V10.5M5.5 8H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Provision customer
              </Link>
              {[
                { href: '/founder/customers', label: 'Customer directory' },
                { href: '/founder/health', label: 'Customer health' },
                { href: '/founder/audit', label: 'Audit logs' },
                { href: '/founder/operations', label: 'System health' },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  {action.label}
                  <span className="text-slate-400">→</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Platform stats */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Platform stats</p>
            <dl className="mt-3 space-y-3">
              {[
                { label: 'Integrations connected', value: data?.integrationsConnected ?? 0 },
                { label: 'Playbooks uploaded', value: data?.playbooks ?? 0 },
                { label: 'Investigation cases', value: data?.investigations ?? 0 },
                { label: 'Low adoption accounts', value: data?.lowAdoption ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-sm font-semibold text-slate-500">{label}</dt>
                  <dd className="text-sm font-black tabular-nums text-slate-950">{value.toLocaleString()}</dd>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm font-semibold text-slate-500">Storage mode</dt>
                  <dd>
                    <FounderBadge tone={overview.migrationRequired ? 'amber' : 'green'}>
                      {overview.migrationRequired ? 'Fallback' : 'Live'}
                    </FounderBadge>
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          {/* Recent activity */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
              <Link href="/founder/audit" className="text-sm font-black text-[#2557dc] hover:text-blue-700">
                All logs →
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {recentLogs.length ? (
                recentLogs.map((log) => (
                  <div key={log.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{formatAction(log.action)}</p>
                        {log.actorEmail ? (
                          <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{log.actorEmail}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                        {relativeTime(log.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-400">No activity yet</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
