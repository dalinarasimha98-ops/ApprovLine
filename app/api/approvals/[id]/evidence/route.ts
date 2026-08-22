import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { withTimeout } from '@/lib/performance';
import { createSimplePdf } from '@/lib/simple-pdf';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!tenant.organization) return NextResponse.json({ error: 'Workspace is unavailable. Please retry.' }, { status: 503 });

  try {
    const approval = await withTimeout(
      'approval evidence download',
      prisma.approvalRecord.findFirst({
        where: { id, organizationId: tenant.organization.id },
        include: { messageSource: true, auditLogs: { orderBy: { createdAt: 'asc' } } },
      }),
      8000,
    );
    if (!approval) {
      reportApprovalFailure(new Error('Approval evidence record missing'), {
        action: 'evidence_retrieval', approvalId: id, organizationId: tenant.organization.id, userId: tenant.session.userId,
      });
      return NextResponse.json({ error: 'Approval evidence is unavailable or has been deleted.' }, { status: 404 });
    }

    // A human-readable PDF, not the raw JSON dump this route used to return -
    // this is meant to be opened and read, not parsed. Reuses the same
    // simple PDF writer app/api/export/approvals/route.ts already uses for
    // its own single/bulk approval exports (lib/simple-pdf.ts), so this
    // route's output looks and behaves the same way as that one instead of
    // introducing a second PDF format.
    const timestamp = approval.approvalTimestamp ?? approval.occurredAt;
    const lines = [
      'ApprovLine Approval Evidence',
      `Generated: ${new Date().toISOString()}`,
      '',
      approval.subject,
      `Status: ${approval.status} | Type: ${approval.approvalType} | Confidence: ${approval.confidence}% | Risk: ${approval.riskLevel ?? 'low'}`,
      `Approver: ${approval.approverName ?? 'Unknown'} <${approval.approverEmail ?? 'unknown'}>`,
      `Department: ${approval.department ?? 'Unassigned'} | Category: ${approval.category ?? 'Unassigned'}`,
      `Source: ${approval.sourcePlatform ?? approval.messageSource?.provider ?? 'unknown'} | Channel: ${approval.messageSource?.channel ?? 'Not recorded'}`,
      `Message sender: ${approval.messageSource?.sender ?? 'Not recorded'} <${approval.messageSource?.senderEmail ?? 'unknown'}>`,
      `Decision timestamp: ${timestamp.toISOString()}`,
      '',
      `Reasoning: ${approval.reasoning}`,
      ...(approval.conditions ? [`Conditions: ${approval.conditions}`] : []),
      `Evidence: ${approval.evidenceSnippet ?? 'No evidence snippet retained'}`,
      ...(approval.sourceLink ? [`Source link: ${approval.sourceLink}`] : []),
      '',
      `Audit trail (${approval.auditLogs.length} events):`,
      ...approval.auditLogs.map((event) => `  ${event.createdAt.toISOString()}  ${event.action}`),
    ];

    return new NextResponse(createSimplePdf(lines), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="approvline-evidence-${id}.pdf"`,
      },
    });
  } catch (error) {
    const correlationId = reportApprovalFailure(error, {
      action: 'evidence_retrieval', approvalId: id, organizationId: tenant.organization.id, userId: tenant.session.userId,
    });
    return NextResponse.json({ error: 'Evidence could not be retrieved. Please retry.', reference: correlationId }, { status: 503 });
  }
}
