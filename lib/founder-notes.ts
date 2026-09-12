/**
 * Support & Notes (/founder/notes) — pure, client-safe types and display
 * helpers. No DB/framework dependencies (matches lib/founder-billing.ts's
 * and lib/founder-revenue.ts's convention).
 *
 * ARCHITECTURE BOUNDARY — see services/founder-notes.ts's header for the
 * full audit. In short:
 *   - NOTES        CustomerNote (id/customerAccountId/authorEmail/body/
 *                  pinned/createdAt/updatedAt) — the only note model.
 *                  No priority, status, SLA, assignee, or ticket-ID field
 *                  exists anywhere in the schema. This module never
 *                  fabricates any of those concepts.
 *   - CUSTOMER 360 owns the complete per-customer note history and
 *                  inline editing. This module shows only each
 *                  customer's LATEST note for portfolio-wide triage,
 *                  linking to Customer 360 for the full thread.
 *   - CUSTOMER ACTIVITY is FounderAuditLog (/founder/audit) — this
 *                  module never reads or displays audit-log events.
 *   - FOUNDER ATTENTION is CustomerHealth-based
 *                  (/founder/customer-health) — a separate engine. This
 *                  module's own "Customer Attention" section surfaces
 *                  only note-coverage signals (customers with no
 *                  recorded notes), never a health/risk score.
 */
import type { HealthStatus } from './customer-health';
import { HEALTH_STATUS_LABELS } from './customer-health';

export {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  accountStatusTone,
  fmtDate,
} from './founder-billing';

export type NotesCoverage = 'HAS_NOTES' | 'NO_NOTES';

export const NOTES_COVERAGE_FILTER_OPTIONS: { value: NotesCoverage | ''; label: string }[] = [
  { value: '', label: 'All notes coverage' },
  { value: 'HAS_NOTES', label: 'Has notes' },
  { value: 'NO_NOTES', label: 'No notes' },
];

/**
 * A short, table-safe preview of a note body — long notes must never
 * distort the portfolio table's row height or column width. The full,
 * untruncated body is always available in the drawer, never silently
 * dropped.
 */
export function notePreview(body: string, maxLength = 120): string {
  const singleLine = body.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

export function healthStatusLabel(status: HealthStatus): string {
  return HEALTH_STATUS_LABELS[status];
}

export function healthStatusTone(status: HealthStatus): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'HEALTHY') return 'green';
  if (status === 'NEEDS_ATTENTION') return 'amber';
  if (status === 'AT_RISK' || status === 'CRITICAL') return 'red';
  return 'slate';
}
