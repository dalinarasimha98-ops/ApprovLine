import type { Prisma, UnifiedEvidenceMemberStatus } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { isConnectionPoolError, isMigrationError } from '@/lib/prisma-errors';
import { withTimeout } from '@/lib/performance';
import { toDate } from '@/lib/types/dates';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';

// 5000ms, not 3000ms - matches the same fix already applied to approval
// detail's core query (services/approvalDetail.ts). These queries
// themselves are lean/indexed; the budget has to cover connection-pool
// queue wait under real concurrent traffic, not just execution time.
// Confirmed via production logs (vercel logs): genuine "evidence:record
// timed out after 3000ms" failures recurring under real traffic even
// after connection_limit was corrected - these are not connection-pool
// exhaustion errors (no "connection limit" text alongside them), just a
// budget that's too tight for real-world concurrent load.
const EVIDENCE_DETAIL_QUERY_TIMEOUT_MS = 5000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Cache tag / invalidation ------------------------------------------
export function unifiedEvidenceCacheTag(organizationId: string) {
  return `unified-evidence-${organizationId}`;
}

/** Safe to call from anywhere, including the standalone worker process
 *  (the evidence correlation pipeline runs there) - never throws outside
 *  a Next.js server request scope. */
export function invalidateUnifiedEvidenceCache(organizationId: string) {
  try {
    revalidateTag(unifiedEvidenceCacheTag(organizationId));
  } catch (error) {
    console.warn('[evidence] cache invalidation skipped (no Next.js server request scope)', error instanceof Error ? error.message : error);
  }
}

// --- Circuit breaker -----------------------------------------------------
// Shared by getLatestUnifiedEvidenceRecordId() and searchUnifiedEvidence() -
// both back the /evidence list page and fail together when the database is
// genuinely struggling. Deliberately NOT shared with the /evidence/[id]
// detail-page functions below (see the separate breaker near
// withEvidenceDetailRetry) - the list and detail pages hit different tables
// with different failure modes, and an earlier version of this file shared
// one breaker across both, which meant a detail-page-specific problem
// tripped the list page's "Unified evidence is recovering" banner even
// though the list page's own query was healthy. Mirrors the pattern used
// across every other service fixed this session.
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveEvidenceListFailures = 0;
let evidenceListBreakerOpenUntil = 0;

function isEvidenceListBreakerOpen() {
  return Date.now() < evidenceListBreakerOpenUntil;
}

function recordEvidenceListSuccess() {
  consecutiveEvidenceListFailures = 0;
  evidenceListBreakerOpenUntil = 0;
}

function recordEvidenceListFailure() {
  consecutiveEvidenceListFailures += 1;
  if (consecutiveEvidenceListFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    evidenceListBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class EvidenceListCircuitOpenError extends Error {
  constructor() {
    super('Unified evidence lookup is temporarily paused after repeated database failures.');
    this.name = 'EvidenceListCircuitOpenError';
  }
}

const EVIDENCE_LIST_QUERY_TIMEOUT_MS = 3000;
const EVIDENCE_LIST_TOTAL_FETCH_TIMEOUT_MS = 5000;
const EVIDENCE_LIST_REVALIDATE_SECONDS = 1;
const EVIDENCE_LIST_STALE_CACHE_TTL_MS = 10 * 60 * 1000;

const publicEventSelect = {
  id: true,
  providerKey: true,
  providerEventType: true,
  occurredAt: true,
  receivedAt: true,
  actorId: true,
  actorName: true,
  actorEmail: true,
  objectType: true,
  objectId: true,
  threadId: true,
  parentId: true,
  relatedIds: true,
  participants: true,
  attachments: true,
  links: true,
  content: true,
  metadata: true,
  evidenceHash: true,
  correlationId: true,
  correlationKeys: true,
  confidence: true,
  status: true,
  lastProcessedAt: true,
} satisfies Prisma.CanonicalEvidenceEventSelect;

type EvidenceSearchInput = {
  organizationId: string;
  query?: string;
  providerKey?: string;
  riskLevel?: string;
  page?: number;
  pageSize?: number;
};

const unifiedEvidenceListSelect = {
  id: true,
  subject: true,
  decision: true,
  outcome: true,
  category: true,
  department: true,
  approverName: true,
  approverEmail: true,
  riskLevel: true,
  confidence: true,
  verificationStatus: true,
  evidenceCount: true,
  sourceCount: true,
  lastSeenAt: true,
  events: { select: { providerKey: true }, distinct: ['providerKey'] },
  _count: { select: { events: true, members: true } },
} satisfies Prisma.UnifiedEvidenceRecordSelect;

type UnifiedEvidenceListRow = Prisma.UnifiedEvidenceRecordGetPayload<{ select: typeof unifiedEvidenceListSelect }>;

type EvidenceSearchResultFresh = {
  records: Array<Omit<UnifiedEvidenceListRow, 'events'> & { providers: string[] }>;
  pagination: { page: number; pageSize: number; total: number; pages: number };
};

function buildEvidenceSearchWhere(input: EvidenceSearchInput): Prisma.UnifiedEvidenceRecordWhereInput {
  return {
    organizationId: input.organizationId,
    riskLevel: input.riskLevel || undefined,
    events: input.providerKey ? { some: { providerKey: input.providerKey } } : undefined,
    OR: input.query ? [
      { subject: { contains: input.query, mode: 'insensitive' } },
      { approverName: { contains: input.query, mode: 'insensitive' } },
      { approverEmail: { contains: input.query, mode: 'insensitive' } },
      { department: { contains: input.query, mode: 'insensitive' } },
      { category: { contains: input.query, mode: 'insensitive' } },
    ] : undefined,
  };
}

async function fetchEvidenceSearchFresh(cacheParams: Required<EvidenceSearchInput>): Promise<EvidenceSearchResultFresh> {
  if (isEvidenceListBreakerOpen()) {
    throw new EvidenceListCircuitOpenError();
  }

  const where = buildEvidenceSearchWhere(cacheParams);
  const attempt = () =>
    Promise.all([
      withTimeout(
        'evidence:searchRecords',
        prisma.unifiedEvidenceRecord.findMany({
          where,
          select: unifiedEvidenceListSelect,
          orderBy: { lastSeenAt: 'desc' },
          skip: (cacheParams.page - 1) * cacheParams.pageSize,
          take: cacheParams.pageSize,
        }),
        EVIDENCE_LIST_QUERY_TIMEOUT_MS,
      ),
      withTimeout('evidence:searchCount', prisma.unifiedEvidenceRecord.count({ where }), EVIDENCE_LIST_QUERY_TIMEOUT_MS),
    ]);

  try {
    const [records, total] = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleep(300);
      return attempt();
    });

    recordEvidenceListSuccess();
    return {
      records: records.map((record) => ({
        ...record,
        providers: record.events.map((event) => event.providerKey),
        events: undefined,
      })),
      pagination: { page: cacheParams.page, pageSize: cacheParams.pageSize, total, pages: Math.ceil(total / cacheParams.pageSize) },
    };
  } catch (error) {
    // A missing table is a permanent condition, not the database struggling
    // - it must never count toward the breaker (which would otherwise mask
    // the real "run npm run db:deploy" message behind a generic
    // "temporarily unavailable" one after 3 occurrences) and retrying it
    // is pointless.
    if (!isMigrationError(error instanceof Error ? error.message : String(error))) {
      recordEvidenceListFailure();
    }
    throw error;
  }
}

function getCachedEvidenceSearchFetcher(organizationId: string) {
  return unstable_cache(
    (cacheParams: Required<EvidenceSearchInput>) => fetchEvidenceSearchFresh(cacheParams),
    ['unified-evidence-search', organizationId],
    { revalidate: EVIDENCE_LIST_REVALIDATE_SECONDS, tags: [unifiedEvidenceCacheTag(organizationId)] },
  );
}

/** unstable_cache serializes to JSON - lastSeenAt comes back as a string on a
 *  cache hit. Applied unconditionally, matching the fix already applied
 *  everywhere else this session. */
function deserializeEvidenceSearchResult(result: EvidenceSearchResultFresh): EvidenceSearchResultFresh {
  return { ...result, records: result.records.map((record) => ({ ...record, lastSeenAt: toDate(record.lastSeenAt) })) };
}

const getEvidenceSearchForRequest = cache(async (organizationId: string, cacheKey: string) => {
  const cacheParams = JSON.parse(cacheKey) as Required<EvidenceSearchInput>;
  const result = await getCachedEvidenceSearchFetcher(organizationId)(cacheParams);
  return deserializeEvidenceSearchResult(result);
});

type LastGoodSearchEntry = { result: EvidenceSearchResultFresh; cachedAt: number };
const globalForEvidenceSearch = globalThis as unknown as {
  approvlineEvidenceSearchLastGood?: Map<string, LastGoodSearchEntry>;
};
function evidenceSearchLastGoodStore() {
  globalForEvidenceSearch.approvlineEvidenceSearchLastGood ??= new Map();
  return globalForEvidenceSearch.approvlineEvidenceSearchLastGood;
}

export async function searchUnifiedEvidence(input: EvidenceSearchInput): Promise<
  EvidenceSearchResultFresh & { degraded: boolean; alert: boolean; staleAsOfMs?: number; message?: string; setupRequired?: boolean }
> {
  const cacheParams: Required<EvidenceSearchInput> = {
    organizationId: input.organizationId,
    query: input.query?.trim().toLowerCase() ?? '',
    providerKey: input.providerKey ?? '',
    riskLevel: input.riskLevel ?? '',
    page: Math.max(1, input.page ?? 1),
    pageSize: Math.min(100, Math.max(1, input.pageSize ?? 25)),
  };
  const cacheKey = JSON.stringify(cacheParams);
  const lastGoodKey = `${input.organizationId}::${cacheKey}`;

  try {
    const result = await withTimeout('evidence search (total)', getEvidenceSearchForRequest(input.organizationId, cacheKey), EVIDENCE_LIST_TOTAL_FETCH_TIMEOUT_MS);
    evidenceSearchLastGoodStore().set(lastGoodKey, { result, cachedAt: Date.now() });
    return { ...result, degraded: false, alert: false };
  } catch (error) {
    console.error('[evidence] search fetch failed', error);

    // A genuinely missing table is a distinct, permanent condition - it
    // must never be presented as "temporarily unavailable, retry in a
    // moment" (that's misleading; retrying will never fix it) and it must
    // never be masked by a stale cache showing old data as if nothing was
    // wrong.
    if (isMigrationError(error instanceof Error ? error.message : String(error))) {
      return {
        records: [],
        pagination: { page: cacheParams.page, pageSize: cacheParams.pageSize, total: 0, pages: 0 },
        degraded: true,
        alert: true,
        setupRequired: true,
        message: error instanceof Error ? error.message : 'Unified evidence storage is not ready yet.',
      };
    }

    const alert = isEvidenceListBreakerOpen();

    const lastGood = evidenceSearchLastGoodStore().get(lastGoodKey);
    if (lastGood && Date.now() - lastGood.cachedAt < EVIDENCE_LIST_STALE_CACHE_TTL_MS) {
      return {
        ...lastGood.result,
        degraded: alert,
        alert,
        staleAsOfMs: lastGood.cachedAt,
        message: alert ? 'Live database results are delayed, so recently loaded evidence records are shown instead.' : undefined,
      };
    }

    return {
      records: [],
      pagination: { page: cacheParams.page, pageSize: cacheParams.pageSize, total: 0, pages: 0 },
      degraded: true,
      alert,
      message: alert
        ? 'Unified evidence is temporarily unavailable. The rest of the dashboard remains usable.'
        : 'Unified evidence is loading. Retrying automatically.',
    };
  }
}

/**
 * Used only to decide whether to redirect a default /evidence landing to
 * the single most recent record - a convenience, not the data the user
 * came for. On failure this degrades to null (no redirect, fall through to
 * the normal search list) rather than surfacing an error state for what is
 * ultimately an optional shortcut.
 */
export async function getLatestUnifiedEvidenceRecordId(organizationId: string): Promise<string | null> {
  if (isEvidenceListBreakerOpen()) return null;

  const attempt = () =>
    withTimeout(
      'evidence:latestRecordId',
      prisma.unifiedEvidenceRecord.findFirst({
        where: { organizationId },
        orderBy: [{ lastSeenAt: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
        select: { id: true },
      }),
      EVIDENCE_LIST_QUERY_TIMEOUT_MS,
    );

  try {
    const record = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleep(300);
      return attempt();
    });
    recordEvidenceListSuccess();
    return record?.id ?? null;
  } catch (error) {
    // Same reasoning as fetchEvidenceSearchFresh: a missing table must
    // never count toward the shared breaker, or it would mask
    // searchUnifiedEvidence's distinct "run npm run db:deploy" message
    // behind the breaker's generic degraded state.
    if (!isMigrationError(error instanceof Error ? error.message : String(error))) {
      recordEvidenceListFailure();
    }
    console.error('[evidence] latest-record lookup failed, skipping redirect', error);
    return null;
  }
}

/**
 * Powers the "View in Unified Evidence" button on the approval detail page
 * (app/approvals/[id]/page.tsx). Not every approval has a linked
 * UnifiedEvidenceRecord - only those captured through the real evidence
 * pipeline or backfilled (see services/evidence/pipeline.ts's
 * backfillUnifiedEvidenceForApproval()) do. Degrades to null on any failure
 * (breaker open, timeout, missing table) rather than throwing, matching
 * getLatestUnifiedEvidenceRecordId() just above - this is an optional
 * enhancement to the approval detail page, never something that page's core
 * render should block or fail on. The caller is expected to render nothing
 * (not a broken link) when this returns null.
 */
export async function getUnifiedEvidenceIdForApproval(organizationId: string, approvalId: string): Promise<string | null> {
  if (isEvidenceListBreakerOpen()) return null;

  const attempt = () =>
    withTimeout(
      'evidence:idForApproval',
      prisma.unifiedEvidenceRecord.findFirst({
        where: { organizationId, primaryApprovalId: approvalId },
        select: { id: true },
      }),
      EVIDENCE_LIST_QUERY_TIMEOUT_MS,
    );

  try {
    const record = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleep(300);
      return attempt();
    });
    recordEvidenceListSuccess();
    return record?.id ?? null;
  } catch (error) {
    if (!isMigrationError(error instanceof Error ? error.message : String(error))) {
      recordEvidenceListFailure();
    }
    console.error('[evidence] id-for-approval lookup failed, hiding the evidence link', error);
    return null;
  }
}

/**
 * Batch form of getUnifiedEvidenceIdForApproval() for the approvals list
 * page (app/dashboard/approvals/page.tsx / components/dashboard/
 * ApprovalTable.tsx) - one query per page load instead of one per row, which
 * an N+1 per-row lookup would otherwise turn into. Returns a Map keyed by
 * approvalId so the caller can do a simple lookup per row; approvals with no
 * linked record are simply absent from the map (not an error). Degrades to
 * an empty map on any failure, same reasoning as the single-approval version
 * above - a failed lookup here should hide every row's evidence link, never
 * break the list page itself.
 */
export async function getUnifiedEvidenceIdsForApprovals(organizationId: string, approvalIds: string[]): Promise<Map<string, string>> {
  if (approvalIds.length === 0 || isEvidenceListBreakerOpen()) return new Map();

  const attempt = () =>
    withTimeout(
      'evidence:idsForApprovals',
      prisma.unifiedEvidenceRecord.findMany({
        where: { organizationId, primaryApprovalId: { in: approvalIds } },
        select: { id: true, primaryApprovalId: true },
      }),
      EVIDENCE_LIST_QUERY_TIMEOUT_MS,
    );

  try {
    const records = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleep(300);
      return attempt();
    });
    recordEvidenceListSuccess();
    return new Map(records.filter((record) => record.primaryApprovalId).map((record) => [record.primaryApprovalId!, record.id]));
  } catch (error) {
    if (!isMigrationError(error instanceof Error ? error.message : String(error))) {
      recordEvidenceListFailure();
    }
    console.error('[evidence] ids-for-approvals lookup failed, hiding evidence links', error);
    return new Map();
  }
}

// --- Detail-page stale fallback (Tier-2 "last known good") -----------------
// unstable_cache only memoizes successful returns of its own wrapped
// function - it has no "serve the last successful value even though this
// attempt errored" primitive. Mirrors lib/approvalRecords.ts's
// lastGoodStore().
const EVIDENCE_DETAIL_REVALIDATE_SECONDS = 60;
const EVIDENCE_DETAIL_STALE_CACHE_TTL_MS = 10 * 60 * 1000;

type LastGoodEntry<T> = { value: T; cachedAt: number };
const globalForEvidenceDetail = globalThis as unknown as {
  approvlineEvidenceDetailLastGood?: Map<string, LastGoodEntry<unknown>>;
};
function evidenceDetailLastGoodStore() {
  globalForEvidenceDetail.approvlineEvidenceDetailLastGood ??= new Map();
  return globalForEvidenceDetail.approvlineEvidenceDetailLastGood;
}

function deserializeEventDates<T extends { occurredAt: unknown; receivedAt: unknown; lastProcessedAt?: unknown }>(event: T) {
  return {
    ...event,
    occurredAt: toDate(event.occurredAt as Parameters<typeof toDate>[0]),
    receivedAt: toDate(event.receivedAt as Parameters<typeof toDate>[0]),
    lastProcessedAt: toDate(event.lastProcessedAt as Parameters<typeof toDate>[0]),
  };
}

function deserializePrimaryApproval<T extends { approvalTimestamp?: unknown; occurredAt: unknown; createdAt: unknown; updatedAt: unknown } | null>(approval: T) {
  if (!approval) return approval;
  return {
    ...approval,
    approvalTimestamp: toDate(approval.approvalTimestamp as Parameters<typeof toDate>[0]),
    occurredAt: toDate(approval.occurredAt as Parameters<typeof toDate>[0]),
    createdAt: toDate(approval.createdAt as Parameters<typeof toDate>[0]),
    updatedAt: toDate(approval.updatedAt as Parameters<typeof toDate>[0]),
  };
}

function deserializeConnection<T extends { lastSyncAt: unknown; health: { lastEventAt: unknown; lastSuccessfulSyncAt: unknown; checkedAt: unknown } | null } | null>(connection: T) {
  if (!connection) return connection;
  return {
    ...connection,
    lastSyncAt: toDate(connection.lastSyncAt as Parameters<typeof toDate>[0]),
    health: connection.health
      ? {
          ...connection.health,
          lastEventAt: toDate(connection.health.lastEventAt as Parameters<typeof toDate>[0]),
          lastSuccessfulSyncAt: toDate(connection.health.lastSuccessfulSyncAt as Parameters<typeof toDate>[0]),
          checkedAt: toDate(connection.health.checkedAt as Parameters<typeof toDate>[0]),
        }
      : connection.health,
  };
}

// --- Circuit breaker (detail page) -----------------------------------------
// Independent from the list-page breaker above - see that breaker's comment
// for why sharing one breaker between list and detail was a bug, not a
// simplification. Shared only between getUnifiedEvidenceDetail() and
// getUnifiedEvidenceExperience(), which both hit the same
// UnifiedEvidenceRecord + CanonicalEvidenceEvent queries for one record.
let consecutiveEvidenceDetailFailures = 0;
let evidenceDetailBreakerOpenUntil = 0;

function isEvidenceDetailBreakerOpen() {
  return Date.now() < evidenceDetailBreakerOpenUntil;
}

function recordEvidenceDetailSuccess() {
  consecutiveEvidenceDetailFailures = 0;
  evidenceDetailBreakerOpenUntil = 0;
}

function recordEvidenceDetailFailure() {
  consecutiveEvidenceDetailFailures += 1;
  if (consecutiveEvidenceDetailFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    evidenceDetailBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class EvidenceDetailCircuitOpenError extends Error {
  constructor() {
    super('Unified evidence record lookup is temporarily paused after repeated database failures.');
    this.name = 'EvidenceDetailCircuitOpenError';
  }
}

/**
 * `critical` gates whether a failure counts toward the shared breaker.
 * Several callers below (providerCounts/connections/latestEvent/
 * complianceEvaluation) already tolerate their own failure by falling back
 * to an empty/null default at the call site via `.catch()` on the
 * Promise.all entry - the page renders fine without them. Before this fix
 * those non-critical failures still called recordEvidenceDetailFailure()
 * here, so three unrelated, already-handled sub-query blips (e.g. from
 * ordinary connection-pool contention while several detail pages load
 * concurrently) could trip the breaker and block the one query that
 * actually matters - the main record fetch - for every user, for 60
 * seconds, even though nothing about the main record lookup was failing.
 * Only `critical: true` (the main record queries) should be able to open
 * the breaker.
 */
async function withEvidenceDetailRetry<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number,
  options: { critical: boolean } = { critical: true },
): Promise<T> {
  if (options.critical && isEvidenceDetailBreakerOpen()) throw new EvidenceDetailCircuitOpenError();
  const attempt = () => withTimeout(label, fn(), timeoutMs);
  try {
    const result = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleep(300);
      return attempt();
    });
    if (options.critical) recordEvidenceDetailSuccess();
    return result;
  } catch (error) {
    if (options.critical && !isMigrationError(error instanceof Error ? error.message : String(error))) {
      recordEvidenceDetailFailure();
    }
    throw error;
  }
}

async function fetchUnifiedEvidenceDetailFresh(organizationId: string, id: string) {
  return withEvidenceDetailRetry(
    'evidence:detail',
    () =>
      prisma.unifiedEvidenceRecord.findFirst({
        where: { id, organizationId },
        include: {
          primaryApproval: true,
          events: {
            select: publicEventSelect,
            orderBy: { occurredAt: 'asc' },
            take: 101,
          },
          members: {
            include: {
              event: { select: publicEventSelect },
            },
            orderBy: { createdAt: 'asc' },
            take: 101,
          },
        },
      }),
    EVIDENCE_DETAIL_QUERY_TIMEOUT_MS,
  );
}

function getCachedUnifiedEvidenceDetailFetcher(organizationId: string, id: string) {
  return unstable_cache(
    () => fetchUnifiedEvidenceDetailFresh(organizationId, id),
    ['unified-evidence-detail', organizationId, id],
    { revalidate: EVIDENCE_DETAIL_REVALIDATE_SECONDS, tags: [unifiedEvidenceCacheTag(organizationId)] },
  );
}

function deserializeUnifiedEvidenceDetail<T extends {
  firstSeenAt: unknown; lastSeenAt: unknown; createdAt: unknown; updatedAt: unknown;
  primaryApproval: Parameters<typeof deserializePrimaryApproval>[0];
  events: Array<Parameters<typeof deserializeEventDates>[0]>;
  members: Array<{ reviewedAt: unknown; createdAt: unknown; updatedAt: unknown; event: Parameters<typeof deserializeEventDates>[0] }>;
}>(record: T) {
  return {
    ...record,
    firstSeenAt: toDate(record.firstSeenAt as Parameters<typeof toDate>[0]),
    lastSeenAt: toDate(record.lastSeenAt as Parameters<typeof toDate>[0]),
    createdAt: toDate(record.createdAt as Parameters<typeof toDate>[0]),
    updatedAt: toDate(record.updatedAt as Parameters<typeof toDate>[0]),
    primaryApproval: deserializePrimaryApproval(record.primaryApproval),
    events: record.events.map(deserializeEventDates),
    members: record.members.map((member) => ({
      ...member,
      reviewedAt: toDate(member.reviewedAt as Parameters<typeof toDate>[0]),
      createdAt: toDate(member.createdAt as Parameters<typeof toDate>[0]),
      updatedAt: toDate(member.updatedAt as Parameters<typeof toDate>[0]),
      event: deserializeEventDates(member.event),
    })),
  };
}

const getEvidenceDetailForRequest = cache(async (organizationId: string, id: string) => {
  const lastGoodKey = `detail::${organizationId}::${id}`;
  try {
    const record = await getCachedUnifiedEvidenceDetailFetcher(organizationId, id)();
    if (record) {
      const deserialized = deserializeUnifiedEvidenceDetail(record);
      evidenceDetailLastGoodStore().set(lastGoodKey, { value: deserialized, cachedAt: Date.now() });
      return deserialized;
    }
    return null;
  } catch (error) {
    const lastGood = evidenceDetailLastGoodStore().get(lastGoodKey);
    if (lastGood && Date.now() - lastGood.cachedAt < EVIDENCE_DETAIL_STALE_CACHE_TTL_MS) {
      console.warn('[evidence] detail fetch failed, serving stale cached record', error instanceof Error ? error.message : error);
      return lastGood.value as ReturnType<typeof deserializeUnifiedEvidenceDetail>;
    }
    throw error;
  }
});

export async function getUnifiedEvidenceDetail(organizationId: string, id: string) {
  return getEvidenceDetailForRequest(organizationId, id);
}

async function fetchUnifiedEvidenceExperienceFresh(organizationId: string, id: string, take: number) {
  const record = await withEvidenceDetailRetry(
    'evidence:record',
    () =>
      prisma.unifiedEvidenceRecord.findFirst({
        where: { id, organizationId },
        include: {
          primaryApproval: true,
          events: {
            select: publicEventSelect,
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take: take + 1,
          },
          members: {
            orderBy: { createdAt: 'asc' },
            take: take + 1,
          },
        },
      }),
    EVIDENCE_DETAIL_QUERY_TIMEOUT_MS,
  );
  if (!record) return null;

  const hasMoreEvents = record.events.length > take;
  const events = record.events.slice(0, take);
  const eventIds = new Set(events.map((event) => event.id));
  // These four don't depend on each other - only on the record above -
  // so they run concurrently instead of one after another.
  const [providerCounts, connections, latestEvent, complianceEvaluation] = await Promise.all([
    withEvidenceDetailRetry(
      'evidence:providerCounts',
      () =>
        prisma.canonicalEvidenceEvent.groupBy({
          by: ['providerKey'],
          where: { organizationId, unifiedRecordId: id },
          _count: { _all: true },
          _max: { occurredAt: true },
        }),
      EVIDENCE_DETAIL_QUERY_TIMEOUT_MS,
      { critical: false },
    ).catch(() => [] as Array<{ providerKey: string; _count: { _all: number }; _max: { occurredAt: Date | null } }>),
    withEvidenceDetailRetry(
      'evidence:connections',
      () =>
        prisma.evidenceProviderConnection.findMany({
          where: { organizationId },
          select: {
            providerKey: true,
            displayName: true,
            status: true,
            lastSyncAt: true,
            health: {
              select: {
                status: true,
                latencyMs: true,
                syncStatus: true,
                lastEventAt: true,
                lastSuccessfulSyncAt: true,
                consecutiveFailures: true,
                lastErrorCode: true,
                lastErrorMessage: true,
                checkedAt: true,
              },
            },
          },
        }),
      EVIDENCE_DETAIL_QUERY_TIMEOUT_MS,
      { critical: false },
    ).catch(() => []),
    withEvidenceDetailRetry(
      'evidence:latestEvent',
      () =>
        prisma.canonicalEvidenceEvent.findFirst({
          where: { organizationId, unifiedRecordId: id },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        }),
      EVIDENCE_DETAIL_QUERY_TIMEOUT_MS,
      { critical: false },
    ).catch(() => null),
    // Only meaningful when this record is actually linked to an approval -
    // primaryApprovalId is optional (correlation-only records have none),
    // and playbook compliance evaluation is scored per-ApprovalRecord, not
    // per-UnifiedEvidenceRecord. No approval link means no query to run.
    record.primaryApprovalId
      ? withEvidenceDetailRetry(
          'evidence:complianceEvaluation',
          () =>
            prisma.approvalComplianceEvaluation.findFirst({
              where: { organizationId, approvalRecordId: record.primaryApprovalId! },
              select: {
                score: true,
                status: true,
                severity: true,
                missingApprovers: true,
                missingDepartments: true,
                missingEscalationSteps: true,
                missingEvidence: true,
                triggeredRule: true,
                explanation: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            }),
          EVIDENCE_DETAIL_QUERY_TIMEOUT_MS,
          { critical: false },
        ).catch(() => null)
      : Promise.resolve(null),
  ]);
  const connectionByProvider = new Map(
    connections.map((connection) => [connection.providerKey, connection]),
  );

  return {
    ...record,
    events,
    members: record.members.filter(
      (member) => eventIds.has(member.eventId) || member.status === 'SUGGESTED',
    ),
    eventPage: {
      hasMore: hasMoreEvents,
      cursor: events.at(-1)?.id ?? null,
      limit: take,
    },
    liveCursor: latestEvent?.id ?? null,
    providers: providerCounts.map((provider) => ({
      providerKey: provider.providerKey,
      eventCount: provider._count._all,
      latestEventAt: provider._max.occurredAt,
      connection: connectionByProvider.get(provider.providerKey) ?? null,
    })),
    complianceEvaluation,
  };
}

function getCachedUnifiedEvidenceExperienceFetcher(organizationId: string, id: string, take: number) {
  return unstable_cache(
    () => fetchUnifiedEvidenceExperienceFresh(organizationId, id, take),
    ['unified-evidence-experience', organizationId, id, String(take)],
    { revalidate: EVIDENCE_DETAIL_REVALIDATE_SECONDS, tags: [unifiedEvidenceCacheTag(organizationId)] },
  );
}

function deserializeUnifiedEvidenceExperience<T extends {
  firstSeenAt: unknown; lastSeenAt: unknown; createdAt: unknown; updatedAt: unknown;
  primaryApproval: Parameters<typeof deserializePrimaryApproval>[0];
  events: Array<Parameters<typeof deserializeEventDates>[0]>;
  members: Array<{ reviewedAt: unknown; createdAt: unknown; updatedAt: unknown }>;
  providers: Array<{ latestEventAt: unknown; connection: Parameters<typeof deserializeConnection>[0] }>;
  complianceEvaluation: { createdAt: unknown } | null;
}>(record: T) {
  return {
    ...record,
    firstSeenAt: toDate(record.firstSeenAt as Parameters<typeof toDate>[0]),
    lastSeenAt: toDate(record.lastSeenAt as Parameters<typeof toDate>[0]),
    createdAt: toDate(record.createdAt as Parameters<typeof toDate>[0]),
    updatedAt: toDate(record.updatedAt as Parameters<typeof toDate>[0]),
    primaryApproval: deserializePrimaryApproval(record.primaryApproval),
    events: record.events.map(deserializeEventDates),
    members: record.members.map((member) => ({
      ...member,
      reviewedAt: toDate(member.reviewedAt as Parameters<typeof toDate>[0]),
      createdAt: toDate(member.createdAt as Parameters<typeof toDate>[0]),
      updatedAt: toDate(member.updatedAt as Parameters<typeof toDate>[0]),
    })),
    providers: record.providers.map((provider) => ({
      ...provider,
      latestEventAt: toDate(provider.latestEventAt as Parameters<typeof toDate>[0]),
      connection: deserializeConnection(provider.connection),
    })),
    complianceEvaluation: record.complianceEvaluation
      ? { ...record.complianceEvaluation, createdAt: toDate(record.complianceEvaluation.createdAt as Parameters<typeof toDate>[0]) }
      : null,
  };
}

const getEvidenceExperienceForRequest = cache(async (organizationId: string, id: string, take: number) => {
  const lastGoodKey = `experience::${organizationId}::${id}::${take}`;
  try {
    const record = await getCachedUnifiedEvidenceExperienceFetcher(organizationId, id, take)();
    if (record) {
      const deserialized = deserializeUnifiedEvidenceExperience(record);
      evidenceDetailLastGoodStore().set(lastGoodKey, { value: deserialized, cachedAt: Date.now() });
      return deserialized;
    }
    return null;
  } catch (error) {
    const lastGood = evidenceDetailLastGoodStore().get(lastGoodKey);
    if (lastGood && Date.now() - lastGood.cachedAt < EVIDENCE_DETAIL_STALE_CACHE_TTL_MS) {
      console.warn('[evidence] experience fetch failed, serving stale cached record', error instanceof Error ? error.message : error);
      return lastGood.value as ReturnType<typeof deserializeUnifiedEvidenceExperience>;
    }
    throw error;
  }
});

export async function getUnifiedEvidenceExperience(
  organizationId: string,
  id: string,
  eventLimit = 40,
) {
  const take = Math.min(100, Math.max(1, eventLimit));
  return getEvidenceExperienceForRequest(organizationId, id, take);
}

export async function getUnifiedEvidenceEventPage(input: {
  organizationId: string;
  recordId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 40));
  let after:
    | {
        occurredAt: Date;
        id: string;
      }
    | undefined;

  if (input.cursor) {
    const cursorEvent = await prisma.canonicalEvidenceEvent.findFirst({
      where: {
        id: input.cursor,
        organizationId: input.organizationId,
        unifiedRecordId: input.recordId,
      },
      select: { id: true, occurredAt: true },
    });
    if (!cursorEvent) throw new Error('The evidence timeline cursor is no longer valid.');
    after = cursorEvent;
  }

  const events = await prisma.canonicalEvidenceEvent.findMany({
    where: {
      organizationId: input.organizationId,
      unifiedRecordId: input.recordId,
      ...(after
        ? {
            OR: [
              { occurredAt: { gt: after.occurredAt } },
              { occurredAt: after.occurredAt, id: { gt: after.id } },
            ],
          }
        : {}),
    },
    select: {
      ...publicEventSelect,
      memberships: {
        where: { unifiedRecordId: input.recordId },
        select: {
          id: true,
          status: true,
          matchConfidence: true,
          matchingReasons: true,
          reviewedAt: true,
        },
        take: 1,
      },
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });

  const hasMore = events.length > limit;
  const page = events.slice(0, limit).map((event) => ({
    ...event,
    membership: event.memberships[0] ?? null,
    memberships: undefined,
  }));

  return {
    events: page,
    page: {
      hasMore,
      cursor: page.at(-1)?.id ?? input.cursor ?? null,
      limit,
    },
  };
}

export async function reviewEvidenceSuggestion(input: {
  organizationId: string;
  memberId: string;
  reviewerUserId: string;
  decision: 'VERIFY' | 'REJECT';
  reason?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.unifiedEvidenceMember.findFirst({
      where: {
        id: input.memberId,
        unifiedRecord: { organizationId: input.organizationId },
      },
      include: { event: true, unifiedRecord: true },
    });
    if (!member) throw new Error('Evidence suggestion was not found.');
    if (member.status !== 'SUGGESTED') throw new Error('Evidence suggestion has already been reviewed.');
    const status: UnifiedEvidenceMemberStatus =
      input.decision === 'VERIFY' ? 'HUMAN_VERIFIED' : 'REJECTED';

    const reviewed = await tx.unifiedEvidenceMember.update({
      where: { id: member.id },
      data: {
        status,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        matchingReasons: input.reason
          ? [...member.matchingReasons, `reviewer: ${input.reason}`]
          : member.matchingReasons,
      },
    });

    if (status === 'HUMAN_VERIFIED') {
      const previousRecordId = member.event.unifiedRecordId;
      if (previousRecordId && previousRecordId !== member.unifiedRecordId) {
        await tx.unifiedEvidenceMember.deleteMany({
          where: {
            eventId: member.eventId,
            unifiedRecordId: previousRecordId,
            status: 'AUTO_LINKED',
          },
        });
      }
      await tx.canonicalEvidenceEvent.update({
        where: { id: member.eventId },
        data: {
          unifiedRecordId: member.unifiedRecordId,
          status: 'CORRELATED',
          lastProcessedAt: new Date(),
        },
      });
      const eventCount = await tx.canonicalEvidenceEvent.count({
        where: { organizationId: input.organizationId, unifiedRecordId: member.unifiedRecordId },
      });
      const providerRows = await tx.canonicalEvidenceEvent.findMany({
        where: { organizationId: input.organizationId, unifiedRecordId: member.unifiedRecordId },
        select: { providerKey: true },
        distinct: ['providerKey'],
      });
      await tx.unifiedEvidenceRecord.update({
        where: { id: member.unifiedRecordId },
        data: {
          evidenceCount: eventCount,
          sourceCount: providerRows.length,
          verificationStatus: 'HUMAN_VERIFIED',
          lastSeenAt: member.event.occurredAt > member.unifiedRecord.lastSeenAt
            ? member.event.occurredAt
            : member.unifiedRecord.lastSeenAt,
        },
      });
      if (previousRecordId && previousRecordId !== member.unifiedRecordId) {
        const previousRecord = await tx.unifiedEvidenceRecord.findFirst({
          where: { id: previousRecordId, organizationId: input.organizationId },
          select: { id: true, _count: { select: { events: true, members: true } } },
        });
        if (previousRecord && previousRecord._count.events === 0 && previousRecord._count.members === 0) {
          await tx.unifiedEvidenceRecord.delete({ where: { id: previousRecord.id } });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.reviewerUserId,
        action: 'EVIDENCE_CORRELATION_REVIEWED',
        metadata: {
          memberId: member.id,
          eventId: member.eventId,
          unifiedRecordId: member.unifiedRecordId,
          decision: input.decision,
          reason: input.reason,
        },
      },
    });
    return reviewed;
  }).then((result) => {
    invalidateUnifiedEvidenceCache(input.organizationId);
    return result;
  });
}

function eventQueueProvider(providerKey: string): IncomingMessageJob['provider'] {
  const known: Record<string, IncomingMessageJob['provider']> = {
    slack: 'SLACK',
    gmail: 'GMAIL',
    outlook: 'OUTLOOK',
    microsoft_teams: 'MICROSOFT_TEAMS',
    jira: 'JIRA',
    servicenow: 'SERVICENOW',
    zoom: 'ZOOM',
  };
  return known[providerKey] ?? 'CUSTOM';
}

export async function retryEvidenceFailure(input: {
  organizationId: string;
  failureId: string;
  actorUserId: string;
}) {
  const failure = await prisma.evidenceProcessingFailure.findFirst({
    where: {
      id: input.failureId,
      organizationId: input.organizationId,
      resolvedAt: null,
      retryable: true,
    },
    include: { event: { select: publicEventSelect } },
  });
  if (!failure?.event) throw new Error('Retryable evidence failure was not found.');
  const event = failure.event;
  const result = await enqueueIncomingMessage({
    organizationId: input.organizationId,
    provider: eventQueueProvider(event.providerKey),
    providerKey: event.providerKey,
    providerEventType: event.providerEventType,
    externalId: event.objectId ?? event.id,
    objectType: event.objectType,
    objectId: event.objectId ?? undefined,
    threadId: event.threadId ?? undefined,
    parentId: event.parentId ?? undefined,
    relatedIds: event.relatedIds,
    sender: event.actorName ?? undefined,
    senderEmail: event.actorEmail ?? undefined,
    timestamp: event.occurredAt.toISOString(),
    message: event.content ?? '',
    participants: (event.participants as IncomingMessageJob['participants']) ?? [],
    attachments: (event.attachments as IncomingMessageJob['attachments']) ?? [],
    links: (event.links as IncomingMessageJob['links']) ?? [],
    metadata: (event.metadata as Record<string, unknown> | null) ?? {},
  }, {
    sourceSystem: event.providerKey,
    sourceRecordId: event.objectId ?? event.id,
    correlationId: event.correlationId,
    idempotencyKey: `evidence-retry:${failure.id}:${failure.attemptNumber + 1}`,
  });
  if (!result.queued) throw new Error(result.reason);

  await prisma.$transaction([
    prisma.canonicalEvidenceEvent.update({
      where: { id: event.id },
      data: { status: 'RETRY_PENDING', processingAttempts: { increment: 1 }, lastError: null },
    }),
    prisma.evidenceProcessingFailure.update({
      where: { id: failure.id },
      data: { attemptNumber: { increment: 1 }, nextRetryAt: new Date(Date.now() + 60_000) },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'EVIDENCE_FAILURE_RETRIED',
        metadata: { failureId: failure.id, eventId: event.id, correlationId: event.correlationId },
      },
    }),
  ]);
  return result;
}
