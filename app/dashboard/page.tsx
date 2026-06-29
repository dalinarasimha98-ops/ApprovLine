import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PendingLink } from '@/components/system/PendingLink';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const startedAt = Date.now();
  console.info('[dashboard] start load');
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  console.info('[dashboard] user query start');
  let userQueryDelayed = false;
  const user = await withTimeout(
    'dashboard user query',
    prisma.user.findUnique({
      where: { clerkUserId: session.userId },
      include: { organization: true },
    }),
    900,
  ).catch((error) => {
    userQueryDelayed = true;
    console.error(`[dashboard] user query delayed after ${Date.now() - startedAt}ms`, error);
    return null;
  });
  console.info(`[dashboard] user query finished in ${Date.now() - startedAt}ms`);

  if (!user?.organization && !userQueryDelayed) {
    return (
      <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Workspace setup</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Complete onboarding</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Create your ApprovLine organization before opening the dashboard.
          </p>
        </div>
        <PendingLink href="/onboarding" pendingText="Opening onboarding..." className="inline-flex min-h-0 h-11 w-fit items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
          Complete onboarding
        </PendingLink>
      </section>
    );
  }

  if (user?.organization && !user.organization.onboardedAt) {
    redirect('/onboarding');
  }

  console.info(`[dashboard] finish load in ${Date.now() - startedAt}ms`);

  return (
    <section className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Workspace overview</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Welcome back to ApprovLine</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Your approval intelligence workspace is ready. Open approval history, audit logs, or integrations from here.
          </p>
        </div>
        <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
          View approval history
        </PendingLink>
      </div>

      {userQueryDelayed ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-900 shadow-sm">
          <h3 className="font-black">Dashboard opened in quick mode</h3>
          <p className="mt-1 text-sm">Workspace verification is taking longer than usual, so ApprovLine opened the dashboard first. Detailed pages will verify data as they load.</p>
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
