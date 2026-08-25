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
  from?: string;
  to?: string;
  limit?: number;
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
  from: string;
  to: string;
  limit: number;
};

function normalizeFiltersForCache(filters: ApprovalListFilters): ApprovalRecordsCacheParams {
  return {
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
  };
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

async function fetchApprovalRecordsFresh(cacheParams: ApprovalRecordsCacheParams): Promise<ApprovalListRecord[]> {
  if (isApprovalQueryBreakerOpen()) {
    throw new ApprovalQueryCircuitOpenError();
  }

  const attempt = () =>
    withTimeout(
      'dashboard approvals query',
      prisma.approvalRecord.findMany({
        select: approvalRecordListSelect,
        where: buildApprovalRecordsWhere(cacheParams),
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: cacheParams.limit,
      }),
      APPROVAL_RECORDS_QUERY_TIMEOUT_MS,
    );

  try {
    // One quick retry on a connection-pool-shaped error — this is what
    // makes a single transient blip self-heal within the same request
    // instead of ever reaching the stale-cache/empty fallback below.
    const records = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return attempt();
    });
    recordApprovalQuerySuccess();
    return records;
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
  const records = await getCachedApprovalRecordsFetcher(organizationId)(cacheParams);
  return records.map(deserializeApprovalRecord);
});

// --- Tier-2 "last known good" store --------------------------------------
// unstable_cache has no built-in "serve the last successful value even
// though it's technically stale/errored" primitive — it only memoizes
// successful returns of its own wrapped function. This is a small,
// explicitly-imperative store purely for that stale-on-error fallback; the
// cross-request performance win above comes from unstable_cache, not this.
type LastGoodEntry = { records: ApprovalListRecord[]; cachedAt: number };
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
    const records = await getApprovalRecordsForRequest(filters.organizationId, cacheKey);
    lastGoodStore().set(lastGoodKey, { records, cachedAt: Date.now() });
    return { records, source: 'database', degraded: false, alert: false };
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
