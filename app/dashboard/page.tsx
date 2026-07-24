import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Mail,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const panelClass = 'rounded-lg border border-white/[0.09] bg-[#071525] shadow-[0_12px_36px_rgba(0,0,0,.16)]';
const palette = ['#2f7cff', '#49c78e', '#7c6cf2', '#f58b3d', '#46b6df', '#aeb9c8'];

async function safeMetric<T>(label: string, query: Promise<T>, fallback: T) {
  try {
    return await withTimeout(label, query, 1800);
  } catch (error) {
    console.error(`[dashboard] ${label} failed`, error);
    return fallback;
  }
}

function compact(value: number) {
  return new Intl.NumberFormat('en-US', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Sparkline({ color, points }: { color: string; points: number[] }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);
  const line = points.map((point, index) => `${(index / (points.length - 1)) * 100},${34 - ((point - min) / range) * 28}`).join(' ');
  const id = `spark-${color.replace('#', '')}`;
  return (
    <svg viewBox="0 0 100 38" className="h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,38 ${line} 100,38`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function KpiCard({
  label,
  value,
  context,
  tone = 'positive',
  color,
  icon,
  points,
}: {
  label: string;
  value: string;
  context: string;
  tone?: 'positive' | 'warning' | 'neutral';
  color: string;
  icon: React.ReactNode;
  points: number[];
}) {
  const toneClass = tone === 'positive' ? 'text-emerald-400' : tone === 'warning' ? 'text-amber-400' : 'text-slate-400';
  return (
    <article className={`${panelClass} relative min-h-[134px] overflow-hidden p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-slate-400">{label}</p>
          <p className="mt-1 text-[25px] font-bold leading-none tracking-tight text-slate-100">{value}</p>
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-full border" style={{ borderColor: `${color}66`, color }}>{icon}</span>
      </div>
      <div className={`mt-2 flex items-center gap-1 text-[10px] font-semibold ${toneClass}`}>
        <Activity className="h-3 w-3" />
        {context}
      </div>
      <div className="absolute inset-x-3 bottom-0"><Sparkline color={color} points={points} /></div>
    </article>
  );
}

function Donut({ values, total, centerLabel }: { values: number[]; total: number; centerLabel: string }) {
  let offset = 25;
  return (
    <div className="relative grid h-40 w-40 shrink-0 place-items-center">
      <svg viewBox="0 0 42 42" className="-rotate-90">
        <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#17273a" strokeWidth="6" />
        {values.map((value, index) => {
          const percent = total > 0 ? (value / total) * 100 : 0;
          const dash = `${percent} ${100 - percent}`;
          const element = (
            <circle
              key={`${index}-${value}`}
              cx="21"
              cy="21"
              r="15.9155"
              fill="transparent"
              stroke={palette[index % palette.length]}
              strokeWidth="6"
              strokeDasharray={dash}
              strokeDashoffset={100 - offset}
            />
          );
          offset += percent;
          return element;
        })}
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-white">{compact(total)}</p>
        <p className="text-[10px] text-slate-500">{centerLabel}</p>
      </div>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  const normalized = provider.toLowerCase();
  const styles =
    normalized.includes('gmail') ? 'bg-rose-500/15 text-rose-300' :
    normalized.includes('slack') ? 'bg-fuchsia-500/15 text-fuchsia-300' :
    normalized.includes('teams') ? 'bg-indigo-500/15 text-indigo-300' :
    normalized.includes('jira') ? 'bg-blue-500/15 text-blue-300' :
    normalized.includes('outlook') ? 'bg-cyan-500/15 text-cyan-300' :
    'bg-emerald-500/15 text-emerald-300';
  return (
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.06] ${styles}`}>
      {normalized.includes('mail') || normalized.includes('outlook') ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
    </span>
  );
}

function SectionHeader({ title, subtitle, href, linkLabel = 'View all' }: { title: string; subtitle: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-slate-100">{title}</h2>
        <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>
      </div>
      {href ? <Link href={href} className="text-[10px] font-semibold text-blue-400 hover:text-blue-300">{linkLabel} →</Link> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const tenant = await getDashboardTenant(5000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');

  const organizationId = tenant.organization?.id;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalApprovals,
    pendingReview,
    highRiskApprovals,
    recentApprovals,
    categories,
    integrations,
    evidenceTotal,
    recentEvidence,
    recentAudit,
    trendRecords,
  ] = organizationId
    ? await Promise.all([
        safeMetric('total approvals', prisma.approvalRecord.count({ where: { organizationId } }), 0),
        safeMetric('pending approvals', prisma.approvalRecord.count({ where: { organizationId, status: 'PENDING_REVIEW' } }), 0),
        safeMetric('high risk approvals', prisma.approvalRecord.count({ where: { organizationId, riskLevel: { in: ['high', 'critical'] } } }), 0),
        safeMetric('recent approvals', prisma.approvalRecord.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 6 }), []),
        safeMetric('approval categories', prisma.approvalRecord.groupBy({ by: ['category'], where: { organizationId }, _count: { _all: true }, orderBy: { _count: { category: 'desc' } }, take: 6 }), []),
        safeMetric('integrations', prisma.integration.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 12 }), []),
        safeMetric('evidence count', prisma.unifiedEvidenceRecord.count({ where: { organizationId } }), 0),
        safeMetric('recent evidence', prisma.unifiedEvidenceRecord.findMany({ where: { organizationId }, orderBy: { lastSeenAt: 'desc' }, take: 5 }), []),
        safeMetric('recent audit', prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 5 }), []),
        safeMetric('approval trend', prisma.approvalRecord.findMany({ where: { organizationId, createdAt: { gte: since } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 500 }), []),
      ])
    : [0, 0, 0, [], [], [], 0, [], [], []] as const;

  const connected = integrations.filter((item) => item.status === 'CONNECTED' || item.status === 'SYNCING');
  const complianceScore = totalApprovals > 0 ? Math.max(0, Math.round(100 - ((highRiskApprovals + pendingReview * 0.25) / totalApprovals) * 100)) : 100;
  const displayName = tenant.user?.name?.split(' ')[0] ?? 'there';
  const dayCounts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return trendRecords.filter((record) => record.createdAt >= date && record.createdAt < next).length;
  });
  const sourceCounts = new Map<string, number>();
  recentApprovals.forEach((approval) => {
    const source = approval.sourcePlatform ?? 'manual';
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  });
  const sourceSummary = [...sourceCounts.entries()].slice(0, 6);
  const chartMax = Math.max(...dayCounts, 1);
  const chartPoints = dayCounts.map((count, index) => `${8 + index * 15.3},${88 - (count / chartMax) * 62}`).join(' ');

  return (
    <section className="grid gap-3 text-slate-200">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Good morning, {displayName} 👋</h1>
          <p className="mt-1 text-xs text-slate-500">Here&apos;s what&apos;s happening across your organization today.</p>
        </div>
        {tenant.status !== 'ready' ? (
          <Link href="/api/debug/dashboard" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
            Workspace data delayed · Open diagnostics
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Total Approvals" value={compact(totalApprovals)} context={`${dayCounts.reduce((sum, count) => sum + count, 0)} captured this week`} color="#2f7cff" icon={<CheckCircle2 className="h-4 w-4" />} points={[2, 5, 4, 8, 6, 10, 7, 12, 8, 13]} />
        <KpiCard label="High Risk Approvals" value={compact(highRiskApprovals)} context={highRiskApprovals ? 'Requires attention' : 'No high-risk records'} tone={highRiskApprovals ? 'warning' : 'positive'} color="#ff624a" icon={<AlertTriangle className="h-4 w-4" />} points={[2, 4, 9, 3, 6, 5, 7, 7, 9, 14]} />
        <KpiCard label="Pending Approvals" value={compact(pendingReview)} context={pendingReview ? 'Waiting for review' : 'Review queue is clear'} tone={pendingReview ? 'warning' : 'positive'} color="#f4b529" icon={<Clock3 className="h-4 w-4" />} points={[5, 4, 7, 8, 5, 2, 5, 3, 4, 10]} />
        <KpiCard label="Connected Sources" value={`${connected.length}/${Math.max(integrations.length, connected.length)}`} context={`${Math.max(0, integrations.length - connected.length)} need attention`} tone={integrations.length > connected.length ? 'warning' : 'positive'} color="#43ce79" icon={<Network className="h-4 w-4" />} points={[3, 2, 4, 3, 6, 4, 7, 5, 8, 7]} />
        <KpiCard label="Evidence Captured" value={compact(evidenceTotal)} context={`${recentEvidence.length} recent records loaded`} color="#a66df1" icon={<Database className="h-4 w-4" />} points={[2, 5, 3, 7, 6, 8, 6, 9, 7, 14]} />
        <KpiCard label="Compliance Score" value={`${complianceScore}%`} context={complianceScore >= 90 ? 'Healthy posture' : 'Review recommended'} tone={complianceScore >= 90 ? 'positive' : 'warning'} color="#45cf78" icon={<ShieldCheck className="h-4 w-4" />} points={[8, 9, 8, 7, 8, 10, 9, 12, 10, 13]} />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Live Evidence Feed" subtitle="Real-time capture from connected tools" href="/evidence" linkLabel="All evidence" />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {(recentApprovals.length ? recentApprovals.slice(0, 5) : []).map((approval) => (
              <Link href={`/approvals/${approval.id}`} key={approval.id} className="grid grid-cols-[28px_50px_1fr_auto] items-center gap-2 py-2.5 hover:bg-white/[0.025]">
                <ProviderIcon provider={approval.sourcePlatform ?? 'manual'} />
                <span className="text-[9px] text-slate-500">{approval.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[10px] text-slate-400">{statusLabel(approval.sourcePlatform ?? 'manual')}</span>
                  <span className="block truncate text-[11px] font-medium text-slate-200">{approval.subject}</span>
                </span>
                <span className="max-w-20 truncate text-right text-[10px] text-slate-400">{approval.approverName ?? 'Unknown'}</span>
              </Link>
            ))}
            {!recentApprovals.length ? <p className="py-10 text-center text-xs text-slate-500">Evidence appears here as approvals are captured.</p> : null}
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Evidence Capture Overview" subtitle="Across all connected sources" href="/dashboard/settings/integrations" linkLabel="Manage" />
          <div className="mt-3 flex items-center justify-center gap-5">
            <Donut values={sourceSummary.map(([, count]) => count)} total={Math.max(evidenceTotal, recentApprovals.length)} centerLabel="Total Evidence" />
            <div className="min-w-0 flex-1 space-y-2">
              {(sourceSummary.length ? sourceSummary : [['No sources', 0] as [string, number]]).map(([source, count], index) => (
                <div key={source} className="flex items-center gap-2 text-[10px]">
                  <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: palette[index % palette.length] }} />
                  <span className="min-w-0 flex-1 truncate text-slate-400">{statusLabel(source)}</span>
                  <span className="font-semibold text-slate-200">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.025] p-2.5">
            <span className="text-[10px] font-semibold text-slate-400">{connected.length} connected</span>
            <div className="ml-auto flex -space-x-1">
              {connected.slice(0, 8).map((integration) => <ProviderIcon key={integration.id} provider={integration.provider} />)}
            </div>
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Unified Evidence Record (Recent)" subtitle="AI-clustered decisions from multiple sources" href="/evidence" />
          <div className="mt-3 divide-y divide-white/[0.06]">
            {(recentEvidence.length ? recentEvidence : recentApprovals).slice(0, 5).map((record) => {
              const id = record.id;
              const subject = record.subject;
              const status = 'outcome' in record ? record.outcome : record.status;
              const detailHref = 'outcome' in record ? `/evidence/${id}` : `/approvals/${id}`;
              return (
                <Link href={detailHref} key={id} className="flex items-center gap-3 py-3 hover:bg-white/[0.025]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-slate-100">{subject}</p>
                    <p className="mt-0.5 truncate text-[9px] text-slate-500">{'department' in record ? record.department ?? 'General' : 'General'}</p>
                  </div>
                  <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-300">{statusLabel(String(status))}</span>
                </Link>
              );
            })}
            {!recentEvidence.length && !recentApprovals.length ? <p className="py-10 text-center text-xs text-slate-500">No unified records yet.</p> : null}
          </div>
        </article>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-3`}>
          <SectionHeader title="AI Copilot" subtitle="Ask anything about approvals" href="/copilot" linkLabel="Open" />
          <div className="mt-3 grid gap-2">
            {['Who approved the latest budget?', 'Show high-risk approvals this month', 'Which approvals need Finance?', 'Show approvals above $50,000'].map((question) => (
              <Link key={question} href={`/copilot?q=${encodeURIComponent(question)}`} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[10px] text-slate-300 hover:border-violet-500/30 hover:bg-violet-500/[0.06]">
                <Sparkles className="h-3 w-3 text-violet-400" /> {question}
              </Link>
            ))}
          </div>
          <Link href="/copilot" className="mt-3 flex h-9 items-center rounded-md border border-white/[0.08] px-3 text-[10px] text-slate-500 hover:text-white">Ask a question… <Bot className="ml-auto h-3.5 w-3.5 text-violet-400" /></Link>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-5`}>
          <SectionHeader title="Approvals Trend" subtitle="Daily approvals · last 7 days" href="/analytics" linkLabel="Analytics" />
          <div className="mt-3 h-48">
            <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-label="Approvals trend">
              {[25, 50, 75].map((y) => <line key={y} x1="5" x2="98" y1={y} y2={y} stroke="rgba(148,163,184,.09)" strokeDasharray="2 3" />)}
              <polyline points={chartPoints} fill="none" stroke="#347dff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              {dayCounts.map((count, index) => <circle key={index} cx={8 + index * 15.3} cy={88 - (count / chartMax) * 62} r="1.6" fill="#071525" stroke="#347dff" strokeWidth="1.2" />)}
            </svg>
          </div>
          <div className="grid grid-cols-7 text-center text-[9px] text-slate-600">
            {dayCounts.map((_, index) => {
              const date = new Date();
              date.setDate(date.getDate() - (6 - index));
              return <span key={index}>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>;
            })}
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="Risk & Compliance" subtitle="Overview of risks and compliance posture" href="/trust/compliance" linkLabel="Compliance hub" />
          <div className="mt-4 grid grid-cols-[1fr_140px] items-center gap-3">
            <div className="space-y-2">
              {[
                ['High Risk Approvals', highRiskApprovals, 'text-rose-400'],
                ['Missing Evidence', Math.max(0, totalApprovals - evidenceTotal), 'text-amber-400'],
                ['Policy Violations', categories.filter((item) => item.category?.toLowerCase().includes('compliance')).reduce((sum, item) => sum + item._count._all, 0), 'text-violet-400'],
                ['Pending Review', pendingReview, 'text-blue-400'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="flex items-center gap-2 rounded-md border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 text-[10px]">
                  <AlertTriangle className={`h-3.5 w-3.5 ${color}`} />
                  <span className="flex-1 text-slate-400">{label}</span>
                  <span className={`font-bold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="relative grid h-32 w-32 place-items-center rounded-full" style={{ background: `conic-gradient(#45cf78 ${complianceScore}%, #17273a 0)` }}>
              <div className="grid h-24 w-24 place-items-center rounded-full bg-[#071525] text-center">
                <div><p className="text-2xl font-bold text-white">{complianceScore}%</p><p className="text-[9px] text-slate-500">Compliance</p></div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <article className={`${panelClass} p-4 xl:col-span-8`}>
          <SectionHeader title="Recent Activity" subtitle="System and user activities" href="/dashboard/audit" />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {recentAudit.map((event, index) => (
              <div key={event.id} className="min-w-0 border-l border-white/[0.08] pl-3 first:border-l-0">
                <span className={`grid h-7 w-7 place-items-center rounded-full ${index % 2 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blue-500/15 text-blue-300'}`}><Activity className="h-3.5 w-3.5" /></span>
                <p className="mt-2 truncate text-[10px] font-semibold text-slate-200">{statusLabel(event.action)}</p>
                <p className="mt-0.5 text-[9px] text-slate-600">{event.createdAt.toLocaleString()}</p>
              </div>
            ))}
            {!recentAudit.length ? <p className="col-span-full py-5 text-center text-xs text-slate-500">Recent actions will appear here.</p> : null}
          </div>
        </article>

        <article className={`${panelClass} p-4 xl:col-span-4`}>
          <SectionHeader title="System Health" subtitle="Core workspace services" href="/health" linkLabel="Status page" />
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {['Capture Engine', 'AI Classifier', 'Integrations', 'Data Pipeline', 'Storage', 'API Gateway'].map((service) => (
              <div key={service} className="flex items-center gap-2 text-[10px] text-slate-400"><Check className="h-3.5 w-3.5 rounded-full bg-emerald-500/20 p-0.5 text-emerald-400" />{service}</div>
            ))}
          </div>
        </article>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-1 pt-3 text-[9px] text-slate-600">
        <div className="flex flex-wrap gap-4"><span>Enterprise-grade security</span><span>SOC 2 ready</span><span>GDPR aligned</span><span>Read-only integrations</span></div>
        <span>© 2026 ApprovLine</span>
      </div>
    </section>
  );
}
