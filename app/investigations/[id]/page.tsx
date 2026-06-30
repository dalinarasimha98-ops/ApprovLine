import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { buildInvestigationSummary, buildPolicyChecks, calculateRiskScore, timelineForApproval } from '@/services/investigations';

export const dynamic = 'force-dynamic';

type InvestigationDetailPageProps = {
  params: Promise<{ id: string }>;
};

type InvestigationMetadata = {
  demo?: boolean;
  aiSummary?: {
    whatHappened: string;
    whoApproved: string;
    whyRisky: string;
    policyApplies: string[];
    evidenceExists: string[];
    evidenceMissing: string[];
    riskScore: number;
    riskLevel: string;
  };
  policyChecks?: Array<{ policy: string; status: string; finding: string }>;
};

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
}

function riskClass(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (risk === 'medium') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

function policyClass(status: string) {
  if (status === 'Non-compliant') return 'bg-rose-50 text-rose-700';
  if (status === 'Partially compliant') return 'bg-amber-50 text-amber-800';
  return 'bg-emerald-50 text-emerald-700';
}

async function addNoteAction(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');

  const investigationId = String(formData.get('investigationId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!investigationId || !body) redirect(`/investigations/${investigationId || ''}`);

  await prisma.investigationNote.create({
    data: {
      organizationId: tenant.organization.id,
      investigationId,
      authorUserId: tenant.user.id,
      body,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: tenant.organization.id,
      action: 'investigation.note_added',
      metadata: { investigationId, noteLength: body.length } as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/investigations/${investigationId}`);
  redirect(`/investigations/${investigationId}`);
}

async function updateStatusAction(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization) redirect('/onboarding');
  const investigationId = String(formData.get('investigationId') ?? '');
  const status = String(formData.get('status') ?? 'OPEN') === 'CLOSED' ? 'CLOSED' : 'OPEN';
  await prisma.investigationCase.update({
    where: { id: investigationId, organizationId: tenant.organization.id },
    data: { status },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: tenant.organization.id,
      action: status === 'CLOSED' ? 'investigation.closed' : 'investigation.reopened',
      metadata: { investigationId } as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/investigations/${investigationId}`);
  redirect(`/investigations/${investigationId}`);
}

export default async function InvestigationDetailPage({ params }: InvestigationDetailPageProps) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const investigation = await withTimeout(
    'investigation detail',
    prisma.investigationCase.findFirst({
      where: { id, organizationId: tenant.organization.id },
      include: {
        approvals: {
          include: {
            approvalRecord: {
              include: {
                messageSource: true,
                auditLogs: { orderBy: { createdAt: 'asc' } },
              },
            },
          },
        },
        notes: {
          include: { authorUser: true },
          orderBy: { createdAt: 'desc' },
          take: 25,
        },
      },
    }),
    1500,
  ).catch(() => null);

  if (!investigation) notFound();

  const approvals = investigation.approvals.map((item) => item.approvalRecord);
  const generatedSummary = buildInvestigationSummary(approvals);
  const metadata = (investigation.metadata ?? {}) as InvestigationMetadata;
  const summary = metadata.aiSummary ?? generatedSummary;
  const policyChecks = metadata.policyChecks ?? buildPolicyChecks(approvals);
  const timeline = approvals.flatMap(timelineForApproval).sort((left, right) => left.at.getTime() - right.at.getTime());
  const riskScore = Math.max(summary.riskScore, ...approvals.map(calculateRiskScore), 0);

  return (
    <DashboardShell>
      <section className="grid gap-6">
        <div className="rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
          <PendingLink href="/investigations" pendingText="Back to investigations..." className="text-xs font-black uppercase tracking-wide text-blue-200">
            &lt;- Investigation Center
          </PendingLink>
          <div className="mt-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Investigation Case</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">{investigation.title}</h2>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">{investigation.summary ?? summary.whatHappened}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${investigation.status === 'OPEN' ? 'border-blue-100 bg-blue-50 text-[#2155d9]' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>{investigation.status}</span>
              <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${riskClass(investigation.riskLevel)}`}>{summary.riskLevel} risk</span>
              {metadata.demo ? <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-blue-100">Demo</span> : null}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <PendingLink href={`/api/export/investigations/${investigation.id}/report`} pendingText="Preparing report..." className="inline-flex h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-950/30">
              Export PDF Report
            </PendingLink>
            <form action={updateStatusAction}>
              <input type="hidden" name="investigationId" value={investigation.id} />
              <input type="hidden" name="status" value={investigation.status === 'OPEN' ? 'CLOSED' : 'OPEN'} />
              <FormSubmitButton pendingText="Updating..." className="min-h-0 h-11 rounded-xl border border-white/10 bg-white/[0.08] px-5 text-sm font-black text-white">
                {investigation.status === 'OPEN' ? 'Close Investigation' : 'Reopen Investigation'}
              </FormSubmitButton>
            </form>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['Approvals', approvals.length],
            ['Risk Score', riskScore],
            ['Evidence Items', timeline.length],
            ['Policy Checks', policyChecks.length],
            ['Notes', investigation.notes.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">AI Investigation Summary</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">What happened, why it matters, and what is missing</h3>
            <div className="mt-5 grid gap-4 text-sm leading-6 text-slate-600">
              <p><span className="font-black text-slate-950">What happened:</span> {summary.whatHappened}</p>
              <p><span className="font-black text-slate-950">Who approved:</span> {summary.whoApproved}</p>
              <p><span className="font-black text-slate-950">Why risky:</span> {summary.whyRisky}</p>
              <div>
                <p className="font-black text-slate-950">Policy applies:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {summary.policyApplies.map((policy) => (
                    <span key={policy} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#2155d9]">{policy}</span>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-4">
                  <p className="font-black text-emerald-800">Evidence exists</p>
                  <ul className="mt-2 grid gap-1 text-emerald-800">
                    {(summary.evidenceExists.length ? summary.evidenceExists : ['No evidence attached yet']).map((item) => <li key={item}>- {item}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="font-black text-amber-900">Evidence missing</p>
                  <ul className="mt-2 grid gap-1 text-amber-900">
                    {(summary.evidenceMissing.length ? summary.evidenceMissing : ['No missing evidence detected']).map((item) => <li key={item}>- {item}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Playbook AI Integration</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Policy compliance checks</h3>
            <div className="mt-5 grid gap-3">
              {policyChecks.map((check) => (
                <div key={check.policy} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-slate-950">{check.policy}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${policyClass(check.status)}`}>{check.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{check.finding}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Evidence Timeline</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Chronological source, decision, policy, and audit events</h3>
            <div className="mt-6 grid gap-4">
              {timeline.map((event, index) => (
                <div key={`${event.type}-${event.at.toISOString()}-${index}`} className="grid gap-3 border-l-2 border-blue-100 pl-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">{event.type}</p>
                        <p className="mt-1 font-black text-slate-950">{event.title}</p>
                      </div>
                      <p className="text-xs font-bold text-slate-500">{dateText(event.at)}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{event.body}</p>
                  </div>
                </div>
              ))}
              {timeline.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No timeline evidence attached.</p> : null}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Approval Details</p>
              <div className="mt-5 grid gap-3">
                {approvals.map((approval) => (
                  <div key={approval.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">{approval.subject}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {approval.approverName ?? 'Unknown'} · {approval.department ?? 'Unassigned'} · {approval.sourcePlatform ?? 'unknown'} · {dateText(approval.approvalTimestamp ?? approval.occurredAt)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black capitalize ${riskClass(approval.riskLevel)}`}>{approval.riskLevel ?? 'low'}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[#2155d9]">{approval.confidence}% confidence</span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">{approval.status.replaceAll('_', ' ')}</span>
                      <PendingLink href={`/approvals/${approval.id}`} pendingText="Opening approval..." className="rounded-full bg-white px-2.5 py-1 text-[#2155d9]">
                        View Full Approval
                      </PendingLink>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form action={addNoteAction} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <input type="hidden" name="investigationId" value={investigation.id} />
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Investigation Notes</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Legal, compliance, and audit notes</h3>
              <textarea name="body" rows={4} placeholder="Add finding, follow-up, or reviewer note..." className="mt-5 w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
              <FormSubmitButton pendingText="Adding note..." className="mt-3 min-h-0 h-10 rounded-lg bg-[#2155d9] px-4 text-sm font-bold text-white shadow-sm shadow-blue-200">
                Add Note
              </FormSubmitButton>
              <div className="mt-5 grid gap-3">
                {investigation.notes.map((note) => (
                  <div key={note.id} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold leading-6 text-slate-700">{note.body}</p>
                    <p className="mt-2 text-xs font-bold text-slate-500">{note.authorUser?.name ?? note.authorUser?.email ?? 'Reviewer'} · {dateText(note.createdAt)}</p>
                  </div>
                ))}
                {investigation.notes.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No notes yet.</p> : null}
              </div>
            </form>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
