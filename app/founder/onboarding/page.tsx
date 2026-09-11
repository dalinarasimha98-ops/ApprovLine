import { MigrationNotice } from '@/components/founder/FounderShell';
import { OnboardingPipelineClient } from '@/components/founder/OnboardingPipelineClient';
import { getFounderAccess } from '@/services/founder';
import { buildOnboardingPipeline } from '@/services/founder-onboarding';
import { ONBOARDING_BUCKET_LABELS, type OnboardingBucket } from '@/lib/onboarding-pipeline';

export const dynamic = 'force-dynamic';

function percentOfPortfolio(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}% of customers`;
}

const SUMMARY_TONES: Record<OnboardingBucket, { icon: string; ring: string }> = {
  NOT_STARTED: { icon: 'bg-slate-100 text-slate-600', ring: 'border-slate-100' },
  IN_PROGRESS: { icon: 'bg-blue-100 text-blue-700', ring: 'border-blue-100' },
  BLOCKED: { icon: 'bg-rose-100 text-rose-700', ring: 'border-rose-100' },
  LIVE: { icon: 'bg-emerald-100 text-emerald-700', ring: 'border-emerald-100' },
};

// Card order follows the customer's actual journey (Not Started -> In
// Progress -> Blocked -> Live) rather than the bucket's enum key order.
const SUMMARY_ORDER: OnboardingBucket[] = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'LIVE'];

export default async function FounderOnboardingPipelinePage() {
  const access = await getFounderAccess();
  const canExport = access.ok && !access.readOnly;

  const result = await buildOnboardingPipeline();
  const data = result.data;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Onboarding Pipeline</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Onboarding Pipeline</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
          Track customer onboarding progress, identify blockers, and help customers go live faster.
        </p>
      </section>

      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="grid gap-4 md:grid-cols-4">
        {SUMMARY_ORDER.map((bucket) => (
          <article key={bucket} className={`rounded-2xl border bg-white p-5 shadow-sm ${SUMMARY_TONES[bucket].ring}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{ONBOARDING_BUCKET_LABELS[bucket]}</p>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black ${SUMMARY_TONES[bucket].icon}`}>
                {data.counts[bucket]}
              </span>
            </div>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{data.counts[bucket]}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{percentOfPortfolio(data.counts[bucket], data.totalCustomers)}</p>
          </article>
        ))}
      </section>

      <OnboardingPipelineClient rows={data.rows} needsAttention={data.needsAttention} canExport={canExport} />
    </div>
  );
}
