/**
 * Founder Observability (/founder/observability) — a read-only correlation
 * layer over the platform's already-authoritative operational reports. It
 * introduces no new health-checking engine, no new alerting/incident model,
 * and no new mutation.
 *
 * ARCHITECTURE AUDIT — every metric below traces to one of these four
 * existing, independently-built-and-tested reports, called here exactly
 * once each (never re-queried or re-scored):
 *
 *   - buildFounderSystemHealth() (services/founder-system-health.ts) is
 *     the authoritative source for Database, Redis, Background Jobs
 *     (queue-availability angle), Integrations (connectivity angle), and
 *     Error Monitoring (Sentry-configured angle). Its own header comment
 *     already documents why the OLD buildFounderObservabilityCenter()
 *     (services/founder.ts) is NOT reused: its "Redis"/"Sentry" checks only
 *     test whether an env var looks syntactically valid, never a real
 *     connection, and its "alerts" array fabricates entries like
 *     `{ title: 'Database Down', status: 'Resolved' }` unconditionally on
 *     every call. That old function is not called anywhere in this file.
 *   - buildIntegrationHealthPortfolio() (services/founder-integration-
 *     health.ts) is the authoritative source for per-customer/per-provider
 *     integration failure counts (the real CustomerIntegrationHealthState
 *     rollup) — reused directly rather than re-deriving a second,
 *     potentially-diverging integration health score from raw
 *     CustomerIntegrationStatus rows the way the old code did.
 *   - buildFounderBackgroundJobs() (services/founder-background-jobs.ts) is
 *     the authoritative source for real BullMQ failed/dead-lettered job
 *     counts and worker liveness — reused directly instead of re-deriving
 *     "queue backlog" from the tenant-side Event table the way the old code
 *     did (Event has no relationship to the real BullMQ queue at all).
 *   - buildFounderSecurityPosture() (services/founder-security.ts) is the
 *     authoritative source for security/governance control findings.
 *
 * Two, and only two, metrics are computed directly here because they
 * belong to no existing domain owner: "Application Errors" counts real
 * Event.failedAt rows (Event is the platform's generic ingestion-pipeline
 * record — distinct from CustomerIntegrationStatus's connector-health
 * concept and from BackgroundJob's BullMQ-job concept), bounded to a
 * genuine, stated 24-hour window via a single indexed `count()` — never a
 * capped `.findMany().length` sample the way the old code counted (which
 * silently undercounts past its cap and calls the undercount a total).
 *
 * Every one of the four builder calls is wrapped independently (via
 * Promise.allSettled) so one domain being unavailable (e.g. a transient
 * query failure) degrades that one section to an honest "Not available"
 * state instead of taking down the whole page or reporting a fabricated
 * healthy default for it.
 *
 * There is no APM/request-latency telemetry anywhere in this codebase
 * (grepped for latency histograms, tracing middleware, and any table
 * storing request duration — found none beyond ClassifierResult.latencyMs,
 * which is a model-call latency, not a page/API latency, and is already
 * surfaced honestly elsewhere). Performance is therefore reported as
 * "Not instrumented," never a fabricated chart.
 */
import { prisma } from '@/lib/prisma';
import { buildFounderSystemHealth, type SystemHealthReport } from '@/services/founder-system-health';
import { buildIntegrationHealthPortfolio } from '@/services/founder-integration-health';
import { buildFounderBackgroundJobs } from '@/services/founder-background-jobs';
import { buildFounderSecurityPosture } from '@/services/founder-security';
import { WORKER_STATE_LABELS } from '@/lib/founder-background-jobs';
import { SYSTEM_HEALTH_STATUS_LABELS } from '@/lib/founder-system-health';
import { sortObservabilitySignals, type ObservabilitySeverity } from '@/lib/founder-observability';

const APPLICATION_ERROR_WINDOW_MS = 24 * 60 * 60 * 1000;
const APPLICATION_ERROR_SAMPLE_LIMIT = 25;

export type ObservabilityAttentionSignal = {
  id: string;
  severity: ObservabilitySeverity;
  signal: string;
  area: string;
  lastSeen: Date;
  count: number | null;
  actionLabel: string;
  actionHref: string;
};

export type ObservabilityApplicationErrorRow = {
  id: string;
  occurredAt: Date;
  area: string;
  error: string;
};

export type ObservabilityOperationalSignalRow = {
  id: string;
  occurredAt: Date;
  category: string;
  message: string;
};

export type ObservabilityDependency = {
  key: string;
  label: string;
  status: SystemHealthReport['cards'][number]['status'];
  detail: string;
  actionHref: string;
};

export type ObservabilityKpis = {
  // null means the count itself could not be verified (the query failed) —
  // distinct from a genuine, verified zero. Never coalesced to 0, which
  // would misrepresent a failed check as a clean one.
  applicationErrors24h: number | null;
  operationalAttentionCount: number;
  failedJobs: number;
  integrationFailures: number | null;
  activeIncidentSignals: number;
};

// IMPORTANT — what each flag actually detects (found during a final
// adversarial audit): buildFounderSystemHealth, buildFounderBackgroundJobs,
// and buildIntegrationHealthPortfolio are ALL structurally non-throwing —
// every one of them, and everything they call (buildReadinessReport,
// buildFounderOperationsCenter, getApprovalQueueCounts), catches its own
// failures and encodes them as real status *data* (HEALTHY/DEGRADED/
// FAILED/UNKNOWN, `ok: false`, `queueHealth: 'UNAVAILABLE'`) rather than
// rejecting. That data already flows into `attention`/`dependencies` via
// each report's own per-item status, which is the actual, meaningful
// signal — so `systemHealth`/`backgroundJobs` below are near-unreachable
// defensive backstops for a genuine unhandled exception in this file's own
// aggregation code, not a live "is the domain reachable" check (a reachable
// database that happens to be down already shows up as a FAILED card, not
// as `systemHealth: false`).
//
// buildIntegrationHealthPortfolio is the one exception worth guarding
// explicitly: its failure path returns `{ safeError, data: emptyPortfolio() }`
// — indistinguishable from a genuine "no integration data yet" empty state
// unless `safeError` itself is checked, which is what `integrationHealth`
// below actually does (not `!== null`, which — like the other two — would
// always be true here regardless of whether the underlying query failed).
export type ObservabilityAvailability = {
  systemHealth: boolean;
  integrationHealth: boolean;
  backgroundJobs: boolean;
  security: boolean;
  applicationErrors: boolean;
};

export type ObservabilityReport = {
  generatedAt: Date;
  platformStatus: SystemHealthReport['overall'] | 'UNKNOWN';
  kpis: ObservabilityKpis;
  attention: ObservabilityAttentionSignal[];
  dependencies: ObservabilityDependency[];
  applicationErrors: ObservabilityApplicationErrorRow[];
  operationalSignals: ObservabilityOperationalSignalRow[];
  performanceInstrumented: false;
  sentryConfigured: boolean;
  availability: ObservabilityAvailability;
};

async function settleOrNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export async function buildFounderObservability(): Promise<ObservabilityReport> {
  const generatedAt = new Date();
  const errorWindowStart = new Date(generatedAt.getTime() - APPLICATION_ERROR_WINDOW_MS);

  const [systemHealth, integrationPortfolioResult, backgroundJobs, security, applicationErrors24h, recentFailedEvents] = await Promise.all([
    settleOrNull(buildFounderSystemHealth()),
    settleOrNull(buildIntegrationHealthPortfolio({ take: 1 })),
    settleOrNull(buildFounderBackgroundJobs()),
    settleOrNull(buildFounderSecurityPosture()),
    settleOrNull(prisma.event.count({ where: { failedAt: { gte: errorWindowStart } } })),
    settleOrNull(
      prisma.event.findMany({
        where: { failedAt: { gte: errorWindowStart } },
        orderBy: { failedAt: 'desc' },
        select: { id: true, type: true, failureReason: true, failedAt: true },
        take: APPLICATION_ERROR_SAMPLE_LIMIT,
      }),
    ),
  ]);

  // buildIntegrationHealthPortfolio never throws — a genuine query failure
  // surfaces only as a `safeError` string alongside an all-zero
  // emptyPortfolio(), which is otherwise indistinguishable from the
  // legitimate "no integration data recorded yet" state. Checking for that
  // field specifically (not `integrationPortfolioResult !== null`, which is
  // always true here) is what actually detects the failure.
  const integrationHealthFailed = integrationPortfolioResult !== null && 'safeError' in integrationPortfolioResult && Boolean(integrationPortfolioResult.safeError);

  const availability: ObservabilityAvailability = {
    systemHealth: systemHealth !== null,
    integrationHealth: integrationPortfolioResult !== null && !integrationHealthFailed,
    backgroundJobs: backgroundJobs !== null,
    security: security !== null && security.ok,
    applicationErrors: applicationErrors24h !== null,
  };

  const integrationKpis = !integrationHealthFailed ? (integrationPortfolioResult?.data.kpis ?? null) : null;
  // Only used for logic that must branch on a concrete number (severity
  // thresholds, the attention-signal count) — the raw, possibly-null
  // applicationErrors24h is what actually reaches the KPI card, so an
  // unavailable check is never displayed as a verified zero.
  const applicationErrorsCount = applicationErrors24h ?? 0;

  const attention: ObservabilityAttentionSignal[] = [];

  // --- From System Health: any non-HEALTHY card is a real, already-scored signal ---
  if (systemHealth) {
    for (const card of systemHealth.cards) {
      if (card.status === 'HEALTHY') continue;
      const severity: ObservabilitySeverity = card.status === 'FAILED' ? 'CRITICAL' : card.status === 'DEGRADED' ? 'HIGH' : 'MEDIUM';
      const actionHref =
        card.key === 'background-jobs' ? '/founder/background-jobs' :
        card.key === 'integrations' ? '/founder/integration-health' :
        card.key === 'error-monitoring' ? '/founder/security' :
        '/founder/system-health';
      attention.push({
        id: `system-health-${card.key}`,
        severity,
        signal: card.headline,
        area: card.label,
        lastSeen: card.lastChecked,
        count: null,
        actionLabel: 'View System Health',
        actionHref,
      });
    }
  }

  // --- From Integration Health: real per-provider critical/attention counts ---
  if (integrationKpis) {
    if (integrationKpis.critical > 0) {
      attention.push({
        id: 'integration-critical',
        severity: 'CRITICAL',
        signal: `${integrationKpis.critical} customer integration${integrationKpis.critical === 1 ? '' : 's'} in a critical state`,
        area: 'Integrations',
        lastSeen: generatedAt,
        count: integrationKpis.critical,
        actionLabel: 'View Integration Health',
        actionHref: '/founder/integration-health',
      });
    }
    if (integrationKpis.attention > 0) {
      attention.push({
        id: 'integration-attention',
        severity: 'HIGH',
        signal: `${integrationKpis.attention} customer integration${integrationKpis.attention === 1 ? '' : 's'} need attention`,
        area: 'Integrations',
        lastSeen: generatedAt,
        count: integrationKpis.attention,
        actionLabel: 'View Integration Health',
        actionHref: '/founder/integration-health',
      });
    }
  } else if (integrationPortfolioResult === null || integrationHealthFailed) {
    // A real query failure, not "no data yet" — surfaced explicitly rather
    // than silently rendering as 0 integration failures.
    attention.push({
      id: 'integration-health-unavailable',
      severity: 'MEDIUM',
      signal: 'Integration Health data could not be retrieved',
      area: 'Integrations',
      lastSeen: generatedAt,
      count: null,
      actionLabel: 'View Integration Health',
      actionHref: '/founder/integration-health',
    });
  }

  // --- From Background Jobs: real failed/dead-lettered counts and worker liveness ---
  if (backgroundJobs) {
    if (backgroundJobs.deadLetterJobsTotal > 0) {
      attention.push({
        id: 'background-jobs-dead-letter',
        severity: 'CRITICAL',
        signal: `${backgroundJobs.deadLetterJobsTotal} job${backgroundJobs.deadLetterJobsTotal === 1 ? '' : 's'} moved to the dead-letter queue`,
        area: 'Background Jobs',
        lastSeen: backgroundJobs.deadLetterJobs[0]?.lastFailedAt ?? generatedAt,
        count: backgroundJobs.deadLetterJobsTotal,
        actionLabel: 'View Background Jobs',
        actionHref: '/founder/background-jobs',
      });
    } else if (backgroundJobs.failedJobsTotal > 0) {
      attention.push({
        id: 'background-jobs-failed',
        severity: 'HIGH',
        signal: `${backgroundJobs.failedJobsTotal} failed job${backgroundJobs.failedJobsTotal === 1 ? '' : 's'} retained in the queue`,
        area: 'Background Jobs',
        lastSeen: backgroundJobs.failedJobs[0]?.failedAt ?? generatedAt,
        count: backgroundJobs.failedJobsTotal,
        actionLabel: 'View Background Jobs',
        actionHref: '/founder/background-jobs',
      });
    }
    if (backgroundJobs.worker.state === 'OFFLINE' || backgroundJobs.worker.state === 'STALE') {
      attention.push({
        id: 'background-jobs-worker',
        severity: backgroundJobs.worker.state === 'OFFLINE' ? 'CRITICAL' : 'HIGH',
        signal: `Background worker is ${WORKER_STATE_LABELS[backgroundJobs.worker.state].toLowerCase()}`,
        area: 'Background Jobs',
        lastSeen: backgroundJobs.worker.lastSeenAt ?? generatedAt,
        count: null,
        actionLabel: 'View Background Jobs',
        actionHref: '/founder/background-jobs',
      });
    }
  }

  // --- From Security: real critical-finding count ---
  if (security && security.ok) {
    if (security.kpis.criticalFindings > 0) {
      attention.push({
        id: 'security-critical',
        severity: 'CRITICAL',
        signal: `${security.kpis.criticalFindings} security control${security.kpis.criticalFindings === 1 ? '' : 's'} at critical severity`,
        area: 'Security',
        lastSeen: generatedAt,
        count: security.kpis.criticalFindings,
        actionLabel: 'View Security',
        actionHref: '/founder/security',
      });
    } else if (security.kpis.attention > 0) {
      attention.push({
        id: 'security-attention',
        severity: 'MEDIUM',
        signal: `${security.kpis.attention} security control${security.kpis.attention === 1 ? '' : 's'} need attention`,
        area: 'Security',
        lastSeen: generatedAt,
        count: security.kpis.attention,
        actionLabel: 'View Security',
        actionHref: '/founder/security',
      });
    }
  } else {
    // security is either null (an unexpected exception) or `{ ok: false,
    // safeError }` (a real, already-observed failure mode of
    // buildFounderSecurityPosture in this exact environment) — surfaced
    // explicitly per Founder Security's own documented contract, rather
    // than silently omitting the entire Security dimension from Founder
    // Attention.
    attention.push({
      id: 'security-unavailable',
      severity: 'MEDIUM',
      signal: 'Security posture data could not be retrieved',
      area: 'Security',
      lastSeen: generatedAt,
      count: null,
      actionLabel: 'View Security',
      actionHref: '/founder/security',
    });
  }

  // --- Application errors (computed here — no existing domain owns this) ---
  if (applicationErrorsCount > 0) {
    attention.push({
      id: 'application-errors',
      severity: applicationErrorsCount > 25 ? 'HIGH' : 'MEDIUM',
      signal: `${applicationErrorsCount} ingestion event${applicationErrorsCount === 1 ? '' : 's'} failed in the last 24 hours`,
      area: 'Application',
      lastSeen: recentFailedEvents?.[0]?.failedAt ?? generatedAt,
      count: applicationErrorsCount,
      actionLabel: 'View details below',
      actionHref: '/founder/observability',
    });
  }

  const sortedAttention = sortObservabilitySignals(attention);

  const dependencies: ObservabilityDependency[] = systemHealth
    ? systemHealth.cards.map((card) => ({
        key: card.key,
        label: card.label,
        status: card.status,
        detail: card.headline,
        actionHref:
          card.key === 'background-jobs' ? '/founder/background-jobs' :
          card.key === 'integrations' ? '/founder/integration-health' :
          card.key === 'error-monitoring' ? '/founder/security' :
          '/founder/system-health',
      }))
    : [];

  const platformStatus: ObservabilityReport['platformStatus'] = systemHealth ? systemHealth.overall : 'UNKNOWN';

  const kpis: ObservabilityKpis = {
    applicationErrors24h: applicationErrors24h,
    operationalAttentionCount: sortedAttention.length,
    // KNOWN, INHERITED LIMITATION (found during a final adversarial audit,
    // deliberately not fixed here): failedJobsTotal comes from Background
    // Jobs' own prisma.backgroundJob.count().catch(() => 0) — a design
    // decision made and already shipped/tested in that module before this
    // task existed. A genuine Postgres outage affecting only that specific
    // count would render as a confident "0" on both this page and
    // Background Jobs' own page identically. Silently treating it as
    // null/unavailable *here* while Background Jobs itself still shows a
    // confident 0 would make the two pages disagree about the same number,
    // which is worse than the shared limitation — so this reuses that
    // number as-is, faithfully matching its source of truth, rather than
    // recomputing a second, diverging judgment about its reliability.
    failedJobs: backgroundJobs?.failedJobsTotal ?? 0,
    integrationFailures: integrationHealthFailed ? null : integrationKpis ? integrationKpis.critical + integrationKpis.attention : 0,
    activeIncidentSignals: sortedAttention.filter((s) => s.severity === 'CRITICAL').length,
  };

  const applicationErrors: ObservabilityApplicationErrorRow[] = (recentFailedEvents ?? []).map((event) => ({
    id: event.id,
    occurredAt: event.failedAt ?? generatedAt,
    area: event.type,
    error: event.failureReason ?? 'No failure reason recorded.',
  }));

  const operationalSignals: ObservabilityOperationalSignalRow[] = (backgroundJobs?.recentEvents ?? []).map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt,
    // Every recentEvents entry is a BullMQ job outcome — there is only one
    // real category here (unlike Application Errors' varied event.type).
    category: 'Queue',
    message: event.detail ?? `${event.jobType} ${event.kind.toLowerCase()}`,
  }));

  return {
    generatedAt,
    platformStatus,
    kpis,
    attention: sortedAttention,
    dependencies,
    applicationErrors,
    operationalSignals,
    performanceInstrumented: false,
    sentryConfigured: systemHealth?.sentryConfigured ?? Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    availability,
  };
}

// Re-exported so the page can render a real, correctly-typed status label
// without importing lib/founder-system-health directly for one constant.
export { SYSTEM_HEALTH_STATUS_LABELS };
