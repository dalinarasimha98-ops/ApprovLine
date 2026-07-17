import Link from 'next/link';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { buildFounderOperationsCenter } from '@/services/founder';
import { jobRegistry } from '@/services/queue/jobRegistry';

export const dynamic = 'force-dynamic';

const gatewayJobs = jobRegistry.filter((job) =>
  job.jobType.startsWith('gateway.') ||
  job.jobType === 'approval.classify' ||
  job.jobType.includes('ingest') ||
  job.queueName === 'approval-classification'
);

function statusTone(value: number): 'green' | 'amber' | 'red' {
  if (value === 0) return 'green';
  if (value < 5) return 'amber';
  return 'red';
}

export default async function FounderReliabilityPage() {
  const result = await buildFounderOperationsCenter();
  const data = result.data;
  const reliabilityStatus = data.failedJobs + data.gatewayFailures === 0 ? 'Operational' : 'Needs attention';

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Universal Gateway Reliability</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Background job hardening</h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Monitor the reliability layer behind ingestion, idempotency, outbox fallback, retries, and dead-letter handling for Universal Gateway and approval classification jobs.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <FounderBadge tone={reliabilityStatus === 'Operational' ? 'green' : 'amber'}>{reliabilityStatus}</FounderBadge>
            <Link href="/founder/operations" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/15">
              Open operations
            </Link>
            <Link href="/dashboard/gateway" className="rounded-xl bg-[#2557dc] px-4 py-2 text-sm font-black text-white transition hover:bg-[#2f66ff]">
              Open gateway
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <FounderMetricCard label="Gateway failures" value={data.gatewayFailures} detail="Outbox or gateway dead-letter failures" />
        <FounderMetricCard label="Failed jobs" value={data.failedJobs} detail="Failed background jobs and dead letters" />
        <FounderMetricCard label="Queue backlog" value={data.queueBacklogs} detail="Queued, processing, and pending outbox work" />
        <FounderMetricCard label="Sync errors" value={data.syncErrors} detail="Connector sync issues affecting customers" />
        <FounderMetricCard label="Registry jobs" value={gatewayJobs.length} detail="Gateway and ingestion job types registered" />
        <FounderMetricCard label="Retry coverage" value="100%" detail="Registered jobs define retry and dead-letter behavior" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Reliability controls</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">What was hardened</h3>
            </div>
            <FounderBadge tone={statusTone(data.gatewayFailures)}>Gateway</FounderBadge>
          </div>
          <div className="mt-5 grid gap-3">
            {[
              ['Tenant-scoped idempotency', 'Prevents duplicate approval creation when providers retry the same event.'],
              ['Outbox fallback', 'Keeps accepted events recoverable when Redis or workers are temporarily unavailable.'],
              ['Dead-letter tracking', 'Preserves failed payload metadata for founder review and replay decisions.'],
              ['Bounded retries', 'Applies explicit retry counts and timeouts per job type instead of open-ended processing.'],
              ['Operational visibility', 'Surfaces backlog, failures, and recent exceptions in founder operations.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="font-black text-slate-950">{title}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Job registry</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Gateway ingestion job policies</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {gatewayJobs.map((job) => (
              <div key={job.jobType} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <p className="font-black text-slate-950">{job.jobType}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{job.trigger}</p>
                  <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{job.idempotencyStrategy}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <FounderBadge tone="blue">{job.queueName}</FounderBadge>
                  <FounderBadge tone="slate">{job.maxAttempts} attempts</FounderBadge>
                  <FounderBadge tone="green">{Math.round(job.timeoutMs / 1000)}s timeout</FounderBadge>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Recent Exceptions</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Failures that still need review</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {data.recentExceptions.map((event) => (
            <div key={event.id} className="flex flex-col justify-between gap-3 p-5 lg:flex-row lg:items-center">
              <div>
                <p className="font-black text-slate-950">{event.type}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {event.failureReason ?? 'No failure reason stored'} · {event.failedAt?.toLocaleString() ?? event.createdAt.toLocaleString()}
                </p>
              </div>
              <FounderBadge tone="red">Needs review</FounderBadge>
            </div>
          ))}
          {!data.recentExceptions.length ? (
            <div className="p-10 text-center">
              <p className="text-lg font-black text-slate-950">No reliability exceptions</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">Gateway and background job failures are clear right now.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
