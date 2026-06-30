import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { createDemoInvestigationsForOrganization, createInvestigationCase, getInvestigationMetrics } from '@/services/investigations';

export const dynamic = 'force-dynamic';

type InvestigationsPageProps = {
  searchParams: Promise<{
    q?: string;
    department?: string;
    source?: string;
    risk?: string;
    approvalId?: string;
  }>;
};

function contains(value?: string) {
  return value ? { contains: value, mode: 'insensitive' as const } : undefined;
}

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
}

function riskClass(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (risk === 'medium') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

function MetricCard({ label, value, help, tone = 'blue' }: { label: string; value: number; help: string; tone?: 'blue' | 'amber' | 'rose' | 'green' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-[#2155d9]',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-700',
    green: 'bg-emerald-50 text-emerald-700',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${toneClass}`}>{label}</div>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{help}</p>
    </div>
  );
}

async function createInvestigationAction(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization) redirect('/onboarding');

  const approvalIds = formData.getAll('approvalIds').map(String).filter(Boolean);
  const department = String(formData.get('department') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const from = String(formData.get('from') ?? '').trim();
  const to = String(formData.get('to') ?? '').trim();

  const investigation = await createInvestigationCase({
    organizationId: tenant.organization.id,
    title,
    approvalIds,
    department: department || undefined,
    dateRangeStart: from ? new Date(from) : undefined,
    dateRangeEnd: to ? new Date(to) : undefined,
  });
  redirect(`/investigations/${investigation.id}`);
}

async function seedInvestigationsAction() {
  'use server';
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization) redirect('/onboarding');
  await createDemoInvestigationsForOrganization(tenant.organization.id);
  redirect('/investigations?demo=created');
}

export default async function InvestigationsPage({ searchParams }: InvestigationsPageProps) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const filters = await searchParams;
  const caseWhere: Prisma.InvestigationCaseWhereInput = {
    organizationId: tenant.organization.id,
    ...(filters.department ? { department: contains(filters.department) } : {}),
    ...(filters.risk ? { riskLevel: filters.risk.toLowerCase() } : {}),
    ...(filters.q
      ? {
          OR: [
            { title: contains(filters.q) },
            { summary: contains(filters.q) },
            { department: contains(filters.q) },
            { approvals: { some: { approvalRecord: { subject: contains(filters.q) } } } },
            { approvals: { some: { approvalRecord: { approverName: contains(filters.q) } } } },
            { approvals: { some: { approvalRecord: { sourcePlatform: contains(filters.q) } } } },
          ],
        }
      : {}),
  };

  const approvalWhere: Prisma.ApprovalRecordWhereInput = {
    organizationId: tenant.organization.id,
    OR: [
      ...(filters.approvalId ? [{ id: filters.approvalId }] : []),
      { riskLevel: 'high' },
      { riskLevel: 'critical' },
      { approvalType: 'CONDITIONAL' },
      { status: 'PENDING_REVIEW' },
      { evidenceSnippet: null },
      { sourceLink: null },
    ],
    ...(filters.department ? { department: contains(filters.department) } : {}),
    ...(filters.source ? { sourcePlatform: contains(filters.source) } : {}),
    ...(filters.risk ? { riskLevel: filters.risk.toLowerCase() } : {}),
  };

  const [metrics, investigations, riskyApprovals] = await Promise.all([
    withTimeout('investigation metrics', getInvestigationMetrics(tenant.organization.id), 1200),
    withTimeout(
      'investigation cases',
      prisma.investigationCase.findMany({
        where: caseWhere,
        include: {
          approvals: {
            include: { approvalRecord: true },
            take: 4,
          },
          notes: { take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      1400,
    ),
    withTimeout(
      'investigation risky approvals',
      prisma.approvalRecord.findMany({
        where: approvalWhere,
        include: { messageSource: true },
        orderBy: { occurredAt: 'desc' },
        take: 12,
      }),
      1400,
    ),
  ]);

  return (
    <DashboardShell>
      <section className="grid gap-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Approval Investigation Center</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Investigate risky approvals end-to-end</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
            Convert approval evidence into legal, compliance, finance, procurement, and audit-ready investigation cases with source evidence, policy context, notes, and report export.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <PendingLink href="/analytics/drilldown/high-risk-approvals" pendingText="Opening risk KPI..." className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.08] px-4 text-sm font-black text-white">
              Review high-risk KPI
            </PendingLink>
            <form action={seedInvestigationsAction}>
              <FormSubmitButton pendingText="Creating demo cases..." className="min-h-0 h-10 rounded-xl bg-[#2155d9] px-4 text-sm font-black text-white shadow-sm shadow-blue-950/30">
                Generate demo investigations
              </FormSubmitButton>
            </form>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Open investigations" value={metrics.openInvestigations} help="Active legal and audit cases." />
          <MetricCard label="Closed investigations" value={metrics.closedInvestigations} help="Resolved cases with trail." tone="green" />
          <MetricCard label="High-risk approvals" value={metrics.highRiskApprovals} help="Records requiring review." tone="rose" />
          <MetricCard label="Missing approvals" value={metrics.missingApprovals} help="Pending review records." tone="amber" />
          <MetricCard label="Conditional approvals" value={metrics.conditionalApprovals} help="Conditions need verification." tone="amber" />
          <MetricCard label="No evidence" value={metrics.approvalsWithoutEvidence} help="Missing source proof." tone="rose" />
        </div>

        <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
          {[
            ['q', 'Search approval, approver, source'],
            ['department', 'Department'],
            ['source', 'Source'],
            ['risk', 'Risk'],
          ].map(([name, label]) => (
            <label key={name} className="grid gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
              <input name={name} defaultValue={filters[name as keyof typeof filters] ?? ''} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
            </label>
          ))}
          <div className="flex items-end gap-2">
            <FormSubmitButton pendingText="Searching..." className="min-h-0 h-11 rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200">
              Search
            </FormSubmitButton>
            <PendingLink href="/investigations" pendingText="Clearing..." className="inline-flex h-11 items-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">
              Clear
            </PendingLink>
          </div>
        </form>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <form action={createInvestigationAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Create investigation</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Select approvals and scope</h3>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Case title</span>
                <input name="title" placeholder="Vendor payment evidence review" className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Department</span>
                  <input name="department" defaultValue={filters.department ?? ''} placeholder="Procurement" className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">From</span>
                  <input name="from" type="date" className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">To</span>
                  <input name="to" type="date" className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
                </label>
              </div>
              <div className="grid gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Risk queue</p>
                {riskyApprovals.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No risky approvals found. Generate demo data or connect Slack/Gmail.</p>
                ) : (
                  riskyApprovals.map((approval) => (
                    <label key={approval.id} className="flex gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                      <input type="checkbox" name="approvalIds" value={approval.id} defaultChecked={filters.approvalId === approval.id} className="mt-1 h-4 w-4 accent-[#2155d9]" />
                      <span>
                        <span className="block font-black text-slate-950">{approval.subject}</span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">
                          {approval.department ?? 'Unassigned'} · {approval.approverName ?? 'Unknown approver'} · {approval.sourcePlatform ?? 'unknown'} · {dateText(approval.occurredAt)}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <FormSubmitButton pendingText="Creating case..." className="min-h-0 h-11 rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200">
                Create Investigation Case
              </FormSubmitButton>
            </div>
          </form>

          <div className="grid gap-4">
            {investigations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-8 text-center shadow-sm">
                <h3 className="text-lg font-black text-slate-950">No investigation cases yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Create a case from risky approvals or generate demo investigations to show the full customer workflow.</p>
              </div>
            ) : (
              investigations.map((item) => {
                const approvalCount = item.approvals.length;
                const metadata = item.metadata as { demo?: boolean } | null;
                return (
                  <PendingLink key={item.id} href={`/investigations/${item.id}`} pendingText="Opening investigation..." className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${item.status === 'OPEN' ? 'border-blue-100 bg-blue-50 text-[#2155d9]' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>{item.status}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-black capitalize ${riskClass(item.riskLevel)}`}>{item.riskLevel ?? 'low'} risk</span>
                          {metadata?.demo ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">Demo</span> : null}
                        </div>
                        <h3 className="mt-3 text-lg font-black text-slate-950">{item.title}</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{item.summary ?? 'Case is ready for investigation.'}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-black text-slate-950">{approvalCount} approvals</p>
                        <p className="font-semibold text-slate-500">{dateText(item.updatedAt)}</p>
                      </div>
                    </div>
                  </PendingLink>
                );
              })
            )}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
