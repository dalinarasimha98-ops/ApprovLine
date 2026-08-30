import { redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { Zap, FileText, CheckSquare, Layers, Activity, Clock } from 'lucide-react';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';
import { withTimeout } from '@/lib/performance';
import { buildGatewayMetrics, seedUniversalGatewayDemo } from '@/services/gateway/universalGateway';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { RefreshButton } from '@/components/system/RefreshButton';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { KPICard } from '@/components/analytics/KPICard';
import { SVGDonutChart } from '@/components/analytics/SVGDonutChart';
import { SVGLineChart } from '@/components/analytics/SVGLineChart';
import { GatewayFlowDiagram } from '@/components/gateway/GatewayFlowDiagram';
import type React from 'react';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const nf = (n: number) => new Intl.NumberFormat('en-US').format(n);

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: '#10B981', SYNCING: '#3B82F6', DISCONNECTED: '#64748B',
  NEEDS_REAUTH: '#F59E0B', ERROR: '#EF4444',
};
const INTEGRATION_LABELS: Record<string, string> = {
  SLACK: 'Slack', GMAIL: 'Gmail', OUTLOOK: 'Outlook', MICROSOFT_TEAMS: 'Teams',
  JIRA: 'Jira', SERVICENOW: 'ServiceNow', ZOOM: 'Zoom', CUSTOM: 'Custom',
};
const PROVIDER_COLORS: Record<string, string> = {
  slack: '#4A154B', gmail: '#EA4335', teams: '#6264A7', microsoft_teams: '#6264A7',
  outlook: '#0078D4', jira: '#0052CC', servicenow: '#62D84E', zoom: '#2D8CFF',
  sap: '#0FAAFF', oracle: '#F80000', coupa: '#C02E37', workday: '#F38023',
  salesforce: '#00A1E0', hubspot: '#FF7A59', custom: '#7C3AED',
};
const providerColor = (key: string) => PROVIDER_COLORS[key.toLowerCase()] ?? '#64748B';
const providerLabel = (key: string) => INTEGRATION_LABELS[key.toUpperCase()] ?? key;

// ---------------------------------------------------------------------------
// Server action (preserved from original)
// ---------------------------------------------------------------------------
async function seedGatewayDemoAction() {
  'use server';
  const tenant = await getDashboardTenant(2500);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status !== 'ready' || !tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/dashboard/gateway', tenant.user.role);
  await seedUniversalGatewayDemo(tenant.organization.id);
  revalidatePath('/dashboard/gateway');
  redirect('/dashboard/gateway?demo=created');
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------
async function fetchGatewayData(organizationId: string) {
  const orgCtx = { organizationId };
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    connectedSources, evidenceCaptured, decisionsIdentified, unifiedRecords,
    successfulEvents, latencyAgg, integrations, evidenceGrouped,
    recentEvents, trendEvts, trendApprv, auditLog, flowStats,
  ] = await Promise.all([
    prisma.integration.count({ where: tenantScopedWhere(orgCtx, { status: { in: ['CONNECTED', 'SYNCING'] } }) }),
    prisma.canonicalEvidenceEvent.count({ where: tenantScopedWhere(orgCtx) }),
    prisma.approvalRecord.count({ where: tenantScopedWhere(orgCtx) }),
    prisma.unifiedEvidenceRecord.count({ where: tenantScopedWhere(orgCtx) }),
    prisma.canonicalEvidenceEvent.count({ where: tenantScopedWhere(orgCtx, { status: { in: ['CLASSIFIED', 'CORRELATED', 'COMPLETED'] } }) }),
    prisma.classifierResult.aggregate({ where: tenantScopedWhere(orgCtx), _avg: { latencyMs: true } }),
    prisma.integration.findMany({
      where: tenantScopedWhere(orgCtx),
      select: { id: true, provider: true, status: true, externalAccount: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' }, take: 20,
    }),
    prisma.canonicalEvidenceEvent.groupBy({
      by: ['providerKey'], where: tenantScopedWhere(orgCtx),
      _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8,
    }),
    prisma.canonicalEvidenceEvent.findMany({
      where: tenantScopedWhere(orgCtx),
      select: { id: true, providerKey: true, objectType: true, receivedAt: true, status: true, actorName: true },
      orderBy: { receivedAt: 'desc' }, take: 10,
    }),
    prisma.canonicalEvidenceEvent.findMany({
      where: { ...tenantScopedWhere(orgCtx), receivedAt: { gte: since14d } },
      select: { receivedAt: true }, take: 2000,
    }),
    prisma.approvalRecord.findMany({
      where: { ...tenantScopedWhere(orgCtx), createdAt: { gte: since14d } },
      select: { createdAt: true }, take: 2000,
    }),
    prisma.auditLog.findMany({
      where: { ...tenantScopedWhere(orgCtx), action: { startsWith: 'gateway' } },
      select: { id: true, action: true, createdAt: true, actorUserId: true },
      orderBy: { createdAt: 'desc' }, take: 20,
    }),
    prisma.canonicalEvidenceEvent.groupBy({
      by: ['status'], where: tenantScopedWhere(orgCtx), _count: { id: true },
    }),
  ]);

  const trendData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (13 - i));
    const ds = d.toISOString().slice(0, 10);
    return {
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      captured: trendEvts.filter(e => new Date(e.receivedAt).toISOString().slice(0, 10) === ds).length,
      decisions: trendApprv.filter(a => new Date(a.createdAt).toISOString().slice(0, 10) === ds).length,
    };
  });

  const byStatus = Object.fromEntries(flowStats.map(s => [s.status, s._count.id]));
  const get = (k: string) => byStatus[k] ?? 0;

  return {
    connectedSources, evidenceCaptured, decisionsIdentified, unifiedRecords,
    successRate: evidenceCaptured > 0 ? Math.round((successfulEvents / evidenceCaptured) * 100) : null,
    avgLatencyMs: latencyAgg._avg.latencyMs ? Math.round(latencyAgg._avg.latencyMs) : null,
    integrations: integrations.map(i => ({ ...i, provider: String(i.provider), status: String(i.status) })),
    evidenceBySource: evidenceGrouped.map(g => ({ providerKey: g.providerKey, count: g._count.id })),
    recentEvents: recentEvents.map(e => ({ ...e, status: String(e.status) })),
    trendData,
    auditLog,
    byStatus,
    normalizedCount: Math.max(0, evidenceCaptured - get('RECEIVED') - get('QUEUED')),
    classifiedCount: get('CLASSIFIED') + get('CORRELATED') + get('COMPLETED'),
    correlatedCount: get('CORRELATED') + get('COMPLETED'),
    deadLetterCount: get('DEAD_LETTER'),
  };
}

type GatewayData = Awaited<ReturnType<typeof fetchGatewayData>>;

// ---------------------------------------------------------------------------
// UI primitives
// ---------------------------------------------------------------------------
function DarkCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5 ${className}`}>{children}</div>;
}
function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-white">{children}</h3>;
}
function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#64748B';
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}18`, color }}>
      {status}
    </span>
  );
}
function Empty({ msg }: { msg: string }) {
  return <p className="mt-3 text-xs font-semibold text-slate-500">{msg}</p>;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'data-flow', label: 'Data Flow' },
  { id: 'evidence', label: 'Captured Evidence' },
  { id: 'health', label: 'Health' },
  { id: 'mappings', label: 'Mappings' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit Log' },
];

function TabNav({ active }: { active: string }) {
  return (
    <div className="flex gap-0.5 overflow-x-auto border-t border-[#1E2D4A] pt-3 mt-4">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={t.id === 'overview' ? '/dashboard/gateway' : `/dashboard/gateway?tab=${t.id}`}
          className={`relative flex-shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            active === t.id ? 'bg-[#1E2D4A] text-violet-300' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1E2D4A]/50'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------
function OverviewTab({ d, gatewayEmail }: { d: GatewayData; gatewayEmail: string }) {
  const kpis = [
    { title: 'Connected Sources', value: nf(d.connectedSources), icon: <Zap className="h-4 w-4" />, color: '#3B82F6' },
    { title: 'Evidence Captured', value: nf(d.evidenceCaptured), icon: <FileText className="h-4 w-4" />, color: '#8B5CF6' },
    { title: 'Decisions Identified', value: nf(d.decisionsIdentified), icon: <CheckSquare className="h-4 w-4" />, color: '#10B981' },
    { title: 'Unified Records', value: nf(d.unifiedRecords), icon: <Layers className="h-4 w-4" />, color: '#F59E0B' },
    { title: 'Capture Success', value: d.successRate !== null ? `${d.successRate}%` : '—', icon: <Activity className="h-4 w-4" />, color: '#06B6D4' },
    { title: 'Avg Processing', value: d.avgLatencyMs !== null ? `${d.avgLatencyMs}ms` : '—', icon: <Clock className="h-4 w-4" />, color: '#EC4899' },
  ];

  const donutSegments = d.evidenceBySource.map(s => ({
    label: providerLabel(s.providerKey), value: s.count, color: providerColor(s.providerKey),
  }));

  const trendSeries = [
    { key: 'captured', color: '#8B5CF6', label: 'Captured' },
    { key: 'decisions', color: '#10B981', label: 'Decisions' },
  ];

  return (
    <div className="grid gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(kpi => (
          <KPICard key={kpi.title} title={kpi.title} value={kpi.value} icon={kpi.icon} accentColor={kpi.color} />
        ))}
      </div>

      {/* Gateway flow */}
      <DarkCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <CardTitle>Processing Pipeline</CardTitle>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">Live flow</span>
        </div>
        <GatewayFlowDiagram counts={{
          sources: d.connectedSources, captured: d.evidenceCaptured,
          normalized: d.normalizedCount, classified: d.classifiedCount,
          correlated: d.correlatedCount, unified: d.unifiedRecords,
        }} />
      </DarkCard>

      {/* Security bar */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] p-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
        {['🔒 Secure by Design', '🛡 End-to-End Encryption', '🏢 Tenant Isolated', '📋 Full Audit Trail'].map(item => (
          <span key={item} className="text-[11px] font-semibold text-slate-400">{item}</span>
        ))}
      </div>

      {/* Main content */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 grid gap-4">
          {/* Evidence by source */}
          <DarkCard>
            <CardTitle>Evidence by Source</CardTitle>
            <div className="mt-4">
              {donutSegments.length > 0
                ? <SVGDonutChart segments={donutSegments} size={140} centerLabel={nf(d.evidenceCaptured)} centerSublabel="total" />
                : <Empty msg="No evidence captured yet. Configure a connector or use the gateway API to begin ingesting approvals." />}
            </div>
          </DarkCard>

          {/* Capture trend */}
          <DarkCard>
            <CardTitle>Capture Trend — last 14 days</CardTitle>
            <div className="mt-3 overflow-x-auto">
              <SVGLineChart data={d.trendData} series={trendSeries} labelKey="label" labelEvery={2} height={180} />
            </div>
          </DarkCard>

          {/* Connector catalog */}
          <DarkCard>
            <div className="flex items-center justify-between gap-3 mb-4">
              <CardTitle>Active Connectors</CardTitle>
              <Link href="/dashboard/gateway?tab=connectors" className="text-[10px] font-semibold text-violet-400 hover:text-violet-300">View all →</Link>
            </div>
            {d.integrations.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {d.integrations.slice(0, 8).map(int => (
                  <div key={int.id} className="rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] p-3">
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <p className="text-[11px] font-bold text-white truncate">{INTEGRATION_LABELS[int.provider] ?? int.provider}</p>
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[int.status] ?? '#64748B' }} />
                    </div>
                    <p className="text-[10px] text-slate-500">{timeAgo(int.updatedAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Empty msg="No integrations configured yet." />
            )}
          </DarkCard>

          {/* Gateway email */}
          <div className="rounded-xl border border-dashed border-[#1E2D4A] bg-[#0A0E1A] p-4">
            <p className="text-xs font-bold text-white">Tenant email capture</p>
            <p className="mt-1 font-mono text-sm font-bold text-violet-400">{gatewayEmail}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">Forward approval emails here to ingest decisions without a native connector.</p>
          </div>
        </div>

        <div className="grid gap-4 content-start">
          {/* Connector health */}
          <DarkCard>
            <CardTitle>Connector Health</CardTitle>
            {d.integrations.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {d.integrations.slice(0, 8).map(int => (
                  <div key={int.id} className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-[11px] text-slate-300 truncate">{INTEGRATION_LABELS[int.provider] ?? int.provider}</p>
                    <span className="text-[10px] text-slate-500 flex-shrink-0">{timeAgo(int.updatedAt)}</span>
                    <StatusBadge status={int.status} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty msg="No connectors configured." />
            )}
          </DarkCard>

          {/* Recent activity */}
          <DarkCard>
            <CardTitle>Recent Activity</CardTitle>
            {d.recentEvents.length > 0 ? (
              <div className="mt-3 grid gap-2.5">
                {d.recentEvents.map(evt => (
                  <div key={evt.id} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: `${providerColor(evt.providerKey)}22`, color: providerColor(evt.providerKey) }}
                    >
                      {evt.providerKey.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-300 truncate">
                        {evt.actorName ?? evt.objectType} · {providerLabel(evt.providerKey)}
                      </p>
                      <p className="text-[10px] text-slate-500">{evt.status} · {timeAgo(evt.receivedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty msg="No recent events." />
            )}
          </DarkCard>

          {/* Config links */}
          <DarkCard>
            <CardTitle>Gateway Configuration</CardTitle>
            <div className="mt-3 grid gap-1.5">
              {[
                { label: 'Global Settings', href: '/dashboard/settings' },
                { label: 'Field Mappings', href: '/dashboard/gateway?tab=mappings' },
                { label: 'Capture Rules', href: '/dashboard/gateway?tab=settings' },
                { label: 'Audit Log', href: '/dashboard/gateway?tab=audit' },
                { label: 'Reliability Monitor', href: '/dashboard/gateway/reliability' },
              ].map(({ label, href }) => (
                <Link key={href} href={href} className="flex items-center justify-between rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-violet-500/30 hover:text-white transition-colors">
                  {label} <span className="text-slate-600">→</span>
                </Link>
              ))}
            </div>
          </DarkCard>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connectors tab
// ---------------------------------------------------------------------------
function ConnectorsTab({ integrations }: { integrations: GatewayData['integrations'] }) {
  return (
    <DarkCard>
      <CardTitle>All Connectors</CardTitle>
      {integrations.length === 0 ? (
        <Empty msg="No integrations configured. Go to Settings → Integrations to connect a source." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E2D4A] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-4">Provider</th>
                <th className="pb-2 pr-4">Account</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D4A]">
              {integrations.map(int => (
                <tr key={int.id}>
                  <td className="py-2.5 pr-4 font-bold text-white">{INTEGRATION_LABELS[int.provider] ?? int.provider}</td>
                  <td className="py-2.5 pr-4 text-slate-400 truncate max-w-[140px]">{int.externalAccount ?? '—'}</td>
                  <td className="py-2.5 pr-4"><StatusBadge status={int.status} /></td>
                  <td className="py-2.5 text-slate-500">{timeAgo(int.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DarkCard>
  );
}

// ---------------------------------------------------------------------------
// Health tab
// ---------------------------------------------------------------------------
function HealthTab({ d }: { d: GatewayData }) {
  const connected = d.integrations.filter(i => i.status === 'CONNECTED').length;
  const total = d.integrations.length;
  const isHealthy = total > 0 && connected === total;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <DarkCard>
        <CardTitle>Gateway Health</CardTitle>
        <div className="mt-4 flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.deadLetterCount > 0 ? '#F59E0B' : '#10B981' }} />
          <p className="text-sm font-semibold text-white">{d.deadLetterCount > 0 ? `${nf(d.deadLetterCount)} dead-letter events need attention` : 'Processing pipeline healthy'}</p>
        </div>
      </DarkCard>
      <DarkCard>
        <CardTitle>Connector Health</CardTitle>
        <p className="mt-3 text-2xl font-black text-white tabular-nums">{connected}<span className="text-sm font-semibold text-slate-400">/{total}</span></p>
        <p className="text-xs text-slate-500">{isHealthy ? 'All connectors connected' : 'Some connectors need attention'}</p>
        <div className="mt-3 grid gap-2">
          {d.integrations.map(int => (
            <div key={int.id} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[int.status] ?? '#64748B' }} />
              <p className="flex-1 text-xs text-slate-300 truncate">{INTEGRATION_LABELS[int.provider] ?? int.provider}</p>
              <p className="text-[10px] text-slate-500">{timeAgo(int.updatedAt)}</p>
            </div>
          ))}
        </div>
      </DarkCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data flow tab
// ---------------------------------------------------------------------------
function DataFlowTab({ d }: { d: GatewayData }) {
  const stages = [
    { label: 'Captured (Total)', count: d.evidenceCaptured, color: '#8B5CF6' },
    { label: 'Normalized', count: d.normalizedCount, color: '#06B6D4' },
    { label: 'Classified', count: d.classifiedCount, color: '#10B981' },
    { label: 'Correlated', count: d.correlatedCount, color: '#F59E0B' },
    { label: 'Unified Records', count: d.unifiedRecords, color: '#EC4899' },
    { label: 'Failed (Dead Letter)', count: d.deadLetterCount, color: '#EF4444' },
  ];
  const max = Math.max(...stages.map(s => s.count), 1);
  return (
    <DarkCard>
      <CardTitle>Pipeline Stage Counts</CardTitle>
      <p className="mt-1 text-[11px] text-slate-500">Real-time status breakdown of all captured evidence events.</p>
      <div className="mt-5 grid gap-3">
        {stages.map(s => (
          <div key={s.label}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-xs font-semibold text-slate-300">{s.label}</p>
              <p className="text-xs font-bold text-white tabular-nums">{nf(s.count)}</p>
            </div>
            <div className="h-1.5 rounded-full bg-[#1E2D4A]">
              <div className="h-1.5 rounded-full transition-all" style={{ backgroundColor: s.color, width: `${Math.max(1, (s.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </DarkCard>
  );
}

// ---------------------------------------------------------------------------
// Captured evidence tab
// ---------------------------------------------------------------------------
function EvidenceTab({ events }: { events: GatewayData['recentEvents'] }) {
  return (
    <DarkCard>
      <CardTitle>Recent Captured Evidence</CardTitle>
      <p className="mt-1 text-[11px] text-slate-500">Most recent CanonicalEvidenceEvents for this organization.</p>
      {events.length === 0 ? (
        <Empty msg="No evidence captured yet. Connect a source or use the gateway API to start ingesting." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E2D4A] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-4">Source</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Actor</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D4A]">
              {events.map(evt => (
                <tr key={evt.id}>
                  <td className="py-2.5 pr-4"><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${providerColor(evt.providerKey)}18`, color: providerColor(evt.providerKey) }}>{providerLabel(evt.providerKey)}</span></td>
                  <td className="py-2.5 pr-4 text-slate-400">{evt.objectType}</td>
                  <td className="py-2.5 pr-4 text-slate-300 truncate max-w-[120px]">{evt.actorName ?? '—'}</td>
                  <td className="py-2.5 pr-4"><StatusBadge status={evt.status} /></td>
                  <td className="py-2.5 text-slate-500">{timeAgo(evt.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DarkCard>
  );
}

// ---------------------------------------------------------------------------
// Audit log tab
// ---------------------------------------------------------------------------
function AuditTab({ logs }: { logs: GatewayData['auditLog'] }) {
  return (
    <DarkCard>
      <CardTitle>Audit Log — Gateway Events</CardTitle>
      <p className="mt-1 text-[11px] text-slate-500">Actions with prefix <code className="text-violet-400">gateway.*</code> from this organization&apos;s audit trail.</p>
      {logs.length === 0 ? (
        <Empty msg="No gateway audit events recorded yet." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E2D4A] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-4">Action</th>
                <th className="pb-2 pr-4">Actor</th>
                <th className="pb-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D4A]">
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="py-2.5 pr-4 font-mono text-[10px] text-violet-300">{log.action}</td>
                  <td className="py-2.5 pr-4 text-slate-400 truncate max-w-[140px]">{log.actorUserId ?? 'system'}</td>
                  <td className="py-2.5 text-slate-500">{timeAgo(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DarkCard>
  );
}

// ---------------------------------------------------------------------------
// Static info tabs
// ---------------------------------------------------------------------------
function MappingsTab() {
  const mappings = [
    ['source_system', 'sourcePlatform / providerKey'],
    ['approver / approver_email', 'approverName / approverEmail'],
    ['decision', 'evidenceSnippet / reasoning'],
    ['department', 'department'],
    ['amount', 'metadata.amount'],
    ['subject', 'subject'],
    ['timestamp', 'approvalTimestamp / occurredAt'],
    ['metadata.*', 'ApprovalRecord.metadata (JSON)'],
  ];
  return (
    <DarkCard>
      <CardTitle>Field Mappings</CardTitle>
      <p className="mt-1 text-[11px] text-slate-500">How inbound gateway payload fields map to ApprovLine data model fields.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-[#1E2D4A] text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"><th className="pb-2 pr-6">Gateway Field</th><th className="pb-2">ApprovLine Field</th></tr></thead>
          <tbody className="divide-y divide-[#1E2D4A]">
            {mappings.map(([src, dst]) => (
              <tr key={src}><td className="py-2.5 pr-6 font-mono text-violet-300">{src}</td><td className="py-2.5 font-mono text-slate-300">{dst}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </DarkCard>
  );
}

function SettingsTab() {
  const links = [
    { label: 'Slack Integration', href: '/api/integrations/slack/install', desc: 'OAuth install flow for Slack workspace' },
    { label: 'Gmail Integration', href: '/api/integrations/gmail/install', desc: 'OAuth install flow for Gmail' },
    { label: 'Microsoft Teams', href: '/api/integrations/teams/install', desc: 'OAuth install flow for Teams' },
    { label: 'Jira Integration', href: '/api/integrations/jira/install', desc: 'OAuth install flow for Jira Cloud' },
    { label: 'Zoom Integration', href: '/api/integrations/zoom/install', desc: 'OAuth install flow for Zoom' },
  ];
  return (
    <DarkCard>
      <CardTitle>Connector Settings</CardTitle>
      <p className="mt-1 text-[11px] text-slate-500">Configure individual integrations. Admin role required.</p>
      <div className="mt-4 grid gap-2">
        {links.map(l => (
          <div key={l.href} className="flex items-center justify-between rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] px-4 py-3">
            <div><p className="text-xs font-bold text-white">{l.label}</p><p className="text-[10px] text-slate-500">{l.desc}</p></div>
            <Link href={l.href} className="text-[11px] font-semibold text-violet-400 hover:text-violet-300 flex-shrink-0 ml-4">Configure →</Link>
          </div>
        ))}
      </div>
    </DarkCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function UniversalGatewayPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; demo?: string }>;
}) {
  const tenant = await getDashboardTenant(2500);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (tenant.user) enforcePageRole('/dashboard/gateway', tenant.user.role);

  const params = await searchParams;
  const activeTab = params.tab ?? 'overview';

  const [gatewayMetrics, data] = await Promise.all([
    tenant.organization ? buildGatewayMetrics(tenant.organization.id) : null,
    tenant.organization
      ? withTimeout('gateway:dashboard', fetchGatewayData(tenant.organization.id), 6000).catch(() => null)
      : null,
  ]);

  const gatewayEmail = gatewayMetrics?.gatewayEmail ?? `approvals+${tenant.organization?.id?.slice(0, 8) ?? 'tenant'}@approvline.ai`;

  return (
    <div className="grid gap-4">
      {/* Header card */}
      <DarkCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">Universal Approval Gateway</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white" style={{ textWrap: 'balance' } as React.CSSProperties}>Ingest approvals from any system</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">SAP, Oracle, Coupa, Workday, Salesforce, HubSpot, email forwards, CSV, documents, and transcripts — all through one AI classification pipeline.</p>
          </div>
          <form action={seedGatewayDemoAction} className="flex-shrink-0">
            <FormSubmitButton pendingText="Generating…" className="h-9 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white hover:bg-violet-500 min-h-0">
              Generate demo
            </FormSubmitButton>
          </form>
        </div>
        <TabNav active={activeTab} />
      </DarkCard>

      {/* Alerts */}
      {params.demo === 'created' && (
        <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-4 text-emerald-300">
          <p className="text-sm font-bold">Gateway demo data generated</p>
          <p className="mt-0.5 text-xs">Sample SAP, Oracle, and Salesforce approvals were routed through the classifier, audit, and timeline pipeline.</p>
        </div>
      )}
      {gatewayMetrics?.message && (
        <div className={`rounded-2xl border p-4 ${gatewayMetrics.alert ? 'border-amber-700/40 bg-amber-900/20 text-amber-300' : 'border-[#1E2D4A] bg-[#0D1526] text-slate-400'}`}>
          {gatewayMetrics.alert && <AutoRetryOnDegraded />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold">{gatewayMetrics.message}</p>
            <RefreshButton className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 text-xs font-bold text-slate-300 disabled:opacity-60" />
          </div>
        </div>
      )}

      {/* Tab content */}
      {data === null ? (
        <DarkCard><p className="text-sm text-slate-500">Gateway data is temporarily unavailable. Please retry in a moment.</p></DarkCard>
      ) : activeTab === 'overview' ? (
        <OverviewTab d={data} gatewayEmail={gatewayEmail} />
      ) : activeTab === 'connectors' ? (
        <ConnectorsTab integrations={data.integrations} />
      ) : activeTab === 'data-flow' ? (
        <DataFlowTab d={data} />
      ) : activeTab === 'evidence' ? (
        <EvidenceTab events={data.recentEvents} />
      ) : activeTab === 'health' ? (
        <HealthTab d={data} />
      ) : activeTab === 'mappings' ? (
        <MappingsTab />
      ) : activeTab === 'settings' ? (
        <SettingsTab />
      ) : activeTab === 'audit' ? (
        <AuditTab logs={data.auditLog} />
      ) : (
        <DarkCard><p className="text-sm text-slate-500">Tab not found.</p></DarkCard>
      )}
    </div>
  );
}
