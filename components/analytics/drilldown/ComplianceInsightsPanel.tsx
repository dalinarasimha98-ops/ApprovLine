'use client';

import Link from 'next/link';

export type ComplianceInsight = {
  id: string;
  type: 'positive' | 'warning' | 'critical' | 'info';
  title: string;
  description: string;
  filterHref: string;
};

function InsightIcon({ type }: { type: ComplianceInsight['type'] }) {
  if (type === 'critical') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/20">
        <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    );
  }
  if (type === 'warning') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
        <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    );
  }
  if (type === 'positive') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  // info
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-violet-500/20">
      <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}

function insightBorderColor(type: ComplianceInsight['type']): string {
  if (type === 'critical') return 'border-red-500/20';
  if (type === 'warning') return 'border-amber-500/20';
  if (type === 'positive') return 'border-emerald-500/20';
  return 'border-violet-500/20';
}

export function ComplianceInsightsPanel({
  insights,
  overallScore,
}: {
  insights: ComplianceInsight[];
  overallScore: number;
}) {
  return (
    <div className="grid gap-5">
      {/* Insights card */}
      <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/20">
            <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">Compliance Insights AI</p>
            <p className="text-[10px] text-slate-500">Rule-based from live data</p>
          </div>
        </div>

        <div className="grid gap-3">
          {insights.length === 0 ? (
            <div className="rounded-xl border border-[#1E2D4A] bg-[#0A0E1A] p-4 text-center">
              <p className="text-xs font-semibold text-slate-500">No insights generated yet.</p>
              <p className="mt-1 text-[11px] text-slate-600">Capture more approvals to generate compliance insights.</p>
            </div>
          ) : (
            insights.map((insight) => (
              <div
                key={insight.id}
                className={`rounded-xl border bg-[#0A0E1A] p-3 ${insightBorderColor(insight.type)}`}
              >
                <div className="flex items-start gap-2.5">
                  <InsightIcon type={insight.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-white leading-tight">{insight.title}</p>
                    <p className="mt-1 text-[10px] text-slate-400 leading-snug">{insight.description}</p>
                    <Link
                      href={insight.filterHref}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      View details
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Score gauge */}
      <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5">
        <h3 className="text-sm font-bold text-white mb-3">Score Breakdown</h3>
        <div className="grid gap-2.5">
          {[
            { label: 'Compliant (≥80)', pct: overallScore >= 80 ? 100 : overallScore, color: '#10B981' },
            { label: 'Needs Attention (60–79)', pct: overallScore >= 60 && overallScore < 80 ? 100 : 0, color: '#F59E0B' },
            { label: 'At Risk (40–59)', pct: overallScore >= 40 && overallScore < 60 ? 100 : 0, color: '#EF4444' },
            { label: 'Non-Compliant (<40)', pct: overallScore < 40 ? 100 : 0, color: '#991B1B' },
          ].map(({ label, pct, color }) => (
            <div key={label}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-semibold text-slate-400 truncate">{label}</span>
                {pct > 0 && (
                  <span className="text-[10px] font-bold flex-shrink-0" style={{ color }}>Current</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-[#1E2D4A]">
                <div
                  className="h-1.5 rounded-full"
                  style={{ backgroundColor: color, width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-[#1E2D4A] bg-[#0D1526] p-5">
        <h3 className="text-sm font-bold text-white mb-3">Quick Actions</h3>
        <div className="grid gap-2">
          {[
            { label: 'At Risk Records', href: '/analytics/drilldown/compliance-readiness?status=at-risk' },
            { label: 'Pending Approvals', href: '/analytics/drilldown/compliance-readiness?status=PENDING_REVIEW' },
            { label: 'Open Investigations', href: '/investigations' },
            { label: 'Playbook AI', href: '/playbook' },
            { label: 'AI Copilot', href: '/copilot' },
            { label: 'Generate Compliance Report', href: '/api/export/analytics?format=csv&type=compliance' },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#1E2D4A] bg-[#0A0E1A] px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-[#2A3F66] hover:text-white transition-colors"
            >
              {label}
              <svg className="h-3 w-3 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
