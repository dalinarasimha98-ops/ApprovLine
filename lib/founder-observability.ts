/**
 * Founder Observability (/founder/observability) — pure helpers shared by
 * the server aggregation layer (services/founder-observability.ts) and the
 * client component. Introduces its own severity vocabulary because
 * Observability correlates signals from four differently-typed reports
 * (SystemHealthStatus, QueueHealthState, WorkerState, and Integration/
 * Security's own HEALTHY/ATTENTION/CRITICAL-shaped states) into one ranked
 * list — this is the one place that mapping is written, not duplicated.
 */
export { fmtDateTime, fmtRelativeTime } from './founder-activity';

export type ObservabilitySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export const OBSERVABILITY_SEVERITY_LABELS: Record<ObservabilitySeverity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
};

export function observabilitySeverityTone(severity: ObservabilitySeverity): 'red' | 'amber' | 'slate' {
  if (severity === 'CRITICAL') return 'red';
  if (severity === 'HIGH') return 'amber';
  return 'slate';
}

// Ranks CRITICAL first, then HIGH, then MEDIUM, then by most-recently-seen
// within the same severity — the ordering the Observability Attention list
// and the right panel's "Recent Incidents" both render in.
const SEVERITY_RANK: Record<ObservabilitySeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
export function sortObservabilitySignals<T extends { severity: ObservabilitySeverity; lastSeen: Date }>(signals: T[]): T[] {
  return [...signals].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.lastSeen.getTime() - a.lastSeen.getTime());
}
