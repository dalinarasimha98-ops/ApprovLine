import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildExecutiveAnalytics } from '@/services/analytics';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const metricCopy: Record<string, { title: string; eyebrow: string; description: string }> = {
  'approvals-captured': {
    eyebrow: 'Approvals Captured',
    title: 'All approvals behind the KPI',
    description: 'Every approval and rejection included in the executive approvals captured calculation.',
  },
  'high-risk-approvals': {
    eyebrow: 'High-Risk Approvals',
    title: 'High-risk approval records',
    description: 'Security, compliance, procurement, legal, and finance-sensitive approvals behind the high-risk KPI.',
  },
  'time-saved': {
    eyebrow: 'Time Saved',
    title: 'Time saved methodology',
    description: 'How ApprovLine estimates manual search time, audit preparation time, and retrieval time avoided.',
  },
  traceability: {
    eyebrow: 'Traceability',
    title: 'Traceability evidence',
    description: 'Approvals with approver, timestamp, source, evidence, and audit-trail coverage.',
  },
  'compliance-readiness': {
    eyebrow: 'Compliance Readiness',
    title: 'Compliance readiness records',
    description: 'Approval evidence behind audit completeness, evidence coverage, and approval traceability scores.',
  },
  'approval-categories': {
    eyebrow: 'Approval Categories',
    title: 'Department and category breakdown',
    description: 'Approvals grouped by department, category, and decision type.',
  },
  'integration-insights': {
    eyebrow: 'Integration Insights',
    title: 'Approval source contribution',
    description: 'Approvals captured from Slack, Gmail, Teams, Outlook, and other sources.',
  },
};

type DrilldownPageProps = {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{
    q?: string;
    department?: string;
    category?: string;
    source?: string;
    riskLevel?: string;
    from?: string;
    to?: string;
  }>;
};

function contains(value: string | undefined) {
  return value ? { contains: value, mode: 'insensitive' as const } : undefined;
}

function numberFormat(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No timestamp';
}

function countBy<T>(items: T[], fn: (item: T) => string | null | undefined) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = fn(item)?.trim() || 'Unassigned';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

function CountBars({ title, items }: { title: string; items: Array<{ name: string; count: number }> }) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <div className="mt-4 grid gap-3">
        {items.length === 0 ? <p className="text-sm font-semibold text-slate-500">No matching records.</p> : items.map((item) => (
          <div key={item.name} className="grid gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-slate-700">{item.name}</span>
              <span className="font-black text-slate-950">{numberFormat(item.count)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-[#2155d9]" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function AnalyticsDrilldownPage({ params, searchParams }: DrilldownPageProps) {
  const { metric } = await params;
  const copy = metricCopy[metric] ?? metricCopy['approvals-captured'];
  const filters = await searchParams;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const occurredAt: Prisma.DateTimeFilter = {};
  if (filters.from) occurredAt.gte = new Date(filters.from);
  if (filters.to) occurredAt.lte = new Date(filters.to);

  const baseWhere: Prisma.ApprovalRecordWhereInput = {
    organizationId: tenant.organization.id,
    ...(filters.department ? { department: contains(filters.department) } : {}),
    ...(filters.category ? { category: contains(filters.category) } : {}),
    ...(filters.source ? { sourcePlatform: contains(filters.source) } : {}),
    ...(filters.riskLevel ? { riskLevel: filters.riskLevel.toLowerCase() } : {}),
    ...(filters.from || filters.to ? { occurredAt } : {}),
    ...(filters.q
      ? {
          OR: [
            { subject: contains(filters.q) },
            { approverName: contains(filters.q) },
            { department: contains(filters.q) },
            { sourcePlatform: contains(filters.q) },
          ],
        }
      : {}),
  };

  const metricWhere: Prisma.ApprovalRecordWhereInput =
    metric === 'high-risk-approvals'
      ? { AND: [baseWhere, { OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }] }] }
      : metric === 'traceability'
        ? { AND: [baseWhere, { approverName: { not: null }, approvalTimestamp: { not: null }, sourcePlatform: { not: null } }] }
        : baseWhere;

  const [report, approvals] = await Promise.all([
    buildExecutiveAnalytics(tenant.organization.id),
    withTimeout(
      `analytics drilldown ${metric}`,
      prisma.approvalRecord.findMany({
        where: metricWhere,
        include: { auditLogs: true, messageSource: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      900,
    ).catch(() => []),
  ]);

  const traceable = approvals.filter((approval) => approval.approverName && approval.approvalTimestamp && approval.sourcePlatform && approval.evidenceSnippet && approval.auditLogs.length > 0).length;
  const riskByDepartment = countBy(approvals, (approval) => approval.department);
  const riskByCategory = countBy(approvals, (approval) => approval.category);
  const riskBySource = countBy(approvals, (approval) => approval.sourcePlatform);

  return (
    <DashboardShell>
      <section className="grid gap-6">
        <div className="rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
          <PendingLink href="/analytics" pendingText="Back to analytics..." className="text-xs font-black uppercase tracking-wide text-blue-200">
            &lt;- Executive ROI
          </PendingLink>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-blue-200">{copy.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">{copy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{copy.description}</p>
        </div>

        <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
          {[
            ['q', 'Search title, approver, department, source'],
            ['department', 'Department'],
            ['category', 'Category'],
            ['source', 'Source'],
            ['riskLevel', 'Risk level'],
          ].map(([name, placeholder]) => (
            <label key={name} className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{placeholder}</span>
              <input name={name} defaultValue={filters[name as keyof typeof filters] ?? ''} placeholder={placeholder} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
            </label>
          ))}
          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">From</span>
            <input name="from" defaultValue={filters.from ?? ''} type="date" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">To</span>
            <input name="to" defaultValue={filters.to ?? ''} type="date" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
          </label>
          <div className="flex items-end gap-2">
            <FormSubmitButton pendingText="Filtering..." className="min-h-0 h-11 rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
              Apply filters
            </FormSubmitButton>
            <PendingLink href={`/analytics/drilldown/${metric}`} pendingText="Clearing..." className="inline-flex min-h-0 h-11 items-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">
              Clear
            </PendingLink>
          </div>
        </form>

        {metric === 'time-saved' ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Manual Retrieval Time', `${numberFormat(report.timeSaved.retrievalHours)} hrs`, 'Approval lookup and source-link retrieval avoided.'],
              ['Audit Preparation Time', `${numberFormat(report.timeSaved.auditPreparationHours)} hrs`, 'Evidence reconstruction and audit prep avoided.'],
              ['Search Time Saved', `${numberFormat(report.timeSaved.manualSearchHours)} hrs`, 'Manual search across Slack, Gmail, and tools avoided.'],
            ].map(([label, value, help]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">{label}</p>
                <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{help}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm font-semibold leading-6 text-slate-700 md:col-span-3">
              Methodology: ApprovLine estimates 4.8 minutes for approval retrieval, 6.6 minutes for manual search, and additional audit preparation effort for high-risk, conditional, and rejection records. These are conservative planning estimates for executive ROI discussions.
            </div>
          </div>
        ) : null}

        {metric === 'traceability' || metric === 'compliance-readiness' ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['Approver present', approvals.filter((approval) => approval.approverName).length],
              ['Timestamp present', approvals.filter((approval) => approval.approvalTimestamp).length],
              ['Source present', approvals.filter((approval) => approval.sourcePlatform).length],
              ['Evidence + audit trail', traceable],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-black text-slate-950">{numberFormat(value as number)}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <CountBars title={metric === 'high-risk-approvals' ? 'Risk by department' : 'Records by department'} items={riskByDepartment} />
          <CountBars title={metric === 'high-risk-approvals' ? 'Risk by category' : 'Records by category'} items={riskByCategory} />
          <CountBars title={metric === 'high-risk-approvals' ? 'Risk by source platform' : 'Records by source platform'} items={riskBySource} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Detailed records</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{numberFormat(approvals.length)} records behind this number</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Approval ID</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Approver</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((approval) => (
                  <tr key={approval.id} className="border-t border-slate-100 align-top hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{approval.id.slice(0, 10)}</td>
                    <td className="max-w-[260px] px-4 py-3 font-black text-slate-950">{approval.subject}</td>
                    <td className="px-4 py-3 text-slate-600">{approval.category ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{approval.riskLevel ?? 'low'}</td>
                    <td className="px-4 py-3 text-slate-600">{approval.approverName ?? 'Unknown'}</td>
                    <td className="px-4 py-3 text-slate-600">{approval.department ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{approval.sourcePlatform ?? 'Unknown'}</td>
                    <td className="px-4 py-3 text-slate-500">{dateText(approval.approvalTimestamp ?? approval.createdAt)}</td>
                    <td className="px-4 py-3 font-black text-[#2155d9]">{approval.confidence}%</td>
                    <td className="px-4 py-3 text-slate-600">{approval.status.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <PendingLink href={`/approvals/${approval.id}`} pendingText="Opening..." className="text-xs font-black text-[#2155d9] hover:underline">
                        View Full Approval
                      </PendingLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {approvals.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-black text-slate-950">No matching records</p>
                <p className="mt-2 text-sm text-slate-500">Adjust filters or generate demo data to inspect KPI details.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
