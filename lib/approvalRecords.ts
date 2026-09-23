import type { Prisma } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import { withTimeout } from '@/lib/performance';
import { prisma } from '@/lib/prisma';
import { toDate } from '@/lib/types/dates';

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
  /** 'all' (or omitted) means no status filter; otherwise an ApprovalStatus value. */
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  /** 1-based page number for the approvals table. Defaults to 1. */
  page?: number;
  /** Rows per page. Defaults to 10 (matches the dashboard table's default). */
  pageSize?: number;
};

type ApprovalRecordsCacheParams = {
  organizationId: string;
  q: string;
  employee: string;
  department: string;
  sourcePlatform: string;
  category: string;
  riskLevel: string;
  approvalType: string;
  status: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function normalizeFiltersForCache(filters: ApprovalListFilters): ApprovalRecordsCacheParams {
  const pageSize = Math.min(Math.max(1, filters.pageSize ?? filters.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  return {
    organizationId: filters.organizationId,
    q: filters.q?.trim().toLowerCase() ?? '',
    employee: filters.employee?.trim().toLowerCase() ?? '',
    department: filters.department?.trim().toLowerCase() ?? '',
    sourcePlatform: filters.sourcePlatform?.trim().toLowerCase() ?? '',
    category: filters.category?.trim().toLowerCase() ?? '',
    riskLevel: filters.riskLevel?.trim().toLowerCase() ?? '',
    approvalType: filters.approvalType?.trim().toUpperCase() ?? '',
    status: filters.status && filters.status.toLowerCase() !== 'all' ? filters.status.trim().toUpperCase() : '',
    from: filters.from ?? '',
    to: filters.to ?? '',
    page,
    pageSize,
  };
}

export function buildApprovalRecordsWhere(
  filters: ApprovalListFilters | ApprovalRecordsCacheParams,
): Prisma.ApprovalRecordWhereInput {
  const occurredAt: Prisma.DateTimeFilter = {};
  if (filters.from) occurredAt.gte = new Date(filters.from);
  if (filters.to) occurredAt.lte = new Date(filters.to);

  const q = filters.q?.trim();
  const status = 'status' in filters && filters.status && filters.status.toLowerCase() !== 'all'
    ? filters.status.trim().toUpperCase()
    : '';

  return {
    organizationId: filters.organizationId,
    ...(filters.department ? { department: { contains: filters.department, mode: 'insensitive' } } : {}),
    ...(filters.employee ? { approverName: { contains: filters.employee, mode: 'insensitive' } } : {}),
    ...(filters.sourcePlatform ? { sourcePlatform: { contains: filters.sourcePlatform, mode: 'insensitive' } } : {}),
    ...(filters.category ? { category: { contains: filters.category, mode: 'insensitive' } } : {}),
    ...(filters.riskLevel ? { riskLevel: filters.riskLevel.toLowerCase() } : {}),
    ...(filters.approvalType ? { approvalType: filters.approvalType.toUpperCase() as Prisma.EnumApprovalTypeFilter['equals'] } : {}),
    ...(status ? { status: status as Prisma.EnumApprovalStatusFilter['equals'] } : {}),
    ...(filters.from || filters.to ? { occurredAt } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { approverName: { contains: q, mode: 'insensitive' } },
            { approverEmail: { contains: q, mode: 'insensitive' } },
            { department: { contains: q, mode: 'insensitive' } },
            { sourcePlatform: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
            { sourceRecordId: { contains: q, mode: 'insensitive' } },
            { id: q },
          ],
        }
      : {}),
  };
}

// --- Cache tag / invalidation ------------------------------------------
// One tag per organization so a write in org A can never invalidate org B's
// cached page — see the write-path callers (services/manual-approvals.ts,
// services/classifier/persistence.ts, lib/demo-data.ts, etc.).
export function approvalRecordsCacheTag(organizationId: string) {
  return `approval-records-${organizationId}`;
}

/**
 * Safe to call from anywhere that writes an ApprovalRecord, including the
 * standalone BullMQ worker process (services/queue/worker.ts) — unlike a
 * bare revalidateTag() call, this never throws outside a Next.js server
 * request scope. The worker has no such scope, so cache staleness there
 * resolves naturally via the 60s revalidate window instead; every
 * synchronous, request-scoped write path (manual approvals, demo seeding,
 * the /api/classify route) gets immediate invalidation.
 */
export function invalidateApprovalRecordsCache(organizationId: string) {
  try {
    revalidateTag(approvalRecordsCacheTag(organizationId));
  } catch (error) {
    console.warn(
      '[approval-records] cache invalidation skipped (no Next.js server request scope, e.g. called from the worker process)',
      error instanceof Error ? error.message : error,
    );
  }
}

// --- Circuit breaker -----------------------------------------------------
// Mirrors lib/auth.ts's getDashboardTenant() breaker: after repeated
// consecutive DB failures, stop hammering the database and fail fast. Also
// gates whether the UI shows the alarming "recovering" banner at all — a
// single transient blip must never surface it (see loadDashboardApprovalRecords).
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveApprovalQueryFailures = 0;
let approvalQueryBreakerOpenUntil = 0;

function isApprovalQueryBreakerOpen() {
  return Date.now() < approvalQueryBreakerOpenUntil;
}

function recordApprovalQuerySuccess() {
  consecutiveApprovalQueryFailures = 0;
  approvalQueryBreakerOpenUntil = 0;
}

function recordApprovalQueryFailure() {
  consecutiveApprovalQueryFailures += 1;
  if (consecutiveApprovalQueryFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    approvalQueryBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class ApprovalQueryCircuitOpenError extends Error {
  constructor() {
    super('Approval records lookup is temporarily paused after repeated database failures.');
    this.name = 'ApprovalQueryCircuitOpenError';
  }
}

const APPROVAL_RECORDS_QUERY_TIMEOUT_MS = 5000;
const APPROVAL_RECORDS_REVALIDATE_SECONDS = 60;

type ApprovalRecordsPage = { records: ApprovalListRecord[]; total: number };

async function fetchApprovalRecordsFresh(cacheParams: ApprovalRecordsCacheParams): Promise<ApprovalRecordsPage> {
  if (isApprovalQueryBreakerOpen()) {
    throw new ApprovalQueryCircuitOpenError();
  }

  const where = buildApprovalRecordsWhere(cacheParams);
  const attempt = () =>
    withTimeout(
      'dashboard approvals query',
      Promise.all([
        prisma.approvalRecord.findMany({
          select: approvalRecordListSelect,
          where,
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          skip: (cacheParams.page - 1) * cacheParams.pageSize,
          take: cacheParams.pageSize,
        }),
        prisma.approvalRecord.count({ where }),
      ]),
      APPROVAL_RECORDS_QUERY_TIMEOUT_MS,
    );

  try {
    // One quick retry on a connection-pool-shaped error — this is what
    // makes a single transient blip self-heal within the same request
    // instead of ever reaching the stale-cache/empty fallback below.
    const [records, total] = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return attempt();
    });
    recordApprovalQuerySuccess();
    return { records, total };
  } catch (error) {
    recordApprovalQueryFailure();
    throw error;
  }
}

/**
 * Cross-request cache (Next.js Data Cache, not per-process memory) — this is
 * the primary fix for the "recovering" fallback: previously every request on
 * every serverless instance hit Postgres directly with zero shared caching,
 * so under a connection_limit=1 pool, concurrent requests queued behind each
 * other and any request landing on a cold instance had nothing to fall back
 * on when the queue produced a timeout. Constructing the wrapped function
 * per organizationId (rather than once at module scope) is the documented
 * Next.js pattern for a per-entity dynamic cache tag — the cache identity
 * comes from keyParts + call arguments, not from this function's identity.
 */
function getCachedApprovalRecordsFetcher(organizationId: string) {
  return unstable_cache(
    (cacheParams: ApprovalRecordsCacheParams) => fetchApprovalRecordsFresh(cacheParams),
    ['approval-records', organizationId],
    { revalidate: APPROVAL_RECORDS_REVALIDATE_SECONDS, tags: [approvalRecordsCacheTag(organizationId)] },
  );
}

/**
 * unstable_cache serializes its return value to JSON — createdAt/occurredAt
 * come back as ISO strings on a cache hit even though ApprovalListRecord's
 * type (inherited from Prisma) claims they're still Date objects. Applied
 * unconditionally (not just on the cache-hit path) so callers never have to
 * know or care whether a given result was served fresh or from cache.
 */
function deserializeApprovalRecord(record: ApprovalListRecord): ApprovalListRecord {
  return {
    ...record,
    createdAt: toDate(record.createdAt),
    occurredAt: toDate(record.occurredAt),
  };
}

// Per-request dedup on top of the cross-request cache, keyed by a stable
// string (not object identity) so repeat calls with equivalent filters
// within one request resolve to a single in-flight lookup.
const getApprovalRecordsForRequest = cache(async (organizationId: string, cacheParamsKey: string) => {
  const cacheParams = JSON.parse(cacheParamsKey) as ApprovalRecordsCacheParams;
  const page = await getCachedApprovalRecordsFetcher(organizationId)(cacheParams);
  return { records: page.records.map(deserializeApprovalRecord), total: page.total };
});

// --- Tier-2 "last known good" store --------------------------------------
// unstable_cache has no built-in "serve the last successful value even
// though it's technically stale/errored" primitive — it only memoizes
// successful returns of its own wrapped function. This is a small,
// explicitly-imperative store purely for that stale-on-error fallback; the
// cross-request performance win above comes from unstable_cache, not this.
type LastGoodEntry = { records: ApprovalListRecord[]; total: number; cachedAt: number };
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;

const globalForApprovalRecords = globalThis as unknown as {
  approvlineApprovalRecordsLastGood?: Map<string, LastGoodEntry>;
};

function lastGoodStore() {
  globalForApprovalRecords.approvlineApprovalRecordsLastGood ??= new Map();
  return globalForApprovalRecords.approvlineApprovalRecordsLastGood;
}

export async function loadDashboardApprovalRecords(filters: ApprovalListFilters): Promise<{
  records: ApprovalListRecord[];
  total: number;
  page: number;
  pageSize: number;
  source: 'database' | 'cache' | 'empty';
  degraded: boolean;
  alert: boolean;
  staleAsOfMs?: number;
  message?: string;
  reference?: string;
}> {
  const cacheParams = normalizeFiltersForCache(filters);
  const cacheKey = JSON.stringify(cacheParams);
  const lastGoodKey = `${filters.organizationId}::${cacheKey}`;

  try {
    const { records, total } = await getApprovalRecordsForRequest(filters.organizationId, cacheKey);
    lastGoodStore().set(lastGoodKey, { records, total, cachedAt: Date.now() });
    return { records, total, page: cacheParams.page, pageSize: cacheParams.pageSize, source: 'database', degraded: false, alert: false };
  } catch (error) {
    const reference = reportApprovalFailure(error, {
      action: 'approval_history_query',
      organizationId: filters.organizationId,
      userId: filters.userId ?? undefined,
    });

    // The "recovering" banner is reserved for a database that has actually
    // been unreachable for 3+ consecutive attempts (the breaker is open) —
    // a single slow query must never alarm the user, even if it means
    // falling back to a slightly stale (but real) result.
    const alert = isApprovalQueryBreakerOpen();

    const lastGood = lastGoodStore().get(lastGoodKey);
    if (lastGood && Date.now() - lastGood.cachedAt < STALE_CACHE_TTL_MS) {
      return {
        records: lastGood.records,
        total: lastGood.total,
        page: cacheParams.page,
        pageSize: cacheParams.pageSize,
        source: 'cache',
        degraded: alert,
        alert,
        staleAsOfMs: lastGood.cachedAt,
        reference,
        message: alert
          ? 'Live database results are delayed, so recently loaded approval records are shown instead.'
          : undefined,
      };
    }

    return {
      records: [],
      total: 0,
      page: cacheParams.page,
      pageSize: cacheParams.pageSize,
      source: 'empty',
      degraded: true,
      alert,
      reference,
      message: alert
        ? 'Approval records are temporarily unavailable. The page remains usable while the service recovers.'
        : 'Approval records are loading. Retrying automatically.',
    };
  }
}

// --- Status counts (KPI strip + status tabs) --------------------------------
// Deliberately org-wide (tenant-scoped only, no search/filter applied) so the
// KPI cards and status-tab counts read as stable totals - exactly like every
// other enterprise approvals inbox - rather than jumping around as someone
// types into the search box. Always respects tenant scoping; there is no
// per-row visibility restriction on approvals beyond organizationId (see
// lib/rbac.ts's ROUTE_PERMISSIONS, which does not gate '/dashboard/approvals'
// or '/approvals' by role - every authenticated org member can view them).
export type ApprovalStatusCounts = { total: number; approved: number; pending: number; rejected: number; highRisk: number };

async function fetchApprovalStatusCountsFresh(organizationId: string): Promise<ApprovalStatusCounts> {
  const [rows, highRisk] = await withTimeout(
    'dashboard approval status counts',
    Promise.all([
      prisma.approvalRecord.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      prisma.approvalRecord.count({ where: { organizationId, riskLevel: { in: ['high', 'critical'] } } }),
    ]),
    APPROVAL_RECORDS_QUERY_TIMEOUT_MS,
  );

  const counts: ApprovalStatusCounts = { total: 0, approved: 0, pending: 0, rejected: 0, highRisk };
  for (const row of rows) {
    counts.total += row._count._all;
    if (row.status === 'APPROVED') counts.approved = row._count._all;
    else if (row.status === 'PENDING_REVIEW') counts.pending = row._count._all;
    else if (row.status === 'REJECTED') counts.rejected = row._count._all;
  }
  return counts;
}

function getCachedApprovalStatusCountsFetcher(organizationId: string) {
  return unstable_cache(
    () => fetchApprovalStatusCountsFresh(organizationId),
    ['approval-status-counts', organizationId],
    { revalidate: APPROVAL_RECORDS_REVALIDATE_SECONDS, tags: [approvalRecordsCacheTag(organizationId)] },
  );
}

/** Returns zeroed counts on failure rather than throwing - the KPI strip and
 *  status tabs degrade to "0" instead of taking down the whole approvals page. */
export const getApprovalStatusCounts = cache(async (organizationId: string): Promise<ApprovalStatusCounts> => {
  try {
    return await getCachedApprovalStatusCountsFetcher(organizationId)();
  } catch (error) {
    reportApprovalFailure(error, { action: 'approval_status_counts_query', organizationId });
    return { total: 0, approved: 0, pending: 0, rejected: 0, highRisk: 0 };
  }
});

// --- Department breakdown (right-rail widget) -------------------------------
// Org-wide (not limited to the current page's 10 rows) so the breakdown stays
// accurate regardless of pagination - one groupBy query, same caching
// pattern as getApprovalStatusCounts above.
async function fetchApprovalDepartmentBreakdownFresh(organizationId: string): Promise<Array<[string, number]>> {
  const rows = await withTimeout(
    'dashboard approval department breakdown',
    prisma.approvalRecord.groupBy({
      by: ['department'],
      where: { organizationId },
      _count: { _all: true },
    }),
    APPROVAL_RECORDS_QUERY_TIMEOUT_MS,
  );
  return rows
    .map((row): [string, number] => [row.department ?? 'Unassigned', row._count._all])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

function getCachedApprovalDepartmentBreakdownFetcher(organizationId: string) {
  return unstable_cache(
    () => fetchApprovalDepartmentBreakdownFresh(organizationId),
    ['approval-department-breakdown', organizationId],
    { revalidate: APPROVAL_RECORDS_REVALIDATE_SECONDS, tags: [approvalRecordsCacheTag(organizationId)] },
  );
}

export const getApprovalDepartmentBreakdown = cache(async (organizationId: string): Promise<Array<[string, number]>> => {
  try {
    return await getCachedApprovalDepartmentBreakdownFetcher(organizationId)();
  } catch (error) {
    reportApprovalFailure(error, { action: 'approval_department_breakdown_query', organizationId });
    return [];
  }
});
