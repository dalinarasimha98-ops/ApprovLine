'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FounderDrawer } from './FounderDrawer';
import {
  SYSTEM_HEALTH_STATUS_LABELS,
  systemHealthTone,
  systemHealthDotColor,
  fmtDateTime,
  fmtRelativeTime,
  type SystemHealthStatus,
} from '@/lib/founder-system-health';
import type { SystemHealthCard, QueueSummary, IntegrationProviderSummary, RecentSystemEvent } from '@/services/founder-system-health';

// Client-safe mirrors of the service types — every Date field crosses the
// server/client boundary as an ISO string (Next.js can't serialize a Date
// through props), and fmtDateTime/fmtRelativeTime both already accept
// `Date | string`, so no parsing helper is needed beyond this renaming.
type SystemHealthCardClient = Omit<SystemHealthCard, 'lastChecked'> & { lastChecked: string };
type QueueSummaryClient = Omit<QueueSummary, 'workerLastSeenAt'> & { workerLastSeenAt: string | null };
type IntegrationProviderSummaryClient = Omit<IntegrationProviderSummary, 'lastCheck'> & { lastCheck: string | null };
type RecentSystemEventClient = Omit<RecentSystemEvent, 'occurredAt'> & { occurredAt: string };

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

function StatusBadge({ status }: { status: SystemHealthStatus }) {
  return <Badge tone={systemHealthTone(status)}>{SYSTEM_HEALTH_STATUS_LABELS[status]}</Badge>;
}

type Props = {
  generatedAt: string;
  overall: SystemHealthStatus;
  cards: SystemHealthCardClient[];
  queue: QueueSummaryClient;
  integrations: IntegrationProviderSummaryClient[];
  recentEvents: RecentSystemEventClient[];
};

export function SystemHealthClient({ generatedAt, overall, cards, queue, integrations, recentEvents }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<{ type: 'queue' } | { type: 'integration'; provider: IntegrationProviderSummaryClient } | null>(null);

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  const alertCards = cards.filter((c) => c.status !== 'HEALTHY');

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6 xl:col-start-1">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Platform Operations</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">System Health</h2>
              <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
                Real-time status of ApprovLine&rsquo;s core infrastructure, services, and background processing.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <p className="text-xs font-bold text-slate-500">
                Last updated<br />
                <span className="text-sm text-slate-700">{fmtDateTime(generatedAt)}</span>
              </p>
              <button
                type="button"
                onClick={refresh}
                disabled={pending}
                aria-busy={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </section>

        <section aria-label="Core system health" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-black text-slate-950">{card.label}</p>
                <StatusBadge status={card.status} />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-700">{card.headline}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{card.detail}</p>
              <p className="mt-3 text-[11px] font-bold text-slate-400">Last checked: {fmtRelativeTime(card.lastChecked)}</p>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Background Job Queues</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">The one real BullMQ queue in this application.</p>
              </div>
              <Link href="/founder/reliability" className="text-xs font-black text-[#2557dc] hover:underline">
                View all queues →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] table-fixed text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-[160px] px-4 py-2.5">Queue</th>
                    <th scope="col" className="w-[100px] px-3 py-2.5">Status</th>
                    <th scope="col" className="w-[70px] px-3 py-2.5 text-right">Waiting</th>
                    <th scope="col" className="w-[70px] px-3 py-2.5 text-right">Active</th>
                    <th scope="col" className="w-[70px] px-3 py-2.5 text-right">Failed</th>
                    <th scope="col" className="w-24 px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="truncate px-4 py-3 font-black text-slate-950">{queue.queueName}</td>
                    <td className="px-3 py-3">
                      {queue.available ? <Badge tone="green">Healthy</Badge> : <Badge tone="slate">Unavailable</Badge>}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{queue.counts ? queue.counts.waiting : '—'}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{queue.counts ? queue.counts.active : '—'}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{queue.counts ? queue.counts.failed : '—'}</td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" onClick={() => setDrawer({ type: 'queue' })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-100">
                        View →
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {!queue.available ? (
              <p className="border-t border-slate-100 px-6 py-3 text-xs font-semibold text-slate-500">Queue metrics are not currently available. {queue.unavailableReason}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Integration Providers</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Status of external integrations across all customers.</p>
              </div>
              <Link href="/founder/customer-integrations" className="text-xs font-black text-[#2557dc] hover:underline">
                View Integration Health →
              </Link>
            </div>
            {integrations.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm font-semibold text-slate-500">No integration connections recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] table-fixed text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-[160px] px-4 py-2.5">Provider</th>
                      <th scope="col" className="w-[110px] px-3 py-2.5">Status</th>
                      <th scope="col" className="w-[130px] px-3 py-2.5">Last Check</th>
                      <th scope="col" className="w-24 px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {integrations.map((row) => (
                      <tr key={row.provider} className="hover:bg-slate-50">
                        <td className="truncate px-4 py-3 font-black text-slate-950">{row.provider}</td>
                        <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                        <td className="truncate px-3 py-3 text-xs font-semibold text-slate-500" title={row.lastCheck ? fmtDateTime(row.lastCheck) : undefined}>
                          {row.lastCheck ? fmtRelativeTime(row.lastCheck) : 'Unknown'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => setDrawer({ type: 'integration', provider: row })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-100">
                            View →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Recent System Events</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Recorded background-job and outbox failures requiring attention.</p>
          </div>
          {recentEvents.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm font-semibold text-slate-500">No recent system events are recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] table-fixed text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-[190px] px-4 py-2.5">Time</th>
                    <th scope="col" className="w-[200px] px-3 py-2.5">Event</th>
                    <th scope="col" className="w-[90px] px-3 py-2.5">Status</th>
                    <th scope="col" className="px-3 py-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="truncate px-4 py-3 text-xs font-semibold text-slate-500" title={fmtDateTime(event.occurredAt)}>{fmtDateTime(event.occurredAt)}</td>
                      <td className="truncate px-3 py-3 font-bold text-slate-800" title={event.type}>{event.type}</td>
                      <td className="px-3 py-3"><Badge tone="red">Failed</Badge></td>
                      <td className="truncate px-3 py-3 text-xs font-semibold text-slate-500" title={event.failureReason ?? undefined}>
                        {event.failureReason ?? 'No failure reason recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="min-w-0 space-y-4 xl:col-start-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Overall Status</p>
          <div className="mt-3 flex items-center gap-2.5">
            <span className={`h-3 w-3 rounded-full ${systemHealthDotColor(overall)}`} aria-hidden="true" />
            <p className="text-xl font-black text-slate-950">{SYSTEM_HEALTH_STATUS_LABELS[overall]}</p>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-500">
            Last updated<br /><span className="text-slate-700">{fmtDateTime(generatedAt)}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Active Alerts</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">{alertCards.length}</span>
          </div>
          {alertCards.length === 0 ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">No active alerts. All observable systems are healthy.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {alertCards.map((card) => (
                <li key={card.key} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-black text-amber-900">{card.label}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-amber-700">{card.headline}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Recent Incidents</p>
          {recentEvents.length === 0 ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">No recent incidents are recorded.</p>
          ) : (
            <p className="mt-3 text-xs font-semibold text-slate-500">{recentEvents.length} recent system event{recentEvents.length === 1 ? '' : 's'} recorded below.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Quick Actions</p>
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Running…' : 'Run Full Health Check'}
            </button>
            <Link href="/founder/reliability" className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50">
              View Background Jobs →
            </Link>
            <Link href="/founder/customer-integrations" className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50">
              View Integration Health →
            </Link>
          </div>
        </div>
      </aside>

      {drawer?.type === 'queue' ? (
        <FounderDrawer onClose={() => setDrawer(null)} titleId="health-drawer-title" size="sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <h3 id="health-drawer-title" className="text-lg font-black text-slate-950">{queue.queueName}</h3>
              <p className="text-xs font-semibold text-slate-400">Background job queue detail</p>
            </div>
            <button type="button" onClick={() => setDrawer(null)} aria-label="Close queue details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Live Queue State</p>
              {queue.counts ? (
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="font-bold text-slate-400">Waiting</dt><dd className="mt-0.5 font-semibold text-slate-700">{queue.counts.waiting}</dd></div>
                  <div><dt className="font-bold text-slate-400">Active</dt><dd className="mt-0.5 font-semibold text-slate-700">{queue.counts.active}</dd></div>
                  <div><dt className="font-bold text-slate-400">Failed (retained)</dt><dd className="mt-0.5 font-semibold text-slate-700">{queue.counts.failed}</dd></div>
                  <div><dt className="font-bold text-slate-400">Completed (retained)</dt><dd className="mt-0.5 font-semibold text-slate-700">{queue.counts.completed}</dd></div>
                  <div><dt className="font-bold text-slate-400">Delayed</dt><dd className="mt-0.5 font-semibold text-slate-700">{queue.counts.delayed}</dd></div>
                </dl>
              ) : (
                <p className="text-xs font-semibold text-slate-500">Queue metrics are not currently available. {queue.unavailableReason}</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Worker</p>
              <p className="text-xs font-semibold text-slate-500">
                {queue.workerLastSeenAt
                  ? `${queue.workerOnline ? 'Online' : 'Not seen recently'} — last reported ${fmtRelativeTime(queue.workerLastSeenAt)}.`
                  : 'No worker has ever reported in.'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Reliability Backlog</p>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="font-bold text-slate-400">Failed jobs</dt><dd className="mt-0.5 font-semibold text-slate-700">{queue.reliabilityBacklog.failedJobs}</dd></div>
                <div><dt className="font-bold text-slate-400">Queue backlog</dt><dd className="mt-0.5 font-semibold text-slate-700">{queue.reliabilityBacklog.queueBacklogs}</dd></div>
              </dl>
            </div>
            <Link href="/founder/reliability" className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700">
              Open Background Jobs →
            </Link>
          </div>
        </FounderDrawer>
      ) : null}

      {drawer?.type === 'integration' ? (
        <FounderDrawer onClose={() => setDrawer(null)} titleId="health-drawer-title" size="sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <h3 id="health-drawer-title" className="text-lg font-black text-slate-950">{drawer.provider.provider}</h3>
              <p className="text-xs font-semibold text-slate-400">{drawer.provider.category}</p>
            </div>
            <button type="button" onClick={() => setDrawer(null)} aria-label="Close integration details" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-5 px-6 py-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Connection Summary</p>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="font-bold text-slate-400">Status</dt><dd className="mt-0.5"><StatusBadge status={drawer.provider.status} /></dd></div>
                <div><dt className="font-bold text-slate-400">Connected</dt><dd className="mt-0.5 font-semibold text-slate-700">{drawer.provider.connected} of {drawer.provider.total}</dd></div>
                <div><dt className="font-bold text-slate-400">Needs Attention</dt><dd className="mt-0.5 font-semibold text-slate-700">{drawer.provider.needsAttention}</dd></div>
                <div><dt className="font-bold text-slate-400">Last Check</dt><dd className="mt-0.5 font-semibold text-slate-700">{drawer.provider.lastCheck ? fmtDateTime(drawer.provider.lastCheck) : 'Unknown'}</dd></div>
              </dl>
            </div>
            <Link href="/founder/customer-integrations" className="block w-full rounded-xl bg-[#2557dc] px-4 py-2.5 text-center text-sm font-black text-white hover:bg-blue-700">
              Open Integration Health →
            </Link>
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
