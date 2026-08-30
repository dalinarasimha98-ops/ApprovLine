import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import type { Prisma, ApprovalStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** Per-record compliance score (0–100). */
function deriveComplianceScore(record: {
  approverName: string | null;
  evidenceSnippet: string | null;
  status: string;
  sourcePlatform: string | null;
  evidenceAssociationCount: number;
  evalScore: number | null;
}): number {
  if (record.evalScore !== null) {
    return Math.max(0, Math.min(100, record.evalScore));
  }
  let score = 0;
  if (record.approverName) score += 25;
  if (record.evidenceSnippet || record.evidenceAssociationCount > 0) score += 25;
  if (record.status?.toUpperCase() !== 'PENDING_REVIEW') score += 25;
  if (record.sourcePlatform) score += 25;
  return score;
}

/** Per-record evidence coverage estimate (0–100). */
function deriveEvidenceCoverage(record: {
  evidenceSnippet: string | null;
  messageSourceId: string | null;
  evidenceAssociationCount: number;
}): number {
  if (record.evidenceAssociationCount > 0 || record.evidenceSnippet) return 75;
  if (record.messageSourceId) return 50;
  return 0;
}

export async function GET(request: Request) {
  const tenant = await getDashboardTenant();
  if (
    tenant.status === 'unauthenticated' ||
    tenant.status === 'error' ||
    tenant.status === 'database_invalid'
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (
    tenant.status === 'organization_missing' ||
    tenant.status === 'onboarding_incomplete' ||
    !tenant.organization
  ) {
    return NextResponse.json({ error: 'Workspace not ready' }, { status: 403 });
  }
  if (!tenant.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ROUTE_PERMISSIONS, hasAnyRole } = await import('@/lib/rbac');
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
  const riskLevel = searchParams.get('riskLevel') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const fromStr = searchParams.get('from') ?? undefined;
  const toStr = searchParams.get('to') ?? undefined;
  const sortBy = searchParams.get('sortBy') ?? 'createdAt';
  const sortDir = (searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  const searchOR: Prisma.ApprovalRecordWhereInput['OR'] = q
    ? [
        { subject: { contains: q, mode: 'insensitive' } },
        { approverName: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ]
    : undefined;

  const baseFilterClauses: Prisma.ApprovalRecordWhereInput[] = [
    ...(department ? [{ department: { contains: department, mode: 'insensitive' as const } }] : []),
    ...(category ? [{ category: { contains: category, mode: 'insensitive' as const } }] : []),
    ...(source ? [{ sourcePlatform: { contains: source, mode: 'insensitive' as const } }] : []),
    ...(riskLevel ? [{ riskLevel: { contains: riskLevel, mode: 'insensitive' as const } }] : []),
    ...(status ? [{ status: status as ApprovalStatus }] : []),
    ...(from || to
      ? [{ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }]
      : []),
  ];

  const where: Prisma.ApprovalRecordWhereInput = searchOR
    ? {
        ...tenantScopedWhere({ organizationId }),
        AND: [{ OR: searchOR }, ...baseFilterClauses],
      }
    : {
        ...tenantScopedWhere({ organizationId }),
        ...(baseFilterClauses.length > 0 ? { AND: baseFilterClauses } : {}),
      };

  const orderBy: Prisma.ApprovalRecordOrderByWithRelationInput[] =
    sortBy === 'status'
      ? [{ status: sortDir }, { createdAt: 'desc' }]
      : sortBy === 'createdAt'
      ? [{ createdAt: sortDir }]
      : [{ createdAt: 'desc' }];

  const offset = (page - 1) * pageSize;

  const [total, rawRecords] = await Promise.all([
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
        sourcePlatform: true,
        status: true,
        evidenceSnippet: true,
        messageSourceId: true,
        createdAt: true,
        _count: { select: { evidenceAssociations: true } },
        complianceEvaluations: {
          select: { score: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        investigations: { select: { investigationId: true }, take: 1 },
        auditLogs: { select: { id: true }, take: 1 },
      },
      orderBy,
      take: pageSize,
      skip: offset,
    }),
  ]);

  const records = rawRecords.map((r) => {
    const evalScore = r.complianceEvaluations[0]?.score ?? null;
    const complianceScore = deriveComplianceScore({
      approverName: r.approverName,
      evidenceSnippet: r.evidenceSnippet,
      status: r.status,
      sourcePlatform: r.sourcePlatform,
      evidenceAssociationCount: r._count.evidenceAssociations,
      evalScore,
    });
    const evidenceCoverage = deriveEvidenceCoverage({
      evidenceSnippet: r.evidenceSnippet,
      messageSourceId: r.messageSourceId,
      evidenceAssociationCount: r._count.evidenceAssociations,
    });
    return {
      id: r.id,
      subject: r.subject,
      category: r.category,
      approverName: r.approverName,
      department: r.department,
      riskLevel: r.riskLevel,
      sourcePlatform: r.sourcePlatform,
      status: r.status,
      createdAt: r.createdAt,
      complianceScore,
      evidenceCoverage,
      investigations: r.investigations,
      auditLogs: r.auditLogs,
    };
  });

  return NextResponse.json({
    records,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
