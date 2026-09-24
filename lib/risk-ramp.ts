/**
 * The one place risk severity maps to a label and a color, for every
 * surface on the Approvals page. Previously this logic was duplicated
 * (components/dashboard/ApprovalTable.tsx's priorityLabel/priorityClass and
 * components/approvals/ApprovalDetailDrawer.tsx's own copies), and both
 * copies collapsed 'critical' and 'high' into the single displayed word
 * "High" sharing one color - a genuinely Critical-risk record and a
 * genuinely High-risk record were indistinguishable in the UI even though
 * ApprovalRecord.riskLevel correctly stored them as different values. That
 * collapsing, not a list/detail field mismatch, was why a Critical 88
 * record displayed as "High": both surfaces read the same riskLevel field,
 * but the shared-in-spirit (duplicated-in-fact) label function threw away
 * the distinction on the way to the screen.
 *
 * There is no numeric 0-100 risk score column on ApprovalRecord or
 * UnifiedEvidenceRecord today - only the stored riskLevel label
 * (low/medium/high/critical). This ramp buckets by that real label, not a
 * score that doesn't exist in the schema; the numeric ranges below describe
 * the band each label is intended to represent, for whenever a real score
 * is added, not a value actually read at runtime.
 */
export type RiskBand = 'critical' | 'high' | 'medium' | 'low';

const KNOWN_BANDS: readonly RiskBand[] = ['critical', 'high', 'medium', 'low'];

export function riskBand(riskLevel?: string | null): RiskBand {
  const normalized = riskLevel?.trim().toLowerCase() ?? '';
  return (KNOWN_BANDS as readonly string[]).includes(normalized) ? (normalized as RiskBand) : 'low';
}

export function riskLabel(riskLevel?: string | null): string {
  const band = riskBand(riskLevel);
  return band.charAt(0).toUpperCase() + band.slice(1);
}

// One red-to-green ramp, four visually distinct bands, no blue anywhere:
//   Critical 85-100 red · High 67-84 orange · Medium 34-66 amber · Low 0-33 green
const BADGE_CLASS: Record<RiskBand, string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-400',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
};

const DOT_CLASS: Record<RiskBand, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
};

export function riskBadgeClass(riskLevel?: string | null): string {
  return BADGE_CLASS[riskBand(riskLevel)];
}

export function riskDotClass(riskLevel?: string | null): string {
  return DOT_CLASS[riskBand(riskLevel)];
}
