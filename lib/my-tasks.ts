/**
 * My Tasks (/dashboard/tasks) — pure, DB-independent presentation helpers.
 * Mirrors the lib/action-center.ts / lib/my-approvals.ts split already
 * established in this codebase. See services/myTasks.ts's own header
 * comment for the full architecture/reuse rationale.
 */

import type { InvestigationStatus } from '@prisma/client';

export type MyTaskType = 'CONFIRMATION' | 'VERIFICATION' | 'INVESTIGATION';
export type MyTaskSort = 'priority' | 'due' | 'newest' | 'oldest' | 'lastActivity';
export type MyTaskStatusFilter = 'OPEN' | 'COMPLETED';

export const MY_TASK_TYPE_LABELS: Record<MyTaskType, string> = {
  CONFIRMATION: 'Confirmation',
  VERIFICATION: 'Verification',
  INVESTIGATION: 'Investigation',
};

/** InvestigationCase.status's real, complete enum, labeled for display —
 *  never collapsed into a generic Open/Closed that would hide the real
 *  IN_PROGRESS/ESCALATED states this app's own Investigation Center
 *  already shows. */
export const INVESTIGATION_STATUS_LABELS: Record<InvestigationStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** Matches Investigation Center's own real resolution concept
 *  (resolvedAt/status) — RESOLVED and CLOSED are the only two terminal
 *  states; OPEN/IN_PROGRESS/ESCALATED are all genuinely still open work. */
export function isInvestigationOpen(status: InvestigationStatus): boolean {
  return status !== 'RESOLVED' && status !== 'CLOSED';
}

/**
 * The Completed tab's date-range filter: a half-open interval
 * [from, nextDay(to)) — never `lte: endOfDay`. Pure/DB-independent so this
 * exact boundary arithmetic can be real-executed tested (see
 * tests/my-tasks.test.ts) without a database, not just regex-matched
 * against the service file that calls it.
 *
 * `from`/`to` arrive as plain "YYYY-MM-DD" date-picker values. A bare
 * date-only string parses as UTC midnight per the ECMA-262 Date Time
 * String Format (independent of server TZ) — so a user who picks "through
 * Oct 8" means "include every completion that happened on the calendar day
 * of Oct 8," not "stop at Oct 8 00:00:00." A naive `lte: new Date(to)`
 * compares every row's real completion timestamp against that UTC
 * midnight instant, silently excluding anything completed later the same
 * day. `lt: nextDay(to)` moves the boundary to the start of the FOLLOWING
 * day instead, so the entire selected end day is included — the same
 * frame (UTC midnight) `gte: new Date(from)` already uses, kept internally
 * consistent rather than mixing a `<=` end-of-day guess into it.
 *
 * No org/user timezone is applied here deliberately: neither
 * Organization.defaultTimeZone nor User.timezone is consumed by ANY
 * date-range-filtering query anywhere in this codebase today (both are
 * consumed only by services/settings.ts / services/userSettings.ts for
 * display formatting, never for query boundaries) — not in lib/
 * approvalRecords.ts's buildApprovalRecordsWhere (My Approvals / org-wide
 * Approval History), not in services/individualDashboard.ts's
 * resolveIndividualDashboardRange, and not here. Introducing
 * timezone-aware boundaries for My Tasks alone, while every other
 * date-range surface in the app stays UTC-midnight-based, would make this
 * one page disagree with its own siblings about what "Oct 8" means — a
 * worse inconsistency than the one being fixed. UTC-midnight, half-open,
 * is the one semantic this function can keep correct and consistent with
 * the rest of the app today.
 *
 * KNOWN, PRE-EXISTING, OUT OF SCOPE: the identical `lte: new Date(to)`
 * same-day-exclusion pattern this function used to have also exists in
 * lib/approvalRecords.ts's buildApprovalRecordsWhere() (consumed by My
 * Approvals and the org-wide Approval History page) and in services/
 * individualDashboard.ts's resolveIndividualDashboardRange() custom-range
 * branch. Neither is touched here: both are relied on by other,
 * already-locked pages, and changing a function multiple other pages
 * depend on is explicitly out of scope for a My-Tasks-only pass.
 */
export function completedDateRangeFilter(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  const fromDate = from ? new Date(from) : undefined;
  const gte = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined;
  const toDate = to ? new Date(to) : undefined;
  const lt = toDate && !Number.isNaN(toDate.getTime()) ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000) : undefined;
  if (!gte && !lt) return undefined; // never return an empty, semantically-vacuous filter object
  return { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
}
