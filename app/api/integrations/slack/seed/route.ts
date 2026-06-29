import { ApprovalStatus, ApprovalType } from '@prisma/client';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { measure } from '@/lib/performance';
import { writeAuditLog } from '@/services/audit';

const samples = [
  ['Slack vendor payment approval', 'Priya Sharma', 'priya@company.com', 'Procurement', 'Procurement', ApprovalType.EXPLICIT, ApprovalStatus.APPROVED, 'medium'],
  ['Slack budget increase conditional approval', 'Sarah Chen', 'sarah@company.com', 'Finance', 'Finance', ApprovalType.CONDITIONAL, ApprovalStatus.PENDING_REVIEW, 'high'],
  ['Slack contract redline rejection', 'James Okafor', 'james@company.com', 'Legal', 'Legal', ApprovalType.REJECTION, ApprovalStatus.REJECTED, 'high'],
  ['Slack deployment approval', 'Maya Singh', 'maya@company.com', 'Engineering', 'Engineering', ApprovalType.EXPLICIT, ApprovalStatus.APPROVED, 'medium'],
] as const;

export async function POST(request: NextRequest) {
  return measure('POST /api/integrations/slack/seed', async () => {
  const tenant = await requireRole('ADMIN');
  const created = [];
  for (const [subject, approverName, approverEmail, department, category, approvalType, status, riskLevel] of samples) {
    const approval = await prisma.approvalRecord.create({
      data: {
        organizationId: tenant.organization.id,
        subject,
        approverName,
        approverEmail,
        department,
        category,
        approvalType,
        status,
        confidence: 94,
        riskLevel,
        businessImpact: `Sample Slack ${category} decision for beta testing.`,
        reasoning: 'Generated sample Slack approval record for beta testing.',
        conditions: approvalType === ApprovalType.CONDITIONAL ? 'Requires the stated precondition before execution.' : null,
        sourcePlatform: 'slack',
        sourceLink: 'https://app.slack.com/client/demo/beta-approvals',
        evidenceSnippet: `${approverName}: ${subject}`,
        approvalTimestamp: new Date(),
        occurredAt: new Date(),
      },
    });
    created.push(approval.id);
    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      approvalRecordId: approval.id,
      action: 'integration.slack.sample_approval_created',
      metadata: { sourcePlatform: 'slack', category, riskLevel },
    });
  }
  return NextResponse.redirect(new URL('/dashboard/approvals?sourcePlatform=slack', request.url));
  });
}
