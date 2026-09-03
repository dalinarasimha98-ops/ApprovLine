import Link from 'next/link';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function healthTone(status: string): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'HEALTHY') return 'green';
  if (status === 'NEEDS_ATTENTION') return 'amber';
  if (status === 'AT_RISK') return 'red';
  if (status === 'CRITICAL') return 'red';
  return 'slate';
}

function scoreTone(score: number): 'green' | 'amber' | 'red' {
  if (score >= 75) return 'green';
  if (score >= 45) return 'amber';
  return 'red';
}

type HealthRow = {
  id: string;
  status: string;
  score: number;
  activeUsers: number;
  approvalsProcessed: number;
  integrationsConnected: number;
  playbookUsage: number;
  copilotUsage: number;
  lastLoginAt: Date | null;
  updatedAt: Date;
  customerAccount: { id: string; companyName: string; domain: string; status: string; planTier: string } | null;
};

export default async function FounderCustomerHealthPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const params = await searchParams;

  let health: HealthRow[] = [];
  let migrationRequired = false;
  let safeError: string | undefined;
  let totalHealthy = 0;
  let totalNeedsAttention = 0;
  let totalAtRisk = 0;
  let totalCritical = 0;

  try {
    const where: Record<string, unknown> = {};
    if (params?.status) where.status = params.status;

    [health, totalHealthy, totalNeedsAttention, totalAtRisk, totalCritical] = await Promise.all([
      prisma.customerHealth.findMany({
        where,
        orderBy: { score: 'asc' },
        include: {
          customerAccount: {
            select: { id: true, companyName: true, domain: true, status: true, planTier: true },
          },
        },
      }) as Promise<HealthRow[]>,
      prisma.customerHealth.count({ where: { status: 'HEALTHY' } }),
      prisma.customerHealth.count({ where: { status: 'NEEDS_ATTENTION' } }),
      prisma.customerHealth.count({ where: { status: 'AT_RISK' } }),
      prisma.customerHealth.count({ where: { status: 'CRITICAL' } }),
    ]);
  } catch (error) {
    migrationRequired = true;
    safeError = (error instanceof Error ? error.message : String(error)).slice(0, 220);
  }

  return (
    <div className="space-y-6">
      {migrationRequired ? <MigrationNotice message={safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customer Health</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Account health dashboard</h2>
            <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
              Monitor adoption, integration usage, and risk signals for every customer workspace.
            </p>
          </div>
          <form className="flex gap-2">
            <select name="status" defaultValue={params?.status ?? ''} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:border-[#2557dc]">
              <option value="">All statuses</option>
              <option value="HEALTHY">Healthy</option>
              <option value="NEEDS_ATTENTION">Needs attention</option>
              <option value="AT_RISK">At risk</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <button className="rounded-xl bg-[#2557dc] px-4 py-2 text-sm font-black text-white">Filter</button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <FounderMetricCard label="Healthy" value={totalHealthy} detail="Score ≥ 75" />
        <FounderMetricCard label="Needs attention" value={totalNeedsAttention} detail="Score 45–74" />
        <FounderMetricCard label="At risk" value={totalAtRisk} detail="Score below 45" />
        <FounderMetricCard label="Critical" value={totalCritical} detail="Immediate intervention needed" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Health</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Active users</th>
                <th className="px-5 py-3">Approvals</th>
                <th className="px-5 py-3">Integrations</th>
                <th className="px-5 py-3">Playbooks</th>
                <th className="px-5 py-3">Copilot</th>
                <th className="px-5 py-3">Last update</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {health.length ? (
                health.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-950">{row.customerAccount?.companyName ?? '—'}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{row.customerAccount?.domain}</p>
                    </td>
                    <td className="px-5 py-4">
                      <FounderBadge tone={healthTone(row.status)}>{row.status.replace('_', ' ')}</FounderBadge>
                    </td>
                    <td className="px-5 py-4">
                      <FounderBadge tone={scoreTone(row.score)}>{row.score}/100</FounderBadge>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-700">{row.activeUsers}</td>
                    <td className="px-5 py-4 font-bold text-slate-700">{row.approvalsProcessed}</td>
                    <td className="px-5 py-4 font-bold text-slate-700">{row.integrationsConnected}</td>
                    <td className="px-5 py-4 font-bold text-slate-700">{row.playbookUsage}</td>
                    <td className="px-5 py-4 font-bold text-slate-700">{row.copilotUsage}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-500">
                      {row.updatedAt.toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {row.customerAccount ? (
                        <Link href={`/founder/customers/${row.customerAccount.id}`} className="font-black text-[#2557dc] hover:text-blue-700">
                          Open →
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center">
                    <p className="font-black text-slate-950">No health records yet</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Health data is generated when you provision customers.</p>
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
