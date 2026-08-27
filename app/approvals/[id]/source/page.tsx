import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { SourceEvidenceViewer } from '@/components/source-viewer/SourceEvidenceViewer';
import type { EvidenceDetailData } from '@/components/source-viewer/SourceEvidenceViewer';
import { getDashboardTenant } from '@/lib/auth';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { parseSourcePayload, mergeEventContext, constructSyntheticPayload } from '@/lib/source-payload';
import { prisma } from '@/lib/prisma';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { withRetry } from '@/services/approvalDetail';

export const dynamic = 'force-dynamic';

function fmtCapture(d: Date | null | undefined) {
  return d
    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : 'Not recorded';
}

/** Derive a 0-100 numeric risk score from riskLevel + confidence. */
function deriveRiskScore(riskLevel: string | null, confidence: number): number {
  if (riskLevel === 'high') return Math.max(65, Math.min(95, Math.round(confidence * 0.88)));
  if (riskLevel === 'medium') return Math.max(40, Math.min(74, Math.round(confidence * 0.65)));
  return Math.max(10, Math.min(44, Math.round(confidence * 0.35)));
}

/** Short deterministic ID label for display (not a DB key). */
function shortId(id: string, prefix: string) {
  return `${prefix}-${id.slice(-6).toUpperCase()}`;
}

/** Format approval type enum for display. */
function formatApprovalType(t: string | null | undefined): string | null {
  if (!t) return null;
  return t
    .split('_')
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ');
}

export default async function ApprovalSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard/approvals');

  const orgId = tenant.organization.id;

  const result = await withRetry(
    'approval source lookup',
    () =>
      Promise.all([
        prisma.approvalRecord.findFirst({
          where: { id, organizationId: orgId },
          select: {
            subject: true,
            sourceLink: true,
            sourcePlatform: true,
            approvalTimestamp: true,
            occurredAt: true,
            evidenceSnippet: true,
            reasoning: true,
            conditions: true,
            approverName: true,
            approverEmail: true,
            confidence: true,
            riskLevel: true,
            status: true,
            department: true,
            category: true,
            messageSource: {
              select: { provider: true, channel: true, sender: true, senderEmail: true, receivedAt: true, rawPayload: true },
            },
          },
        }),
        prisma.canonicalEvidenceEvent.findFirst({
          where: { approvalRecordId: id, organizationId: orgId },
          orderBy: { occurredAt: 'desc' },
          select: { id: true, providerKey: true, threadId: true, occurredAt: true, participants: true, attachments: true, links: true, metadata: true },
        }),
        prisma.unifiedEvidenceRecord.findFirst({
          where: { primaryApprovalId: id, organizationId: orgId },
          select: { id: true },
        }),
        prisma.classifierResult.findFirst({
          where: { approvalRecordId: id, organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          select: { approvalType: true, confidence: true, normalizedJson: true },
        }),
        prisma.manualApprovalDetail.findFirst({
          where: { approvalRecordId: id, organizationId: orgId },
          select: { kind: true, approverRole: true, communicationChannel: true, businessContext: true, supportingNotes: true, verificationStatus: true, location: true, confidenceLevel: true },
        }),
      ]),
    7000,
  ).then(
    ([approval, event, unified, classifier, manualDetail]) => ({ approval, event, unified, classifier, manualDetail, error: null as unknown }),
    (error: unknown) => ({ approval: null, event: null, unified: null, classifier: null, manualDetail: null, error }),
  );

  if (result.error) {
    const correlationId = reportApprovalFailure(result.error, {
      action: 'open_source', approvalId: id, organizationId: orgId, userId: tenant.session.userId,
    });
    return (
      <DashboardShell>
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-400">Evidence temporarily unavailable</p>
          <h1 className="mt-2 text-2xl font-black text-[#E8EEFF]">The source record could not be loaded</h1>
          <p className="mt-2 text-sm leading-6 text-[#6B7FA8]">Your approval is safe. Retry the evidence lookup or return to the approval record.</p>
          <p className="mt-3 text-xs font-bold text-[#3D5070]">Reference: {correlationId}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <PendingLink href={`/approvals/${id}/source`} pendingText="Retrying..." className="inline-flex h-10 items-center rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500">Retry</PendingLink>
            <PendingLink href={`/approvals/${id}`} pendingText="Opening approval..." className="inline-flex h-10 items-center rounded-xl border border-[#1E2D4A] px-5 text-sm font-bold text-[#A8BAD8] hover:border-violet-500/30 hover:text-[#E8EEFF]">Back to approval</PendingLink>
          </div>
        </section>
      </DashboardShell>
    );
  }

  if (!result.approval) {
    reportApprovalFailure(new Error('Approval source missing'), {
      action: 'open_source', approvalId: id, organizationId: orgId, userId: tenant.session.userId,
      reason: 'Approval was deleted or does not belong to this tenant.',
    });
    notFound();
  }

  const { approval, event, unified, classifier, manualDetail } = result;
  const platform = approval.sourcePlatform ?? approval.messageSource?.provider ?? null;
  const externalUrl = getSafeEvidenceUrl(approval.sourceLink);

  // Parse payload, then overlay any richer context from the canonical event.
  // When no raw payload was captured (e.g. seed/demo records without a
  // MessageSource), fall back to a synthetic payload built from the rich fields
  // available on ApprovalRecord itself so the viewer always shows real content.
  const rawPayload = approval.messageSource?.rawPayload ?? null;
  const parsedPayload = parseSourcePayload(rawPayload, platform);
  const hasMeaningfulPayload = parsedPayload.providerType !== 'generic' || rawPayload !== null;
  const payload = hasMeaningfulPayload
    ? mergeEventContext(parsedPayload, event)
    : constructSyntheticPayload({
        subject: approval.subject,
        evidenceSnippet: approval.evidenceSnippet,
        reasoning: approval.reasoning,
        approverName: approval.approverName ?? approval.messageSource?.sender ?? null,
        approverEmail: approval.approverEmail ?? approval.messageSource?.senderEmail ?? null,
        platform: platform ?? undefined,
        channel: approval.messageSource?.channel ?? undefined,
        status: approval.status ?? undefined,
        riskLevel: approval.riskLevel ?? undefined,
        conditions: approval.conditions ?? null,
        manualDetail: manualDetail
          ? {
              kind: String(manualDetail.kind),
              approverRole: manualDetail.approverRole,
              communicationChannel: manualDetail.communicationChannel,
              businessContext: manualDetail.businessContext,
              supportingNotes: manualDetail.supportingNotes ?? null,
              verificationStatus: String(manualDetail.verificationStatus),
              location: manualDetail.location ?? null,
            }
          : null,
      });

  // Derive AI reasoning from normalizedJson if it has a reasoning field
  const normalizedJson = classifier?.normalizedJson;
  const aiReasoning = (() => {
    if (approval.reasoning) return approval.reasoning;
    if (normalizedJson && typeof normalizedJson === 'object' && !Array.isArray(normalizedJson)) {
      const nj = normalizedJson as Record<string, unknown>;
      if (typeof nj.reasoning === 'string') return nj.reasoning;
    }
    return null;
  })();

  // Format UE ID
  const ueId = unified?.id ? `UE-${new Date().getFullYear()}-${unified.id.slice(-6).toUpperCase()}` : null;
  const evId = event?.id ? shortId(event.id, `EV-${(platform ?? 'SRC').toUpperCase().slice(0, 5)}`) : null;
  const arLabel = `APPR-${new Date().getFullYear()}-${id.slice(-5).toUpperCase()}`;

  const capturedAt = fmtCapture(approval.approvalTimestamp ?? event?.occurredAt ?? approval.occurredAt);

  const detail: EvidenceDetailData = {
    evidenceId: evId,
    unifiedEvidenceId: ueId,
    approvalRecordId: arLabel,
    decisionType: approval.category ?? formatApprovalType(classifier?.approvalType),
    decisionTitle: approval.subject,
    amount: null,
    approverName: approval.approverName ?? approval.messageSource?.sender ?? null,
    approverEmail: approval.approverEmail ?? approval.messageSource?.senderEmail ?? null,
    status: approval.status ?? 'PENDING_REVIEW',
    riskLevel: approval.riskLevel ?? null,
    riskScore: deriveRiskScore(approval.riskLevel, approval.confidence ?? 50),
    capturedAt,
    source: platform,
    channel: approval.messageSource?.channel ?? null,
    workspace: null,
    threadTs: event?.threadId ?? null,
    messageTs: null,
    issueUrl: null,
    prUrl: null,
    confidenceScore: classifier?.confidence ?? approval.confidence ?? 0,
    aiClassification: formatApprovalType(classifier?.approvalType) ?? 'Approval',
    aiReasoning,
    rawPayload: approval.messageSource?.rawPayload ?? null,
  };

  // Overlay provider-specific detail fields from payload
  if (payload.providerType === 'slack') {
    detail.workspace = payload.workspace ?? null;
    detail.threadTs = payload.threadTs ?? detail.threadTs;
    detail.messageTs = payload.messageTs ?? null;
    detail.channel = payload.channel ? `#${payload.channel}` : detail.channel;
  } else if (payload.providerType === 'jira' || payload.providerType === 'servicenow' || payload.providerType === 'asana' || payload.providerType === 'monday') {
    detail.issueUrl = payload.issueUrl ?? null;
  } else if (payload.providerType === 'github' || payload.providerType === 'gitlab' || payload.providerType === 'azure_devops') {
    detail.prUrl = payload.prUrl ?? null;
  }

  return (
    <DashboardShell immersive>
      <SourceEvidenceViewer
        approvalId={id}
        approvalSubject={approval.subject}
        sourcePlatform={platform}
        externalUrl={externalUrl}
        payload={payload}
        detail={detail}
      />
    </DashboardShell>
  );
}
