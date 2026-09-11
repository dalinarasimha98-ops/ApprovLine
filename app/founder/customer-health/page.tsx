import { MigrationNotice } from '@/components/founder/FounderShell';
import { CustomerHealthClient } from '@/components/founder/CustomerHealthClient';
import { getFounderAccess } from '@/services/founder';
import { buildCustomerHealthCommandCenter, HEALTH_STATUS_LABELS, type HealthStatus } from '@/services/founder-customer-health';

export const dynamic = 'force-dynamic';

function percentOfPortfolio(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}% of customers`;
}

const SUMMARY_TONES: Record<HealthStatus, { icon: string; ring: string }> = {
  HEALTHY: { icon: 'bg-emerald-100 text-emerald-700', ring: 'border-emerald-100' },
  NEEDS_ATTENTION: { icon: 'bg-amber-100 text-amber-700', ring: 'border-amber-100' },
  AT_RISK: { icon: 'bg-orange-100 text-orange-700', ring: 'border-orange-100' },
  CRITICAL: { icon: 'bg-rose-100 text-rose-700', ring: 'border-rose-100' },
};

export default async function FounderCustomerHealthPage() {
  const access = await getFounderAccess();
  const canExport = access.ok && !access.readOnly;

  const result = await buildCustomerHealthCommandCenter();
  const data = result.data;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Customer Health</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer Health</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
          Monitor customer health, spot risks early, and take action to drive long-term success.
        </p>
      </section>

      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="grid gap-4 md:grid-cols-4">
        {(Object.keys(HEALTH_STATUS_LABELS) as HealthStatus[]).map((status) => (
          <article key={status} className={`rounded-2xl border bg-white p-5 shadow-sm ${SUMMARY_TONES[status].ring}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{HEALTH_STATUS_LABELS[status]}</p>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${SUMMARY_TONES[status].icon}`}>
                {data.counts[status]}
              </span>
            </div>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{data.counts[status]}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{percentOfPortfolio(data.counts[status], data.totalCustomers)}</p>
          </article>
        ))}
      </section>

      <CustomerHealthClient rows={data.rows} attention={data.attention} canExport={canExport} />
    </div>
  );
}
