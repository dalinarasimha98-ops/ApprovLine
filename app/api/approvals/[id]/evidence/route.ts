import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { withTimeout } from '@/lib/performance';

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

    const payload = {
      approval: {
        subject: approval.subject,
        status: approval.status,
        approvalType: approval.approvalType,
        approver: approval.approverName,
        approverEmail: approval.approverEmail,
        department: approval.department,
        category: approval.category,
        confidence: approval.confidence,
        riskLevel: approval.riskLevel,
        timestamp: approval.approvalTimestamp ?? approval.occurredAt,
      },
      evidence: {
        snippet: approval.evidenceSnippet,
        reasoning: approval.reasoning,
        conditions: approval.conditions,
        sourcePlatform: approval.sourcePlatform,
        sourceLink: approval.sourceLink,
        channel: approval.messageSource?.channel,
        sender: approval.messageSource?.sender,
        senderEmail: approval.messageSource?.senderEmail,
      },
      auditTrail: approval.auditLogs.map((event) => ({ action: event.action, timestamp: event.createdAt, metadata: event.metadata })),
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="approvline-evidence-${id}.json"`,
      },
    });
  } catch (error) {
    const correlationId = reportApprovalFailure(error, {
      action: 'evidence_retrieval', approvalId: id, organizationId: tenant.organization.id, userId: tenant.session.userId,
    });
    return NextResponse.json({ error: 'Evidence could not be retrieved. Please retry.', reference: correlationId }, { status: 503 });
  }
}
