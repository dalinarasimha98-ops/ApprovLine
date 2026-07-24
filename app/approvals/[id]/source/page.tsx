import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { prisma } from '@/lib/prisma';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
}

export default async function ApprovalSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard/approvals');

  const result = await withTimeout(
    'approval source lookup',
    prisma.approvalRecord.findFirst({
      where: { id, organizationId: tenant.organization.id },
      include: { messageSource: true },
    }),
    5000,
  ).then(
    (approval) => ({ approval, error: null as unknown }),
    (error: unknown) => ({ approval: null, error }),
  );

  if (result.error) {
    const correlationId = reportApprovalFailure(result.error, {
      action: 'open_source', approvalId: id, organizationId: tenant.organization.id, userId: tenant.session.userId,
    });
    return (
      <DashboardShell>
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-amber-800">Evidence temporarily unavailable</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">The source record could not be loaded</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your approval is safe. Retry the evidence lookup or return to the approval record.</p>
          <p className="mt-3 text-xs font-bold text-slate-500">Reference: {correlationId}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <PendingLink href={`/approvals/${id}/source`} pendingText="Retrying..." className="inline-flex h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white">Retry</PendingLink>
            <PendingLink href={`/approvals/${id}`} pendingText="Opening approval..." className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700">Back to approval</PendingLink>
          </div>
        </section>
      </DashboardShell>
    );
  }

  if (!result.approval) {
    reportApprovalFailure(new Error('Approval source missing'), {
      action: 'open_source', approvalId: id, organizationId: tenant.organization.id, userId: tenant.session.userId,
      reason: 'Approval was deleted or does not belong to this tenant.',
    });
    notFound();
  }

  const approval = result.approval;
  const externalUrl = getSafeEvidenceUrl(approval.sourceLink);
  const source = approval.messageSource;

  return (
    <DashboardShell>
      <section className="mx-auto grid max-w-5xl gap-6">
        <div className="rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
          <PendingLink href={`/approvals/${id}`} pendingText="Opening approval..." className="text-xs font-black uppercase tracking-wide text-blue-200">&lt;- Full approval</PendingLink>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-blue-200">Source Evidence</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{approval.subject}</h1>
          <p className="mt-3 text-sm text-slate-300">Captured from {approval.sourcePlatform ?? source?.provider ?? 'an enterprise source'} on {dateText(approval.approvalTimestamp ?? approval.occurredAt)}.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Captured Evidence</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Decision context</h2>
            {approval.evidenceSnippet ? (
              <blockquote className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-base font-semibold leading-7 text-slate-700">“{approval.evidenceSnippet}”</blockquote>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <p className="font-black text-slate-950">Evidence text was not retained</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">The source metadata remains available below for audit traceability.</p>
              </div>
            )}
            <div className="mt-5 grid gap-3 text-sm leading-6 text-slate-600">
              <p><span className="font-black text-slate-950">Reasoning:</span> {approval.reasoning}</p>
              {approval.conditions ? <p><span className="font-black text-slate-950">Conditions:</span> {approval.conditions}</p> : null}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {externalUrl ? (
                <a href={externalUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white">Open original system</a>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-black">Original source is no longer available.</p>
                  <p className="mt-1">It may have been deleted, revoked, or was generated as demo evidence. The retained ApprovLine record remains auditable.</p>
                </div>
              )}
              <a href={`/api/approvals/${id}/evidence`} download className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700">Download evidence</a>
            </div>
          </article>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Source Metadata</p>
            <dl className="mt-4 grid gap-3 text-sm">
              {[
                ['Platform', approval.sourcePlatform ?? source?.provider ?? 'Unknown'],
                ['Channel', source?.channel ?? 'Not recorded'],
                ['Approver', approval.approverName ?? source?.sender ?? 'Unknown'],
                ['Approver email', approval.approverEmail ?? source?.senderEmail ?? 'Not recorded'],
                ['Decision time', dateText(approval.approvalTimestamp ?? approval.occurredAt)],
                ['Received time', dateText(source?.receivedAt)],
                ['Confidence', `${approval.confidence}%`],
                ['Risk', approval.riskLevel ?? 'low'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words font-black text-slate-950">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>
    </DashboardShell>
  );
}

