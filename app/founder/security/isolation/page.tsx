import { FounderBadge, FounderMetricCard } from '@/components/founder/FounderShell';
import { buildFounderTenantIsolationReport } from '@/services/founder';

export const dynamic = 'force-dynamic';

function badgeTone(status: string) {
  if (status === 'Pass') return 'green' as const;
  if (status === 'Warning') return 'amber' as const;
  return 'red' as const;
}

export default function FounderTenantIsolationPage() {
  const report = buildFounderTenantIsolationReport();

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2557dc]">Security Verification</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Tenant Isolation Center</h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Verification summary for customer data boundaries, tenant-scoped APIs, Memory Graph linking, background jobs,
              RBAC enforcement, and cross-tenant rejection logging.
            </p>
          </div>
          <FounderBadge tone={badgeTone(report.status)}>{report.status}</FounderBadge>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FounderMetricCard label="Modules Tested" value={report.modulesTested} detail="Customer-facing and founder data paths." />
          <FounderMetricCard label="API Surfaces" value={report.apiSurfaces.length} detail="Routes and services reviewed for tenant context." />
          <FounderMetricCard label="High-Risk Findings" value={report.highRiskFindings.length} detail="Open isolation findings requiring remediation." />
          <FounderMetricCard label="Last Test" value={report.testedAt.toLocaleDateString()} detail="Run locally with the tenant isolation test suite." />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {report.modules.map((module) => (
          <article key={module.name} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Verified Module</p>
                <h3 className="mt-2 text-xl font-black text-slate-950">{module.name}</h3>
              </div>
              <FounderBadge tone={badgeTone(module.status)}>{module.status}</FounderBadge>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">{module.detail}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {module.coverage.map((item) => (
                <span key={item} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">API Coverage</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Surfaces Included</h3>
          <div className="mt-5 grid gap-3">
            {report.apiSurfaces.map((surface) => (
              <div key={surface} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                {surface}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Remediation Standard</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Release Checklist</h3>
          <div className="mt-5 grid gap-3">
            {report.remediation.map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs font-black text-white">✓</span>
                <p className="text-sm font-bold leading-6 text-emerald-900">{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
