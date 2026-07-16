import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { buildFounderObservabilityCenter } from '@/services/founder';

export const dynamic = 'force-dynamic';

type Tone = 'slate' | 'blue' | 'green' | 'amber' | 'red';

function toneForStatus(status: string): Tone {
  if (status === 'Healthy' || status === 'Resolved' || status === 'Low') return 'green';
  if (status === 'Warning' || status === 'Acknowledged' || status === 'Medium') return 'amber';
  if (status === 'Critical' || status === 'Open' || status === 'High') return 'red';
  return 'slate';
}

function StatusCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black text-slate-950">{label}</h3>
        <FounderBadge tone={toneForStatus(status)}>{status}</FounderBadge>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{detail}</p>
    </article>
  );
}

function MiniMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

export default async function FounderObservabilityPage() {
  const result = await buildFounderObservabilityCenter();
  const data = result.data;

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Enterprise Observability</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Monitoring Center</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Founder visibility into customer-impacting failures, integrations, AI services, queues, gateway ingestion, alerts, incidents, and platform performance.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Platform Status</p>
            <div className="mt-3 flex items-center gap-3">
              <FounderBadge tone={toneForStatus(data.platformStatus)}>{data.platformStatus}</FounderBadge>
              <p className="text-sm font-bold text-slate-600">Checked {data.generatedAt.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FounderMetricCard label="Approvals" value={data.totals.approvalCount} detail="Approval records available for operational impact analysis" />
        <FounderMetricCard label="Audit Events" value={data.totals.auditEvents} detail="Customer audit records available for traceability" />
        <FounderMetricCard label="Founder Actions" value={data.totals.founderAuditLogs} detail="Operational actions captured for auditability" />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-950">System Health Dashboard</h3>
          <FounderBadge tone="blue">Live snapshot</FounderBadge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.healthChecks.map((check) => (
            <StatusCard key={check.key} label={check.label} status={check.status} detail={check.detail} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Error Tracking</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">Failure categories</h3>
            </div>
            <FounderBadge tone="blue">Sentry ready</FounderBadge>
          </div>
          <div className="mt-5 grid gap-3">
            {data.errorSummary.map((error) => (
              <div key={error.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-slate-950">{error.label}</p>
                  <div className="flex items-center gap-2">
                    <FounderBadge tone={toneForStatus(error.severity)}>{error.severity}</FounderBadge>
                    <span className="text-sm font-black text-slate-700">{error.count}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{error.detail}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{error.affectedCustomers} affected customers</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Customer Impact</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">Recent impacted workspaces</h3>
            </div>
            <FounderBadge tone={data.customerImpacts.length ? 'amber' : 'green'}>{data.customerImpacts.length ? 'Review' : 'Clear'}</FounderBadge>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Feature</th>
                  <th className="px-4 py-3">Impact</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.customerImpacts.length ? data.customerImpacts.map((impact) => (
                  <tr key={`${impact.customer}-${impact.feature}-${impact.lastSeen.toISOString()}`} className="bg-white">
                    <td className="px-4 py-3 font-black text-slate-950">
                      {impact.customer}
                      <span className="block text-xs font-semibold text-slate-500">{impact.workspace}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-700">{impact.feature}</td>
                    <td className="max-w-xs px-4 py-3 font-semibold text-slate-600">{impact.impact}</td>
                    <td className="px-4 py-3"><FounderBadge tone={toneForStatus(impact.severity)}>{impact.severity}</FounderBadge></td>
                    <td className="px-4 py-3 font-black text-slate-700">{impact.affectedUsers}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-4 py-8 text-center font-bold text-slate-500">No customer-impacting failures detected.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Integration Monitoring</p>
            <h3 className="mt-2 text-xl font-black text-slate-950">Connector health by provider</h3>
          </div>
          <FounderBadge tone="blue">Slack Gmail Teams Outlook Jira Zoom ServiceNow Gateway</FounderBadge>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Connected</th>
                <th className="px-4 py-3">Failed</th>
                <th className="px-4 py-3">Success</th>
                <th className="px-4 py-3">Latency</th>
                <th className="px-4 py-3">Last Sync</th>
                <th className="px-4 py-3">Error Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.integrations.map((integration) => (
                <tr key={integration.provider} className="bg-white">
                  <td className="px-4 py-3 font-black text-slate-950">
                    {integration.provider}
                    <span className="block text-xs font-semibold text-slate-500">{integration.category}</span>
                  </td>
                  <td className="px-4 py-3"><FounderBadge tone={toneForStatus(integration.status)}>{integration.status}</FounderBadge></td>
                  <td className="px-4 py-3 font-black text-slate-700">{integration.connected}</td>
                  <td className="px-4 py-3 font-black text-slate-700">{integration.failed}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{integration.successRate}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{integration.latency}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{integration.lastSync}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{integration.errorRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">AI Monitoring</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Copilot, Playbook AI, Memory Graph</h3>
          <div className="mt-5 grid gap-3">
            {data.aiMetrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <MiniMetric label={metric.label} value={metric.value} detail={metric.detail} />
                  <FounderBadge tone={toneForStatus(metric.status)}>{metric.status}</FounderBadge>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Gateway Monitoring</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Universal ingestion path</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.gatewayMetrics.map((metric) => <MiniMetric key={metric.label} {...metric} />)}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Queue Monitoring</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Jobs and retries</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.queueMetrics.map((metric) => <MiniMetric key={metric.label} {...metric} />)}
          </div>
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900">
            Retry and failure-reason actions are audited through FounderAuditLog when operational write actions are enabled.
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Alert Center</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Operational alerts</h3>
          <div className="mt-5 grid gap-3">
            {data.alerts.map((alert) => (
              <div key={alert.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-slate-950">{alert.title}</p>
                  <div className="flex gap-2">
                    <FounderBadge tone={toneForStatus(alert.severity)}>{alert.severity}</FounderBadge>
                    <FounderBadge tone={toneForStatus(alert.status)}>{alert.status}</FounderBadge>
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{alert.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Founder Incident Center</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Open incident candidates</h3>
          <div className="mt-5 grid gap-3">
            {data.incidents.length ? data.incidents.map((incident) => (
              <div key={incident.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-slate-950">{incident.title}</p>
                  <FounderBadge tone={toneForStatus(incident.severity)}>{incident.severity}</FounderBadge>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{incident.rootCause}</p>
                <p className="mt-2 text-xs font-bold text-slate-500">{incident.timeline} {incident.affectedCustomers} customers affected.</p>
              </div>
            )) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">
                No active incident candidates detected.
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Performance Dashboard</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Latency and rendering signals</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {data.performance.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <MiniMetric label={metric.label} value={metric.value} detail={metric.detail} />
                  <FounderBadge tone={toneForStatus(metric.status)}>{metric.status}</FounderBadge>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Auditability</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Operational actions are recorded</h3>
          <div className="mt-5 grid gap-3">
            {['Retry Job', 'Dismiss Alert', 'Resolve Incident', 'Acknowledge Incident'].map((action) => (
              <div key={action} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-black text-slate-950">{action}</p>
                <FounderBadge tone="green">Audited</FounderBadge>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
