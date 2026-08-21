import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ApprovalActions } from '@/components/approvals/ApprovalActions';
import { CopyEvidenceLinkButton } from '@/components/approvals/CopyEvidenceLinkButton';
import { EvidenceMessageCard } from '@/components/approvals/EvidenceMessageCard';
import { EvidenceThread, parseThreadPayload } from '@/components/approvals/EvidenceThread';
import { ManualApprovalPanel } from '@/components/approvals/ManualApprovalPanel';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { CardSkeleton } from '@/components/system/Skeletons';
import { getDashboardTenant } from '@/lib/auth';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { canManageManualApprovals } from '@/services/manual-approvals';
import {
  getApprovalAuditTrail,
  getApprovalClassifierResults,
  getApprovalComplianceEvaluations,
  getApprovalCore,
  getApprovalManualBundle,
  getApprovalRelatedRecords,
  type ApprovalCore,
} from '@/services/approvalDetail';
import { getUnifiedEvidenceIdForApproval } from '@/services/evidence/records';

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

/** Shared fallback for any one section that fails/times out - the rest of
 *  the page keeps rendering regardless. Retrying re-navigates to the same
 *  URL, which re-runs every Suspense boundary (this is a Server Components
 *  page - there is no client-side per-section refetch primitive here), but
 *  critically a slow/failed section never takes the other sections down
 *  with it the way the single monolithic query used to. */
function SectionLoadError({ approvalId, title, message, correlationId }: { approvalId: string; title: string; message: string; correlationId: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-amber-700">{title}</p>
      <p className="mt-2 text-sm leading-6 text-amber-900">{message}</p>
      <p className="mt-2 text-xs font-bold text-amber-700">Reference: {correlationId}</p>
      <PendingLink href={`/approvals/${approvalId}#timeline`} pendingText="Retrying..." className="mt-4 inline-flex h-9 items-center rounded-lg border border-amber-300 bg-white px-4 text-xs font-black text-amber-800">
        Retry
      </PendingLink>
    </div>
  );
}

export default async function ApprovalDetailPage({ params }: ApprovalDetailPageProps) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const organizationId = tenant.organization.id;

  let core: ApprovalCore | null;
  try {
    core = await getApprovalCore(organizationId, id);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, {
      action: 'view_full_approval',
      approvalId: id,
      organizationId,
      userId: tenant.session.userId,
    });
    return <ApprovalLoadError id={id} correlationId={correlationId} />;
  }

  if (!core) {
    reportApprovalFailure(new Error('Approval detail missing'), {
      action: 'view_full_approval',
      approvalId: id,
      organizationId,
      userId: tenant.session.userId,
      reason: 'Approval was deleted or does not belong to this tenant.',
    });
    notFound();
  }

  const threadPayload = parseThreadPayload(core.messageSource?.rawPayload);
  const externalUrl = getSafeEvidenceUrl(core.sourceLink);

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
            <PendingLink href={`/investigations?approvalId=${core.id}`} pendingText="Opening investigation center..." className="text-xs font-black uppercase tracking-wide text-blue-200">
              Investigate
            </PendingLink>
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-blue-200">Approval Evidence</p>
          <h2 className="mt-2 max-w-4xl text-3xl font-black tracking-tight">{core.subject}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${riskClass(core.riskLevel)}`}>{core.riskLevel ?? 'low'} risk</span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-[#2155d9]">{core.confidence}% confidence</span>
            <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-white">{core.status.replaceAll('_', ' ')}</span>
            {core.sourceLink?.includes('demo') || core.sourceLink?.includes('TDEMO') ? (
              <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-black text-blue-100">Demo data</span>
            ) : null}
          </div>
        </div>

        {/* Suspense-wrapped (fallback null) so this optional link never
            blocks or delays the rest of the page - most approvals do have a
            linked UnifiedEvidenceRecord (real ingestion always creates one;
            see services/evidence/pipeline.ts), but some legacy/seed-path
            approvals still don't until backfilled, so this renders nothing
            rather than a broken link when there isn't one. */}
        <Suspense fallback={null}>
          <UnifiedEvidenceLinkBanner organizationId={organizationId} approvalId={core.id} />
        </Suspense>

        {/* memoryEntityId resolves inside the Related Records section below,
            which is fetched independently - ApprovalActions falls back to a
            Memory Graph search link (its existing behavior for any approval
            with no linked entity) until then, rather than blocking the shell
            on that lookup. */}
        <ApprovalActions approvalId={core.id} subject={core.subject} />

        {core.manualDetail ? (
          <Suspense fallback={<CardSkeleton rows={4} />}>
            <ManualApprovalSection
              organizationId={organizationId}
              core={core}
              canManage={canManageManualApprovals(tenant.user.role)}
              currentUserId={tenant.user.id}
              currentUserRole={tenant.user.role}
            />
          </Suspense>
        ) : null}

        {core.status === 'PENDING_REVIEW' ? (
          <section className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-live="polite">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#2155d9] border-t-transparent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-black text-blue-950">Analyzing approval...</p>
                <p className="mt-1 text-sm leading-6 text-blue-800">Classification or policy checks are still processing. This page remains available and will show the retained decision evidence while background work completes.</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#2155d9]" /></div>
                <p className="mt-2 text-xs font-bold text-blue-700">Estimated status: processing approval. Refresh in a moment for the latest result.</p>
              </div>
              <PendingLink href={`/approvals/${core.id}`} pendingText="Refreshing..." className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-black text-[#2155d9]">Refresh</PendingLink>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="decision-metadata-heading" className="grid gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Decision</p>
            <h3 id="decision-metadata-heading" className="mt-1 text-lg font-black text-slate-950">Decision metadata</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Approval ID" value={core.id} />
            <InfoCard label="Approver" value={core.approverName ?? 'Unknown'} />
            <InfoCard label="Department" value={core.department ?? 'Unassigned'} />
            <InfoCard label="Source Platform" value={core.sourcePlatform ?? core.messageSource?.provider ?? 'Unknown'} />
            <InfoCard label="Category" value={core.category ?? 'Unassigned'} />
            <InfoCard label="Approval Type" value={core.approvalType.replaceAll('_', ' ')} />
            <InfoCard label="Approval Timestamp" value={dateText(core.approvalTimestamp ?? core.occurredAt)} />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Evidence</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Source evidence and reasoning</h3>
              <div className="mt-5 grid gap-4 text-sm leading-6 text-slate-600">
                <p><span className="font-black text-slate-950">Reasoning:</span> {core.reasoning}</p>
                {core.conditions ? <p><span className="font-black text-slate-950">Conditions:</span> {core.conditions}</p> : null}
                {core.businessImpact ? <p><span className="font-black text-slate-950">Business impact:</span> {core.businessImpact}</p> : null}
                {threadPayload ? (
                  <EvidenceThread
                    payload={threadPayload}
                    platform={core.sourcePlatform ?? core.messageSource?.provider}
                    participantCount={new Set(threadPayload.threadMessages.map((message) => message.senderName)).size}
                    sourceUrl={externalUrl}
                    evidenceLinkPath={`/approvals/${core.id}/source`}
                  />
                ) : core.evidenceSnippet || core.approverName ? (
                  <EvidenceMessageCard
                    platform={core.sourcePlatform ?? core.messageSource?.provider}
                    senderName={core.approverName ?? core.messageSource?.sender ?? 'Unknown approver'}
                    senderEmail={core.approverEmail ?? core.messageSource?.senderEmail}
                    timestamp={dateText(core.approvalTimestamp ?? core.occurredAt)}
                    content={core.evidenceSnippet}
                  />
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-200 p-4 font-semibold text-slate-500">No evidence snippet captured yet.</p>
                )}
                {core.messageSource?.rawPayload ? (
                  <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-500">Raw captured payload</summary>
                    <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-white p-4 text-xs leading-5 text-slate-700">{JSON.stringify(core.messageSource.rawPayload, null, 2)}</pre>
                  </details>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <PendingLink href={`/approvals/${core.id}/source`} pendingText="Opening source..." className="inline-flex w-fit min-h-0 h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
                    Open Source
                  </PendingLink>
                  <CopyEvidenceLinkButton path={`/approvals/${core.id}/source`} className="inline-flex w-fit min-h-0 h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50" />
                </div>
              </div>
            </div>

            <Suspense fallback={<CardSkeleton rows={3} />}>
              <AuditTrailSection organizationId={organizationId} approvalId={core.id} />
            </Suspense>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Comments</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Reviewer context</h3>
              <p className="mt-5 rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
                No comments captured for this approval.
              </p>
            </div>
          </div>

          <div className="grid gap-6">
            <Suspense fallback={<CardSkeleton rows={2} />}>
              <ComplianceSection organizationId={organizationId} approvalId={core.id} />
            </Suspense>

            <Suspense fallback={<CardSkeleton rows={2} />}>
              <RelatedRecordsSection organizationId={organizationId} approvalId={core.id} subject={core.subject} />
            </Suspense>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Message Source</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">Captured from source system</h3>
              <dl className="mt-5 grid gap-3 text-sm">
                {[
                  ['Provider', core.messageSource?.provider ?? core.sourcePlatform ?? 'Unknown'],
                  ['Channel', core.messageSource?.channel ?? 'Not recorded'],
                  ['Sender', core.messageSource?.sender ?? core.approverName ?? 'Unknown'],
                  ['Sender Email', core.messageSource?.senderEmail ?? core.approverEmail ?? 'Not recorded'],
                  ['Received At', dateText(core.messageSource?.receivedAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                    <dt className="font-bold text-slate-500">{label}</dt>
                    <dd className="text-right font-black text-slate-950">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Suspense fallback={<CardSkeleton rows={2} />}>
              <ClassifierSection organizationId={organizationId} approvalId={core.id} />
            </Suspense>
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}

async function UnifiedEvidenceLinkBanner({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  const unifiedEvidenceId = await getUnifiedEvidenceIdForApproval(organizationId, approvalId);
  if (!unifiedEvidenceId) return null;

  return (
    <PendingLink
      href={`/evidence/${unifiedEvidenceId}`}
      pendingText="Opening unified evidence..."
      className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-violet-50 p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2155d9]">Correlated across sources</p>
        <h3 className="mt-1 text-lg font-black text-slate-950">This decision has a Unified Evidence record</h3>
        <p className="mt-1 text-sm font-semibold text-slate-600">See every correlated source, mention, and confidence score in one place.</p>
      </div>
      <span className="shrink-0 inline-flex h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-200">
        View in Unified Evidence →
      </span>
    </PendingLink>
  );
}

async function AuditTrailSection({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  let auditLogs;
  try {
    auditLogs = await getApprovalAuditTrail(organizationId, approvalId);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'audit_trail_lookup', approvalId, organizationId });
    return <SectionLoadError approvalId={approvalId} title="Audit trail temporarily unavailable" message="The chronological evidence trail did not load in time." correlationId={correlationId} />;
  }

  return (
    <div id="timeline" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Audit Trail</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Chronological evidence trail</h3>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{auditLogs.length} events</span>
      </div>
      <div className="mt-5 grid gap-3">
        {auditLogs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No audit events recorded for this approval yet.</p>
        ) : (
          auditLogs.map((event) => (
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
  );
}

async function ComplianceSection({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  let evaluations;
  try {
    evaluations = await getApprovalComplianceEvaluations(organizationId, approvalId);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'compliance_evaluation_lookup', approvalId, organizationId });
    return <SectionLoadError approvalId={approvalId} title="Compliance analysis temporarily unavailable" message="Playbook policy evaluation did not load in time." correlationId={correlationId} />;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Compliance Analysis</p>
      <h3 className="mt-1 text-lg font-black text-slate-950">Playbook policy evaluation</h3>
      <div className="mt-5 grid gap-3">
        {evaluations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No Playbook AI compliance evaluation yet. Upload playbooks and run Evaluate Approvals.</p>
        ) : (
          evaluations.map((evaluation) => (
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
  );
}

async function ClassifierSection({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  let results;
  try {
    results = await getApprovalClassifierResults(organizationId, approvalId);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'classifier_history_lookup', approvalId, organizationId });
    return <SectionLoadError approvalId={approvalId} title="Classifier history temporarily unavailable" message="AI classification history did not load in time." correlationId={correlationId} />;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Classifier</p>
      <h3 className="mt-1 text-lg font-black text-slate-950">AI classification history</h3>
      <div className="mt-5 grid gap-3">
        {results.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No classifier snapshots attached.</p>
        ) : (
          results.map((result) => (
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
  );
}

async function RelatedRecordsSection({ organizationId, approvalId, subject }: { organizationId: string; approvalId: string; subject: string }) {
  let related;
  try {
    related = await getApprovalRelatedRecords(organizationId, approvalId, subject);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'related_records_lookup', approvalId, organizationId });
    return <SectionLoadError approvalId={approvalId} title="Related records temporarily unavailable" message="Investigations and Memory Graph links did not load in time." correlationId={correlationId} />;
  }

  const { investigations, memoryEntity } = related;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Related Records</p>
      <h3 className="mt-1 text-lg font-black text-slate-950">Investigations and memory</h3>
      <div className="mt-5 grid gap-3">
        {investigations.length > 0 ? investigations.map((investigation) => (
          <PendingLink key={investigation.id} href={`/investigations/${investigation.id}`} pendingText="Opening investigation..." className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50">
            <span className="block font-black text-slate-950">{investigation.title}</span>
            <span className="mt-1 block text-xs font-bold uppercase text-slate-500">{investigation.status.replaceAll('_', ' ')}</span>
          </PendingLink>
        )) : (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No investigations reference this approval yet.</p>
        )}
        <PendingLink href={memoryEntity ? `/memory/${memoryEntity.id}` : `/memory?search=${encodeURIComponent(subject)}`} pendingText="Opening memory graph..." className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">
          {memoryEntity ? 'View related Memory Graph entity' : 'Search Memory Graph'}
        </PendingLink>
      </div>
    </div>
  );
}

async function ManualApprovalSection({
  organizationId,
  core,
  canManage,
  currentUserId,
  currentUserRole,
}: {
  organizationId: string;
  core: ApprovalCore;
  canManage: boolean;
  currentUserId: string;
  currentUserRole: string;
}) {
  if (!core.manualDetail) return null;

  let bundle;
  try {
    bundle = await getApprovalManualBundle(organizationId, core.id);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'manual_approval_bundle_lookup', approvalId: core.id, organizationId });
    return <SectionLoadError approvalId={core.id} title="Manual approval detail temporarily unavailable" message="Evidence, versions, and confirmations did not load in time." correlationId={correlationId} />;
  }

  return (
    <ManualApprovalPanel
      approval={{
        id: core.id,
        subject: core.subject,
        status: core.status === 'NOT_A_DECISION' ? 'PENDING_REVIEW' : core.status,
        approvalType: core.approvalType === 'NOT_APPROVAL' ? 'EXPLICIT' : core.approvalType,
        approverName: core.approverName,
        approverEmail: core.approverEmail,
        approvalTimestamp: (core.approvalTimestamp ?? core.occurredAt ?? core.createdAt).toISOString(),
        conditions: core.conditions,
        department: core.department,
        category: core.category,
      }}
      detail={{
        ...core.manualDetail,
        secondVerifiedAt: core.manualDetail.secondVerifiedAt?.toISOString() ?? null,
      }}
      evidence={bundle.evidence.map((item) => ({
        ...item,
        sourceTimestamp: item.sourceTimestamp.toISOString(),
        messageSource: {
          ...item.messageSource,
          receivedAt: item.messageSource.receivedAt.toISOString(),
          excerpt: evidenceExcerpt(item.messageSource.rawPayload).slice(0, 1200) || 'Source evidence is preserved in its original provider record.',
        },
      }))}
      versions={bundle.versions.map((version) => ({
        ...version,
        createdAt: version.createdAt.toISOString(),
      }))}
      confirmations={bundle.confirmations.map((confirmation) => ({
        id: confirmation.id,
        approverEmail: confirmation.approverEmail,
        decision: confirmation.decision,
        createdAt: confirmation.createdAt.toISOString(),
        respondedAt: confirmation.respondedAt?.toISOString() ?? null,
        responseNote: confirmation.responseNote,
        requestedByUser: confirmation.requestedByUser,
      }))}
      canManage={canManage}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
    />
  );
}
