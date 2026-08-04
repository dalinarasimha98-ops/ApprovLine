import type { Prisma } from '@prisma/client';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { withTimeout } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export const approvalRecordListSelect = {
  id: true,
  subject: true,
  sourceLink: true,
  reasoning: true,
  conditions: true,
  businessImpact: true,
  evidenceSnippet: true,
  approverName: true,
  approverEmail: true,
  department: true,
  category: true,
  riskLevel: true,
  sourcePlatform: true,
  confidence: true,
  status: true,
  createdAt: true,
  occurredAt: true,
} satisfies Prisma.ApprovalRecordSelect;

export type ApprovalListRecord = Prisma.ApprovalRecordGetPayload<{
  select: typeof approvalRecordListSelect;
}>;

export type ApprovalListFilters = {
  organizationId: string;
  userId?: string | null;
  q?: string;
  employee?: string;
  department?: string;
  sourcePlatform?: string;
  category?: string;
  riskLevel?: string;
  approvalType?: string;
  from?: string;
  to?: string;
  limit?: number;
  timeoutMs?: number;
};

type ApprovalRecordsCacheEntry = {
  records: ApprovalListRecord[];
  cachedAt: number;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;

const globalForApprovalRecords = globalThis as unknown as {
  approvlineApprovalRecordsCache?: Map<string, ApprovalRecordsCacheEntry>;
};

function approvalRecordsCache() {
  globalForApprovalRecords.approvlineApprovalRecordsCache ??= new Map();
  return globalForApprovalRecords.approvlineApprovalRecordsCache;
}

function normalizedFilterKey(filters: ApprovalListFilters) {
  return JSON.stringify({
    organizationId: filters.organizationId,
    q: filters.q?.trim().toLowerCase() ?? '',
    employee: filters.employee?.trim().toLowerCase() ?? '',
    department: filters.department?.trim().toLowerCase() ?? '',
    sourcePlatform: filters.sourcePlatform?.trim().toLowerCase() ?? '',
    category: filters.category?.trim().toLowerCase() ?? '',
    riskLevel: filters.riskLevel?.trim().toLowerCase() ?? '',
    approvalType: filters.approvalType?.trim().toUpperCase() ?? '',
    from: filters.from ?? '',
    to: filters.to ?? '',
    limit: Math.min(filters.limit ?? 50, 100),
  });
}

export function buildApprovalRecordsWhere(filters: ApprovalListFilters): Prisma.ApprovalRecordWhereInput {
  const occurredAt: Prisma.DateTimeFilter = {};
  if (filters.from) occurredAt.gte = new Date(filters.from);
  if (filters.to) occurredAt.lte = new Date(filters.to);

  const q = filters.q?.trim();

  return {
    organizationId: filters.organizationId,
    ...(filters.department ? { department: { contains: filters.department, mode: 'insensitive' } } : {}),
    ...(filters.employee ? { approverName: { contains: filters.employee, mode: 'insensitive' } } : {}),
    ...(filters.sourcePlatform ? { sourcePlatform: { contains: filters.sourcePlatform, mode: 'insensitive' } } : {}),
    ...(filters.category ? { category: { contains: filters.category, mode: 'insensitive' } } : {}),
    ...(filters.riskLevel ? { riskLevel: filters.riskLevel.toLowerCase() } : {}),
    ...(filters.approvalType ? { approvalType: filters.approvalType.toUpperCase() as Prisma.EnumApprovalTypeFilter['equals'] } : {}),
    ...(filters.from || filters.to ? { occurredAt } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { approverName: { contains: q, mode: 'insensitive' } },
            { approverEmail: { contains: q, mode: 'insensitive' } },
            { department: { contains: q, mode: 'insensitive' } },
            { sourcePlatform: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function loadDashboardApprovalRecords(filters: ApprovalListFilters): Promise<{
  records: ApprovalListRecord[];
  source: 'database' | 'cache' | 'empty';
  degraded: boolean;
  message?: string;
  reference?: string;
}> {
  const cacheKey = normalizedFilterKey(filters);
  const cached = approvalRecordsCache().get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return { records: cached.records, source: 'cache', degraded: false };
  }

  try {
    const records = await withTimeout(
      'dashboard approvals query',
      prisma.approvalRecord.findMany({
        select: approvalRecordListSelect,
        where: buildApprovalRecordsWhere(filters),
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(filters.limit ?? 50, 100),
      }),
      filters.timeoutMs ?? 10000,
    );

    approvalRecordsCache().set(cacheKey, { records, cachedAt: now });
    return { records, source: 'database', degraded: false };
  } catch (error) {
    const reference = reportApprovalFailure(error, {
      action: 'approval_history_query',
      organizationId: filters.organizationId,
      userId: filters.userId ?? undefined,
    });

    if (cached && now - cached.cachedAt < STALE_CACHE_TTL_MS) {
      return {
        records: cached.records,
        source: 'cache',
        degraded: true,
        reference,
        message: 'Showing recently loaded approval records while the database catches up.',
      };
    }

    return {
      records: [],
      source: 'empty',
      degraded: true,
      reference,
      message: 'Approval records are temporarily unavailable. The page remains usable while the service recovers.',
    };
  }
}
