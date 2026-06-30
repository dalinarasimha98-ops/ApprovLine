import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function contains(value: string | null) {
  return value ? { contains: value, mode: 'insensitive' as const } : undefined;
}

function jsonReplacer(_: string, value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function GET(request: NextRequest) {
  const tenant = await getDashboardTenant(2000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tenant.organization) {
    return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });
  }
  const { organization } = tenant;
  const params = request.nextUrl.searchParams;
  const format = params.get('format') ?? 'csv';
  const occurredAt: Prisma.DateTimeFilter = {};
  if (params.get('from')) occurredAt.gte = new Date(params.get('from') as string);
  if (params.get('to')) occurredAt.lte = new Date(params.get('to') as string);

  const where: Prisma.ApprovalRecordWhereInput = {
    organizationId: organization.id,
    ...(params.get('sourcePlatform') ? { sourcePlatform: contains(params.get('sourcePlatform')) } : {}),
    ...(params.get('approver') ? { approverName: contains(params.get('approver')) } : {}),
    ...(params.get('category') ? { category: contains(params.get('category')) } : {}),
    ...(params.get('riskLevel') ? { riskLevel: params.get('riskLevel')?.toLowerCase() } : {}),
    ...(params.get('approvalType') ? { approvalType: params.get('approvalType')?.toUpperCase() as Prisma.EnumApprovalTypeFilter['equals'] } : {}),
    ...(params.get('from') || params.get('to') ? { occurredAt } : {}),
  };

  const approvals = await prisma.approvalRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ approvals }, jsonReplacer, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="approvline-approvals.json"',
      },
    });
  }

  const header = [
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
    'Approval Timestamp',
    'Created At',
  ];
  const rows = approvals.map((item) => [
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
    item.approvalTimestamp?.toISOString() ?? '',
    item.createdAt.toISOString(),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="approvline-approvals.csv"',
    },
  });
}
