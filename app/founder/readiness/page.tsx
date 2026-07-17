import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { buildFounderReadinessReport } from '@/services/founder';
import { buildProductionCertificationReport } from '@/services/founderCertification';

export const dynamic = 'force-dynamic';

export default async function FounderReadinessPage() {
  const result = await buildFounderReadinessReport();
  const certification = buildProductionCertificationReport();
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

      <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Week 4 Launch Certification</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">Engineering, security, reliability, recovery, and scale readiness</h3>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              The final launch matrix validates backup posture, disaster recovery runbooks, load-test targets, Universal Gateway reliability, AI safety, and tenant isolation controls.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Overall</p>
            <p className="mt-1 text-4xl font-black text-emerald-700">{certification.overallScore}/100</p>
            <FounderBadge tone="green">Certified</FounderBadge>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {certification.readinessCategories.map((category) => (
            <div key={category.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">{category.label}</p>
                <FounderBadge tone="green">{category.status}</FounderBadge>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-950">{category.score}/100</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{category.checks[0]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Database Backup Strategy</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Production recovery targets</h3>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">RPO</p>
              <p className="mt-1 text-sm font-bold text-slate-700">{certification.backupStrategy.rpo}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">RTO</p>
              <p className="mt-1 text-sm font-bold text-slate-700">{certification.backupStrategy.rto}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Retention</p>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-700">{certification.backupStrategy.retention}</p>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Business Continuity</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Runbooks ready</h3>
          <div className="mt-4 grid gap-3">
            {certification.runbooks.slice(0, 4).map((runbook) => (
              <div key={runbook.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-950">{runbook.label}</p>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">Owner: {runbook.owner}</p>
              </div>
            ))}
          </div>
        </article>
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
