import Link from 'next/link';
import type { ExecutiveInsight } from '@/services/analytics';

type HighRiskApproval = {
  id: string;
  subject: string | null;
  riskLevel: string | null;
  department: string | null;
  approverName: string | null;
  businessImpact?: string | null;
};

function parseAmount(businessImpact: string | null | undefined): string | null {
  if (!businessImpact) return null;
  const m = businessImpact.match(/\$[\d,]+(?:\.\d+)?[KMBkmb]?/);
  return m ? m[0] : null;
}

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
          {insights.map((insight) => {
            const hasStructured = insight.whatHappened || insight.whyItMatters || insight.action;
            return (
              <div
                key={insight.id}
                className="rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] p-3 transition-colors hover:border-[#2A3F66]"
              >
                <div className="flex items-start gap-2.5">
                  <InsightIcon type={insight.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white leading-snug">{insight.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{insight.description}</p>

                    {hasStructured && (
                      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[#1E2D4A] pt-2.5">
                        {insight.whatHappened && (
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">What Happened</span>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{insight.whatHappened}</p>
                          </div>
                        )}
                        {insight.whyItMatters && (
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Why It Matters</span>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{insight.whyItMatters}</p>
                          </div>
                        )}
                        {insight.action && (
                          <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-violet-500">Recommended Action</span>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-violet-300">{insight.action}</p>
                          </div>
                        )}
                      </div>
                    )}

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
            );
          })}
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
            {highRiskApprovals.slice(0, 5).map((approval) => {
              const amount = parseAmount(approval.businessImpact);
              return (
                <Link
                  key={approval.id}
                  href={`/approvals/${approval.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] p-2.5 transition-colors hover:border-[#2A3F66]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-slate-200">
                      {approval.subject ?? 'Untitled approval'}
                    </p>
                    {amount ? (
                      <p className="text-[10px] font-bold text-slate-400">{amount}</p>
                    ) : (
                      <p className="text-[10px] text-slate-500">{approval.department ?? 'Unassigned'}</p>
                    )}
                  </div>
                  <RiskBadge level={approval.riskLevel} />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-1">
        <h4 className="mb-2 text-xs font-bold text-slate-300">Quick Actions</h4>
        <div className="grid grid-cols-1 gap-1.5">
          {[
            { label: 'View Approvals', href: '/approvals', iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'View High Risk Approvals', href: '/approvals?riskLevel=high', iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
            { label: 'Open Investigations', href: '/investigations', iconPath: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
            { label: 'Ask AI Copilot', href: '/copilot', iconPath: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
          ].map(({ label, href, iconPath }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-[#2A3F66] hover:text-white"
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
              </svg>
              {label}
            </Link>
          ))}
        </div>
        <Link
          href="/api/export/analytics?format=csv"
          className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-violet-500"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Generate Executive Report
        </Link>
      </div>
    </div>
  );
}
