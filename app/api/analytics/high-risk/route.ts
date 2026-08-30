import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import type { Prisma, ApprovalStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated' || tenant.status === 'error' || tenant.status === 'database_invalid') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete' || !tenant.organization) {
    return NextResponse.json({ error: 'Workspace not ready' }, { status: 403 });
  }
  if (!tenant.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ROUTE_PERMISSIONS } = await import('@/lib/rbac');
  const { hasAnyRole } = await import('@/lib/rbac');
  const allowedRoles = ROUTE_PERMISSIONS['/analytics'];
  if (allowedRoles && !hasAnyRole(tenant.user.role, allowedRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const organizationId = tenant.organization.id;
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '10', 10) || 10));
  const q = searchParams.get('q') ?? undefined;
  const department = searchParams.get('department') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const source = searchParams.get('source') ?? undefined;
  const riskLevelRaw = searchParams.get('riskLevel') ?? 'high,critical';
  const status = searchParams.get('status') ?? undefined;
  const fromStr = searchParams.get('from') ?? undefined;
  const toStr = searchParams.get('to') ?? undefined;
  const sortBy = searchParams.get('sortBy') ?? 'riskLevel';
  const sortDir = (searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const riskLevels = riskLevelRaw.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  const riskOR: Prisma.ApprovalRecordWhereInput['OR'] = riskLevels.length > 0
    ? riskLevels.map((r) => ({ riskLevel: r }))
    : [{ riskLevel: 'high' }, { riskLevel: 'critical' }];

  const searchOR: Prisma.ApprovalRecordWhereInput['OR'] = q ? [
    { subject: { contains: q, mode: 'insensitive' } },
    { approverName: { contains: q, mode: 'insensitive' } },
    { department: { contains: q, mode: 'insensitive' } },
    { category: { contains: q, mode: 'insensitive' } },
  ] : undefined;

  const where: Prisma.ApprovalRecordWhereInput = searchOR
    ? {
        ...tenantScopedWhere({ organizationId }),
        AND: [
          { OR: riskOR },
          { OR: searchOR },
          ...(department ? [{ department: { contains: department, mode: 'insensitive' as const } }] : []),
          ...(category ? [{ category: { contains: category, mode: 'insensitive' as const } }] : []),
          ...(source ? [{ sourcePlatform: { contains: source, mode: 'insensitive' as const } }] : []),
          ...(status ? [{ status: status as ApprovalStatus }] : []),
          ...(from || to ? [{ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }] : []),
        ],
      }
    : {
        ...tenantScopedWhere({ organizationId }),
        OR: riskOR,
        ...(department ? { department: { contains: department, mode: 'insensitive' } } : {}),
        ...(category ? { category: { contains: category, mode: 'insensitive' } } : {}),
        ...(source ? { sourcePlatform: { contains: source, mode: 'insensitive' } } : {}),
        ...(status ? { status: status as ApprovalStatus } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      };

  const orderBy: Prisma.ApprovalRecordOrderByWithRelationInput[] =
    sortBy === 'status' ? [{ status: sortDir }, { createdAt: 'desc' }]
    : sortBy === 'createdAt' ? [{ createdAt: sortDir }]
    : [{ riskLevel: sortDir }, { createdAt: 'desc' }];

  const offset = (page - 1) * pageSize;

  const [total, records] = await Promise.all([
    prisma.approvalRecord.count({ where }),
    prisma.approvalRecord.findMany({
      where,
      select: {
        id: true,
        subject: true,
        category: true,
        approverName: true,
        department: true,
        riskLevel: true,
        confidence: true,
        businessImpact: true,
        sourcePlatform: true,
        status: true,
        evidenceSnippet: true,
        sourceLink: true,
        createdAt: true,
        occurredAt: true,
        investigations: { select: { investigationId: true }, take: 1 },
        auditLogs: { select: { id: true }, take: 1 },
      },
      orderBy,
      take: pageSize,
      skip: offset,
    }),
  ]);

  return NextResponse.json({
    records,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
