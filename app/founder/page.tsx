import { auth, currentUser } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { isFounderIdentity } from '@/lib/founder-identity';
import { buildFounderOverview, buildFounderOperationsCenter, listFounderAuditLogs } from '@/services/founder';

export const dynamic = 'force-dynamic';

function statusTone(status: string): 'green' | 'blue' | 'amber' | 'red' | 'slate' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'TRIAL') return 'blue';
  if (status === 'SUSPENDED') return 'red';
  if (status === 'CHURNED') return 'slate';
  return 'slate';
}

function healthTone(score: number): 'green' | 'amber' | 'red' {
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
  return `${Math.floor(hrs / 24)}d ago`;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border px-5 py-4 ${
        accent
          ? 'border-[#2557dc]/20 bg-[#2557dc]/5'
          : warn
            ? 'border-amber-200 bg-amber-50'
            : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p
        className={`text-2xl font-black tabular-nums ${
          accent ? 'text-[#2557dc]' : warn ? 'text-amber-700' : 'text-slate-950'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="text-xs font-semibold text-slate-400">{sub}</p> : null}
    </div>
  );
}

export default async function FounderHomePage() {
  // Triple-checked: middleware + layout + page
  const session = await auth();
  if (!session.userId) redirect('/dashboard');
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    null;
  if (!isFounderIdentity(session.userId, email)) redirect('/dashboard');

  const [overview, opsCenter, auditResult] = await Promise.all([
    buildFounderOverview(),
    buildFounderOperationsCenter(),
    listFounderAuditLogs({ take: 6 }),
  ]);

  const data = overview.data;
  const ops = opsCenter.data;
  const recentLogs = auditResult.data ?? [];

  const healthy = data ? Math.max(0, data.customers - data.atRisk - data.needsAttention) : 0;
  const hasOperationalIssues =
    data && (data.atRisk > 0 || data.needsAttention > 0);
  const hasSystemIssues = ops && (ops.failedJobs > 0 || ops.syncErrors > 0 || ops.integrationFailures > 0);

  return (
    <div className="space-y-6">
      {overview.migrationRequired ? <MigrationNotice message={overview.safeError} /> : null}

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Customers" value={data?.customers ?? 0} sub={`${data?.activeCustomers ?? 0} live`} accent />
        <KpiCard label="Trials" value={data?.trials ?? 0} sub="onboarding" />
        <KpiCard label="Healthy" value={healthy} sub="score ≥ 75" />
        <KpiCard
          label="Needs Attention"
          value={data?.needsAttention ?? 0}
          sub="score 45–74"
          warn={(data?.needsAttention ?? 0) > 0}
        />
        <KpiCard
          label="At Risk"
          value={data?.atRisk ?? 0}
          sub="score &lt; 45"
          warn={(data?.atRisk ?? 0) > 0}
        />
        <KpiCard label="Approvals Captured" value={(data?.approvals ?? 0).toLocaleString()} sub="all workspaces" />
      </section>

      {/* Operational status — attention or all-clear */}
      <section
        className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-5 py-4 shadow-sm ${
          hasOperationalIssues || hasSystemIssues
            ? 'border-amber-200 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50'
        }`}
      >
        {hasOperationalIssues || hasSystemIssues ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M8 6.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                </svg>
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Needs attention</p>
                <p className="text-sm font-bold text-amber-900">
                  {[
                    data && data.atRisk > 0 && `${data.atRisk} customer${data.atRisk > 1 ? 's' : ''} at risk`,
                    data && data.needsAttention > 0 && `${data.needsAttention} need${data.needsAttention > 1 ? '' : 's'} attention`,
                    ops && ops.failedJobs > 0 && `${ops.failedJobs} failed job${ops.failedJobs > 1 ? 's' : ''}`,
                    ops && ops.syncErrors > 0 && `${ops.syncErrors} sync error${ops.syncErrors > 1 ? 's' : ''}`,
                    ops && ops.integrationFailures > 0 && `${ops.integrationFailures} integration failure${ops.integrationFailures > 1 ? 's' : ''}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {hasSystemIssues && (
                <Link
                  href="/founder/operations"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-black text-amber-800 transition hover:bg-amber-50"
                >
                  System health
                </Link>
              )}
              {hasOperationalIssues && (
                <Link
                  href="/founder/health"
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white transition hover:bg-amber-700"
                >
                  Review health →
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">All clear</p>
              <p className="text-sm font-bold text-emerald-900">All customers are operating normally.</p>
            </div>
          </div>
        )}
      </section>

      {/* Main content — items-start prevents table from stretching to match right column height */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        {/* Customer table — spans 2 columns, sizes to content */}
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
          {data?.recentCustomers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Company', 'Plan', 'Status', 'Health', ''].map((col) => (
                      <th
                        key={col}
                        className="px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentCustomers.map((customer) => (
                    <tr key={customer.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-black text-slate-950">{customer.companyName}</p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-400">{customer.domain}</p>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-600">
                        {customer.planTier.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3.5">
                        <FounderBadge tone={statusTone(customer.status)}>{customer.status}</FounderBadge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${
                                customer.score >= 75
                                  ? 'bg-emerald-500'
                                  : customer.score >= 45
                                    ? 'bg-amber-400'
                                    : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.max(4, customer.score)}%` }}
                            />
                          </div>
                          <FounderBadge tone={healthTone(customer.score)}>
                            {healthLabel(customer.score)}
                          </FounderBadge>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/founder/customers/${customer.id}`}
                          className="font-black text-[#2557dc] transition hover:text-blue-700"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="font-black text-slate-950">No customer accounts yet</p>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                <Link href="/founder/provision" className="text-[#2557dc] hover:text-blue-700">
                  Provision your first customer
                </Link>{' '}
                to populate this table.
              </p>
            </div>
          )}
        </section>

        {/* Right column: Quick actions + Platform stats + Recent activity */}
        <div className="flex flex-col gap-4">
          {/* Quick actions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Quick actions</p>
            <div className="flex flex-col gap-2">
              <Link
                href="/founder/provision"
                className="flex items-center gap-2 rounded-xl bg-[#2557dc] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 4.5V9.5M4.5 7H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Platform stats</p>
            <dl className="space-y-2.5">
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
              <div className="border-t border-slate-100 pt-2.5">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-sm font-semibold text-slate-500">Storage</dt>
                  <dd>
                    <FounderBadge tone={overview.migrationRequired ? 'amber' : 'green'}>
                      {overview.migrationRequired ? 'Fallback' : 'Live'}
                    </FounderBadge>
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          {/* System health — compact */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">System health</p>
              <Link href="/founder/operations" className="text-[11px] font-black text-[#2557dc] hover:text-blue-700">
                Details →
              </Link>
            </div>
            {ops ? (
              <dl className="space-y-2.5">
                {[
                  { label: 'Failed jobs', value: ops.failedJobs, bad: ops.failedJobs > 0 },
                  { label: 'Queue backlogs', value: ops.queueBacklogs, bad: ops.queueBacklogs > 10 },
                  { label: 'Sync errors', value: ops.syncErrors, bad: ops.syncErrors > 0 },
                  { label: 'Integration failures', value: ops.integrationFailures, bad: ops.integrationFailures > 0 },
                ].map(({ label, value, bad }) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <dt className="text-sm font-semibold text-slate-500">{label}</dt>
                    <dd className={`text-sm font-black tabular-nums ${bad ? 'text-red-600' : 'text-slate-950'}`}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm font-semibold text-slate-400">System data unavailable.</p>
            )}
          </section>

          {/* Recent activity */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
              <Link href="/founder/audit" className="text-[11px] font-black text-[#2557dc] hover:text-blue-700">
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
                <div className="px-5 py-6 text-center">
                  <p className="text-sm font-semibold text-slate-400">No recent founder activity.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
