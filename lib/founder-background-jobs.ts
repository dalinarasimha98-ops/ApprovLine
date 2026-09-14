/**
 * Background Jobs (/founder/background-jobs) — pure, client-safe types and
 * display helpers. No DB/framework dependencies (matches lib/founder-
 * system-health.ts's and lib/founder-integration-health.ts's convention).
 *
 * ARCHITECTURE — see services/founder-background-jobs.ts's header for the
 * full audit. In short: this page is a dedicated, queue-scoped view of the
 * one real BullMQ queue ('approval-classification') and its real
 * BackgroundJob/DeadLetterJob/WorkerHeartbeat rows — narrower and more
 * precise than services/founder.ts's buildFounderOperationsCenter(), which
 * blends this queue's numbers with gateway outbox/copilot/integration
 * failures for its own (different) purpose.
 */

export type QueueHealthState = 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'UNAVAILABLE';

export const QUEUE_HEALTH_LABELS: Record<QueueHealthState, string> = {
  HEALTHY: 'Healthy',
  ATTENTION: 'Attention',
  CRITICAL: 'Critical',
  UNAVAILABLE: 'Unavailable',
};

export function queueHealthTone(state: QueueHealthState): 'green' | 'amber' | 'red' | 'slate' {
  if (state === 'HEALTHY') return 'green';
  if (state === 'ATTENTION') return 'amber';
  if (state === 'CRITICAL') return 'red';
  return 'slate';
}

export type WorkerState = 'ONLINE' | 'STALE' | 'OFFLINE' | 'UNKNOWN';

export const WORKER_STATE_LABELS: Record<WorkerState, string> = {
  ONLINE: 'Online',
  STALE: 'Stale',
  OFFLINE: 'Offline',
  UNKNOWN: 'Unknown',
};

export function workerStateTone(state: WorkerState): 'green' | 'amber' | 'red' | 'slate' {
  if (state === 'ONLINE') return 'green';
  if (state === 'STALE') return 'amber';
  if (state === 'OFFLINE') return 'red';
  return 'slate';
}

// Matches services/founder-system-health.ts's own WORKER_STALE_AFTER_MS
// value exactly (same 5-minute ONLINE/STALE boundary), so this page can
// never disagree with System Health about what "still actively processing"
// means. Duplicated as a literal rather than imported: this file must stay
// a client-safe pure module (BackgroundJobsClient.tsx imports it directly),
// and services/founder-system-health.ts is a server-only module that pulls
// in Prisma/BullMQ — importing it here would leak server code into the
// client bundle. tests/founder-background-jobs.test.ts asserts the two
// values stay numerically identical so they can never silently drift.
export const WORKER_STALE_AFTER_MS = 5 * 60 * 1000;
// New here — System Health only ever needed a binary online/not-online
// signal; this page's 4-state vocabulary needs a second, slower threshold
// for "hasn't reported in so long it should be treated as offline, not
// merely lagging," which didn't previously exist anywhere.
export const WORKER_OFFLINE_AFTER_MS = 30 * 60 * 1000;

export function computeWorkerState(lastSeenAt: Date | null, now: number = Date.now()): WorkerState {
  if (!lastSeenAt) return 'UNKNOWN';
  const age = now - lastSeenAt.getTime();
  if (age < WORKER_STALE_AFTER_MS) return 'ONLINE';
  if (age < WORKER_OFFLINE_AFTER_MS) return 'STALE';
  return 'OFFLINE';
}

// Reused verbatim from System Health's own already-approved threshold for
// "too many failed jobs retained" — kept as one constant so both pages can
// never silently diverge on what "too many" means.
export const CRITICAL_FAILED_THRESHOLD = 20;

export type QueueCountsInput = { ok: true; counts: { waiting: number; active: number } } | { ok: false; reason: string };

/**
 * The one deterministic queue-health rule for this page, mirroring System
 * Health's computeOverallSystemHealth() in spirit: every branch is a real,
 * named condition, never a weighted/arbitrary score.
 *
 * Failure severity is judged from `failedJobsTotal` — the real, durable
 * count of BackgroundJob rows with status='FAILED' — rather than BullMQ's
 * own `counts.counts.failed`. Found during real Redis+BullMQ verification:
 * BullMQ's failed bucket is capped by this queue's own
 * `removeOnFail: 5_000` retention option (services/queue/approvalQueue.ts),
 * so it can under-report or reset independently of what actually happened;
 * the BackgroundJob table has no such cap and is the same source this
 * page's own Failed Jobs section already queries, so the health badge can
 * never disagree with the table directly below it.
 *
 *   UNAVAILABLE — the queue backend itself could not be reached (Redis down,
 *                 misconfigured, or the count request timed out). Distinct
 *                 from "zero jobs": UNAVAILABLE never reports 0/0/0.
 *   CRITICAL    — more than 20 failed jobs are retained, OR the worker is
 *                 OFFLINE while jobs are waiting/active in BullMQ (a real
 *                 backlog with nothing processing it).
 *   ATTENTION   — any failed jobs are retained, the worker is OFFLINE (even
 *                 with an empty queue — a proven-dead worker is a real
 *                 infrastructure problem regardless of current backlog), or
 *                 the worker is STALE/UNKNOWN (hasn't proven it's alive
 *                 recently, or ever).
 *   HEALTHY     — reachable, no retained failures, and the worker is ONLINE.
 */
export function computeQueueHealth(counts: QueueCountsInput, workerState: WorkerState, failedJobsTotal: number): { state: QueueHealthState; headline: string } {
  if (!counts.ok) {
    return { state: 'UNAVAILABLE', headline: 'Queue metrics are not currently available.' };
  }
  const { waiting, active } = counts.counts;
  if (failedJobsTotal > CRITICAL_FAILED_THRESHOLD) {
    return { state: 'CRITICAL', headline: `${failedJobsTotal} failed jobs retained.` };
  }
  if (workerState === 'OFFLINE' && waiting + active > 0) {
    return { state: 'CRITICAL', headline: `${waiting + active} job(s) waiting with no worker online.` };
  }
  if (failedJobsTotal > 0) {
    return { state: 'ATTENTION', headline: `${failedJobsTotal} failed job${failedJobsTotal === 1 ? '' : 's'} retained.` };
  }
  if (workerState === 'OFFLINE') {
    return { state: 'ATTENTION', headline: 'No worker has reported in within the last 30 minutes.' };
  }
  if (workerState === 'STALE' || workerState === 'UNKNOWN') {
    return { state: 'ATTENTION', headline: workerState === 'UNKNOWN' ? 'No worker has ever reported in.' : 'No worker has reported in within the last 5 minutes.' };
  }
  return { state: 'HEALTHY', headline: `${waiting} waiting, ${active} active.` };
}

export type QueueFailureCategoryValue = 'TRANSIENT' | 'PERMANENT' | 'TIMEOUT' | 'RATE_LIMIT' | 'AUTHENTICATION' | 'VALIDATION' | 'UNKNOWN';

export const FAILURE_CATEGORY_LABELS: Record<QueueFailureCategoryValue, string> = {
  TRANSIENT: 'Transient',
  PERMANENT: 'Permanent',
  TIMEOUT: 'Timeout',
  RATE_LIMIT: 'Rate Limited',
  AUTHENTICATION: 'Authentication',
  VALIDATION: 'Validation',
  UNKNOWN: 'Unknown',
};

export function failureCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Unknown';
  return FAILURE_CATEGORY_LABELS[category as QueueFailureCategoryValue] ?? category;
}

/**
 * Truncates a raw failure/error message for compact table display. Never
 * fabricates a reason — a genuinely missing reason is the caller's job to
 * render as "No reason recorded", not this function's.
 */
export function truncateReason(reason: string, max = 120): string {
  if (reason.length <= max) return reason;
  return `${reason.slice(0, max - 1)}…`;
}

export { fmtDateTime, fmtRelativeTime } from './founder-activity';
