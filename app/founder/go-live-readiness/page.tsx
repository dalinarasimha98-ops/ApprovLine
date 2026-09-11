import { MigrationNotice } from '@/components/founder/FounderShell';
import { GoLiveReadinessClient } from '@/components/founder/GoLiveReadinessClient';
import { getFounderAccess } from '@/services/founder';
import { buildGoLiveReadinessPortfolio } from '@/services/founder-go-live-readiness';
import { READINESS_STATUS_LABELS, type ReadinessStatus } from '@/lib/go-live-readiness';

export const dynamic = 'force-dynamic';

function percentOfPortfolio(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}% of customers`;
}

const SUMMARY_TONES: Record<ReadinessStatus, { icon: string; ring: string }> = {
  READY: { icon: 'bg-emerald-100 text-emerald-700', ring: 'border-emerald-100' },
  NOT_READY: { icon: 'bg-amber-100 text-amber-700', ring: 'border-amber-100' },
  BLOCKED: { icon: 'bg-rose-100 text-rose-700', ring: 'border-rose-100' },
  NOT_ASSESSED: { icon: 'bg-slate-100 text-slate-600', ring: 'border-slate-100' },
};

const SUMMARY_ORDER: ReadinessStatus[] = ['READY', 'NOT_READY', 'BLOCKED', 'NOT_ASSESSED'];

export default async function FounderGoLiveReadinessPage() {
  const access = await getFounderAccess();
  const canExport = access.ok && !access.readOnly;

  const result = await buildGoLiveReadinessPortfolio();
  const data = result.data;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Go-Live Readiness</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Go-Live Readiness</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
          Verify customer readiness, identify remaining blockers, and make informed go-live decisions.
        </p>
      </section>

      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="grid gap-4 md:grid-cols-4">
        {SUMMARY_ORDER.map((status) => (
          <article key={status} className={`rounded-2xl border bg-white p-5 shadow-sm ${SUMMARY_TONES[status].ring}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{READINESS_STATUS_LABELS[status]}</p>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${SUMMARY_TONES[status].icon}`}>
                {data.counts[status]}
              </span>
            </div>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{data.counts[status]}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{percentOfPortfolio(data.counts[status], data.totalCustomers)}</p>
          </article>
        ))}
      </section>

      <GoLiveReadinessClient rows={data.rows} attention={data.attention} canExport={canExport} />
    </div>
  );
}
