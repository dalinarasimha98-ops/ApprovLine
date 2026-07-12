import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

async function safeMetric<T>(label: string, query: Promise<T>, fallback: T) {
  try {
    return await withTimeout(label, query, 1200);
  } catch (error) {
    console.error(`[dashboard] ${label} failed`, error);
    return fallback;
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; reason?: string }>;
}) {
  const startedAt = Date.now();
  console.info('[dashboard] start load');
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const tenant = await getDashboardTenant(8000);
  const query = await searchParams;

  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    redirect('/onboarding');
  }

  const workspaceWarning = tenant.status !== 'ready' ? tenant.error ?? 'Workspace verification is temporarily unavailable.' : null;
  const organizationId = tenant.organization?.id;
  const [totalApprovals, pendingReview, highRiskApprovals, connectedIntegrations, recentApprovals, categoryGroups] = organizationId
    ? await Promise.all([
        safeMetric('total approvals', prisma.approvalRecord.count({ where: { organizationId } }), 0),
        safeMetric('pending approvals', prisma.approvalRecord.count({ where: { organizationId, status: 'PENDING_REVIEW' } }), 0),
        safeMetric('high risk approvals', prisma.approvalRecord.count({ where: { organizationId, riskLevel: 'high' } }), 0),
        safeMetric('connected integrations', prisma.integration.count({ where: { organizationId, status: { in: ['CONNECTED', 'SYNCING'] } } }), 0),
        safeMetric(
          'recent approvals',
          prisma.approvalRecord.findMany({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
            take: 5,
          }),
          [],
        ),
        safeMetric(
          'approval categories',
          prisma.approvalRecord.groupBy({
            by: ['category'],
            where: { organizationId },
            _count: { _all: true },
            orderBy: { _count: { category: 'desc' } },
            take: 5,
          }),
          [],
        ),
      ])
    : [0, 0, 0, 0, [], []] as const;

  console.info(`[dashboard] finish load in ${Date.now() - startedAt}ms`);

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Workspace overview</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">
            {tenant.organization?.name ? `${tenant.organization.name} dashboard` : 'Welcome back to ApprovLine'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Your approval intelligence workspace is ready. Open approval history, audit logs, or integrations from here.
          </p>
        </div>
        <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-950/30 hover:bg-[#2f66ff]">
          View approval history
        </PendingLink>
        </div>
      </div>

      {workspaceWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <h3 className="font-black">Workspace data is delayed</h3>
          <p className="mt-1 text-sm">{workspaceWarning}</p>
          <PendingLink href="/api/debug/dashboard" pendingText="Opening diagnostics..." className="mt-3 inline-flex min-h-0 h-10 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-bold text-amber-900 shadow-sm">
            Open dashboard diagnostics
          </PendingLink>
        </div>
      ) : null}

      {query.demo === 'error' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-sm">
          <h3 className="font-black">Demo data could not be generated</h3>
          <p className="mt-1 text-sm">{query.reason ?? 'Please try again or check database readiness.'}</p>
        </div>
      ) : null}
      {query.demo === 'reset' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-700 shadow-sm">
          <h3 className="font-black text-slate-950">Demo data reset</h3>
          <p className="mt-1 text-sm">Your workspace demo records were removed. Real approval data was left untouched.</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Approvals captured', totalApprovals, 'All recorded approval decisions'],
          ['Pending review', pendingReview, 'Low-confidence or conditional records'],
          ['High-risk approvals', highRiskApprovals, 'Security, compliance, legal risk'],
          ['Connected integrations', connectedIntegrations, 'Active approval sources'],
        ].map(([label, value, help]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{help}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Recent timeline</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Latest approval activity</h3>
            </div>
            <PendingLink href="/dashboard/approvals" pendingText="Opening..." className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
              View all
            </PendingLink>
          </div>
          <div className="mt-5 grid gap-3">
            {recentApprovals.length > 0 ? recentApprovals.map((approval) => (
              <div key={approval.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{approval.subject}</p>
                    <p className="mt-1 text-sm text-slate-500">{approval.approverName ?? 'Unknown approver'} · {approval.department ?? 'Unassigned'}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black uppercase text-[#2155d9]">{approval.confidence}%</span>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <p className="font-black text-slate-950">No approval activity yet</p>
                <p className="mt-1 text-sm text-slate-500">Connect Slack or Gmail, or generate sample data.</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Categories</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Approval mix</h3>
          <div className="mt-5 grid gap-3">
            {categoryGroups.length > 0 ? categoryGroups.map((item) => (
              <div key={item.category ?? 'Unassigned'} className="grid gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700">{item.category ?? 'Unassigned'}</span>
                  <span className="font-black text-slate-950">{item._count._all}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-[#2155d9]" style={{ width: `${Math.min(100, item._count._all * 18)}%` }} />
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">Categories appear once approvals are captured.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-black text-slate-950">Generate a polished demo workspace</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Create marked demo records for the full journey: Slack/Gmail message, approval detection, timeline, audit log, and export.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action="/api/demo/seed" method="post">
              <FormSubmitButton pendingText="Generating..." className="inline-flex min-h-0 h-11 items-center gap-2 rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
                Generate Demo Workspace
              </FormSubmitButton>
            </form>
            <form action="/api/demo/reset" method="post">
              <FormSubmitButton pendingText="Resetting..." className="inline-flex min-h-0 h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                Reset Demo Data
              </FormSubmitButton>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Demo exports</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Share customer-ready evidence</h3>
          <p className="mt-1 text-sm text-slate-500">Export approval evidence with demo markers, source links, confidence scores, and audit-ready metadata.</p>
        </div>
        <PendingLink href="/api/export/approvals?format=csv" pendingText="Preparing CSV..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Export CSV
        </PendingLink>
        <PendingLink href="/api/export/approvals?format=pdf" pendingText="Preparing PDF..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#07111f] px-4 text-sm font-bold text-white hover:bg-slate-800">
          Export PDF
        </PendingLink>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PendingLink href="/dashboard/settings/integrations" pendingText="Opening integrations..." className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="block text-lg font-black text-slate-950">Connect integrations</span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">Manage Slack and Gmail connectors, run demo ingestion, and review sync state.</span>
        </PendingLink>
        <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="block text-lg font-black text-slate-950">Review approvals</span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">Filter by source, approver, department, risk level, category, and date range.</span>
        </PendingLink>
        <PendingLink href="/dashboard/audit" pendingText="Opening audit logs..." className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="block text-lg font-black text-slate-950">Open audit trail</span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">Inspect immutable operational and compliance events for this workspace.</span>
        </PendingLink>
      </div>
    </section>
  );
}
