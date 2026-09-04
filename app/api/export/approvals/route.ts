import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { withTimeout } from '@/lib/performance';
import { hasAnyRole } from '@/lib/rbac';
import { createSimplePdf } from '@/lib/simple-pdf';
import { writeAuditLog } from '@/services/audit';

function contains(value: string | null) {
  return value ? { contains: value, mode: 'insensitive' as const } : undefined;
}

function jsonReplacer(_: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function GET(request: NextRequest) {
  const tenant = await getDashboardTenant(3000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
  }
  if (!tenant.organization || !tenant.user) {
    return NextResponse.json({ error: 'Workspace access could not be confirmed. Please retry.' }, { status: 503 });
  }
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN', 'AUDITOR'])) {
    return NextResponse.json({ error: 'Your workspace role cannot export approval records.' }, { status: 403 });
  }
  const { organization } = tenant;
  const params = request.nextUrl.searchParams;
  const approvalId = params.get('approvalId');
  const format = params.get('format') ?? 'csv';
  if (!['csv', 'json', 'pdf'].includes(format)) {
    return NextResponse.json({ error: 'Choose PDF, JSON, or CSV format.' }, { status: 400 });
  }
  const occurredAt: Prisma.DateTimeFilter = {};
  if (params.get('from')) occurredAt.gte = new Date(params.get('from') as string);
  if (params.get('to')) occurredAt.lte = new Date(params.get('to') as string);

  const where: Prisma.ApprovalRecordWhereInput = {
    organizationId: organization.id,
    ...(approvalId ? { id: approvalId } : {}),
    ...(params.get('sourcePlatform') ? { sourcePlatform: contains(params.get('sourcePlatform')) } : {}),
    ...(params.get('approver') ? { approverName: contains(params.get('approver')) } : {}),
    ...(params.get('category') ? { category: contains(params.get('category')) } : {}),
    ...(params.get('riskLevel') ? { riskLevel: params.get('riskLevel')?.toLowerCase() } : {}),
    ...(params.get('approvalType') ? { approvalType: params.get('approvalType')?.toUpperCase() as Prisma.EnumApprovalTypeFilter['equals'] } : {}),
    ...(params.get('from') || params.get('to') ? { occurredAt } : {}),
  };

  let approvals;
  try {
    approvals = await withTimeout(
      'approval export query',
      prisma.approvalRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          messageSource: true,
          manualDetail: {
            include: { recorder: { select: { name: true, email: true } } },
          },
          evidenceAssociations: {
            select: {
              origin: true,
              status: true,
              confidence: true,
              sourceTimestamp: true,
            },
          },
        },
        take: approvalId ? 1 : 10_000,
      }),
      10_000,
    );
  } catch (error) {
    const correlationId = reportApprovalFailure(error, {
      action: `export_${format}`,
      approvalId: approvalId ?? undefined,
      organizationId: organization.id,
      userId: tenant.session.userId,
    });
    return NextResponse.json({ error: 'Approval export could not be prepared. Please retry.', reference: correlationId }, { status: 503 });
  }

  if (approvalId && approvals.length === 0) {
    reportApprovalFailure(new Error('Approval export record missing'), {
      action: `export_${format}`,
      approvalId,
      organizationId: organization.id,
      userId: tenant.session.userId,
      reason: 'Approval was deleted or does not belong to this tenant.',
    });
    return NextResponse.json({ error: 'Approval export is unavailable or has been deleted.' }, { status: 404 });
  }

  // Non-blocking audit log — export is complete regardless of whether this write succeeds.
  writeAuditLog({
    organizationId: organization.id,
    actorUserId: tenant.session?.userId,
    action: 'report.exported',
    metadata: { reportId: 'approval-audit', reportName: 'Approval Audit Report', format, recordCount: approvals.length },
  }).catch(() => {});

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ approvals }, jsonReplacer, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="approvline-approvals.json"',
      },
    });
  }

  const header = [
    'Demo Data',
    'Subject',
    'Approver',
    'Approver Email',
    'Department',
    'Category',
    'Risk Level',
    'Business Impact',
    'Source Platform',
    'Type',
    'Status',
    'Confidence',
    'Evidence Snippet',
    'Source Link',
    'Source Channel',
    'Message Sender',
    'Approval Timestamp',
    'Created At',
    'Evidence Origin',
    'Verification Status',
    'Recorder',
    'Communication Channel',
    'Evidence Associations',
    'Human Verified Evidence',
  ];
  const rows = approvals.map((item) => [
    item.messageSource?.externalId?.startsWith('demo-') || item.sourceLink?.includes('TDEMO') || item.sourceLink?.includes('demo-') ? 'Yes' : 'No',
    item.subject,
    item.approverName ?? '',
    item.approverEmail ?? '',
    item.department ?? '',
    item.category ?? '',
    item.riskLevel ?? '',
    item.businessImpact ?? '',
    item.sourcePlatform ?? '',
    item.approvalType,
    item.status,
    String(item.confidence),
    item.evidenceSnippet ?? '',
    item.sourceLink ?? '',
    item.messageSource?.channel ?? '',
    item.messageSource?.sender ?? '',
    item.approvalTimestamp?.toISOString() ?? '',
    item.createdAt.toISOString(),
    item.manualDetail?.kind === 'VERBAL' ? 'VERBAL_APPROVAL' : item.manualDetail ? 'MANUAL_ENTRY' : 'AUTOMATIC_CAPTURE',
    item.manualDetail?.verificationStatus ?? 'AUTOMATICALLY_CAPTURED',
    item.manualDetail ? (item.manualDetail.recorder.name ?? item.manualDetail.recorder.email) : '',
    item.manualDetail?.communicationChannel ?? '',
    String(item.evidenceAssociations.length),
    String(item.evidenceAssociations.filter((association) => association.status === 'CONFIRMED').length),
  ]);

  if (format === 'pdf') {
    const lines = [
      'ApprovLine Approval Evidence Export',
      `Generated: ${new Date().toISOString()}`,
      `Records: ${approvals.length}`,
      'Demo data is marked in each record when applicable.',
      '',
      ...approvals.flatMap((item, index) => [
        `${index + 1}. ${item.subject}`,
        `   Status: ${item.status} | Type: ${item.approvalType} | Confidence: ${item.confidence}% | Risk: ${item.riskLevel ?? 'low'}`,
        `   Approver: ${item.approverName ?? 'Unknown'} <${item.approverEmail ?? 'unknown'}>`,
        `   Source: ${item.sourcePlatform ?? 'unknown'} | ${item.messageSource?.channel ?? 'no channel'} | Demo: ${
          item.messageSource?.externalId?.startsWith('demo-') || item.sourceLink?.includes('TDEMO') || item.sourceLink?.includes('demo-') ? 'Yes' : 'No'
        }`,
        `   Evidence: ${item.evidenceSnippet ?? 'No evidence snippet'}`,
        `   Origin: ${item.manualDetail?.kind === 'VERBAL' ? 'Verbal approval' : item.manualDetail ? 'Manual entry' : 'Automatic capture'} | Verification: ${item.manualDetail?.verificationStatus ?? 'Automatically captured'}`,
        `   Supporting evidence: ${item.evidenceAssociations.length} linked/suggested | Human verified: ${item.evidenceAssociations.filter((association) => association.status === 'CONFIRMED').length}`,
        '',
      ]),
    ];
    return new NextResponse(createSimplePdf(lines), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="approvline-approval-evidence.pdf"',
      },
    });
  }

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="approvline-approvals.csv"',
    },
  });
}
