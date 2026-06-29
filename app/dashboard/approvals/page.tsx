import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { ApprovalTable } from '@/components/dashboard/ApprovalTable';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { withTimeout } from '@/lib/performance';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    employee?: string;
    department?: string;
    sourcePlatform?: string;
    category?: string;
    riskLevel?: string;
    approvalType?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const startedAt = Date.now();
  console.info('[dashboard] approvals page start load');
  const { organization } = await getCurrentTenant();
  const filters = await searchParams;
  const occurredAt: Prisma.DateTimeFilter = {};
  if (filters.from) occurredAt.gte = new Date(filters.from);
  if (filters.to) occurredAt.lte = new Date(filters.to);
  let approvals: Awaited<ReturnType<typeof prisma.approvalRecord.findMany>> = [];
  let loadError: string | null = null;

  try {
    console.info('[dashboard] approvals query start');
    approvals = await withTimeout(
      'dashboard approvals query',
      prisma.approvalRecord.findMany({
        where: {
          organizationId: organization.id,
          ...(filters.department ? { department: { contains: filters.department, mode: 'insensitive' } } : {}),
          ...(filters.employee ? { approverName: { contains: filters.employee, mode: 'insensitive' } } : {}),
          ...(filters.sourcePlatform ? { sourcePlatform: { contains: filters.sourcePlatform, mode: 'insensitive' } } : {}),
          ...(filters.category ? { category: { contains: filters.category, mode: 'insensitive' } } : {}),
          ...(filters.riskLevel ? { riskLevel: filters.riskLevel.toLowerCase() } : {}),
          ...(filters.approvalType ? { approvalType: filters.approvalType.toUpperCase() as Prisma.EnumApprovalTypeFilter['equals'] } : {}),
          ...(filters.from || filters.to ? { occurredAt } : {}),
          ...(filters.q
            ? {
                OR: [
                  { subject: { contains: filters.q, mode: 'insensitive' } },
                  { reasoning: { contains: filters.q, mode: 'insensitive' } },
                  { evidenceSnippet: { contains: filters.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      1500,
    );
    console.info(`[dashboard] approvals query finished in ${Date.now() - startedAt}ms`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load approvals.';
    console.error(`[dashboard] approvals query failed after ${Date.now() - startedAt}ms`, error);
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Approval evidence</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Approval history</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Search and filter every captured approval record across Slack, Gmail, and future connectors.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">Records shown</span>
          <span className="text-2xl font-black text-slate-950">{approvals.length}</span>
        </div>
      </div>
      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        {[
          ['q', 'Search approvals'],
          ['employee', 'Approver'],
          ['department', 'Department'],
          ['sourcePlatform', 'Source platform'],
          ['category', 'Category'],
          ['riskLevel', 'Risk level'],
          ['approvalType', 'Approval type'],
        ].map(([name, placeholder]) => (
          <label key={name} className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{placeholder}</span>
            <input name={name} placeholder={placeholder} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
          </label>
        ))}
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">From</span>
          <input name="from" type="date" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">To</span>
          <input name="to" type="date" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
        </label>
        <div className="flex items-end">
          <FormSubmitButton pendingText="Filtering..." className="min-h-0 h-11 w-full rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
            Apply filters
          </FormSubmitButton>
        </div>
      </form>
      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
          <h3 className="font-black">Unable to load approvals</h3>
          <p className="mt-1 text-sm">The dashboard stopped waiting so you are not stuck on an infinite loading screen.</p>
          <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs font-semibold">{loadError}</p>
          <PendingLink href="/dashboard/approvals" pendingText="Retrying..." className="mt-3 inline-flex min-h-0 h-10 items-center justify-center rounded-lg bg-[#2155d9] px-3 text-sm font-bold text-white shadow-sm shadow-blue-200">
            Retry
          </PendingLink>
        </div>
      ) : null}
      <ApprovalTable approvals={approvals} />
    </section>
  );
}
