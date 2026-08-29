import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { withTimeout } from '@/lib/performance';
import { createInvestigationCase } from '@/services/investigations';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

export async function GET(request: Request) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...ALLOWED_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const risk = searchParams.get('risk') ?? '';
  const type = searchParams.get('type') ?? '';
  const assignedTo = searchParams.get('assignedTo') ?? '';
  const department = searchParams.get('department') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const perPage = Math.min(50, Math.max(5, parseInt(searchParams.get('perPage') ?? '20', 10)));

  function contains(value: string) {
    return value ? { contains: value, mode: 'insensitive' as const } : undefined;
  }

  const where: Prisma.InvestigationCaseWhereInput = {
    organizationId: tenant.organization.id,
    ...(status ? { status: status as Prisma.EnumInvestigationStatusFilter } : {}),
    ...(risk ? { riskLevel: risk.toLowerCase() } : {}),
    ...(type ? { type: contains(type) } : {}),
    ...(assignedTo === 'unassigned' ? { assignedToUserId: null } : assignedTo ? { assignedToUserId: assignedTo } : {}),
    ...(department ? { department: contains(department) } : {}),
    ...(dateFrom || dateTo ? {
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    } : {}),
    ...(q ? {
      OR: [
        { title: contains(q) },
        { summary: contains(q) },
        { department: contains(q) },
        { type: contains(q) },
        { approvals: { some: { approvalRecord: { subject: contains(q) } } } },
        { approvals: { some: { approvalRecord: { approverName: contains(q) } } } },
      ],
    } : {}),
  };

  const [total, cases] = await withTimeout(
    'investigations list',
    Promise.all([
      prisma.investigationCase.count({ where }),
      prisma.investigationCase.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          approvals: {
            include: {
              approvalRecord: {
                select: { id: true, subject: true, approverName: true, department: true, riskLevel: true, status: true, confidence: true, occurredAt: true, sourcePlatform: true },
              },
            },
            take: 5,
          },
          notes: { take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]),
    3000,
  );

  return NextResponse.json({
    cases,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  });
}

export async function POST(request: Request) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...ALLOWED_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    title?: string;
    type?: string;
    department?: string;
    approvalIds?: string[];
    dateRangeStart?: string;
    dateRangeEnd?: string;
    assignedToUserId?: string;
  };

  const investigation = await createInvestigationCase({
    organizationId: tenant.organization.id,
    title: body.title,
    type: body.type,
    approvalIds: body.approvalIds ?? [],
    department: body.department,
    dateRangeStart: body.dateRangeStart ? new Date(body.dateRangeStart) : undefined,
    dateRangeEnd: body.dateRangeEnd ? new Date(body.dateRangeEnd) : undefined,
    createdByUserId: tenant.user.id,
    assignedToUserId: body.assignedToUserId,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'investigation.created',
      metadata: { investigationId: investigation.id, type: body.type, approvalCount: (body.approvalIds ?? []).length } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ investigation }, { status: 201 });
}
