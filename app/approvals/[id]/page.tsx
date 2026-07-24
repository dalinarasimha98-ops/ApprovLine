import { notFound, redirect } from 'next/navigation';
import { ApprovalActions } from '@/components/approvals/ApprovalActions';
import { ManualApprovalPanel } from '@/components/approvals/ManualApprovalPanel';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { canManageManualApprovals } from '@/services/manual-approvals';

function evidenceExcerpt(value: unknown): string {
  const preferredKeys = ['text', 'message', 'content', 'body', 'snippet', 'subject', 'description', 'title'];
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(evidenceExcerpt).filter(Boolean).join(' ').trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const candidate = evidenceExcerpt(record[key]);
    if (candidate) return candidate;
  }
  return '';
}

export const dynamic = 'force-dynamic';

type ApprovalDetailPageProps = {
  params: Promise<{ id: string }>;
};

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
}

function riskClass(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (risk === 'medium') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function ApprovalLoadError({ id, correlationId }: { id: string; correlationId: string }) {
  return (
    <DashboardShell>
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Approval temporarily unavailable</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">We could not load this approval yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          The approval exists in your workspace, but its evidence lookup did not complete in time. Retry without losing your place.
        </p>
        <p className="mt-3 text-xs font-bold text-slate-500">Reference: {correlationId}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <PendingLink href={`/approvals/${id}`} pendingText="Retrying..." className="inline-flex h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white">
            Retry approval
          </PendingLink>
          <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700">
            Back to approvals
          </PendingLink>
        </div>
      </section>
    </DashboardShell>
  );
}

export default async function ApprovalDetailPage({ params }: ApprovalDetailPageProps) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const approvalResult = await withTimeout(
    'approval detail lookup',
    prisma.approvalRecord.findFirst({
      where: { id, organizationId: tenant.organization.id },
      include: {
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        classifierResults: { orderBy: { createdAt: 'desc' }, take: 3 },
        messageSource: true,
        complianceEvaluations: { include: { rule: true }, orderBy: { createdAt: 'desc' }, take: 3 },
        investigations: { include: { investigation: true }, orderBy: { createdAt: 'desc' }, take: 5 },
        manualDetail: {
          include: {
            recorder: { select: { id: true, name: true, email: true } },
            secondVerifier: { select: { name: true, email: true } },
          },
        },
        manualVersions: {
          include: { actorUser: { select: { name: true, email: true } } },
          orderBy: { version: 'desc' },
          take: 20,
        },
        evidenceAssociations: {
          include: { messageSource: true },
          orderBy: { sourceTimestamp: 'asc' },
        },
        confirmationRequests: {
          include: { requestedByUser: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    }),
    5000,
  ).then(
    (approval) => ({ status: 'ok' as const, approval }),
    (error: unknown) => ({ status: 'error' as const, approval: null, error }),
  );

  if (approvalResult.status === 'error') {
    const correlationId = reportApprovalFailure(approvalResult.error, {
      action: 'view_full_approval',
      approvalId: id,
      organizationId: tenant.organization.id,
      userId: tenant.session.userId,
    });
    return <ApprovalLoadError id={id} correlationId={correlationId} />;
  }

  const approval = approvalResult.approval;

  if (!approval) {
    reportApprovalFailure(new Error('Approval detail missing'), {
      action: 'view_full_approval',
      approvalId: id,
      organizationId: tenant.organization.id,
      userId: tenant.session.userId,
      reason: 'Approval was deleted or does not belong to this tenant.',
    });
    notFound();
  }

  const memoryEntity = await withTimeout(
    'approval memory entity lookup',
    prisma.memoryEntity.findFirst({
      where: {
        organizationId: tenant.organization.id,
        OR: [
          { externalId: approval.id },
          { title: { equals: approval.subject, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    }),
    1800,
  ).catch((error) => {
    reportApprovalFailure(error, {
      action: 'memory_graph_lookup',
      approvalId: approval.id,
      organizationId: tenant.organization.id,
      userId: tenant.session.userId,
    });
    return null;
  });

  return (
    <DashboardShell>
      <section className="grid gap-6">
        <div className="rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
          <div className="flex flex-wrap gap-3">
            <PendingLink href="/analytics" pendingText="Back to analytics..." className="text-xs font-black uppercase tracking-wide text-blue-200">
              &lt;- Executive ROI
            </PendingLink>
            <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="text-xs font-black uppercase tracking-wide text-blue-200">
              Approval History
            </PendingLink>
            <PendingLink href={`/investigations?approvalId=${approval.id}`} pendingText="Opening investigation center..." className="text-xs font-black uppercase tracking-wide text-blue-200">
              Investigate
            </PendingLink>
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-blue-200">Approval Evidence</p>
          <h2 className="mt-2 max-w-4xl text-3xl font-black tracking-tight">{approval.subject}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${riskClass(approval.riskLevel)}`}>{approval.riskLevel ?? 'low'} risk</span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-[#2155d9]">{approval.confidence}% confidence</span>
            <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-white">{approval.status.replaceAll('_', ' ')}</span>
            {approval.sourceLink?.includes('demo') || approval.sourceLink?.includes('TDEMO') ? (
              <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-blue-100">Demo data</span>
            ) : null}
          </div>
        </div>

        <ApprovalActions approvalId={approval.id} subject={approval.subject} memoryEntityId={memoryEntity?.id} />

        {approval.manualDetail ? (
          <ManualApprovalPanel
            approval={{
              id: approval.id,
              subject: approval.subject,
              status: approval.status === 'NOT_A_DECISION' ? 'PENDING_REVIEW' : approval.status,
              approvalType: approval.approvalType === 'NOT_APPROVAL' ? 'EXPLICIT' : approval.approvalType,
              approverName: approval.approverName,
              approverEmail: approval.approverEmail,
              approvalTimestamp: (approval.approvalTimestamp ?? approval.occurredAt ?? approval.createdAt).toISOString(),
              conditions: approval.conditions,
              department: approval.department,
              category: approval.category,
            }}
            detail={{
              ...approval.manualDetail,
              secondVerifiedAt: approval.manualDetail.secondVerifiedAt?.toISOString() ?? null,
            }}
            evidence={approval.evidenceAssociations.map((item) => ({
              ...item,
              sourceTimestamp: item.sourceTimestamp.toISOString(),
              messageSource: {
                ...item.messageSource,
                receivedAt: item.messageSource.receivedAt.toISOString(),
                excerpt: evidenceExcerpt(item.messageSource.rawPayload).slice(0, 1200) || 'Source evidence is preserved in its original provider record.',
              },
            }))}
            versions={approval.manualVersions.map((version) => ({
              ...version,
              createdAt: version.createdAt.toISOString(),
            }))}
            confirmations={approval.confirmationRequests.map((confirmation) => ({
              id: confirmation.id,
              approverEmail: confirmation.approverEmail,
              decision: confirmation.decision,
              createdAt: confirmation.createdAt.toISOString(),
              respondedAt: confirmation.respondedAt?.toISOString() ?? null,
              responseNote: confirmation.responseNote,
              requestedByUser: confirmation.requestedByUser,
            }))}
            canManage={canManageManualApprovals(tenant.user.role)}
            currentUserId={tenant.user.id}
            currentUserRole={tenant.user.role}
          />
        ) : null}

        {approval.status === 'PENDING_REVIEW' ? (
          <section className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-live="polite">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#2155d9] border-t-transparent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-black text-blue-950">Analyzing approval...</p>
                <p className="mt-1 text-sm leading-6 text-blue-800">Classification or policy checks are still processing. This page remains available and will show the retained decision evidence while background work completes.</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#2155d9]" /></div>
                <p className="mt-2 text-xs font-bold text-blue-700">Estimated status: processing approval. Refresh in a moment for the latest result.</p>
              </div>
              <PendingLink href={`/approvals/${approval.id}`} pendingText="Refreshing..." className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-black text-[#2155d9]">Refresh</PendingLink>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="decision-metadata-heading" className="grid gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Decision</p>
            <h3 id="decision-metadata-heading" className="mt-1 text-lg font-black text-slate-950">Decision metadata</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Approval ID" value={approval.id} />
            <InfoCard label="Approver" value={approval.approverName ?? 'Unknown'} />
            <InfoCard label="Department" value={approval.department ?? 'Unassigned'} />
            <InfoCard label="Source Platform" value={approval.sourcePlatform ?? approval.messageSource?.provider ?? 'Unknown'} />
            <InfoCard label="Category" value={approval.category ?? 'Unassigned'} />
            <InfoCard label="Approval Type" value={approval.approvalType.replaceAll('_', ' ')} />
            <InfoCard label="Approval Timestamp" value={dateText(approval.approvalTimestamp ?? approval.occurredAt)} />
            <InfoCard label="Audit Events" value={approval.auditLogs.length} />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Evidence</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Source evidence and reasoning</h3>
              <div className="mt-5 grid gap-4 text-sm leading-6 text-slate-600">
                <p><span className="font-black text-slate-950">Reasoning:</span> {approval.reasoning}</p>
                {approval.conditions ? <p><span className="font-black text-slate-950">Conditions:</span> {approval.conditions}</p> : null}
                {approval.businessImpact ? <p><span className="font-black text-slate-950">Business impact:</span> {approval.businessImpact}</p> : null}
                {approval.evidenceSnippet ? (
                  <blockquote className="rounded-2xl border border-blue-100 bg-blue-50 p-4 font-semibold text-slate-700">
                    “{approval.evidenceSnippet}”
                  </blockquote>
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-200 p-4 font-semibold text-slate-500">No evidence snippet captured yet.</p>
                )}
                <PendingLink href={`/approvals/${approval.id}/source`} pendingText="Opening source..." className="inline-flex w-fit min-h-0 h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
                  Open Source
                </PendingLink>
              </div>
            </div>

            <div id="timeline" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Audit Trail</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Chronological evidence trail</h3>
              <div className="mt-5 grid gap-3">
                {approval.auditLogs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No audit events recorded for this approval yet.</p>
                ) : (
                  approval.auditLogs.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-slate-950">{event.action.replaceAll('_', ' ')}</p>
                        <p className="text-xs font-bold text-slate-500">{dateText(event.createdAt)}</p>
                      </div>
                      {event.metadata ? <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-xs text-slate-500">{JSON.stringify(event.metadata, null, 2)}</pre> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Comments</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Reviewer context</h3>
              <p className="mt-5 rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
                No comments captured for this approval.
              </p>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Compliance Analysis</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Playbook policy evaluation</h3>
              <div className="mt-5 grid gap-3">
                {approval.complianceEvaluations.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No Playbook AI compliance evaluation yet. Upload playbooks and run Evaluate Approvals.</p>
                ) : (
                  approval.complianceEvaluations.map((evaluation) => (
                    <div key={evaluation.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-slate-950">{evaluation.status}</p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#2155d9]">{evaluation.score}/100</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{evaluation.explanation}</p>
                      {evaluation.triggeredRule ? <p className="mt-2 text-xs font-black text-slate-500">Rule: {evaluation.triggeredRule}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                        {evaluation.missingApprovers.map((item) => <span key={item} className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">Missing {item}</span>)}
                        {evaluation.missingEvidence.map((item) => <span key={item} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Need {item}</span>)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Related Records</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Investigations and memory</h3>
              <div className="mt-5 grid gap-3">
                {approval.investigations.length > 0 ? approval.investigations.map(({ investigation }) => (
                  <PendingLink key={investigation.id} href={`/investigations/${investigation.id}`} pendingText="Opening investigation..." className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50">
                    <span className="block font-black text-slate-950">{investigation.title}</span>
                    <span className="mt-1 block text-xs font-bold uppercase text-slate-500">{investigation.status.replaceAll('_', ' ')}</span>
                  </PendingLink>
                )) : (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No investigations reference this approval yet.</p>
                )}
                <PendingLink href={memoryEntity ? `/memory/${memoryEntity.id}` : `/memory?search=${encodeURIComponent(approval.subject)}`} pendingText="Opening memory graph..." className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">
                  {memoryEntity ? 'View related Memory Graph entity' : 'Search Memory Graph'}
                </PendingLink>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Message Source</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Captured from source system</h3>
              <dl className="mt-5 grid gap-3 text-sm">
                {[
                  ['Provider', approval.messageSource?.provider ?? approval.sourcePlatform ?? 'Unknown'],
                  ['Channel', approval.messageSource?.channel ?? 'Not recorded'],
                  ['Sender', approval.messageSource?.sender ?? approval.approverName ?? 'Unknown'],
                  ['Sender Email', approval.messageSource?.senderEmail ?? approval.approverEmail ?? 'Not recorded'],
                  ['Received At', dateText(approval.messageSource?.receivedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                    <dt className="font-bold text-slate-500">{label}</dt>
                    <dd className="text-right font-black text-slate-950">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Classifier</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">AI classification history</h3>
              <div className="mt-5 grid gap-3">
                {approval.classifierResults.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No classifier snapshots attached.</p>
                ) : (
                  approval.classifierResults.map((result) => (
                    <div key={result.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-slate-950">{result.model}</p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#2155d9]">{result.confidence}%</span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Prompt {result.promptVersion} · {dateText(result.createdAt)}</p>
                      <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-500">{JSON.stringify(result.normalizedJson, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
