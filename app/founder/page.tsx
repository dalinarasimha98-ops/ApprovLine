import { auth, currentUser } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { isFounderIdentity } from '@/lib/founder-identity';
import { buildFounderOverview, buildFounderOperationsCenter, listFounderAuditLogs } from '@/services/founder';
import { buildFounderPilotCommandCenter } from '@/services/founder-pilots';
import type { PilotStatus } from '@/services/founder-pilots';

export const dynamic = 'force-dynamic';

const PILOT_STAGE_ORDER: PilotStatus[] = [
  'Prospect',
  'Demo Scheduled',
  'Pilot Active',
  'Pilot At Risk',
  'Pilot Completed',
  'Converted',
  'Lost',
];

function statusTone(status: string): 'green' | 'blue' | 'amber' | 'red' | 'slate' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'TRIAL') return 'blue';
  if (status === 'SUSPENDED') return 'red';
  if (status === 'CHURNED') return 'slate';
  return 'slate';
}

function healthTone(status: string | null): 'green' | 'amber' | 'red' {
  if (status === 'HEALTHY') return 'green';
  if (status === 'NEEDS_ATTENTION') return 'amber';
  return 'red';
}

function healthLabelFromStatus(status: string | null) {
  if (status === 'HEALTHY') return 'Healthy';
  if (status === 'NEEDS_ATTENTION') return 'Needs Attention';
  if (status === 'AT_RISK') return 'At Risk';
  if (status === 'CRITICAL') return 'Critical';
  return 'Needs Attention';
}

function healthBarColor(status: string | null) {
  if (status === 'HEALTHY') return 'bg-emerald-500';
  if (status === 'NEEDS_ATTENTION') return 'bg-amber-400';
  return 'bg-red-500';
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

function formatArr(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
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

type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

const SEVERITY_ORDER: Record<SeverityLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_STYLES: Record<SeverityLevel, { dot: string; badge: string; label: string }> = {
  critical: { dot: 'bg-red-500', badge: 'border-red-200 bg-red-50 text-red-700', label: 'Critical' },
  high: { dot: 'bg-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-700', label: 'High' },
  medium: { dot: 'bg-yellow-400', badge: 'border-yellow-200 bg-yellow-50 text-yellow-700', label: 'Medium' },
  low: { dot: 'bg-slate-300', badge: 'border-slate-200 bg-slate-50 text-slate-500', label: 'Low' },
};

const STAGE_STYLES: Record<PilotStatus, { bg: string; text: string }> = {
  'Prospect': { bg: 'bg-slate-100', text: 'text-slate-600' },
  'Demo Scheduled': { bg: 'bg-blue-50', text: 'text-blue-700' },
  'Pilot Active': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'Pilot At Risk': { bg: 'bg-amber-50', text: 'text-amber-700' },
  'Pilot Completed': { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  'Converted': { bg: 'bg-green-50', text: 'text-green-700' },
  'Lost': { bg: 'bg-rose-50', text: 'text-rose-700' },
};

export default async function FounderHomePage() {
  // Triple auth guard: middleware + layout + page
  const session = await auth();
  if (!session.userId) redirect('/dashboard');
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    null;
  if (!isFounderIdentity(session.userId, email)) redirect('/dashboard');

  const [overview, opsCenter, auditResult, pilotsResult] = await Promise.all([
    buildFounderOverview(),
    buildFounderOperationsCenter(),
    listFounderAuditLogs({ take: 6 }),
    buildFounderPilotCommandCenter(),
  ]);

  const data = overview.data;
  const ops = opsCenter.data;
  const recentLogs = auditResult.data ?? [];
  const pilots = pilotsResult.data;

  // KPI: total estimated ARR from all pilot expectedArr values
  const totalEstArr = pilots?.pilots.reduce((sum, p) => sum + p.expectedArr, 0) ?? 0;

  // Pipeline stage counts
  const stageCounts = PILOT_STAGE_ORDER.reduce<Record<PilotStatus, number>>(
    (acc, s) => { acc[s] = 0; return acc; },
    {} as Record<PilotStatus, number>,
  );
  pilots?.pilots.forEach((p) => { stageCounts[p.status] = (stageCounts[p.status] ?? 0) + 1; });

  // Build attention items from at-risk pilots + ops signals
  type AttentionItem = { key: string; label: string; detail: string; severity: SeverityLevel; href: string };
  const attentionItems: AttentionItem[] = [];

  pilots?.atRiskPilots.forEach((p) => {
    const severity: SeverityLevel =
      p.healthLabel === 'Critical' ? 'critical' : p.healthLabel === 'At Risk' ? 'high' : 'medium';
    attentionItems.push({
      key: `pilot-${p.id}`,
      label: p.companyName,
      detail: `${p.healthLabel} · ${p.approvalsCaptured} approvals · ${p.integrationsConnected} integration${p.integrationsConnected !== 1 ? 's' : ''}`,
      severity,
      href: `/founder/customers/${p.id}`,
    });
  });

  if (ops?.failedJobs && ops.failedJobs > 0) {
    attentionItems.push({
      key: 'ops-failed-jobs',
      label: `${ops.failedJobs} failed background job${ops.failedJobs > 1 ? 's' : ''}`,
      detail: 'Queue failure — check reliability dashboard',
      severity: 'critical',
      href: '/founder/reliability',
    });
  }
  if (ops?.integrationFailures && ops.integrationFailures > 0) {
    attentionItems.push({
      key: 'ops-integration-failures',
      label: `${ops.integrationFailures} integration failure${ops.integrationFailures > 1 ? 's' : ''}`,
      detail: 'Provider connectivity issue — check operations',
      severity: 'high',
      href: '/founder/operations',
    });
  }
  if (ops?.syncErrors && ops.syncErrors > 0) {
    attentionItems.push({
      key: 'ops-sync-errors',
      label: `${ops.syncErrors} sync error${ops.syncErrors > 1 ? 's' : ''}`,
      detail: 'Data sync failures detected',
      severity: 'high',
      href: '/founder/operations',
    });
  }
  if (ops?.copilotFailures && ops.copilotFailures > 0) {
    attentionItems.push({
      key: 'ops-copilot',
      label: `${ops.copilotFailures} AI Copilot failure${ops.copilotFailures > 1 ? 's' : ''}`,
      detail: 'Classifier or LLM errors detected',
      severity: 'medium',
      href: '/founder/operations',
    });
  }

  attentionItems.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Cross-reference recentCustomers with pilot status map
  const pilotStatusById = new Map(pilots?.pilots.map((p) => [p.id, p.status]) ?? []);

  // Derive pipeline ARR from active/at-risk pilots only
  const pipelineArr = pilots?.pilots
    .filter((p) => ['Prospect', 'Demo Scheduled', 'Pilot Active', 'Pilot At Risk', 'Pilot Completed'].includes(p.status))
    .reduce((sum, p) => sum + p.expectedArr, 0) ?? 0;

  const atRiskCount = (data?.atRisk ?? 0) + (data?.needsAttention ?? 0);

  return (
    <div className="space-y-6">
      {overview.migrationRequired ? <MigrationNotice message={overview.safeError} /> : null}

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total Customers"
          value={data?.customers ?? 0}
          sub={`${data?.activeCustomers ?? 0} live`}
          accent
        />
        <KpiCard
          label="Active Onboardings"
          value={pilots?.metrics.activePilots ?? data?.trials ?? 0}
          sub="in pilot pipeline"
        />
        <KpiCard
          label="At Risk"
          value={atRiskCount}
          sub={`${data?.atRisk ?? 0} at risk · ${data?.needsAttention ?? 0} attention`}
          warn={atRiskCount > 0}
        />
        <KpiCard
          label="Converted"
          value={pilots?.metrics.convertedCustomers ?? 0}
          sub={`${pilots?.metrics.pilotConversionRate ?? 0}% conversion rate`}
        />
        <KpiCard
          label="Approvals Captured"
          value={(data?.approvals ?? 0).toLocaleString()}
          sub="all workspaces"
        />
        <KpiCard
          label="Est. ARR"
          value={formatArr(totalEstArr)}
          sub="plan-based estimate"
          accent
        />
      </section>

      {/* Founder Attention */}
      {attentionItems.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between gap-4 border-b border-amber-200/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M8 6.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                </svg>
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Founder Attention</p>
                <p className="text-sm font-bold text-amber-900">{attentionItems.length} item{attentionItems.length > 1 ? 's' : ''} require your attention</p>
              </div>
            </div>
            <Link href="/founder/health" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700">
              Review all →
            </Link>
          </div>
          <div className="divide-y divide-amber-200/40">
            {attentionItems.map((item) => {
              const styles = SEVERITY_STYLES[item.severity];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center gap-4 px-5 py-3 transition hover:bg-amber-100/50"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-amber-900">{item.label}</p>
                    <p className="truncate text-xs font-semibold text-amber-700/70">{item.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${styles.badge}`}>
                    {styles.label}
                  </span>
                  <span className="shrink-0 text-sm font-black text-amber-600">→</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">All clear</p>
            <p className="text-sm font-bold text-emerald-900">No customers at risk and platform is operating normally.</p>
          </div>
        </section>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">

        {/* Left: Recent customers + Onboarding pipeline */}
        <div className="flex flex-col gap-6 xl:col-span-2">

          {/* Recent customers */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recent Customers</p>
                <h2 className="mt-0.5 text-base font-black text-slate-950">Latest provisioned accounts</h2>
              </div>
              <Link href="/founder/customers" className="text-sm font-black text-[#2557dc] hover:text-blue-700">
                View all →
              </Link>
            </div>
            {data?.recentCustomers.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[580px] text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Company', 'Plan', 'Status', 'Health', 'Stage', ''].map((col) => (
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
                    {data.recentCustomers.map((customer) => {
                      const pilotStatus = pilotStatusById.get(customer.id);
                      const stageStyle = pilotStatus ? STAGE_STYLES[pilotStatus] : null;
                      return (
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
                                  className={`h-full rounded-full transition-all ${healthBarColor(customer.healthStatus)}`}
                                  style={{ width: `${Math.max(4, customer.score)}%` }}
                                />
                              </div>
                              <FounderBadge tone={healthTone(customer.healthStatus)}>
                                {healthLabelFromStatus(customer.healthStatus)}
                              </FounderBadge>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {pilotStatus && stageStyle ? (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${stageStyle.bg} ${stageStyle.text}`}>
                                {pilotStatus}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
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
                      );
                    })}
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

          {/* Onboarding pipeline */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Onboarding Pipeline</p>
                <p className="mt-0.5 text-base font-black text-slate-950">
                  {pilots?.metrics.totalPilots ?? 0} account{(pilots?.metrics.totalPilots ?? 0) !== 1 ? 's' : ''} tracked
                </p>
              </div>
              <Link href="/founder/pilots" className="text-sm font-black text-[#2557dc] hover:text-blue-700">
                Full pipeline →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PILOT_STAGE_ORDER.filter((s) => s !== 'Lost').map((stage) => {
                const count = stageCounts[stage] ?? 0;
                const style = STAGE_STYLES[stage];
                return (
                  <div key={stage} className={`rounded-xl border px-4 py-3 ${style.bg}`}>
                    <p className={`text-xl font-black tabular-nums ${style.text}`}>{count}</p>
                    <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">{stage}</p>
                  </div>
                );
              })}
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                <p className="text-xl font-black tabular-nums text-rose-600">{stageCounts['Lost'] ?? 0}</p>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">Lost</p>
              </div>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Quick actions */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Quick Actions</p>
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
              {([
                { href: '/founder/customers', label: 'Customer directory' },
                { href: '/founder/health', label: 'Customer health' },
                { href: '/founder/pilots', label: 'Pilot pipeline' },
                { href: '/founder/audit', label: 'Audit logs' },
                { href: '/founder/operations', label: 'System health' },
                { href: '/founder/readiness', label: 'Go-live readiness' },
              ] as const).map((action) => (
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

          {/* Revenue estimate */}
          <section className="rounded-2xl border border-[#2557dc]/20 bg-[#2557dc]/5 p-5 shadow-sm">
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2557dc]/70">Est. ARR</p>
              <span className="rounded-full border border-[#2557dc]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2557dc]/60">Plan-based estimate</span>
            </div>
            <p className="text-3xl font-black tabular-nums text-[#2557dc]">{formatArr(totalEstArr)}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Total est. ARR across all accounts</p>
            <div className="mt-4 space-y-2.5 border-t border-[#2557dc]/10 pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-500">Pipeline ARR</span>
                <span className="text-sm font-black tabular-nums text-slate-800">{formatArr(pipelineArr)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-500">Converted accounts</span>
                <span className="text-sm font-black tabular-nums text-slate-800">{pilots?.metrics.convertedCustomers ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-500">Conversion rate</span>
                <span className="text-sm font-black tabular-nums text-slate-800">{pilots?.metrics.pilotConversionRate ?? 0}%</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-500">Avg. pilot health</span>
                <span className="text-sm font-black tabular-nums text-slate-800">{pilots?.metrics.averagePilotHealth ?? 0}</span>
              </div>
            </div>
          </section>

          {/* Platform health — compact */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Platform Health</p>
              <Link href="/founder/operations" className="text-[11px] font-black text-[#2557dc] hover:text-blue-700">
                Details →
              </Link>
            </div>
            {ops ? (
              <dl className="space-y-2.5">
                {([
                  { label: 'Failed jobs', value: ops.failedJobs, bad: ops.failedJobs > 0 },
                  { label: 'Queue backlogs', value: ops.queueBacklogs, bad: ops.queueBacklogs > 10 },
                  { label: 'Sync errors', value: ops.syncErrors, bad: ops.syncErrors > 0 },
                  { label: 'Integration failures', value: ops.integrationFailures, bad: ops.integrationFailures > 0 },
                ] as const).map(({ label, value, bad }) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <dt className="text-sm font-semibold text-slate-500">{label}</dt>
                    <dd className={`text-sm font-black tabular-nums ${bad ? 'text-red-600' : 'text-slate-950'}`}>
                      {value}
                    </dd>
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
            ) : (
              <p className="text-sm font-semibold text-slate-400">System data unavailable.</p>
            )}
          </section>

          {/* Recent activity */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recent Activity</p>
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

          {/* Platform stats */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Platform Stats</p>
            <dl className="space-y-2.5">
              {([
                { label: 'Integrations connected', value: data?.integrationsConnected ?? 0 },
                { label: 'Playbooks uploaded', value: data?.playbooks ?? 0 },
                { label: 'Investigation cases', value: data?.investigations ?? 0 },
                { label: 'Low adoption accounts', value: data?.lowAdoption ?? 0 },
              ] as const).map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-sm font-semibold text-slate-500">{label}</dt>
                  <dd className="text-sm font-black tabular-nums text-slate-950">{value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
