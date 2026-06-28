import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { ApprovalTable } from '@/components/dashboard/ApprovalTable';
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
  const { organization } = await getCurrentTenant();
  const filters = await searchParams;
  const occurredAt: Prisma.DateTimeFilter = {};
  if (filters.from) occurredAt.gte = new Date(filters.from);
  if (filters.to) occurredAt.lte = new Date(filters.to);
  const approvals = await prisma.approvalRecord.findMany({
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
    take: 100,
  });

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-2xl font-black">Approval history</h2>
        <p className="text-slate-600">Search and filter every captured approval record.</p>
      </div>
      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input name="q" placeholder="Search approvals" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="employee" placeholder="Filter by employee" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="department" placeholder="Filter by department" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="sourcePlatform" placeholder="Source platform" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="category" placeholder="Category" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="riskLevel" placeholder="Risk level" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="approvalType" placeholder="Approval type" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="from" type="date" className="rounded-md border border-slate-200 px-3 py-2" />
        <input name="to" type="date" className="rounded-md border border-slate-200 px-3 py-2" />
        <button className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">Apply filters</button>
      </form>
      <ApprovalTable approvals={approvals} />
    </section>
  );
}
