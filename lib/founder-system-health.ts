/**
 * System Health (/founder/system-health) — pure, client-safe types and
 * display helpers. No DB/framework dependencies.
 *
 * ARCHITECTURE — see services/founder-system-health.ts's header for the
 * full audit. In short: this module introduces no new health-checking
 * engine. It aggregates three already-authoritative, already-exported
 * sources verbatim:
 *   - services/readiness.ts's buildReadinessReport() — real Postgres
 *     (`SELECT 1`) and Redis (`connect()` + `ping()`) checks, already used
 *     by /health and scripts/readiness.ts.
 *   - services/founder.ts's buildFounderOperationsCenter() — real
 *     BackgroundJob/DeadLetterJob/OutboxEvent counts, already used by
 *     /founder/operations and /founder/reliability.
 *   - services/queue/approvalQueue.ts's getApprovalQueue() — the one real
 *     named BullMQ queue in this codebase ('approval-classification');
 *     this module is the first caller of its live .getJobCounts().
 * Two real, narrow additions were needed and are documented in the
 * service file: a WorkerHeartbeat recency check (an existing model with
 * no prior reader) and a platform-wide CustomerIntegrationStatus groupBy
 * (an existing table with no prior platform-level aggregate).
 */

export type SystemHealthStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'UNKNOWN';

export const SYSTEM_HEALTH_STATUS_LABELS: Record<SystemHealthStatus, string> = {
  HEALTHY: 'Healthy',
  DEGRADED: 'Degraded',
  FAILED: 'Failed',
  UNKNOWN: 'Unknown',
};

export function systemHealthTone(status: SystemHealthStatus): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'HEALTHY') return 'green';
  if (status === 'DEGRADED') return 'amber';
  if (status === 'FAILED') return 'red';
  return 'slate';
}

export function systemHealthDotColor(status: SystemHealthStatus): string {
  if (status === 'HEALTHY') return 'bg-emerald-500';
  if (status === 'DEGRADED') return 'bg-amber-500';
  if (status === 'FAILED') return 'bg-rose-500';
  return 'bg-slate-400';
}

export { fmtDateTime, fmtRelativeTime } from './founder-activity';

/**
 * The one deterministic overall-status rule, computed once here (both the
 * service layer and, for the same-render KPI strip, the page itself, call
 * this — never re-derived ad hoc in a component) so the frontend can never
 * disagree with the server about what "Healthy" means.
 *
 *   FAILED   — Database, Redis, or Background Jobs is itself FAILED. These
 *              three are the only checks this module treats as "critical":
 *              a real outage of any one of them means the platform cannot
 *              do its job (serve requests, or process approval events).
 *   DEGRADED — nothing critical has failed, but at least one authoritative
 *              signal needs attention: Background Jobs or Integrations is
 *              DEGRADED, or Error Monitoring is UNKNOWN (Sentry not
 *              configured — a real observability gap, not merely cosmetic).
 *   HEALTHY  — every required, observable critical system is HEALTHY, and
 *              there is no outstanding DEGRADED/UNKNOWN signal from the
 *              non-critical systems either.
 *   UNKNOWN  — only when the aggregation itself could not run at all (the
 *              service layer's own try/catch) — this function never
 *              returns UNKNOWN on its own, since by the time it runs every
 *              input already has a real status (including UNKNOWN itself
 *              for e.g. unconfigured Redis, which this rule treats as
 *              DEGRADED, not FAILED — a missing optional capability is not
 *              the same as an active outage of a configured one).
 */
export function computeOverallSystemHealth(input: {
  database: SystemHealthStatus;
  redis: SystemHealthStatus;
  backgroundJobs: SystemHealthStatus;
  integrations: SystemHealthStatus;
  errorMonitoring: SystemHealthStatus;
}): SystemHealthStatus {
  const critical = [input.database, input.redis, input.backgroundJobs];
  if (critical.some((s) => s === 'FAILED')) return 'FAILED';

  const needsAttention =
    input.backgroundJobs === 'DEGRADED' ||
    input.backgroundJobs === 'UNKNOWN' ||
    input.integrations === 'DEGRADED' ||
    input.integrations === 'FAILED' ||
    input.errorMonitoring === 'UNKNOWN' ||
    input.database === 'UNKNOWN' ||
    input.redis === 'UNKNOWN';
  if (needsAttention) return 'DEGRADED';

  return 'HEALTHY';
}
