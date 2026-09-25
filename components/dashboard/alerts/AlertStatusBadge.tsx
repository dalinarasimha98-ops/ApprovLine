import type { AlertSeverity } from '@/services/alerts';

const SEVERITY_CLASSES: Record<AlertSeverity, string> = {
  Critical: 'border-rose-200 bg-rose-50 text-rose-700',
  High: 'border-amber-200 bg-amber-50 text-amber-800',
  Medium: 'border-blue-200 bg-blue-50 text-al-accent',
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  Critical: 'bg-al-danger',
  High: 'bg-al-warning',
  Medium: 'bg-blue-500',
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-violet-700">
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
