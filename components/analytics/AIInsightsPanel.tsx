import Link from 'next/link';
import type { ExecutiveInsight } from '@/services/analytics';

type HighRiskApproval = {
  id: string;
  subject: string | null;
  riskLevel: string | null;
  department: string | null;
  approverName: string | null;
};

type Props = {
  insights: ExecutiveInsight[];
  highRiskApprovals?: HighRiskApproval[];
};

function InsightIcon({ type }: { type: ExecutiveInsight['type'] }) {
  if (type === 'critical') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    );
  }
  if (type === 'warning') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    );
  }
  if (type === 'positive') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}

function RiskBadge({ level }: { level: string | null }) {
  const color =
    level === 'critical' ? 'bg-red-500/15 text-red-400 border-red-500/20' :
    level === 'high' ? 'bg-orange-500/15 text-orange-400 border-orange-500/20' :
    level === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${color}`}>
      {level ?? 'low'}
    </span>
  );
}

export function AIInsightsPanel({ insights, highRiskApprovals = [] }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-black text-white">AI Executive Insights</h3>
        <span className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-violet-400 border border-violet-500/20">
          AI
        </span>
      </div>

      {/* Insight cards */}
      {insights.length === 0 ? (
        <div className="rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] p-4 text-center">
          <p className="text-xs font-semibold text-slate-500">
            Insights appear once approval data is captured.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] p-3 transition-colors hover:border-[#2A3F66]"
            >
              <div className="flex items-start gap-2.5">
                <InsightIcon type={insight.type} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white leading-snug">{insight.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{insight.description}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-600">
                      {insight.metric}: {insight.metricValue}
                    </span>
                    <Link
                      href={insight.drilldownHref}
                      className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      View details &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* High Risk Approvals mini-list */}
      {highRiskApprovals.length > 0 && (
        <div className="mt-1">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300">High Risk Approvals</h4>
            <Link
              href="/approvals?riskLevel=high"
              className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            {highRiskApprovals.slice(0, 5).map((approval) => (
              <Link
                key={approval.id}
                href={`/approvals/${approval.id}`}
                className="flex items-center justify-between rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] p-2.5 transition-colors hover:border-[#2A3F66]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-200">
                    {approval.subject ?? 'Untitled approval'}
                  </p>
                  <p className="text-[10px] text-slate-500">{approval.department ?? 'Unassigned'} • {approval.approverName ?? 'Unknown'}</p>
                </div>
                <RiskBadge level={approval.riskLevel} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-1">
        <h4 className="mb-2 text-xs font-bold text-slate-300">Quick Actions</h4>
        <div className="grid grid-cols-1 gap-1.5">
          {[
            { label: 'View All Approvals', href: '/approvals', icon: '📋' },
            { label: 'High Risk Approvals', href: '/approvals?riskLevel=high', icon: '⚠️' },
            { label: 'Open Investigations', href: '/investigations', icon: '🔍' },
            { label: 'Generate Report', href: '/api/export/analytics?format=csv', icon: '📊' },
          ].map(({ label, href, icon }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-[#2A3F66] hover:text-white"
            >
              <span className="text-sm">{icon}</span>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
