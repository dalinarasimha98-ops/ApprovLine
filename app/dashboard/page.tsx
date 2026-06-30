import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; reason?: string }>;
}) {
  const startedAt = Date.now();
  console.info('[dashboard] start load');
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const tenant = await getDashboardTenant(1500);
  const query = await searchParams;

  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    redirect('/onboarding');
  }

  const workspaceWarning = tenant.status !== 'ready' ? tenant.error ?? 'Workspace verification is temporarily unavailable.' : null;

  console.info(`[dashboard] finish load in ${Date.now() - startedAt}ms`);

  return (
    <section className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Workspace overview</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {tenant.organization?.name ? `${tenant.organization.name} dashboard` : 'Welcome back to ApprovLine'}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Your approval intelligence workspace is ready. Open approval history, audit logs, or integrations from here.
          </p>
        </div>
        <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
          View approval history
        </PendingLink>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Approval history', 'Open', 'Searchable approval records'],
          ['Audit trail', 'Ready', 'Compliance activity entries'],
          ['Integrations', 'Manage', 'Slack, Gmail, Teams, Zoom'],
          ['Review queue', 'Available', 'Low-confidence approvals'],
        ].map(([label, value, help]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{help}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-black text-slate-950">Connect Slack or Gmail to start capturing approvals</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              New workspace? Generate safe sample approvals to demo finance, procurement, legal, engineering, and compliance workflows.
            </p>
          </div>
          <form action="/api/demo/seed" method="post">
            <FormSubmitButton pendingText="Generating..." className="min-h-0 h-11 rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
              Generate demo data
            </FormSubmitButton>
          </form>
        </div>
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
