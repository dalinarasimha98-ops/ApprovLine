import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { buildFounderOperationsCenter } from '@/services/founder';

export const dynamic = 'force-dynamic';

export default async function FounderOperationsPage() {
  const result = await buildFounderOperationsCenter();
  const data = result.data;

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Operations Center</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Production workflow monitor</h2>
        <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
          Monitor background jobs, outbox backlog, sync failures, Copilot errors, Universal Gateway reliability, and recent exceptions without exposing customer secrets.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <FounderMetricCard label="Failed jobs" value={data.failedJobs} detail="Failed or dead-lettered reliability jobs" />
        <FounderMetricCard label="Backlog" value={data.queueBacklogs} detail="Queued jobs and outbox events" />
        <FounderMetricCard label="Sync errors" value={data.syncErrors} detail="Customer integrations unhealthy" />
        <FounderMetricCard label="Integration failures" value={data.integrationFailures} detail="Founder status errors" />
        <FounderMetricCard label="Copilot failures" value={data.copilotFailures} detail="AI assistant errors" />
        <FounderMetricCard label="Gateway failures" value={data.gatewayFailures} detail="Universal Gateway outbox or dead-letter failures" />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Recent Exceptions</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Reliability exceptions requiring attention</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {data.recentExceptions.map((event) => (
            <div key={event.id} className="flex flex-col justify-between gap-3 p-5 lg:flex-row lg:items-center">
              <div>
                <p className="font-black text-slate-950">{event.type}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{event.failureReason ?? 'No failure reason stored'} · {event.failedAt?.toLocaleString() ?? event.createdAt.toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <FounderBadge tone="red">Failed</FounderBadge>
                <FounderBadge tone="slate">Retry from source</FounderBadge>
              </div>
            </div>
          ))}
          {!data.recentExceptions.length ? (
            <div className="p-10 text-center">
              <p className="text-lg font-black text-slate-950">No recent exceptions</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">The operations queue is quiet right now.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
