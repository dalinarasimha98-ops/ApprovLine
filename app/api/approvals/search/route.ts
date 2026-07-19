import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getCurrentTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { distributedRateLimit } from '@/lib/rate-limit';

const searchSchema = z.object({
  q: z.string().optional(),
  employee: z.string().optional(),
  approverEmail: z.string().optional(),
  department: z.string().optional(),
  category: z.string().optional(),
  riskLevel: z.string().optional(),
  sourcePlatform: z.string().optional(),
  approver: z.string().optional(),
  approvalType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

function contains(value: string | undefined) {
  return value ? { contains: value, mode: 'insensitive' as const } : undefined;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = await distributedRateLimit(`approval-search:${ip}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const tenant = await getCurrentTenant();
  const parsed = searchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid search query', details: parsed.error.flatten() }, { status: 400 });
  }

  const query = parsed.data;
  const occurredAt: Prisma.DateTimeFilter = {};
  if (query.from) occurredAt.gte = new Date(query.from);
  if (query.to) occurredAt.lte = new Date(query.to);

  const where: Prisma.ApprovalRecordWhereInput = {
    organizationId: tenant.organization.id,
    ...(query.department ? { department: contains(query.department) } : {}),
    ...(query.category ? { category: contains(query.category) } : {}),
    ...(query.riskLevel ? { riskLevel: query.riskLevel.toLowerCase() } : {}),
    ...(query.sourcePlatform ? { sourcePlatform: contains(query.sourcePlatform) } : {}),
    ...(query.approvalType ? { approvalType: query.approvalType.toUpperCase() as Prisma.EnumApprovalTypeFilter['equals'] } : {}),
    ...(query.approverEmail ? { approverEmail: contains(query.approverEmail) } : {}),
    ...(query.employee || query.approver ? { approverName: contains(query.employee ?? query.approver) } : {}),
    ...(query.from || query.to ? { occurredAt } : {}),
    ...(query.q
      ? {
          OR: [
            { subject: contains(query.q) },
            { reasoning: contains(query.q) },
            { conditions: contains(query.q) },
            { evidenceSnippet: contains(query.q) },
            { approverName: contains(query.q) },
            { approverEmail: contains(query.q) },
            { businessImpact: contains(query.q) },
          ],
        }
      : {}),
  };

  const approvals = await prisma.approvalRecord.findMany({
    where,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      subject: true,
      department: true,
      category: true,
      approvalType: true,
      status: true,
      confidence: true,
      riskLevel: true,
      businessImpact: true,
      approverName: true,
      approverEmail: true,
      approvalTimestamp: true,
      sourcePlatform: true,
      sourceLink: true,
      occurredAt: true,
      createdAt: true,
    },
  });

  const hasMore = approvals.length > query.limit;
  const items = hasMore ? approvals.slice(0, query.limit) : approvals;

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  });
}
