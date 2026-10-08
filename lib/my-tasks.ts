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
