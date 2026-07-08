import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { buildFounderReadinessReport } from '@/services/founder';

export const dynamic = 'force-dynamic';

export default async function FounderReadinessPage() {
  const result = await buildFounderReadinessReport();
  const { score, checks, stats } = result.data;
  const scoreTone = score >= 90 ? 'green' : score >= 75 ? 'amber' : 'red';

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Production Readiness</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Founder Control Center v2</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Evaluates customer management, user lifecycle, seats, feature gates, integration gates, security, audit logging, health scoring, and operations monitoring.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Overall Score</p>
            <p className="mt-2 text-5xl font-black text-slate-950">{score}/100</p>
            <div className="mt-3"><FounderBadge tone={scoreTone}>{score >= 90 ? 'Pass' : score >= 75 ? 'Warning' : 'Fail'}</FounderBadge></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FounderMetricCard label="Customers" value={stats.customers} detail="Founder-managed customer accounts" />
        <FounderMetricCard label="Managed users" value={stats.managedUsers} detail="Users in founder lifecycle controls" />
        <FounderMetricCard label="Audit events" value={stats.auditLogs} detail="Sensitive operations logged" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {checks.map((check) => (
          <article key={check.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-slate-950">{check.label}</h3>
              <FounderBadge tone={check.ok ? 'green' : 'red'}>{check.ok ? 'Pass' : 'Fail'}</FounderBadge>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{check.detail}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
