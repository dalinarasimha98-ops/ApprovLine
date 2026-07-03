import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { getDashboardTenant } from '@/lib/auth';
import { buildExecutiveAnalytics, type ExecutiveAnalytics } from '@/services/analytics';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

type AnalyticsPageProps = {
  searchParams: Promise<{ demo?: string }>;
};

function numberFormat(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function MetricCard({
  label,
  value,
  help,
  tone = 'blue',
  href,
}: {
  label: string;
  value: string;
  help: string;
  tone?: 'blue' | 'dark' | 'amber' | 'green';
  href?: string;
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-[#2155d9]',
    dark: 'bg-slate-950 text-white',
    amber: 'bg-amber-50 text-amber-800',
    green: 'bg-emerald-50 text-emerald-700',
  }[tone];

  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${toneClass}`}>{label}</div>
      <p className="text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{help}</p>
      {href ? <p className="mt-4 text-xs font-black uppercase tracking-wide text-[#2155d9]">View details &gt;</p> : null}
    </div>
  );

  if (!href) return content;

  return (
    <PendingLink href={href} pendingText="Opening details..." className="block transition hover:-translate-y-0.5 hover:shadow-md">
      {content}
    </PendingLink>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-slate-700">{label}</span>
        <span className="font-black text-slate-950">{value}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100">
        <div className="h-2.5 rounded-full bg-[#2155d9]" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function CountList({ items, empty }: { items: Array<{ name: string; count: number }>; empty: string }) {
  if (items.length === 0) return <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">{empty}</p>;
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-bold text-slate-700">{item.name}</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-950 shadow-sm">{numberFormat(item.count)}</span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ data }: { data: Array<{ name: string; count: number }> }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="grid min-h-64 grid-cols-6 items-end gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
      {data.map((item) => (
        <div key={item.name} className="grid gap-2 text-center">
          <div className="flex h-44 items-end">
            <div
              className="w-full rounded-t-xl bg-gradient-to-t from-[#2155d9] to-[#74a0ff] shadow-sm"
              style={{ height: `${Math.max(12, (item.count / max) * 100)}%` }}
              title={`${item.name}: ${item.count}`}
            />
          </div>
          <span className="text-xs font-black text-slate-500">{item.name}</span>
          <span className="text-xs font-black text-slate-950">{numberFormat(item.count)}</span>
        </div>
      ))}
    </div>
  );
}

function DepartmentTable({ items }: { items: Array<{ name: string; count: number }> }) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">Department analytics appear after approvals are captured.</p>;
  }
  const total = Math.max(items.reduce((sum, item) => sum + item.count, 0), 1);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Department</th>
            <th className="px-4 py-3">Approvals</th>
            <th className="px-4 py-3">Share</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.name} className="border-t border-slate-100">
              <td className="px-4 py-3 font-black text-slate-950">{item.name}</td>
              <td className="px-4 py-3 font-semibold text-slate-600">{numberFormat(item.count)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-[#2155d9]" style={{ width: `${Math.round((item.count / total) * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs font-black text-slate-500">{Math.round((item.count / total) * 100)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportPreview({ report, exportSuffix }: { report: ExecutiveAnalytics; exportSuffix: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Executive ROI Report Preview</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Preview the exact business summary before exporting.</h3>
          <p className="mt-3 max-w-4xl text-base leading-7 text-slate-600">{report.summary}</p>
        </div>
        <div className="rounded-2xl bg-[#07111f] px-5 py-4 text-white">
          <p className="text-xs font-black uppercase tracking-wide text-blue-200">Readiness</p>
          <p className="mt-1 text-3xl font-black">{report.complianceReadiness.approvalTraceability}%</p>
          <p className="text-xs font-semibold text-slate-300">approval traceability</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Captured" value={numberFormat(report.approvals.total)} help="Approval decisions available for executive review." href="/analytics/drilldown/approvals-captured" />
        <MetricCard label="Hours saved" value={`${numberFormat(report.timeSaved.totalHours)} hrs`} help="Estimated manual audit and retrieval effort avoided." tone="green" href="/analytics/drilldown/time-saved" />
        <MetricCard label="Risk surfaced" value={numberFormat(report.riskReduction.highRiskApprovalsDetected)} help="High-risk approval records identified for control review." tone="amber" href="/analytics/drilldown/high-risk-approvals" />
        <MetricCard label="Coverage" value={`${report.complianceReadiness.evidenceCoverage}%`} help="Approval records with usable evidence links or snippets." tone="dark" href="/analytics/drilldown/traceability" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-3 text-sm font-black text-slate-950">Approval trends</p>
          <TrendChart data={report.approvals.trends} />
        </div>
        <div>
          <p className="mb-3 text-sm font-black text-slate-950">High-risk approval summary</p>
          <CountList items={report.highRiskSummary} empty="No high-risk approval records detected yet." />
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <p className="mb-3 text-sm font-black text-slate-950">Department breakdown</p>
          <DepartmentTable items={report.approvals.byDepartment} />
        </div>
          <PendingLink href="/analytics/drilldown/compliance-readiness" pendingText="Opening compliance details..." className="block rounded-2xl border border-slate-200 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-sm font-black text-slate-950">Compliance score</p>
            <div className="mt-5 grid gap-5">
              <ProgressRow label="Audit completeness" value={report.complianceReadiness.auditCompleteness} />
              <ProgressRow label="Evidence coverage" value={report.complianceReadiness.evidenceCoverage} />
              <ProgressRow label="Approval traceability" value={report.complianceReadiness.approvalTraceability} />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-wide text-[#2155d9]">View details &gt;</p>
          </PendingLink>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-black text-slate-950">Export this preview</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">Exports include the executive summary, ROI metrics, trends, risk summary, compliance scores, integration insights, and Playbook AI findings.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PendingLink href={`/api/export/analytics?format=pdf${exportSuffix}`} pendingText="Preparing PDF..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
            Export PDF
          </PendingLink>
          <PendingLink href={`/api/export/analytics?format=csv${exportSuffix}`} pendingText="Preparing CSV..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            Export CSV
          </PendingLink>
        </div>
      </div>
    </div>
  );
}

function AnalyticsErrorState({ message }: { message: string }) {
  return (
    <DashboardShell>
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide">Analytics unavailable</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">We could not load the Executive ROI Dashboard</h2>
        <p className="mt-2 text-sm font-semibold">{message}</p>
        <PendingLink href="/analytics?demo=1" pendingText="Loading demo..." className="mt-4 inline-flex min-h-0 h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm">
          Open demo preview
        </PendingLink>
      </section>
    </DashboardShell>
  );
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const query = await searchParams;
  const requestedDemo = query.demo === '1';
  let liveReport: ExecutiveAnalytics;

  try {
    liveReport = await withTimeout(
      'executive analytics page',
      buildExecutiveAnalytics(tenant.organization.id, { demoProjection: requestedDemo }),
      2800,
    );
  } catch (error) {
    return <AnalyticsErrorState message={error instanceof Error ? error.message : 'Analytics query timed out.'} />;
  }

  const usingEmptyDemoPreview = !requestedDemo && liveReport.approvals.total === 0;
  const report = usingEmptyDemoPreview
    ? await buildExecutiveAnalytics(tenant.organization.id, { demoProjection: true })
    : liveReport;
  const exportSuffix = report.demoProjection ? '&demo=1' : '';

  return (
    <DashboardShell>
      <section className="grid gap-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Executive ROI Dashboard</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Boardroom-ready business value view</h2>
              <p className="mt-3 max-w-4xl text-base leading-7 text-slate-200">
                See the full ApprovLine ROI story before exporting: captured approvals, risk reduction, time saved, compliance readiness, integrations, and Playbook AI insights.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['CEO', 'CFO', 'CTO', 'Head of Legal', 'Compliance Officer', 'Procurement Head'].map((role) => (
                  <span key={role} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black text-blue-100">{role}</span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-black uppercase tracking-wide text-blue-200">Report mode</p>
              <p className="mt-1 text-sm font-bold text-white">{report.demoProjection ? 'Demo preview' : 'Live workspace'}</p>
              <p className="mt-1 text-xs font-semibold text-slate-300">Generated {new Date(report.generatedAt).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {(usingEmptyDemoPreview || report.demoProjection) ? (
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 shadow-sm sm:flex-row sm:items-center">
            <div>
              <h3 className="font-black text-slate-950">{usingEmptyDemoPreview ? 'No live analytics yet - showing demo preview' : 'Demo analytics preview enabled'}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-600">Use this customer-ready preview while Slack, Gmail, approvals, and Playbook AI data accumulate.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PendingLink href="/analytics" pendingText="Loading live..." className="inline-flex min-h-0 h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm">
                View live data
              </PendingLink>
              <form action="/api/demo/seed" method="post">
                <FormSubmitButton pendingText="Generating..." className="inline-flex min-h-0 h-10 items-center justify-center rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200">
                  Generate demo data
                </FormSubmitButton>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 shadow-sm sm:flex-row sm:items-center">
            <div>
              <h3 className="font-black text-slate-950">Want to present a fuller customer story?</h3>
              <p className="mt-1 text-sm font-semibold text-slate-600">Switch to demo preview to show realistic monthly executive ROI projections.</p>
            </div>
            <PendingLink href="/analytics?demo=1" pendingText="Loading demo..." className="inline-flex min-h-0 h-10 items-center justify-center rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200">
              Use demo analytics
            </PendingLink>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Approvals captured" value={numberFormat(report.approvals.total)} help="Total approval and rejection decisions in the executive reporting window." href="/analytics/drilldown/approvals-captured" />
          <MetricCard label="Time saved" value={`${numberFormat(report.timeSaved.totalHours)} hrs`} help="Manual search, retrieval, and audit preparation effort avoided." tone="green" href="/analytics/drilldown/time-saved" />
          <MetricCard label="High-risk approvals" value={numberFormat(report.riskReduction.highRiskApprovalsDetected)} help="Security, compliance, legal, finance, and procurement decisions surfaced." tone="amber" href="/analytics/drilldown/high-risk-approvals" />
          <MetricCard label="Traceability" value={`${report.complianceReadiness.approvalTraceability}%`} help="Records with approver, source, timestamp, and decision context." tone="dark" href="/analytics/drilldown/traceability" />
        </div>

        <ReportPreview report={report} exportSuffix={exportSuffix} />

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <PendingLink href="/analytics/drilldown/approval-categories" pendingText="Opening category details..." className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Approvals captured</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Approvals by department</h3>
            <div className="mt-5">
              <DepartmentTable items={report.approvals.byDepartment} />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-wide text-[#2155d9]">View department and category details &gt;</p>
          </PendingLink>

          <PendingLink href="/analytics/drilldown/integration-insights" pendingText="Opening integration details..." className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Approvals by source</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Integration contribution</h3>
            <div className="mt-5">
              <CountList items={report.approvals.bySource} empty="Source data appears after Slack or Gmail ingestion runs." />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-wide text-[#2155d9]">View integration details &gt;</p>
          </PendingLink>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Time saved</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Operational effort avoided</h3>
            <div className="mt-5 grid gap-3">
              <MetricCard label="Manual search" value={`${numberFormat(report.timeSaved.manualSearchHours)} hrs`} help="Time avoided searching Slack, Gmail, and audit trails." />
              <MetricCard label="Audit prep" value={`${numberFormat(report.timeSaved.auditPreparationHours)} hrs`} help="Evidence reconstruction effort avoided." />
              <MetricCard label="Retrieval" value={`${numberFormat(report.timeSaved.retrievalHours)} hrs`} help="Approval lookup and source-link retrieval time avoided." />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Risk reduction</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Controls surfaced</h3>
            <div className="mt-5 grid gap-3">
              {[
                ['Missing approvals detected', report.riskReduction.missingApprovalsDetected],
                ['Conditional approvals detected', report.riskReduction.conditionalApprovalsDetected],
                ['High-risk approvals detected', report.riskReduction.highRiskApprovalsDetected],
                ['Approvals without evidence', report.riskReduction.approvalsWithoutEvidence],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                  <span className="text-lg font-black text-slate-950">{numberFormat(value as number)}</span>
                </div>
              ))}
            </div>
          </div>

          <PendingLink href="/analytics/drilldown/compliance-readiness" pendingText="Opening compliance details..." className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Compliance readiness</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Audit posture</h3>
            <div className="mt-5 grid gap-5">
              <ProgressRow label="Audit completeness" value={report.complianceReadiness.auditCompleteness} />
              <ProgressRow label="Evidence coverage" value={report.complianceReadiness.evidenceCoverage} />
              <ProgressRow label="Approval traceability" value={report.complianceReadiness.approvalTraceability} />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-wide text-[#2155d9]">View readiness details &gt;</p>
          </PendingLink>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <PendingLink href="/analytics/drilldown/integration-insights" pendingText="Opening integration details..." className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Integration insights</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Connector contribution</h3>
            <div className="mt-5 grid gap-3">
              {[
                ['Slack approvals', report.integrations.slackApprovals],
                ['Gmail approvals', report.integrations.gmailApprovals],
                ['Teams approvals', report.integrations.teamsApprovals],
                ['Jira approvals', report.integrations.jiraApprovals],
                ['Outlook approvals', report.integrations.outlookApprovals],
                ['ServiceNow approvals', report.integrations.serviceNowApprovals],
                ['Zoom approvals', report.integrations.zoomApprovals],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="font-bold text-slate-700">{label}</span>
                  <span className="font-black text-slate-950">{numberFormat(value as number)}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-wide text-[#2155d9]">View integration approvals &gt;</p>
          </PendingLink>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Playbook AI insights</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Policy intelligence</h3>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <p className="text-sm font-black text-slate-950">{numberFormat(report.playbookAi.questionsAsked)} questions asked</p>
                <div className="mt-3">
                  <CountList items={report.playbookAi.mostReferencedPolicies} empty="Referenced policies appear after Playbook AI answers questions." />
                </div>
              </div>
              <div className="grid gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Missing policy areas</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(report.playbookAi.missingPolicyAreas.length ? report.playbookAi.missingPolicyAreas : ['No missing policy areas detected']).map((item) => (
                      <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">{item}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Approval bottlenecks</p>
                  <div className="mt-2">
                    <CountList items={report.playbookAi.approvalBottlenecks} empty="Bottlenecks appear when conditional or pending records exist." />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
