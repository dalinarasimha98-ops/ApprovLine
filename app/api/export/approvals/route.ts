import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { withTimeout } from '@/lib/performance';

function contains(value: string | null) {
  return value ? { contains: value, mode: 'insensitive' as const } : undefined;
}

function jsonReplacer(_: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

function escapePdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('\n', ' ');
}

function createSimplePdf(lines: string[]) {
  const objects: string[] = [];
  const contentLines = lines.slice(0, 42).flatMap((line, index) => {
    const y = 760 - index * 16;
    return [`BT /F1 9 Tf 42 ${y} Td (${escapePdfText(line.slice(0, 118))}) Tj ET`];
  });
  const stream = contentLines.join('\n');

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push(
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
  );
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefAt = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return pdf;
}

export async function GET(request: NextRequest) {
  const tenant = await getDashboardTenant(3000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 });
  }
  if (!tenant.organization) {
    return NextResponse.json({ error: 'Workspace access could not be confirmed. Please retry.' }, { status: 503 });
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
