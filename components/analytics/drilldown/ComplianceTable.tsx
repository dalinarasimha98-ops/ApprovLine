'use client';

import Link from 'next/link';

export type ComplianceTableRecord = {
  id: string;
  subject: string;
  category: string | null;
  approverName: string | null;
  department: string | null;
  riskLevel: string | null;
  sourcePlatform: string | null;
  status: string;
  evidenceSnippet: string | null;
  messageSourceId: string | null;
  createdAt: Date;
  complianceScore: number;
  evidenceCoverage: number;
  investigations: Array<{ investigationId: string }>;
  auditLogs: Array<{ id: string }>;
  _evidenceAssociationCount: number;
};

function dateText(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ageText(d: Date) {
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return `${months} mo`;
}

function formatRecordId(id: string): string {
  return `CR-${id.slice(-8).toUpperCase()}`;
}

function RiskBadge({ riskLevel }: { riskLevel: string | null }) {
  const level = riskLevel?.toLowerCase() ?? 'low';
  let cls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
  if (level === 'critical') cls = 'bg-red-900/30 text-red-300 border-red-900/40';
  else if (level === 'high') cls = 'bg-red-500/15 text-red-400 border-red-500/20';
  else if (level === 'medium') cls = 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${cls}`}>
      {label}
    </span>
  );
}

function ComplianceStatusBadge({ score, status }: { score: number; status: string }) {
  if (status?.toUpperCase() === 'PENDING_REVIEW') {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/15 px-2 py-0.5 text-[10px] font-black text-blue-400">
        Pending
      </span>
    );
  }
  if (score >= 80) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-400">
        Compliant
      </span>
    );
  }
  if (score >= 60) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-400">
        Needs Attention
      </span>
    );
  }
  if (score >= 40) {
    return (
      <span className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/15 px-2 py-0.5 text-[10px] font-black text-orange-400">
        At Risk
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-red-900/30 bg-red-900/20 px-2 py-0.5 text-[10px] font-black text-red-300">
      Non-Compliant
    </span>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="h-1.5 flex-1 rounded-full bg-[#1E2D4A]">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{
            width: `${Math.max(2, Math.min(100, value))}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="text-[10px] font-bold w-7 text-right" style={{ color }}>
        {value}%
      </span>
    </div>
  );
}

function complianceColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-[10px] text-slate-600">Unknown</span>;
  const colors: Record<string, string> = {
    slack: 'bg-[#4A154B]/30 text-[#E01E5A]',
    gmail: 'bg-red-500/10 text-red-400',
    teams: 'bg-blue-600/10 text-blue-400',
    outlook: 'bg-blue-500/10 text-blue-300',
    jira: 'bg-blue-700/10 text-blue-500',
    zoom: 'bg-blue-900/20 text-blue-300',
    sap: 'bg-amber-500/10 text-amber-400',
    workday: 'bg-orange-500/10 text-orange-400',
    salesforce: 'bg-cyan-500/10 text-cyan-400',
    oracle: 'bg-red-600/10 text-red-500',
    coupa: 'bg-teal-500/10 text-teal-400',
    hubspot: 'bg-orange-600/10 text-orange-500',
  };
  const key = source.toLowerCase();
  const colorClass = colors[key] ?? 'bg-slate-500/10 text-slate-400';
  const label = source.charAt(0).toUpperCase() + source.slice(1);
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${colorClass}`}>
      {label}
    </span>
  );
}

export function ComplianceTable({ records }: { records: ComplianceTableRecord[] }) {
  if (records.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1200px] w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#1E2D4A]">
            {[
              'Record ID',
              'Title',
              'Category',
              'Department',
              'Risk',
              'Compliance Score',
              'Evidence Coverage',
              'Source',
              'Age',
              'Status',
              'Action',
            ].map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const investigationId = record.investigations[0]?.investigationId ?? null;
            const compColor = complianceColor(record.complianceScore);
            const evidColor = complianceColor(record.evidenceCoverage);

            return (
              <tr
                key={record.id}
                className="border-b border-[#1E2D4A]/60 align-middle hover:bg-[#1E2D4A]/30 transition-colors"
              >
                {/* Record ID */}
                <td className="px-4 py-3">
                  <span className="font-mono text-[10px] text-violet-400">
                    {formatRecordId(record.id)}
                  </span>
                </td>

                {/* Title */}
                <td className="px-4 py-3 max-w-[200px]">
                  <span className="line-clamp-2 text-[11px] font-semibold text-slate-200 leading-snug">
                    {record.subject || 'Untitled'}
                  </span>
                </td>

                {/* Category */}
                <td className="px-4 py-3">
                  <span className="text-[11px] text-slate-400">{record.category ?? '—'}</span>
                </td>

                {/* Department */}
                <td className="px-4 py-3">
                  <span className="text-[11px] text-slate-400">{record.department ?? '—'}</span>
                </td>

                {/* Risk */}
                <td className="px-4 py-3">
                  <RiskBadge riskLevel={record.riskLevel} />
                </td>

                {/* Compliance Score */}
                <td className="px-4 py-3">
                  <ScoreBar value={record.complianceScore} color={compColor} />
                </td>

                {/* Evidence Coverage */}
                <td className="px-4 py-3">
                  <ScoreBar value={record.evidenceCoverage} color={evidColor} />
                </td>

                {/* Source */}
                <td className="px-4 py-3">
                  <SourceBadge source={record.sourcePlatform} />
                </td>

                {/* Age */}
                <td className="px-4 py-3">
                  <span
                    className="text-[11px] text-slate-500"
                    title={dateText(record.createdAt)}
                  >
                    {ageText(record.createdAt)}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <ComplianceStatusBadge score={record.complianceScore} status={record.status} />
                </td>

                {/* Action */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/approvals/${record.id}`}
                      className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap"
                      title="View approval record"
                    >
                      View
                    </Link>
                    <span className="text-slate-700">·</span>
                    {investigationId ? (
                      <Link
                        href={`/investigations/${investigationId}`}
                        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
                      >
                        Case
                      </Link>
                    ) : (
                      <Link
                        href={`/investigations/new?approvalId=${record.id}`}
                        className="text-[10px] font-bold text-slate-500 hover:text-slate-400 transition-colors whitespace-nowrap"
                      >
                        Investigate
                      </Link>
                    )}
                    <span className="text-slate-700">·</span>
                    <Link
                      href={`/copilot?context=compliance&id=${record.id}`}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
                    >
                      Copilot
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
