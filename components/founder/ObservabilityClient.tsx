'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FounderDrawer } from './FounderDrawer';
import {
  fmtDateTime,
  fmtRelativeTime,
  OBSERVABILITY_SEVERITY_LABELS,
  observabilitySeverityTone,
  type ObservabilitySeverity,
} from '@/lib/founder-observability';
import { SYSTEM_HEALTH_STATUS_LABELS, systemHealthTone, type SystemHealthStatus } from '@/lib/founder-system-health';
import type {
  ObservabilityAttentionSignal,
  ObservabilityApplicationErrorRow,
  ObservabilityOperationalSignalRow,
  ObservabilityDependency,
  ObservabilityKpis,
  ObservabilityAvailability,
} from '@/services/founder-observability';

type AttentionClient = Omit<ObservabilityAttentionSignal, 'lastSeen'> & { lastSeen: string };
type ApplicationErrorClient = Omit<ObservabilityApplicationErrorRow, 'occurredAt'> & { occurredAt: string };
type OperationalSignalClient = Omit<ObservabilityOperationalSignalRow, 'occurredAt'> & { occurredAt: string };

type PlatformStatus = SystemHealthStatus | 'UNKNOWN';

type Props = {
  generatedAt: string;
  platformStatus: PlatformStatus;
  kpis: ObservabilityKpis;
  attention: AttentionClient[];
  dependencies: ObservabilityDependency[];
  applicationErrors: ApplicationErrorClient[];
  operationalSignals: OperationalSignalClient[];
  sentryConfigured: boolean;
  availability: ObservabilityAvailability;
};

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

function SeverityBadge({ severity }: { severity: ObservabilitySeverity }) {
  return <Badge tone={observabilitySeverityTone(severity)}>{OBSERVABILITY_SEVERITY_LABELS[severity]}</Badge>;
}

function PlatformStatusBadge({ status }: { status: PlatformStatus }) {
  if (status === 'UNKNOWN') return <Badge tone="slate">Unknown</Badge>;
  return <Badge tone={systemHealthTone(status)}>{SYSTEM_HEALTH_STATUS_LABELS[status]}</Badge>;
}

// Minimal inline stroke icons matching this console's established icon
// language (thin strokes, rounded caps). No icon library is introduced.
function KpiIcon({ kind }: { kind: 'errors' | 'attention' | 'jobs' | 'integrations' | 'incidents' | 'performance' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'errors') return <svg {...common}><path d="M12 3l9 16H3l9-16z" /><path d="M12 10v4M12 17.5v.01" /></svg>;
  if (kind === 'attention') return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 15.5v.01" /></svg>;
  if (kind === 'jobs') return <svg {...common}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
  if (kind === 'integrations') return <svg {...common}><path d="M9 7H6a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h3M15 7h3a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3h-3" /><path d="M8 10h8" /></svg>;
  if (kind === 'incidents') return <svg {...common}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M12 8v4.5M12 15.5v.01" /></svg>;
  return <svg {...common}><path d="M4 19h16M4 19V9M9 19v-6M14 19V6M19 19v-9" /></svg>;
}

function KpiCard({ kind, tone, label, value, detail }: { kind: Parameters<typeof KpiIcon>[0]['kind']; tone: 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'purple'; label: string; value: string | number; detail: string }) {
  const iconBox = {
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-500',
    blue: 'bg-blue-50 text-[#2557dc]',
    purple: 'bg-violet-50 text-violet-600',
  }[tone];
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconBox}`}>
          <KpiIcon kind={kind} />
        </span>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
    </div>
  );
}

export function ObservabilityClient({ generatedAt, platformStatus, kpis, attention, dependencies, applicationErrors, operationalSignals, sentryConfigured, availability }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [rightTab, setRightTab] = useState<'overview' | 'incidents' | 'help'>('overview');
  const [drawerSignal, setDrawerSignal] = useState<AttentionClient | null>(null);

  function refresh() {
    if (refreshing) return;
    startRefresh(() => router.refresh());
  }

  const topIncidents = attention.slice(0, 5);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Internal Tools</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Observability</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Monitor application errors, operational signals, integrations, background processing, and platform performance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-right text-xs font-bold text-slate-500">
              Last checked<br />
              <span className="text-sm text-slate-700">{fmtDateTime(generatedAt)}</span>
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true" className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Observability KPIs" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard kind="errors" tone="red" label="Application Errors" value={kpis.applicationErrors24h ?? 'Not available'} detail="Last 24 hours" />
            <KpiCard kind="attention" tone="amber" label="Operational Attention" value={kpis.operationalAttentionCount} detail="Signals needing review" />
            <KpiCard kind="jobs" tone="purple" label="Failed Jobs" value={kpis.failedJobs} detail="Retained in the queue" />
            <KpiCard kind="integrations" tone="blue" label="Integration Failures" value={kpis.integrationFailures} detail="Customer integrations" />
            <KpiCard kind="incidents" tone="red" label="Active Incident Signals" value={kpis.activeIncidentSignals} detail="Critical severity" />
            <KpiCard kind="performance" tone="slate" label="Performance" value="Not instrumented" detail="Request latency" />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Founder Attention</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Observability Attention</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">Operational signals that may require founder attention.</p>
              </div>
              <Link href="/founder/system-health" className="text-xs font-black text-[#2557dc] hover:underline">
                View all →
              </Link>
            </div>
            {attention.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-5 text-center">
                <p className="text-sm font-bold text-emerald-800">No operational signals require attention right now.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                  <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-24 py-2">Severity</th>
                      <th scope="col" className="w-44 py-2">Signal</th>
                      <th scope="col" className="w-28 py-2">Area</th>
                      <th scope="col" className="w-28 py-2">Last Seen</th>
                      <th scope="col" className="w-16 py-2">Count</th>
                      <th scope="col" className="w-36 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attention.map((signal) => (
                      <tr key={signal.id}>
                        <td className="py-3"><SeverityBadge severity={signal.severity} /></td>
                        <td className="py-3">
                          <button type="button" onClick={() => setDrawerSignal(signal)} className="block w-full whitespace-normal break-words text-left font-bold text-slate-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc]">
                            {signal.signal}
                          </button>
                        </td>
                        <td className="py-3 text-xs font-semibold text-slate-500">{signal.area}</td>
                        <td className="py-3 text-xs font-semibold text-slate-500" title={fmtDateTime(signal.lastSeen)}>{fmtRelativeTime(signal.lastSeen)}</td>
                        <td className="py-3 text-xs font-bold text-slate-700">{signal.count ?? '—'}</td>
                        <td className="py-3 text-right">
                          <Link href={signal.actionHref} className="text-xs font-black text-[#2557dc] hover:underline">
                            {signal.actionLabel} →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Application Errors</p>
                  <h3 className="mt-1 text-sm font-black text-slate-950">Recent application errors</h3>
                </div>
              </div>
              {!availability.systemHealth ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">System status is temporarily unavailable.</p>
              ) : applicationErrors.length === 0 ? (
                <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-500">No application errors in the last 24 hours.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {applicationErrors.slice(0, 6).map((row) => (
                    <li key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-black text-slate-900">{row.area}</p>
                        <p className="shrink-0 text-[11px] font-semibold text-slate-500" title={fmtDateTime(row.occurredAt)}>{fmtRelativeTime(row.occurredAt)}</p>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-600">{row.error}</p>
                    </li>
                  ))}
                </ul>
              )}
              {!sentryConfigured ? (
                <p className="mt-3 text-[11px] font-semibold text-slate-400">
                  Sentry is not configured, so frontend/browser error telemetry is not available from this environment — the rows above are ingestion-pipeline failures only.
                </p>
              ) : null}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Operational Signals</p>
              <h3 className="mt-1 text-sm font-black text-slate-950">Recent queue activity</h3>
              {!availability.backgroundJobs ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Background job status is temporarily unavailable.</p>
              ) : operationalSignals.length === 0 ? (
                <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-500">No recent queue activity recorded.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {operationalSignals.slice(0, 6).map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{row.category}</p>
                        <p className="truncate text-xs font-semibold text-slate-700">{row.message}</p>
                      </div>
                      <p className="shrink-0 text-[11px] font-semibold text-slate-500" title={fmtDateTime(row.occurredAt)}>{fmtRelativeTime(row.occurredAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Platform Dependencies</p>
            <h3 className="mt-1 text-sm font-black text-slate-950">Core platform services and their current status</h3>
            {dependencies.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Platform dependency status is temporarily unavailable.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dependencies.map((dep) => (
                  <Link key={dep.key} href={dep.actionHref} className="block rounded-xl border border-slate-200 p-3.5 transition hover:border-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-slate-950">{dep.label}</p>
                      <span className={`h-2 w-2 rounded-full ${{ HEALTHY: 'bg-emerald-500', DEGRADED: 'bg-amber-500', FAILED: 'bg-rose-500', UNKNOWN: 'bg-slate-400' }[dep.status]}`} aria-hidden="true" />
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{SYSTEM_HEALTH_STATUS_LABELS[dep.status]}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-400">{dep.detail}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right command panel */}
        <aside className="space-y-0">
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3.5">
              <h3 className="text-base font-black text-slate-950">Observability</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Platform health and operational insights.</p>
            </div>
            <div className="flex border-b border-slate-100 px-2" role="tablist" aria-label="Observability panel">
              {(['overview', 'incidents', 'help'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={rightTab === tab}
                  onClick={() => setRightTab(tab)}
                  className={`whitespace-normal border-b-2 px-3 py-2 text-left text-xs font-black transition ${rightTab === tab ? 'border-[#2557dc] text-[#2557dc]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {tab === 'overview' ? 'Overview' : tab === 'incidents' ? 'Recent Incidents' : 'Help'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {rightTab === 'overview' ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Quick Actions</p>
                    <div className="mt-3 space-y-2">
                      <Link href="/founder/system-health" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl bg-[#2557dc] px-4 py-3 text-left text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
                        View System Health <span aria-hidden="true">→</span>
                      </Link>
                      <Link href="/founder/integration-health" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50">
                        View Integration Health <span aria-hidden="true">→</span>
                      </Link>
                      <Link href="/founder/background-jobs" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50">
                        View Background Jobs <span aria-hidden="true">→</span>
                      </Link>
                      <Link href="/founder/audit" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50">
                        View Founder Audit Logs <span aria-hidden="true">→</span>
                      </Link>
                      <Link href="/founder/security" className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50">
                        View Security <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Current Status</p>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black text-slate-950">
                          {platformStatus === 'HEALTHY' ? 'Platform Operational' : platformStatus === 'DEGRADED' ? 'Platform Degraded' : platformStatus === 'FAILED' ? 'Platform Failure Detected' : 'Status Unknown'}
                        </p>
                        <PlatformStatusBadge status={platformStatus} />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-500">Last checked {fmtRelativeTime(generatedAt)}</p>
                    </div>
                  </div>
                </div>
              ) : rightTab === 'incidents' ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Recent Incidents</p>
                  {topIncidents.length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                      <p className="text-xs font-bold text-slate-600">No active incident signals.</p>
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {topIncidents.map((signal) => (
                        <li key={signal.id}>
                          <button
                            type="button"
                            onClick={() => setDrawerSignal(signal)}
                            className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left transition hover:border-slate-300"
                          >
                            <div className="min-w-0">
                              <p className={`truncate text-xs font-black ${signal.severity === 'CRITICAL' ? 'text-rose-700' : signal.severity === 'HIGH' ? 'text-amber-700' : 'text-slate-800'}`}>{signal.signal}</p>
                              <p className="text-[11px] font-semibold text-slate-500">{fmtRelativeTime(signal.lastSeen)}</p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href="#" onClick={(e) => { e.preventDefault(); setRightTab('overview'); }} className="mt-3 inline-block text-xs font-black text-[#2557dc] hover:underline">
                    View All Incidents →
                  </Link>
                </div>
              ) : (
                <div className="space-y-4 text-xs font-semibold leading-5 text-slate-600">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">About Observability</p>
                    <p className="mt-1.5">This page aggregates operational signals from across the ApprovLine platform. For detailed diagnostics, use the dedicated System Health, Integration Health, Background Jobs, and Security pages linked in Quick Actions.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">What counts as an attention signal</p>
                    <p className="mt-1.5">Only real, currently-observed conditions — a degraded dependency, failed jobs, integration failures, or a security finding — ever appear here. Nothing is fabricated or estimated.</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Performance</p>
                    <p className="mt-1.5">Request/API latency telemetry is not currently instrumented in this environment, so it is honestly reported as &ldquo;Not instrumented&rdquo; rather than estimated.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {drawerSignal ? (
        <FounderDrawer onClose={() => setDrawerSignal(null)} titleId="observability-signal-title" size="sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <h3 id="observability-signal-title" className="text-lg font-black text-slate-950">Signal detail</h3>
            <button type="button" onClick={() => setDrawerSignal(null)} aria-label="Close signal detail" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-4 px-6 py-5">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={drawerSignal.severity} />
              <span className="text-xs font-bold text-slate-500">{drawerSignal.area}</span>
            </div>
            <p className="text-sm font-black text-slate-950">{drawerSignal.signal}</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Observed At</p>
              <p className="mt-1 text-sm font-bold text-slate-800">{fmtDateTime(drawerSignal.lastSeen)}</p>
            </div>
            {drawerSignal.count !== null ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Count</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{drawerSignal.count}</p>
              </div>
            ) : null}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Recommended Action</p>
              <Link href={drawerSignal.actionHref} className="mt-2 inline-block text-sm font-black text-[#2557dc] hover:underline">
                {drawerSignal.actionLabel} →
              </Link>
            </div>
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}
