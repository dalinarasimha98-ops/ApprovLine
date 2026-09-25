import type { AlertSeverity } from '@/services/alerts';

const SEVERITY_CLASSES: Record<AlertSeverity, string> = {
  Critical: 'border-al-danger/30 bg-al-danger/10 text-al-danger',
  High: 'border-al-warning/30 bg-al-warning/10 text-al-warning',
  Medium: 'border-al-info/30 bg-al-info/10 text-al-accent',
  Low: 'border-al-success/30 bg-al-success/10 text-al-success',
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  Critical: 'bg-al-danger',
  High: 'bg-al-warning',
  Medium: 'bg-al-info/100',
  Low: 'bg-al-success',
};

export function SeverityBadge({ severity, score }: { severity: AlertSeverity; score?: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${SEVERITY_CLASSES[severity]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
      {severity}
      {score !== undefined ? <span className="font-semibold opacity-70">· {score}</span> : null}
    </span>
  );
}

export function OperationalStatusBadge({ escalated, investigating, acknowledged }: { escalated: boolean; investigating: boolean; acknowledged: boolean }) {
  if (investigating) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-indigo-700">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
        Investigating
      </span>
    );
  }
  if (escalated) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-al-accent/30 bg-al-accent/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-al-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-al-accent-hover" />
        Escalated
      </span>
    );
  }
  if (acknowledged) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-al-border bg-al-surface-sunken px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-al-text-secondary">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Acknowledged
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-orange-700">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
      Open
    </span>
  );
}
