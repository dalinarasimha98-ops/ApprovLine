'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FounderDrawer } from './FounderDrawer';
import {
  QUEUE_HEALTH_LABELS,
  queueHealthTone,
  WORKER_STATE_LABELS,
  workerStateTone,
  failureCategoryLabel,
  truncateReason,
  fmtDateTime,
  fmtRelativeTime,
  type QueueHealthState,
  type WorkerState,
} from '@/lib/founder-background-jobs';
import type { ApprovalQueueCountsResult } from '@/services/queue/approvalQueue';
import type { FailedJobRow, DeadLetterJobRow, RecentJobEvent, WorkerActivity } from '@/services/founder-background-jobs';

// Client-safe mirrors — every Date field crosses the server/client boundary
// as an ISO string (matches SystemHealthClient's / IntegrationHealthClient's
// own convention).
type FailedJobRowClient = Omit<FailedJobRow, 'failedAt' | 'createdAt'> & { failedAt: string | null; createdAt: string };
type DeadLetterJobRowClient = Omit<DeadLetterJobRow, 'firstFailedAt' | 'lastFailedAt'> & { firstFailedAt: string; lastFailedAt: string };
type RecentJobEventClient = Omit<RecentJobEvent, 'occurredAt'> & { occurredAt: string };
type WorkerActivityClient = Omit<WorkerActivity, 'lastSeenAt'> & { lastSeenAt: string | null };

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'slate'; children: React.ReactNode }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide ${classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${{ green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', slate: 'bg-slate-400' }[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function QueueHealthBadge({ state }: { state: QueueHealthState }) {
  return <Badge tone={queueHealthTone(state)}>{QUEUE_HEALTH_LABELS[state]}</Badge>;
}

function WorkerStateBadge({ state }: { state: WorkerState }) {
  return <Badge tone={workerStateTone(state)}>{WORKER_STATE_LABELS[state]}</Badge>;
}

const EVENT_KIND_LABELS: Record<RecentJobEventClient['kind'], string> = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  DEAD_LETTERED: 'Dead-lettered',
};

const EVENT_KIND_TONE: Record<RecentJobEventClient['kind'], 'green' | 'amber' | 'red' | 'slate'> = {
  COMPLETED: 'green',
  FAILED: 'amber',
  DEAD_LETTERED: 'red',
};

type Props = {
  generatedAt: string;
  queueName: string;
  queueHealth: QueueHealthState;
  queueHeadline: string;
  counts: ApprovalQueueCountsResult;
  worker: WorkerActivityClient;
  failedJobsTotal: number;
  failedJobs: FailedJobRowClient[];
  deadLetterJobsTotal: number;
  deadLetterJobs: DeadLetterJobRowClient[];
  recentEvents: RecentJobEventClient[];
};

export function BackgroundJobsClient({
  generatedAt,
  queueName,
  queueHealth,
  queueHeadline,
  counts,
  worker,
  failedJobsTotal,
  failedJobs,
  deadLetterJobsTotal,
  deadLetterJobs,
  recentEvents,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function refresh() {
    if (pending) return; // never fire a second refresh while one is already in flight
    startTransition(() => {
      router.refresh();
    });
  }

  const kpis = [
    { label: 'Queues', value: '1' },
    { label: 'Waiting', value: counts.ok ? String(counts.counts.waiting) : '—' },
    { label: 'Active', value: counts.ok ? String(counts.counts.active) : '—' },
    { label: 'Failed', value: String(failedJobsTotal) },
    { label: 'Dead Letters', value: String(deadLetterJobsTotal) },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Platform Operations</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Background Jobs</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Live status of ApprovLine&rsquo;s background processing queue, workers, and failures.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-right text-xs font-bold text-slate-500">
              Last updated<br />
              <span className="text-sm text-slate-700">{fmtDateTime(generatedAt)}</span>
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              aria-busy={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true" className={pending ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
              {pending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      <section aria-label="Background job metrics" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{kpi.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{kpi.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Queue health" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Queue Health</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">The one real BullMQ queue in this application.</p>
          </div>
        </div>
        <div className="p-5">
          <article className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-black text-slate-950">{queueName}</p>
                <QueueHealthBadge state={queueHealth} />
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-600">{queueHeadline}</p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="shrink-0 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 sm:self-auto"
            >
              View details →
            </button>
          </article>
          {!counts.ok ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">Queue metrics are not currently available. {counts.reason}</p>
          ) : null}
        </div>
      </section>

      <section aria-label="Worker activity" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Worker Activity</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-400">The most recently active worker process for this queue.</p>
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <WorkerStateBadge state={worker.state} />
            <p className="text-sm font-semibold text-slate-600">
              {worker.lastSeenAt ? `Last reported ${fmtRelativeTime(worker.lastSeenAt)}` : 'No worker has ever reported in.'}
            </p>
          </div>
          {worker.currentJobType ? (
            <p className="text-xs font-semibold text-slate-500">Currently processing: <span className="font-black text-slate-700">{worker.currentJobType}</span></p>
          ) : null}
        </div>
      </section>

      <section aria-label="Failed jobs" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Failed Jobs</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
              {failedJobsTotal > failedJobs.length ? `Showing ${failedJobs.length} of ${failedJobsTotal} retained failures.` : 'Jobs that exhausted their retries.'}
            </p>
          </div>
        </div>
        {!counts.ok ? (
          <p className="px-6 py-5 text-center text-sm font-semibold text-slate-500">Failed job data is not currently available.</p>
        ) : failedJobs.length === 0 ? (
          <p className="px-6 py-5 text-center text-sm font-semibold text-slate-500">No failed jobs recorded.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 sm:hidden">
              {failedJobs.map((job) => (
                <li key={job.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-black text-slate-950">{job.jobType}</p>
                    <Badge tone="red">{failureCategoryLabel(job.failureCategory)}</Badge>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">Attempt {job.attemptNumber} of {job.maxAttempts}</p>
                  <p className="text-xs font-semibold text-slate-500">{job.failedAt ? fmtDateTime(job.failedAt) : 'Unknown time'}</p>
                  <p className="text-xs font-semibold text-slate-600">{job.failureReason ? truncateReason(job.failureReason) : 'No reason recorded'}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-[180px] px-4 py-2.5">Job</th>
                    <th scope="col" className="w-[130px] px-3 py-2.5">Category</th>
                    <th scope="col" className="w-[90px] px-3 py-2.5">Attempts</th>
                    <th scope="col" className="w-[150px] px-3 py-2.5">Failed At</th>
                    <th scope="col" className="px-3 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {failedJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="truncate px-4 py-3 font-black text-slate-950" title={job.jobType}>{job.jobType}</td>
                      <td className="px-3 py-3"><Badge tone="red">{failureCategoryLabel(job.failureCategory)}</Badge></td>
                      <td className="px-3 py-3 font-bold text-slate-700">{job.attemptNumber}/{job.maxAttempts}</td>
                      <td className="truncate px-3 py-3 text-xs font-semibold text-slate-500" title={job.failedAt ? fmtDateTime(job.failedAt) : undefined}>
                        {job.failedAt ? fmtDateTime(job.failedAt) : 'Unknown'}
                      </td>
                      <td className="truncate px-3 py-3 text-xs font-semibold text-slate-500" title={job.failureReason ?? undefined}>
                        {job.failureReason ? truncateReason(job.failureReason) : 'No reason recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-label="Dead-letter jobs" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Dead-Letter Jobs</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
              {deadLetterJobsTotal > deadLetterJobs.length ? `Showing ${deadLetterJobs.length} of ${deadLetterJobsTotal} dead-lettered jobs.` : 'Jobs permanently escalated after unrecoverable failure — distinct from retryable failed jobs above.'}
            </p>
          </div>
        </div>
        {deadLetterJobs.length === 0 ? (
          <p className="px-6 py-5 text-center text-sm font-semibold text-slate-500">No dead-letter jobs recorded.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 sm:hidden">
              {deadLetterJobs.map((job) => (
                <li key={job.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-black text-slate-950">{job.jobType}</p>
                    <Badge tone="red">{failureCategoryLabel(job.failureCategory)}</Badge>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{job.attemptCount} attempt{job.attemptCount === 1 ? '' : 's'} · {job.retryEligible ? 'Retry eligible' : 'Not retry eligible'}</p>
                  <p className="text-xs font-semibold text-slate-500">{fmtDateTime(job.lastFailedAt)}</p>
                  <p className="text-xs font-semibold text-slate-600">{truncateReason(job.failureReason)}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[780px] table-fixed text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-[180px] px-4 py-2.5">Job</th>
                    <th scope="col" className="w-[130px] px-3 py-2.5">Category</th>
                    <th scope="col" className="w-[90px] px-3 py-2.5">Attempts</th>
                    <th scope="col" className="w-[110px] px-3 py-2.5">Retryable</th>
                    <th scope="col" className="w-[150px] px-3 py-2.5">Last Failed</th>
                    <th scope="col" className="px-3 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deadLetterJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="truncate px-4 py-3 font-black text-slate-950" title={job.jobType}>{job.jobType}</td>
                      <td className="px-3 py-3"><Badge tone="red">{failureCategoryLabel(job.failureCategory)}</Badge></td>
                      <td className="px-3 py-3 font-bold text-slate-700">{job.attemptCount}</td>
                      <td className="px-3 py-3">{job.retryEligible ? <Badge tone="amber">Eligible</Badge> : <Badge tone="slate">No</Badge>}</td>
                      <td className="truncate px-3 py-3 text-xs font-semibold text-slate-500" title={fmtDateTime(job.lastFailedAt)}>{fmtDateTime(job.lastFailedAt)}</td>
                      <td className="truncate px-3 py-3 text-xs font-semibold text-slate-500" title={job.failureReason}>{truncateReason(job.failureReason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section aria-label="Recent job events" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Recent Job Events</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Real completions, failures, and dead-letter escalations for this queue.</p>
        </div>
        {recentEvents.length === 0 ? (
          <div className="px-6 py-5 text-center">
            <p className="text-sm font-black text-slate-700">No recent job events</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Job activity will appear here once processed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-[190px] px-4 py-2.5">Time</th>
                  <th scope="col" className="w-[180px] px-3 py-2.5">Job</th>
                  <th scope="col" className="w-[110px] px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentEvents.map((event) => (
                  <tr key={`${event.kind}-${event.id}`}>
                    <td className="truncate px-4 py-3 text-xs font-semibold text-slate-500" title={fmtDateTime(event.occurredAt)}>{fmtDateTime(event.occurredAt)}</td>
                    <td className="truncate px-3 py-3 font-bold text-slate-800" title={event.jobType}>{event.jobType}</td>
                    <td className="px-3 py-3"><Badge tone={EVENT_KIND_TONE[event.kind]}>{EVENT_KIND_LABELS[event.kind]}</Badge></td>
                    <td className="truncate px-3 py-3 text-xs font-semibold text-slate-500" title={event.detail ?? undefined}>{event.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <FounderDrawer onClose={() => setDrawerOpen(false)} titleId="background-jobs-drawer-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <h3 id="background-jobs-drawer-title" className="text-lg font-black text-slate-950">{queueName}</h3>
              <p className="text-xs font-semibold text-slate-400">Queue detail</p>
            </div>
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close queue details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Status</p>
              <div className="flex items-center gap-2">
                <QueueHealthBadge state={queueHealth} />
                <p className="text-xs font-semibold text-slate-600">{queueHeadline}</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Current State</p>
              {counts.ok ? (
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="font-bold text-slate-400">Waiting</dt><dd className="mt-0.5 font-semibold text-slate-700">{counts.counts.waiting}</dd></div>
                  <div><dt className="font-bold text-slate-400">Active</dt><dd className="mt-0.5 font-semibold text-slate-700">{counts.counts.active}</dd></div>
                  <div><dt className="font-bold text-slate-400">Failed (retained)</dt><dd className="mt-0.5 font-semibold text-slate-700">{counts.counts.failed}</dd></div>
                  <div><dt className="font-bold text-slate-400">Completed (retained)</dt><dd className="mt-0.5 font-semibold text-slate-700">{counts.counts.completed}</dd></div>
                  <div><dt className="font-bold text-slate-400">Delayed</dt><dd className="mt-0.5 font-semibold text-slate-700">{counts.counts.delayed}</dd></div>
                </dl>
              ) : (
                <p className="text-xs font-semibold text-slate-500">Queue metrics are not currently available. {counts.reason}</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Worker</p>
              <div className="flex items-center gap-2">
                <WorkerStateBadge state={worker.state} />
                <p className="text-xs font-semibold text-slate-600">
                  {worker.lastSeenAt ? `Last reported ${fmtRelativeTime(worker.lastSeenAt)}` : 'No worker has ever reported in.'}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Recent Failures</p>
              {failedJobs.length === 0 ? (
                <p className="text-xs font-semibold text-slate-500">No failed jobs recorded.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {failedJobs.slice(0, 5).map((job) => (
                    <li key={job.id} className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-700">{job.jobType}</span>
                      <span className="shrink-0 text-slate-400">{job.failedAt ? fmtRelativeTime(job.failedAt) : 'Unknown'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Dead Letters</p>
              {deadLetterJobs.length === 0 ? (
                <p className="text-xs font-semibold text-slate-500">No dead-letter jobs recorded.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {deadLetterJobs.slice(0, 5).map((job) => (
                    <li key={job.id} className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-slate-700">{job.jobType}</span>
                      <span className="shrink-0 text-slate-400">{fmtRelativeTime(job.lastFailedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
