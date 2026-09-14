/**
 * Background Jobs (/founder/background-jobs) — a read-only, queue-scoped
 * view answering "are ApprovLine's background processing systems operating
 * normally, and what requires my attention?" Introduces no new job engine,
 * no second BullMQ Queue/Worker, and no fabricated metric.
 *
 * ARCHITECTURE AUDIT — what this page reuses vs. what is genuinely new:
 *
 *   - services/queue/approvalQueue.ts's getApprovalQueueCounts() is reused
 *     verbatim (the exact same reader services/founder-system-health.ts
 *     calls) rather than a second BullMQ .getJobCounts() reader.
 *   - lib/founder-background-jobs.ts's WORKER_STALE_AFTER_MS matches
 *     services/founder-system-health.ts's own threshold value (5 minutes)
 *     exactly, so this page can never disagree with System Health about
 *     what "still actively processing" means — duplicated as a literal
 *     rather than imported, since the lib file must stay client-safe and
 *     the System Health service is server-only (see that constant's own
 *     comment for the full reasoning, and the test file for the drift
 *     guard). A second boundary, WORKER_OFFLINE_AFTER_MS (30 minutes), is
 *     new here — System Health only needed a binary online/not-online
 *     signal for its single health card; this page's spec explicitly calls
 *     for a 4-state ONLINE/STALE/OFFLINE/UNKNOWN vocabulary, which needs a
 *     second threshold that didn't previously exist anywhere.
 *   - services/founder.ts's buildFounderOperationsCenter() is deliberately
 *     NOT reused for this page's Failed Jobs / Dead-Letter Jobs / Recent Job
 *     Events sections: its failedJobs/recentExceptions numbers are a
 *     platform-wide blend across BackgroundJob, DeadLetterJob, AND
 *     OutboxEvent, across every source system (gateway, copilot,
 *     integrations) — not scoped to the one real queue, and not able to
 *     distinguish FAILED from DEAD_LETTERED (it sums them together as one
 *     "failedJobs" count and interleaves both into one "recentExceptions"
 *     feed). services/queue/reliability.ts's own state machine
 *     (markBackgroundJobFailed vs. moveToDeadLetter) proves these are two
 *     real, distinct terminal states, so this page queries BackgroundJob
 *     (status='FAILED') and DeadLetterJob directly and separately, each
 *     scoped to queueName='approval-classification'.
 *   - Verified independently (grepped for `new Queue(` / `new Worker(`
 *     across the whole codebase) that 'approval-classification'
 *     (services/queue/approvalQueue.ts + services/queue/worker.ts) is the
 *     ONLY real BullMQ queue/worker pair that exists. services/queue/
 *     jobRegistry.ts documents 24 job types across 9 distinct `queueName`
 *     values (content-processing, integration-sync, ai-processing,
 *     memory-graph, analytics, exports, notifications, retention) as
 *     forward-looking metadata, but grepping every enqueueIncomingMessage
 *     call site confirms none of them ever passes a `jobType` override —
 *     every real job in this codebase runs as 'approval.classify' on the
 *     'approval-classification' queue. This page therefore shows exactly
 *     one Queue Health card, never fabricating the other 8 registry names
 *     as if they were live queues.
 *   - WorkerHeartbeat: reliabilityWorkerId is process-specific
 *     (`hostname:pid`), so multiple rows can accumulate across worker
 *     process restarts. Reused pattern from System Health:
 *     `findFirst({ orderBy: { lastSeenAt: 'desc' } })` surfaces only the
 *     most-recently-active worker, never a stale historical list that would
 *     misleadingly imply multiple concurrent workers.
 *   - Recent Job Events: there is no dedicated event-log table — BackgroundJob
 *     only stores current-row state, not a history of transitions. This
 *     section is therefore built from the real timestamped state each row
 *     already carries (completedAt / failedAt / DeadLetterJob.lastFailedAt),
 *     scoped to this queue, merged and sorted — never a synthetic event
 *     stream and never inventing "routine success" rows beyond what
 *     completedAt already proves happened.
 */
import { prisma } from '@/lib/prisma';
import { getApprovalQueueCounts, approvalQueueName, type ApprovalQueueCountsResult } from '@/services/queue/approvalQueue';
import { computeWorkerState, computeQueueHealth, type QueueHealthState, type WorkerState } from '@/lib/founder-background-jobs';

const FAILED_JOBS_LIMIT = 25;
const DEAD_LETTER_JOBS_LIMIT = 25;
const RECENT_EVENTS_LIMIT = 10;

export type FailedJobRow = {
  id: string;
  jobType: string;
  organizationId: string;
  attemptNumber: number;
  maxAttempts: number;
  failureCategory: string | null;
  failureReason: string | null;
  failedAt: Date | null;
  createdAt: Date;
  correlationId: string;
};

export type DeadLetterJobRow = {
  id: string;
  jobType: string;
  organizationId: string;
  attemptCount: number;
  retryEligible: boolean;
  failureCategory: string;
  failureReason: string;
  firstFailedAt: Date;
  lastFailedAt: Date;
  correlationId: string;
};

export type RecentJobEvent = {
  id: string;
  kind: 'COMPLETED' | 'FAILED' | 'DEAD_LETTERED';
  jobType: string;
  occurredAt: Date;
  detail: string | null;
};

export type WorkerActivity = {
  state: WorkerState;
  workerId: string | null;
  hostname: string | null;
  currentJobType: string | null;
  currentJobId: string | null;
  lastSeenAt: Date | null;
};

export type BackgroundJobsReport = {
  generatedAt: Date;
  queueName: string;
  queueHealth: QueueHealthState;
  queueHeadline: string;
  counts: ApprovalQueueCountsResult;
  worker: WorkerActivity;
  failedJobsTotal: number;
  failedJobs: FailedJobRow[];
  deadLetterJobsTotal: number;
  deadLetterJobs: DeadLetterJobRow[];
  recentEvents: RecentJobEvent[];
};

export async function buildFounderBackgroundJobs(): Promise<BackgroundJobsReport> {
  const generatedAt = new Date();

  const [counts, workerHeartbeat, failedJobsTotal, failedJobs, deadLetterJobsTotal, deadLetterJobs, recentCompleted] = await Promise.all([
    getApprovalQueueCounts(),
    prisma.workerHeartbeat.findFirst({
      where: { queueName: approvalQueueName },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, hostname: true, currentJobType: true, currentJobId: true, lastSeenAt: true },
    }).catch(() => null),
    prisma.backgroundJob.count({ where: { queueName: approvalQueueName, status: 'FAILED' } }).catch(() => 0),
    prisma.backgroundJob.findMany({
      where: { queueName: approvalQueueName, status: 'FAILED' },
      orderBy: { failedAt: 'desc' },
      take: FAILED_JOBS_LIMIT,
      select: { id: true, jobType: true, organizationId: true, attemptNumber: true, maxAttempts: true, failureCategory: true, failureReason: true, failedAt: true, createdAt: true, correlationId: true },
    }).catch(() => []),
    prisma.deadLetterJob.count({ where: { queueName: approvalQueueName } }).catch(() => 0),
    prisma.deadLetterJob.findMany({
      where: { queueName: approvalQueueName },
      orderBy: { lastFailedAt: 'desc' },
      take: DEAD_LETTER_JOBS_LIMIT,
      select: { id: true, jobType: true, organizationId: true, attemptCount: true, retryEligible: true, failureCategory: true, failureReason: true, firstFailedAt: true, lastFailedAt: true, correlationId: true },
    }).catch(() => []),
    prisma.backgroundJob.findMany({
      where: { queueName: approvalQueueName, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: RECENT_EVENTS_LIMIT,
      select: { id: true, jobType: true, completedAt: true },
    }).catch(() => []),
  ]);

  const workerState = computeWorkerState(workerHeartbeat?.lastSeenAt ?? null);
  const { state: queueHealth, headline: queueHeadline } = computeQueueHealth(counts, workerState, failedJobsTotal);

  const recentEvents: RecentJobEvent[] = [
    ...recentCompleted
      .filter((job) => job.completedAt)
      .map((job): RecentJobEvent => ({ id: job.id, kind: 'COMPLETED', jobType: job.jobType, occurredAt: job.completedAt as Date, detail: null })),
    ...failedJobs
      .filter((job) => job.failedAt)
      .map((job): RecentJobEvent => ({ id: job.id, kind: 'FAILED', jobType: job.jobType, occurredAt: job.failedAt as Date, detail: job.failureReason })),
    ...deadLetterJobs.map((job): RecentJobEvent => ({ id: job.id, kind: 'DEAD_LETTERED', jobType: job.jobType, occurredAt: job.lastFailedAt, detail: job.failureReason })),
  ]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, RECENT_EVENTS_LIMIT);

  return {
    generatedAt,
    queueName: approvalQueueName,
    queueHealth,
    queueHeadline,
    counts,
    worker: {
      state: workerState,
      workerId: workerHeartbeat?.id ?? null,
      hostname: workerHeartbeat?.hostname ?? null,
      currentJobType: workerHeartbeat?.currentJobType ?? null,
      currentJobId: workerHeartbeat?.currentJobId ?? null,
      lastSeenAt: workerHeartbeat?.lastSeenAt ?? null,
    },
    failedJobsTotal,
    failedJobs,
    deadLetterJobsTotal,
    deadLetterJobs,
    recentEvents,
  };
}
