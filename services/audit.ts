import type { Prisma } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import { withTimeout } from '@/lib/performance';
import { toDate } from '@/lib/types/dates';

// --- Cache tag / invalidation ------------------------------------------
export function auditLogCacheTag(organizationId: string) {
  return `audit-log-${organizationId}`;
}

/** Safe to call from anywhere, including the standalone worker process
 *  (writeAuditLog is called from dozens of places throughout the app,
 *  many of them worker-driven) - never throws outside a Next.js server
 *  request scope. */
export function invalidateAuditLogCache(organizationId: string) {
  try {
    revalidateTag(auditLogCacheTag(organizationId));
  } catch (error) {
    console.warn('[audit] cache invalidation skipped (no Next.js server request scope)', error instanceof Error ? error.message : error);
  }
}

export async function writeAuditLog(input: {
  organizationId: string;
  actorUserId?: string;
  approvalRecordId?: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}) {
  const log = await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      approvalRecordId: input.approvalRecordId,
      action: input.action,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  invalidateAuditLogCache(input.organizationId);
  return log;
}

// --- Read path: cached, paginated audit log history -----------------------

const auditLogListSelect = {
  id: true,
  action: true,
  actorUserId: true,
  approvalRecordId: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

export type AuditLogEntry = Prisma.AuditLogGetPayload<{ select: typeof auditLogListSelect }>;

export type AuditLogPage = {
  logs: AuditLogEntry[];
  nextCursor: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Circuit breaker -----------------------------------------------------
// Same pattern used across lib/auth.ts, lib/approvalRecords.ts,
// services/alerts.ts, services/memory.ts, services/readiness.ts, and
// services/onboarding.ts this session.
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveAuditFailures = 0;
let auditBreakerOpenUntil = 0;

function isAuditBreakerOpen() {
  return Date.now() < auditBreakerOpenUntil;
}

function recordAuditSuccess() {
  consecutiveAuditFailures = 0;
  auditBreakerOpenUntil = 0;
}

function recordAuditFailure() {
  consecutiveAuditFailures += 1;
  if (consecutiveAuditFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    auditBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class AuditLogCircuitOpenError extends Error {
  constructor() {
    super('Audit log lookup is temporarily paused after repeated database failures.');
    this.name = 'AuditLogCircuitOpenError';
  }
}

const AUDIT_LOG_PAGE_SIZE = 50;
const AUDIT_QUERY_TIMEOUT_MS = 3000;
const AUDIT_TOTAL_FETCH_TIMEOUT_MS = 5000;
const AUDIT_REVALIDATE_SECONDS = 60;
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchAuditLogPageFresh(organizationId: string, cursor: string | null): Promise<AuditLogPage> {
  if (isAuditBreakerOpen()) {
    throw new AuditLogCircuitOpenError();
  }

  const attempt = () =>
    withTimeout(
      'audit:history',
      prisma.auditLog.findMany({
        where: { organizationId },
        select: auditLogListSelect,
        orderBy: { createdAt: 'desc' },
        // organizationId + createdAt is already indexed (@@index([organizationId, createdAt]))
        // so this is an index-ordered scan regardless of table size.
        take: AUDIT_LOG_PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      AUDIT_QUERY_TIMEOUT_MS,
    );

  try {
    // One quick retry on a connection-pool-shaped error.
    const rows = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleep(300);
      return attempt();
    });

    recordAuditSuccess();
    const hasMore = rows.length > AUDIT_LOG_PAGE_SIZE;
    const logs = hasMore ? rows.slice(0, AUDIT_LOG_PAGE_SIZE) : rows;
    return { logs, nextCursor: hasMore ? logs[logs.length - 1].id : null };
  } catch (error) {
    recordAuditFailure();
    throw error;
  }
}

/**
 * Cross-request cache - the same fix already applied to every other
 * timeout fixed this session: previously every page load hit Postgres
 * directly with zero shared caching, and a single slow query immediately
 * showed the "still warming up" banner with no retry or stale fallback.
 * Constructing the wrapped function per organizationId is the documented
 * Next.js pattern for a per-entity dynamic cache tag.
 */
function getCachedAuditLogPageFetcher(organizationId: string) {
  return unstable_cache(
    (cursor: string) => fetchAuditLogPageFresh(organizationId, cursor || null),
    ['audit-log-page', organizationId],
    { revalidate: AUDIT_REVALIDATE_SECONDS, tags: [auditLogCacheTag(organizationId)] },
  );
}

/**
 * unstable_cache serializes its return value to JSON - createdAt comes
 * back as an ISO string on a cache hit even though AuditLogEntry's type
 * claims it's still a Date. Applied unconditionally, matching the fix
 * already applied everywhere else this session.
 */
function deserializeAuditLogPage(page: AuditLogPage): AuditLogPage {
  return { ...page, logs: page.logs.map((log) => ({ ...log, createdAt: toDate(log.createdAt) })) };
}

// Per-request dedup on top of the cross-request cache above.
const getAuditLogPageForRequest = cache(async (organizationId: string, cursor: string) => {
  const page = await getCachedAuditLogPageFetcher(organizationId)(cursor);
  return deserializeAuditLogPage(page);
});

// --- Tier-2 "last known good" store --------------------------------------
type LastGoodEntry = { page: AuditLogPage; cachedAt: number };
const globalForAudit = globalThis as unknown as {
  approvlineAuditLastGood?: Map<string, LastGoodEntry>;
};

function lastGoodStore() {
  globalForAudit.approvlineAuditLastGood ??= new Map();
  return globalForAudit.approvlineAuditLastGood;
}

export async function getAuditLogHistory(organizationId: string, cursor?: string | null): Promise<
  AuditLogPage & { degraded: boolean; alert: boolean; staleAsOfMs?: number; message?: string }
> {
  const cursorKey = cursor ?? '';
  const lastGoodKey = `${organizationId}::${cursorKey}`;

  try {
    const page = await withTimeout('audit log history (total)', getAuditLogPageForRequest(organizationId, cursorKey), AUDIT_TOTAL_FETCH_TIMEOUT_MS);
    lastGoodStore().set(lastGoodKey, { page, cachedAt: Date.now() });
    return { ...page, degraded: false, alert: false };
  } catch (error) {
    console.error('[audit] history fetch failed', error);

    // The degraded banner is reserved for a database that has actually
    // been unreachable for 3+ consecutive attempts (breaker open) - a
    // single slow query must never alarm the user.
    const alert = isAuditBreakerOpen();

    const lastGood = lastGoodStore().get(lastGoodKey);
    if (lastGood && Date.now() - lastGood.cachedAt < STALE_CACHE_TTL_MS) {
      return {
        ...lastGood.page,
        degraded: alert,
        alert,
        staleAsOfMs: lastGood.cachedAt,
        message: alert ? 'Live database results are delayed, so recently loaded audit logs are shown instead.' : undefined,
      };
    }

    return {
      logs: [],
      nextCursor: null,
      degraded: true,
      alert,
      message: alert
        ? 'Audit logs are temporarily unavailable. The rest of the dashboard remains usable.'
        : 'Audit logs are loading. Retrying automatically.',
    };
  }
}
