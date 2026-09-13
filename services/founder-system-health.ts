/**
 * System Health (/founder/system-health) — a read-only aggregation of
 * ApprovLine's real, already-observable infrastructure signals. Introduces
 * no new health-checking engine, no new alerting/incident model, and no
 * new mutation.
 *
 * ARCHITECTURE AUDIT — what "health" actually means in this codebase, and
 * what was found to be genuinely authoritative vs. not:
 *
 *   - services/founder.ts's buildFounderObservabilityCenter() (used by
 *     /founder/observability) was inspected in full and found NOT
 *     authoritative enough to reuse for this page: its "Redis Status" and
 *     "Sentry configured" checks only test whether an env var LOOKS
 *     syntactically valid, never an actual connection; its "queueMetrics"
 *     derive from the tenant-side Event table (ingestion backlog), not any
 *     real BullMQ queue; and its "alerts" array contains entries like
 *     `{ title: 'Database Down', status: 'Resolved', detail: ... }` that
 *     are generated unconditionally on every call, never from a real
 *     observed outage. Reusing it here would mean re-exposing exactly the
 *     fabricated-metric patterns this page is required to avoid, so it is
 *     deliberately NOT used as a source for Database, Redis, or Alerts.
 *   - services/readiness.ts's buildReadinessReport() IS genuinely
 *     authoritative for Database and Redis: checkPostgres() runs a real
 *     `SELECT 1`, and checkRedis() (via services/queue/connection.ts's
 *     checkRedisConnection()) performs a real `connect()` + `ping()`, both
 *     with real timeouts. This is the same function already used by
 *     /health and scripts/readiness.ts. Reused verbatim, uncached (the
 *     30s-cached buildHealthPageReport() wrapper exists specifically for
 *     /health's public, frequently-polled use case — this page's own
 *     Refresh button needs a guaranteed-fresh check on demand instead).
 *   - services/founder.ts's buildFounderOperationsCenter() (used today by
 *     /founder/operations and /founder/reliability) IS genuinely
 *     authoritative for background-job reliability: every number is a
 *     direct BackgroundJob/DeadLetterJob/OutboxEvent count, no fabricated
 *     alert wrapper. Reused verbatim as supporting context.
 *   - The one real named BullMQ queue in this entire codebase is
 *     'approval-classification' (services/queue/approvalQueue.ts) — there
 *     is no 'emails'/'integrations'/'webhooks' queue anywhere; those names
 *     in the reference mockup this page was built from are illustrative
 *     only. getApprovalQueue().getJobCounts() is called directly here (its
 *     first reader anywhere in the codebase) for a genuinely live
 *     waiting/active/failed/completed/delayed snapshot, timeout-guarded
 *     exactly like the readiness checks.
 *   - WorkerHeartbeat (schema-only until now — grepped, no prior reader
 *     anywhere) is a real signal for "is a worker process actually
 *     consuming jobs," distinct from "is the queue backend reachable." A
 *     reachable-but-workerless queue is a real, different failure mode
 *     this page can now actually distinguish.
 *   - CustomerIntegrationStatus (already used by services/founder.ts and
 *     services/founder-customer-integrations.ts) has no existing
 *     PLATFORM-WIDE per-provider aggregate — every existing reader is
 *     either customer-scoped or folded into buildFounderObservabilityCenter's
 *     already-rejected integrationGroups (which adds fabricated
 *     latency/successRate strings). A plain groupBy over the same real
 *     table, with no scoring logic invented, is added here.
 *   - Sentry: there is no code anywhere in this repository that queries
 *     Sentry's own API for real error counts/rates — only SDK capture
 *     configuration. "Error Monitoring" here can therefore only ever
 *     report whether capture is CONFIGURED (a real, binary fact), never a
 *     real error rate. Configured -> HEALTHY (capture is active);
 *     unconfigured -> UNKNOWN ("error rates cannot be observed"), never a
 *     fabricated count.
 *   - "Deployment" and "API Routes" cards from the reference mockup are
 *     deliberately NOT built: this repository contains zero deployment
 *     telemetry (no Vercel API integration, no deployment timestamp
 *     tracked anywhere — grepped for VERCEL_GIT/VERCEL_DEPLOYMENT/
 *     deploymentId and found nothing), and "API Routes" would reduce to
 *     the exact same signal as "Application" (this Server Component
 *     executing at all) — a second card for the same fact would be a
 *     duplicate, not a genuinely separate observation.
 *   - "Recent System Events" reuses buildFounderOperationsCenter()'s
 *     recentExceptions (real DeadLetterJob/BackgroundJob/OutboxEvent
 *     failure rows) rather than inventing a generic event log — there is
 *     no "routine success" event stream in this schema (the reference
 *     mockup's "Database check succeeded" rows have no backing table), so
 *     this section only ever shows real recorded failures, never
 *     synthetic successes.
 *   - There is no incident model in this schema distinct from these
 *     failure records (InvestigationCase is a compliance-investigation
 *     concept, unrelated to infrastructure incidents) — "Recent
 *     Incidents" is intentionally not modeled as a new table; it reuses
 *     the same failure records, framed honestly.
 *   - No uptime-percentage, response-time-history, or deployment-frequency
 *     table exists anywhere — none of those are displayed.
 */
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { buildReadinessReport } from '@/services/readiness';
import { buildFounderOperationsCenter, founderIntegrationCatalog } from '@/services/founder';
import { getApprovalQueue, approvalQueueName } from '@/services/queue/approvalQueue';
import { computeOverallSystemHealth, type SystemHealthStatus } from '@/lib/founder-system-health';

const WORKER_STALE_AFTER_MS = 5 * 60 * 1000; // a worker that hasn't reported in 5 minutes is treated as not actively processing, not as "still fine"

export type SystemHealthCard = {
  key: string;
  label: string;
  status: SystemHealthStatus;
  headline: string;
  detail: string;
  lastChecked: Date;
};

export type QueueSummary = {
  available: boolean;
  queueName: string;
  counts: { waiting: number; active: number; failed: number; completed: number; delayed: number } | null;
  workerLastSeenAt: Date | null;
  workerOnline: boolean;
  reliabilityBacklog: { failedJobs: number; queueBacklogs: number };
  unavailableReason: string | null;
};

export type IntegrationProviderSummary = {
  provider: string;
  category: string;
  connected: number;
  needsAttention: number;
  total: number;
  status: SystemHealthStatus;
  lastCheck: Date | null;
};

export type RecentSystemEvent = {
  id: string;
  type: string;
  failureReason: string | null;
  occurredAt: Date;
};

export type SystemHealthReport = {
  generatedAt: Date;
  overall: SystemHealthStatus;
  cards: SystemHealthCard[];
  queue: QueueSummary;
  integrations: IntegrationProviderSummary[];
  recentEvents: RecentSystemEvent[];
  sentryConfigured: boolean;
};

function readinessToStatus(check: { status: 'ok' | 'missing' | 'error' } | undefined, missingIsUnknown = true): SystemHealthStatus {
  if (!check) return 'UNKNOWN';
  if (check.status === 'ok') return 'HEALTHY';
  if (check.status === 'error') return 'FAILED';
  return missingIsUnknown ? 'UNKNOWN' : 'DEGRADED';
}

export async function buildFounderSystemHealth(): Promise<SystemHealthReport> {
  const generatedAt = new Date();

  const [readiness, operations, queueCounts, workerHeartbeat, integrationRows] = await Promise.all([
    buildReadinessReport(),
    buildFounderOperationsCenter(),
    (async () => {
      const queue = getApprovalQueue();
      if (!queue) return { ok: false as const, reason: 'Redis is not configured; the approval-classification queue cannot be reached.' };
      try {
        // getJobCounts() returns a loosely-typed {[type: string]: number} —
        // normalized here into the fixed shape the rest of this module (and
        // the UI) depends on, defensively defaulting to 0 only for a type
        // BullMQ didn't return at all (never silently swallowing a real
        // failure — that's what the outer try/catch is for).
        const raw = await withTimeout('system-health:queue-counts', queue.getJobCounts('waiting', 'active', 'failed', 'completed', 'delayed'), 2500);
        const counts = {
          waiting: raw.waiting ?? 0,
          active: raw.active ?? 0,
          failed: raw.failed ?? 0,
          completed: raw.completed ?? 0,
          delayed: raw.delayed ?? 0,
        };
        return { ok: true as const, counts };
      } catch (error) {
        return { ok: false as const, reason: error instanceof Error ? error.message : 'Queue metrics request failed.' };
      }
    })(),
    prisma.workerHeartbeat.findFirst({ where: { queueName: approvalQueueName }, orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }).catch(() => null),
    prisma.customerIntegrationStatus.groupBy({
      by: ['provider', 'connectionState'],
      _count: { _all: true },
      _max: { updatedAt: true },
    }).catch(() => [] as { provider: string; connectionState: string; _count: { _all: number }; _max: { updatedAt: Date | null } }[]),
  ]);

  const databaseStatus = readinessToStatus(readiness.checks.postgresql, false);
  const redisStatus = readinessToStatus(readiness.checks.redis, true);

  // --- Background Jobs ---
  const workerOnline = Boolean(workerHeartbeat?.lastSeenAt && Date.now() - workerHeartbeat.lastSeenAt.getTime() < WORKER_STALE_AFTER_MS);
  let backgroundJobsStatus: SystemHealthStatus;
  let backgroundJobsHeadline: string;
  let backgroundJobsDetail: string;
  if (redisStatus === 'FAILED') {
    backgroundJobsStatus = 'FAILED';
    backgroundJobsHeadline = 'Queue infrastructure unavailable.';
    backgroundJobsDetail = 'Redis (the BullMQ backend) is unreachable, so background job processing cannot run.';
  } else if (!queueCounts.ok) {
    backgroundJobsStatus = redisStatus === 'UNKNOWN' ? 'UNKNOWN' : 'DEGRADED';
    backgroundJobsHeadline = 'Queue metrics are not currently available.';
    backgroundJobsDetail = queueCounts.reason;
  } else {
    const c = queueCounts.counts;
    if (c.failed > 20) {
      backgroundJobsStatus = 'DEGRADED';
      backgroundJobsHeadline = `${c.failed} failed jobs retained in the queue.`;
    } else if (!workerOnline) {
      backgroundJobsStatus = 'DEGRADED';
      backgroundJobsHeadline = 'No worker has reported in within the last 5 minutes.';
    } else {
      backgroundJobsStatus = 'HEALTHY';
      backgroundJobsHeadline = `${c.waiting} waiting, ${c.active} active.`;
    }
    backgroundJobsDetail = `${approvalQueueName}: ${c.waiting} waiting · ${c.active} active · ${c.failed} failed (retained) · ${c.completed} completed (retained) · ${c.delayed} delayed.`;
  }

  // --- Integrations (platform-wide, from CustomerIntegrationStatus) ---
  const byProvider = new Map<string, { connected: number; needsAttention: number; total: number; lastCheck: Date | null }>();
  for (const row of integrationRows) {
    const entry = byProvider.get(row.provider) ?? { connected: 0, needsAttention: 0, total: 0, lastCheck: null };
    entry.total += row._count._all;
    if (row.connectionState === 'CONNECTED') entry.connected += row._count._all;
    if (row.connectionState === 'ERROR' || row.connectionState === 'NEEDS_REAUTH') entry.needsAttention += row._count._all;
    if (row._max.updatedAt && (!entry.lastCheck || row._max.updatedAt > entry.lastCheck)) entry.lastCheck = row._max.updatedAt;
    byProvider.set(row.provider, entry);
  }
  const integrations: IntegrationProviderSummary[] = founderIntegrationCatalog
    .map((item): IntegrationProviderSummary | null => {
      const entry = byProvider.get(item.key);
      if (!entry || entry.total === 0) return null;
      const status: SystemHealthStatus = entry.needsAttention === 0 ? 'HEALTHY' : entry.needsAttention === entry.total ? 'FAILED' : 'DEGRADED';
      return {
        provider: item.label,
        category: item.category,
        connected: entry.connected,
        needsAttention: entry.needsAttention,
        total: entry.total,
        status,
        lastCheck: entry.lastCheck,
      };
    })
    .filter((row): row is IntegrationProviderSummary => row !== null);
  const totalNeedingAttention = integrations.reduce((sum, row) => sum + row.needsAttention, 0);
  const integrationsStatus: SystemHealthStatus = integrations.length === 0
    ? 'UNKNOWN'
    : totalNeedingAttention === 0
      ? 'HEALTHY'
      : integrations.every((row) => row.status === 'FAILED')
        ? 'FAILED'
        : 'DEGRADED';

  // --- Error Monitoring (Sentry) ---
  const sentryConfigured = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  const errorMonitoringStatus: SystemHealthStatus = sentryConfigured ? 'HEALTHY' : 'UNKNOWN';

  const overall = computeOverallSystemHealth({
    database: databaseStatus,
    redis: redisStatus,
    backgroundJobs: backgroundJobsStatus,
    integrations: integrationsStatus,
    errorMonitoring: errorMonitoringStatus,
  });

  const cards: SystemHealthCard[] = [
    {
      key: 'application',
      label: 'Application',
      status: 'HEALTHY',
      headline: 'Responding normally.',
      detail: 'This page rendered under Founder authorization, confirming the application and middleware are serving requests.',
      lastChecked: generatedAt,
    },
    {
      key: 'database',
      label: 'Database (PostgreSQL)',
      status: databaseStatus,
      headline: databaseStatus === 'HEALTHY' ? 'Connected.' : databaseStatus === 'FAILED' ? 'Database connection unavailable.' : 'Database configuration missing.',
      detail: readiness.checks.postgresql.message,
      lastChecked: generatedAt,
    },
    {
      key: 'redis',
      label: 'Redis',
      status: redisStatus,
      headline: redisStatus === 'HEALTHY' ? 'Connected.' : redisStatus === 'FAILED' ? 'Redis connection unavailable.' : 'Redis is not configured.',
      detail: readiness.checks.redis.message,
      lastChecked: generatedAt,
    },
    {
      key: 'background-jobs',
      label: 'Background Jobs (BullMQ)',
      status: backgroundJobsStatus,
      headline: backgroundJobsHeadline,
      detail: backgroundJobsDetail,
      lastChecked: generatedAt,
    },
    {
      key: 'integrations',
      label: 'Integrations',
      status: integrationsStatus,
      headline: integrations.length === 0
        ? 'No integration connections recorded yet.'
        : totalNeedingAttention === 0
          ? `${integrations.length} providers connected.`
          : `${totalNeedingAttention} of ${integrations.reduce((s, r) => s + r.total, 0)} provider connections need attention.`,
      detail: integrations.length === 0
        ? 'No customer has an integration status recorded yet.'
        : `${integrations.map((r) => r.provider).join(', ')}.`,
      lastChecked: generatedAt,
    },
    {
      key: 'error-monitoring',
      label: 'Error Monitoring',
      status: errorMonitoringStatus,
      headline: sentryConfigured ? 'Sentry error capture is configured.' : 'Sentry is not configured.',
      detail: sentryConfigured
        ? 'Error-rate metrics are available in Sentry rather than queried here.'
        : 'No SENTRY_DSN is configured, so error rates cannot be observed from this application.',
      lastChecked: generatedAt,
    },
  ];

  return {
    generatedAt,
    overall,
    cards,
    queue: {
      available: queueCounts.ok,
      queueName: approvalQueueName,
      counts: queueCounts.ok ? queueCounts.counts : null,
      workerLastSeenAt: workerHeartbeat?.lastSeenAt ?? null,
      workerOnline,
      reliabilityBacklog: { failedJobs: operations.data.failedJobs, queueBacklogs: operations.data.queueBacklogs },
      unavailableReason: queueCounts.ok ? null : queueCounts.reason,
    },
    integrations,
    recentEvents: operations.data.recentExceptions.map((event) => ({
      id: event.id,
      type: event.type,
      failureReason: event.failureReason,
      occurredAt: event.failedAt ?? event.createdAt,
    })),
    sentryConfigured,
  };
}
