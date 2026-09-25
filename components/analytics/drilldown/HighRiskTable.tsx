'use client';

import Link from 'next/link';

export type HighRiskTableRecord = {
  id: string;
  subject: string;
  category: string | null;
  approverName: string | null;
  department: string | null;
  riskLevel: string | null;
  confidence: number;
  businessImpact: string | null;
  sourcePlatform: string | null;
  status: string;
  evidenceSnippet: string | null;
  sourceLink: string | null;
  createdAt: Date;
  occurredAt: Date;
  investigations: Array<{ investigationId: string }>;
  auditLogs: Array<{ id: string }>;
};

function numberFormat(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

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

function RiskScoreBadge({ riskLevel }: { riskLevel: string | null }) {
  const level = riskLevel?.toLowerCase() ?? 'low';
  const score = level === 'critical' ? 95 : level === 'high' ? 80 : level === 'medium' ? 55 : 20;

  let bgColor = 'bg-al-success/15 text-al-success border-al-success/20';
  if (level === 'critical') bgColor = 'bg-red-900/30 text-red-300 border-red-900/40';
  else if (level === 'high') bgColor = 'bg-al-danger/15 text-al-danger border-al-danger/20';
  else if (level === 'medium') bgColor = 'bg-al-warning/15 text-al-warning border-al-warning/20';

  const label = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${bgColor}`}>
      <span className="font-mono">{score}</span>
      <span>{label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  if (s === 'APPROVED') return <span className="text-[10px] font-bold text-al-success">Approved</span>;
  if (s === 'REJECTED') return <span className="text-[10px] font-bold text-al-danger">Rejected</span>;
  if (s === 'PENDING_REVIEW') return <span className="text-[10px] font-bold text-al-warning">Pending</span>;
  return <span className="text-[10px] font-bold text-al-text-muted">{status.replaceAll('_', ' ')}</span>;
}

function EvidenceBar({ hasEvidence }: { hasEvidence: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-al-border">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{
            width: hasEvidence ? '100%' : '0%',
            backgroundColor: hasEvidence ? '#10B981' : '#EF4444',
          }}
        />
      </div>
      <span className={`text-[10px] font-bold ${hasEvidence ? 'text-al-success' : 'text-al-danger'}`}>
        {hasEvidence ? '✓' : '—'}
      </span>
    </div>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-[10px] text-al-text-secondary">Unknown</span>;
  const colors: Record<string, string> = {
    slack: 'bg-[#4A154B]/30 text-[#E01E5A]',
    gmail: 'bg-al-danger/10 text-al-danger',
    teams: 'bg-blue-600/10 text-al-info',
    outlook: 'bg-al-info/10 text-blue-300',
    jira: 'bg-blue-700/10 text-blue-500',
    zoom: 'bg-blue-900/20 text-blue-300',
    sap: 'bg-al-warning/10 text-al-warning',
    workday: 'bg-orange-500/10 text-orange-400',
    salesforce: 'bg-cyan-500/10 text-cyan-400',
  };
  const key = source.toLowerCase();
  const colorClass = colors[key] ?? 'bg-al-text-muted/10 text-al-text-muted';
  const label = source.charAt(0).toUpperCase() + source.slice(1);
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${colorClass}`}>
      {label}
    </span>
  );
}

export function HighRiskTable({ records }: { records: HighRiskTableRecord[] }) {
  if (records.length === 0) {
    return null; // empty state handled by parent
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-al-border">
            {['Approval ID', 'Title', 'Category', 'Approver', 'Dept', 'Risk', 'Value', 'Source', 'Age', 'Evidence', 'Status', 'Action'].map((col) => (
              <th key={col} className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.15em] text-al-text-muted whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const investigationId = record.investigations[0]?.investigationId ?? null;
            const hasEvidence = Boolean(record.evidenceSnippet || record.sourceLink);

            return (
              <tr key={record.id} className="border-b border-al-border/60 align-middle hover:bg-al-border/30 transition-colors">
                {/* Approval ID */}
                <td className="px-4 py-3">
                  <span className="font-mono text-[10px] text-al-text-muted">{record.id.slice(0, 8)}</span>
                </td>

                {/* Title */}
                <td className="px-4 py-3 max-w-[200px]">
                  <span className="line-clamp-2 text-[11px] font-semibold text-al-text-secondary leading-snug">
                    {record.subject || 'Untitled'}
                  </span>
                </td>

                {/* Category */}
                <td className="px-4 py-3">
                  <span className="text-[11px] text-al-text-muted">{record.category ?? '—'}</span>
                </td>

                {/* Approver */}
                <td className="px-4 py-3">
                  <span className="text-[11px] text-al-text-secondary">{record.approverName ?? 'Unknown'}</span>
                </td>

                {/* Department */}
                <td className="px-4 py-3">
                  <span className="text-[11px] text-al-text-muted">{record.department ?? '—'}</span>
                </td>

                {/* Risk Score */}
                <td className="px-4 py-3">
                  <RiskScoreBadge riskLevel={record.riskLevel} />
                </td>

                {/* Value */}
                <td className="px-4 py-3">
                  <span className="text-[11px] font-semibold text-al-text-secondary">
                    {record.businessImpact ?? '—'}
                  </span>
                </td>

                {/* Source */}
                <td className="px-4 py-3">
                  <SourceBadge source={record.sourcePlatform} />
                </td>

                {/* Age */}
                <td className="px-4 py-3">
                  <span className="text-[11px] text-al-text-muted" title={dateText(record.createdAt)}>
                    {ageText(record.createdAt)}
                  </span>
                </td>

                {/* Evidence */}
                <td className="px-4 py-3">
                  <EvidenceBar hasEvidence={hasEvidence} />
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={record.status} />
                </td>

                {/* Action */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/approvals/${record.id}`}
                      className="text-[10px] font-bold text-al-accent hover:text-al-accent transition-colors whitespace-nowrap"
                    >
                      View
                    </Link>
                    <span className="text-al-text-secondary">·</span>
                    {investigationId ? (
                      <Link
                        href={`/investigations/${investigationId}`}
                        className="text-[10px] font-bold text-al-warning hover:text-al-warning transition-colors whitespace-nowrap"
                      >
                        Case
                      </Link>
                    ) : (
                      <Link
                        href={`/investigations/new?approvalId=${record.id}`}
                        className="text-[10px] font-bold text-al-text-muted hover:text-al-text-muted transition-colors whitespace-nowrap"
                      >
                        Investigate
                      </Link>
                    )}
                    <span className="text-al-text-secondary">·</span>
                    <Link
                      href={`/copilot?context=approval&id=${record.id}`}
                      className="text-[10px] font-bold text-al-info hover:text-blue-300 transition-colors whitespace-nowrap"
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

// Keep numberFormat in scope to avoid lint unused-import warnings
void numberFormat;
