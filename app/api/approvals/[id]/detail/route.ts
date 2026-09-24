import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { canManageManualApprovals } from '@/services/manual-approvals';
import { getApprovalDetailForViewer } from '@/services/approvalDetail';

export const dynamic = 'force-dynamic';

/**
 * A thin, read-only view over the exact same canonical, tenant-scoped data
 * getApprovalDetailForViewer() composes from - the same cached fetchers
 * app/approvals/[id]/page.tsx (the full detail page) already uses.
 *
 * Not currently called by any UI path: the approvals list's preview panel
 * (components/approvals/ApprovalPreviewPanel.tsx) was deliberately rebuilt
 * to render only from data the list query already has, with no fetch on
 * open - the fix for the "Approval unavailable" failure mode, which this
 * route's own fetch used to be a possible cause of. Left in place as a
 * legitimate, tested, tenant-scoped read endpoint that may still serve a
 * future caller (an API consumer, a refresh action), not dead code left by
 * accident.
 *
 * Tenant isolation: organizationId always comes from getDashboardTenant()'s
 * server-resolved session, never from the client, the URL, or a query
 * param. A cross-tenant or nonexistent approvalId both resolve to the same
 * 404 (see getApprovalDetailForViewer's doc comment) so existence is never
 * leaked across tenants.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tenant: Awaited<ReturnType<typeof getDashboardTenant>>;
  try {
    tenant = await getDashboardTenant(4000);
  } catch (error) {
    console.error('[approval-detail-drawer] getDashboardTenant threw unexpectedly:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    return NextResponse.json({ error: 'Workspace onboarding is not complete.' }, { status: 409 });
  }
  if (!tenant.organization) return NextResponse.json({ error: 'Workspace is unavailable. Please retry.' }, { status: 503 });

  const organizationId = tenant.organization.id;

  let detail;
  try {
    detail = await getApprovalDetailForViewer({ approvalId: id, organizationId });
  } catch (error) {
    const reference = reportApprovalFailure(error, {
      action: 'view_approval_drawer',
      approvalId: id,
      organizationId,
      userId: tenant.session.userId,
    });
    return NextResponse.json({ error: 'This approval could not be loaded. Please retry.', reference }, { status: 503 });
  }

  if (!detail) {
    return NextResponse.json({ error: 'Approval not found.' }, { status: 404 });
  }

  const { core, manualBundle, unifiedEvidenceId, auditTrail, related, complianceEvaluations } = detail;

  return NextResponse.json({
    approval: {
      id: core.id,
      subject: core.subject,
      status: core.status,
      approvalType: core.approvalType,
      confidence: core.confidence,
      riskLevel: core.riskLevel,
      department: core.department,
      category: core.category,
      approverName: core.approverName,
      approverEmail: core.approverEmail,
      reasoning: core.reasoning,
      conditions: core.conditions,
      businessImpact: core.businessImpact,
      evidenceSnippet: core.evidenceSnippet,
      sourcePlatform: core.sourcePlatform,
      sourceUrl: getSafeEvidenceUrl(core.sourceLink),
      sourcePagePath: `/approvals/${core.id}/source`,
      approvalTimestamp: (core.approvalTimestamp ?? core.occurredAt).toISOString(),
      createdAt: core.createdAt.toISOString(),
    },
    messageSource: core.messageSource
      ? {
          provider: core.messageSource.provider,
          channel: core.messageSource.channel,
          sender: core.messageSource.sender,
          senderEmail: core.messageSource.senderEmail,
          receivedAt: core.messageSource.receivedAt?.toISOString() ?? null,
        }
      : null,
    manual: core.manualDetail
      ? {
          kind: core.manualDetail.kind,
          approverRole: core.manualDetail.approverRole,
          communicationChannel: core.manualDetail.communicationChannel,
          location: core.manualDetail.location,
          businessContext: core.manualDetail.businessContext,
          verificationStatus: core.manualDetail.verificationStatus,
          confidenceLevel: core.manualDetail.confidenceLevel,
          secondPersonRequired: core.manualDetail.secondPersonRequired,
          secondVerifiedAt: core.manualDetail.secondVerifiedAt?.toISOString() ?? null,
          secondVerificationNote: core.manualDetail.secondVerificationNote,
          recorder: core.manualDetail.recorder
            ? { name: core.manualDetail.recorder.name, email: core.manualDetail.recorder.email }
            : null,
          secondVerifier: core.manualDetail.secondVerifier
            ? { name: core.manualDetail.secondVerifier.name, email: core.manualDetail.secondVerifier.email }
            : null,
          evidenceCount: manualBundle?.evidence.length ?? 0,
          versionCount: manualBundle?.versions.length ?? 0,
          confirmationCount: manualBundle?.confirmations.length ?? 0,
        }
      : null,
    unifiedEvidenceId,
    activity: auditTrail.map((event) => ({
      id: event.id,
      action: event.action,
      createdAt: event.createdAt.toISOString(),
    })),
    related: {
      investigations: related.investigations.map((investigation) => ({
        id: investigation.id,
        title: investigation.title,
        status: investigation.status,
      })),
      memoryEntityId: related.memoryEntity?.id ?? null,
      complianceEvaluationCount: complianceEvaluations.length,
    },
    canManage: canManageManualApprovals(tenant.user.role),
    fullPageUrl: `/approvals/${core.id}`,
  });
}
