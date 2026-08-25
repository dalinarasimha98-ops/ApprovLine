import { ApprovalType, type Prisma } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import { withTimeout } from '@/lib/performance';
import { toDate } from '@/lib/types/dates';
import { writeAuditLog } from '@/services/audit';
import { calculateRiskScore, riskLabel } from '@/services/investigations';

// Alerts have no dedicated schema — dismiss/escalate state is tracked as
// real, persisted AuditLog events (the same append-only trail every other
// approval action already writes to) rather than an unpersisted UI toggle.
export const ALERT_DISMISSED_ACTION = 'approval_alert.dismissed';
export const ALERT_ESCALATED_ACTION = 'approval_alert.escalated';

export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type ApprovalAlert = {
  id: string;
  subject: string;
  department: string | null;
  category: string | null;
  riskLevel: string | null;
  status: string;
  approvalType: string;
  sourcePlatform: string | null;
  approverName: string | null;
  evidenceSnippet: string | null;
  sourceLink: string | null;
  occurredAt: Date;
  riskScore: number;
  severity: AlertSeverity;
  reasons: string[];
  complianceExplanation: string | null;
  complianceSeverity: string | null;
  escalated: boolean;
};

export type AlertsResult = {
  alerts: ApprovalAlert[];
  severityCounts: Record<AlertSeverity, number>;
  total: number;
  dismissedCount: number;
};

const alertApprovalSelect = {
  id: true,
  subject: true,
  department: true,
  category: true,
  riskLevel: true,
  status: true,
  approvalType: true,
  sourcePlatform: true,
  approverName: true,
  evidenceSnippet: true,
  sourceLink: true,
  occurredAt: true,
  confidence: true,
  complianceEvaluations: { select: { explanation: true, severity: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ApprovalRecordSelect;

type AlertSourceApproval = Prisma.ApprovalRecordGetPayload<{ select: typeof alertApprovalSelect }>;

function flagReasons(approval: AlertSourceApproval): string[] {
  const reasons: string[] = [];
  if (approval.riskLevel === 'critical' || approval.riskLevel === 'high') reasons.push(`${approval.riskLevel} risk level`);
  if (approval.approvalType === 'CONDITIONAL') reasons.push('Conditional approval requires verification');
  if (approval.status === 'PENDING_REVIEW') reasons.push('Pending review');
  if (approval.status === 'REJECTED') reasons.push('Rejected decision on record');
  if (!approval.evidenceSnippet || !approval.sourceLink) reasons.push('Missing evidence or source link');
  return reasons;
}

export type AlertFilters = {
  severity?: string;
  approvalType?: string;
  from?: string;
  to?: string;
};

type AlertsCacheParams = {
  organizationId: string;
  approvalType: string;
  from: string;
  to: string;
};

function normalizeFiltersForCache(organizationId: string, filters: AlertFilters): AlertsCacheParams {
  return {
    organizationId,
    approvalType: filters.approvalType?.trim().toUpperCase() ?? '',
    from: filters.from ?? '',
    to: filters.to ?? '',
  };
}

function isApprovalType(value: string): value is ApprovalType {
  return (Object.values(ApprovalType) as string[]).includes(value);
}

// --- Cache tag / invalidation ------------------------------------------
export function alertsCacheTag(organizationId: string) {
  return `alerts-${organizationId}`;
}

/** Safe to call from anywhere (including the standalone worker process, which has
 *  no Next.js request scope and would otherwise throw on a bare revalidateTag). */
export function invalidateAlertsCache(organizationId: string) {
  try {
    revalidateTag(alertsCacheTag(organizationId));
  } catch (error) {
    console.warn('[alerts] cache invalidation skipped (no Next.js server request scope)', error instanceof Error ? error.message : error);
  }
}

// --- Circuit breaker -----------------------------------------------------
// Mirrors lib/auth.ts / lib/approvalRecords.ts: after repeated consecutive
// failures, stop hitting the database and fail fast. Also gates whether the
// degraded banner is shown at all — a single slow query must never alarm
// the user.
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveAlertsFailures = 0;
let alertsBreakerOpenUntil = 0;

function isAlertsBreakerOpen() {
  return Date.now() < alertsBreakerOpenUntil;
}

function recordAlertsSuccess() {
  consecutiveAlertsFailures = 0;
  alertsBreakerOpenUntil = 0;
}

function recordAlertsFailure() {
  consecutiveAlertsFailures += 1;
  if (consecutiveAlertsFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    alertsBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class AlertsCircuitOpenError extends Error {
  constructor() {
    super('Alerts lookup is temporarily paused after repeated database failures.');
    this.name = 'AlertsCircuitOpenError';
  }
}

const ALERTS_QUERY_TIMEOUT_MS = 3000;
const ALERTS_TOTAL_FETCH_TIMEOUT_MS = 5000;
const ALERTS_REVALIDATE_SECONDS = 120;

async function fetchAlertsFresh(cacheParams: AlertsCacheParams): Promise<AlertsResult> {
  if (isAlertsBreakerOpen()) {
    throw new AlertsCircuitOpenError();
  }

  const { organizationId } = cacheParams;
  const occurredAt: Prisma.DateTimeFilter = {};
  if (cacheParams.from) occurredAt.gte = new Date(cacheParams.from);
  if (cacheParams.to) occurredAt.lte = new Date(cacheParams.to);

  const attempt = () =>
    Promise.all([
      withTimeout(
        'alerts:auditEvents',
        prisma.auditLog.findMany({
          where: { organizationId, action: { in: [ALERT_DISMISSED_ACTION, ALERT_ESCALATED_ACTION] }, approvalRecordId: { not: null } },
          select: { approvalRecordId: true, action: true },
        }),
        ALERTS_QUERY_TIMEOUT_MS,
      ).catch(() => [] as Array<{ approvalRecordId: string | null; action: string }>),
      withTimeout(
        'alerts:approvals',
        prisma.approvalRecord.findMany({
          where: {
            organizationId,
            OR: [
              { riskLevel: 'high' },
              { riskLevel: 'critical' },
              { approvalType: 'CONDITIONAL' },
              { status: 'PENDING_REVIEW' },
              { status: 'REJECTED' },
              { evidenceSnippet: null },
              { sourceLink: null },
            ],
            ...(isApprovalType(cacheParams.approvalType) ? { approvalType: cacheParams.approvalType } : {}),
            ...(cacheParams.from || cacheParams.to ? { occurredAt } : {}),
          },
          select: alertApprovalSelect,
          orderBy: [{ riskLevel: 'desc' }, { occurredAt: 'desc' }],
          take: 150,
        }),
        ALERTS_QUERY_TIMEOUT_MS,
      ),
    ]);

  try {
    // One quick retry on a connection-pool-shaped error — self-heals a
    // single transient blip within the same request.
    const [auditEvents, approvals] = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return attempt();
    });

    const dismissedIds = new Set(auditEvents.filter((e) => e.action === ALERT_DISMISSED_ACTION).map((e) => e.approvalRecordId!));
    const escalatedIds = new Set(auditEvents.filter((e) => e.action === ALERT_ESCALATED_ACTION).map((e) => e.approvalRecordId!));

    const alerts: ApprovalAlert[] = approvals
      .filter((approval) => !dismissedIds.has(approval.id))
      .map((approval) => {
        const riskScore = calculateRiskScore(approval);
        return {
          id: approval.id,
          subject: approval.subject,
          department: approval.department,
          category: approval.category,
          riskLevel: approval.riskLevel,
          status: approval.status,
          approvalType: approval.approvalType,
          sourcePlatform: approval.sourcePlatform,
          approverName: approval.approverName,
          evidenceSnippet: approval.evidenceSnippet,
          sourceLink: approval.sourceLink,
          occurredAt: approval.occurredAt,
          riskScore,
          severity: riskLabel(riskScore) as AlertSeverity,
          reasons: flagReasons(approval),
          complianceExplanation: approval.complianceEvaluations[0]?.explanation ?? null,
          complianceSeverity: approval.complianceEvaluations[0]?.severity ?? null,
          escalated: escalatedIds.has(approval.id),
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);

    const severityCounts: Record<AlertSeverity, number> = {
      Critical: alerts.filter((a) => a.severity === 'Critical').length,
      High: alerts.filter((a) => a.severity === 'High').length,
      Medium: alerts.filter((a) => a.severity === 'Medium').length,
      Low: alerts.filter((a) => a.severity === 'Low').length,
    };

    recordAlertsSuccess();
    return { alerts, severityCounts, total: alerts.length, dismissedCount: dismissedIds.size };
  } catch (error) {
    recordAlertsFailure();
    throw error;
  }
}

/**
 * Cross-request cache (Next.js Data Cache) — the primary fix: previously
 * every page load hit Postgres directly with zero shared caching, and any
 * single slow query immediately showed the degraded banner (see
 * fetchAlertsFresh's breaker for why that's now gated to 3+ consecutive
 * failures instead). Severity/date filters are folded into the cache key
 * via cacheParams; the "All" case (no filters) is what most page loads hit.
 */
function getCachedAlertsFetcher(organizationId: string) {
  return unstable_cache(
    (cacheParams: AlertsCacheParams) => fetchAlertsFresh(cacheParams),
    ['alerts', organizationId],
    { revalidate: ALERTS_REVALIDATE_SECONDS, tags: [alertsCacheTag(organizationId)] },
  );
}

/**
 * unstable_cache serializes its return value to JSON — occurredAt comes back
 * as an ISO string on a cache hit even though ApprovalAlert's type claims
 * it's still a Date. Applied unconditionally, matching the fix already
 * applied to lib/approvalRecords.ts and lib/auth.ts.
 */
function deserializeAlert(alert: ApprovalAlert): ApprovalAlert {
  return { ...alert, occurredAt: toDate(alert.occurredAt) };
}

function deserializeAlertsResult(result: AlertsResult): AlertsResult {
  return { ...result, alerts: result.alerts.map(deserializeAlert) };
}

// Per-request dedup on top of the cross-request cache, keyed by a stable
// string (not object identity).
const getAlertsForRequest = cache(async (organizationId: string, cacheParamsKey: string) => {
  const cacheParams = JSON.parse(cacheParamsKey) as AlertsCacheParams;
  const result = await getCachedAlertsFetcher(organizationId)(cacheParams);
  return deserializeAlertsResult(result);
});

// --- Tier-2 "last known good" store --------------------------------------
// unstable_cache has no built-in stale-if-error primitive — this is the
// same small, explicitly-imperative fallback store used in
// lib/approvalRecords.ts, purely for serving the last successful result
// when a fresh fetch fails and nothing else is available.
type LastGoodEntry = { result: AlertsResult; cachedAt: number };
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;

const globalForAlerts = globalThis as unknown as {
  approvlineAlertsLastGood?: Map<string, LastGoodEntry>;
};

function lastGoodStore() {
  globalForAlerts.approvlineAlertsLastGood ??= new Map();
  return globalForAlerts.approvlineAlertsLastGood;
}

export async function getApprovalAlerts(organizationId: string, filters: AlertFilters = {}): Promise<
  AlertsResult & { degraded: boolean; alert: boolean; staleAsOfMs?: number; message?: string }
> {
  const cacheParams = normalizeFiltersForCache(organizationId, filters);
  const cacheKey = JSON.stringify(cacheParams);
  const lastGoodKey = `${organizationId}::${cacheKey}`;

  try {
    const result = await withTimeout('alerts (total)', getAlertsForRequest(organizationId, cacheKey), ALERTS_TOTAL_FETCH_TIMEOUT_MS);
    const filtered = filters.severity ? result.alerts.filter((a) => a.severity.toLowerCase() === filters.severity!.toLowerCase()) : result.alerts;
    const withFilter = { ...result, alerts: filtered };
    lastGoodStore().set(lastGoodKey, { result, cachedAt: Date.now() });
    return { ...withFilter, degraded: false, alert: false };
  } catch (error) {
    console.error('[alerts] fetch failed', error);

    // The degraded banner is reserved for a database that has actually been
    // unreachable for 3+ consecutive attempts (the breaker is open) — a
    // single slow query must never alarm the user, even if it means
    // falling back to a slightly stale (but real) result.
    const alert = isAlertsBreakerOpen();

    const lastGood = lastGoodStore().get(lastGoodKey);
    if (lastGood && Date.now() - lastGood.cachedAt < STALE_CACHE_TTL_MS) {
      const filtered = filters.severity
        ? lastGood.result.alerts.filter((a) => a.severity.toLowerCase() === filters.severity!.toLowerCase())
        : lastGood.result.alerts;
      return {
        ...lastGood.result,
        alerts: filtered,
        degraded: alert,
        alert,
        staleAsOfMs: lastGood.cachedAt,
        message: alert ? 'Live database results are delayed, so recently loaded alerts are shown instead.' : undefined,
      };
    }

    return {
      alerts: [],
      severityCounts: { Critical: 0, High: 0, Medium: 0, Low: 0 },
      total: 0,
      dismissedCount: 0,
      degraded: true,
      alert,
      message: alert
        ? 'Alerts are temporarily unavailable. The rest of the dashboard remains usable.'
        : 'Alerts are loading. Retrying automatically.',
    };
  }
}

export async function dismissApprovalAlert(input: { organizationId: string; actorUserId?: string; approvalId: string }) {
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    approvalRecordId: input.approvalId,
    action: ALERT_DISMISSED_ACTION,
  });
  invalidateAlertsCache(input.organizationId);
}

export async function escalateApprovalAlert(input: { organizationId: string; actorUserId?: string; approvalId: string }) {
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    approvalRecordId: input.approvalId,
    action: ALERT_ESCALATED_ACTION,
  });
  invalidateAlertsCache(input.organizationId);
}
