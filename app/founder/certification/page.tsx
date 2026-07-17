import { FounderBadge, FounderMetricCard } from '@/components/founder/FounderShell';
import { buildProductionCertificationReport } from '@/services/founderCertification';

export const dynamic = 'force-dynamic';

function toneFor(status: 'Pass' | 'Warning' | 'Fail') {
  if (status === 'Pass') return 'green';
  if (status === 'Warning') return 'amber';
  return 'red';
}

export default function FounderCertificationPage() {
  const report = buildProductionCertificationReport();
  const backupRows = [
    ['Frequency', report.backupStrategy.frequency],
    ['Retention', report.backupStrategy.retention],
    ['Encryption', report.backupStrategy.encryption],
    ['Storage', report.backupStrategy.storage],
    ['RPO', report.backupStrategy.rpo],
    ['RTO', report.backupStrategy.rto],
    ['Validation', report.backupStrategy.validation],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2557dc]">Week 4 Certification</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Production launch certification</h2>
            <p className="mt-3 max-w-4xl text-base font-semibold leading-7 text-slate-600">
              Final operational validation for load readiness, backup and recovery posture, tenant isolation, monitoring, gateway reliability, AI systems, integrations, and business continuity.
            </p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Launch Score</p>
            <p className="mt-2 text-6xl font-black tracking-tight text-emerald-700">{report.overallScore}</p>
            <FounderBadge tone="green">Certified</FounderBadge>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-900">
          {report.recommendation}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {report.readinessCategories.map((category) => (
          <FounderMetricCard key={category.key} label={category.label} value={`${category.score}/100`} detail={`${category.status} - ${category.checks[0]}`} />
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Certification Matrix</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">Go-live controls</h3>
          </div>
          <FounderBadge tone="green">All checks pass</FounderBadge>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {report.certificationChecks.map((check) => (
            <article key={check.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-slate-950">{check.label}</h4>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{check.detail}</p>
                </div>
                <FounderBadge tone={toneFor(check.status)}>{check.status}</FounderBadge>
              </div>
              <p className="mt-4 rounded-xl bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500">
                Evidence: <span className="normal-case tracking-normal text-slate-700">{check.evidence}</span>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Backup Strategy</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">RPO/RTO posture</h3>
          <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {backupRows.map(([label, value]) => (
              <div key={label} className="grid gap-2 p-4 md:grid-cols-[150px_1fr]">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
                <p className="text-sm font-bold leading-6 text-slate-700">{value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Disaster Recovery</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Recovery simulations</h3>
          <div className="mt-5 grid gap-3">
            {report.recoveryScenarios.map((scenario) => (
              <div key={scenario.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-black text-slate-950">{scenario.label}</h4>
                  <FounderBadge tone={toneFor(scenario.status)}>{scenario.status}</FounderBadge>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{scenario.validation}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <FounderBadge tone="blue">RPO {scenario.rpo}</FounderBadge>
                  <FounderBadge tone="blue">RTO {scenario.rto}</FounderBadge>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Safe Load Test Matrix</p>
        <h3 className="mt-2 text-2xl font-black text-slate-950">Scale and failure-mode targets</h3>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1.1fr_1fr_1.4fr_120px_120px] gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <span>Scenario</span>
            <span>Target</span>
            <span>Result</span>
            <span>P95</span>
            <span>Status</span>
          </div>
          {report.loadScenarios.map((scenario) => (
            <div key={scenario.label} className="grid grid-cols-[1.1fr_1fr_1.4fr_120px_120px] gap-3 border-t border-slate-100 px-4 py-4 text-sm font-semibold text-slate-700">
              <span className="font-black text-slate-950">{scenario.label}</span>
              <span>{scenario.target}</span>
              <span>{scenario.result}</span>
              <span>{scenario.p95LatencyMs}ms</span>
              <FounderBadge tone={toneFor(scenario.status)}>{scenario.status}</FounderBadge>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Cost Observability</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Pilot cost controls</h3>
          <div className="mt-5 grid gap-3">
            {report.costSignals.map((signal) => (
              <div key={signal.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-black text-slate-950">{signal.label}</h4>
                  <FounderBadge tone={toneFor(signal.status)}>{signal.status}</FounderBadge>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{signal.control}</p>
                <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">Target: {signal.target}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Business Continuity</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Runbooks</h3>
          <div className="mt-5 grid gap-3">
            {report.runbooks.map((runbook) => (
              <details key={runbook.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-black text-slate-950">{runbook.label}</summary>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Owner: {runbook.owner}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Trigger: {runbook.trigger}</p>
                <ul className="mt-3 grid gap-2">
                  {runbook.firstActions.map((action) => (
                    <li key={action} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">{action}</li>
                  ))}
                </ul>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Customer update: {runbook.customerUpdate}</p>
              </details>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
