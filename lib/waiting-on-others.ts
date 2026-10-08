/**
 * Waiting on Others (/dashboard/waiting-on-others) — pure, DB-independent
 * presentation helpers. Mirrors the lib/my-tasks.ts / lib/awaiting-my-
 * response.ts split already established in this codebase. See
 * services/waitingOnOthers.ts's own header comment for the full
 * architecture/reuse rationale and the source/relationship matrix.
 *
 * This is the structural MIRROR of My Tasks and Awaiting My Response,
 * read from the opposite direction: those answer "work assigned to me" /
 * "what needs MY response" (OTHER -> ME or ME -> ME); this answers "work I
 * initiated where ANOTHER person is the next actor" (ME -> OTHER). Same
 * three underlying record types My Tasks already uses
 * (ApprovalConfirmationRequest / ManualApprovalDetail second-person
 * verification / InvestigationCase), each has a real, already-production
 * initiator field (requestedByUserId / recorderUserId / createdByUserId)
 * and a real, already-production next-actor field (approverEmail /
 * secondVerifierUserId / assignedToUserId) — never inferred from
 * department, role, team, or "created around the same time."
 */

export type WaitingOnOthersType = 'CONFIRMATION' | 'VERIFICATION' | 'INVESTIGATION';
export type WaitingOnOthersSort = 'priority' | 'due' | 'longestWaiting' | 'newest' | 'oldest';
export type WaitingOnOthersDueBucket = 'OVERDUE' | 'DUE_SOON' | 'NORMAL';

export const WAITING_ON_OTHERS_TYPE_LABELS: Record<WaitingOnOthersType, string> = {
  CONFIRMATION: 'Confirmation',
  VERIFICATION: 'Verification',
  INVESTIGATION: 'Investigation',
};

const DUE_SOON_HORIZON_DAYS = 14;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Only CONFIRMATION/VERIFICATION rows ever have a real due date
 *  (ApprovalConfirmationRequest.expiresAt) — INVESTIGATION has no deadline
 *  field anywhere in this schema (InvestigationCase.dateRangeEnd is scope,
 *  not a deadline, per lib/my-tasks.ts's own identical documented
 *  decision), so its dueAt is always null here, never fabricated. */
export function deriveDueBucket(dueAt: Date | null, now: Date): WaitingOnOthersDueBucket {
  if (!dueAt) return 'NORMAL';
  if (dueAt.getTime() < now.getTime()) return 'OVERDUE';
  if (dueAt.getTime() <= now.getTime() + DUE_SOON_HORIZON_DAYS * MS_PER_DAY) return 'DUE_SOON';
  return 'NORMAL';
}

/** "Overdue by 2 days" / "Due today" / "Due tomorrow" / "Due in 4 days" /
 *  "No due date" — never a fabricated deadline for a row type with none. */
export function formatDueLabel(dueAt: Date | null, now: Date): string {
  if (!dueAt) return 'No due date';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDueDay = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  const dayDiff = Math.round((startOfDueDay.getTime() - startOfToday.getTime()) / MS_PER_DAY);
  if (dayDiff < 0) {
    const overdueDays = Math.abs(dayDiff);
    return overdueDays === 1 ? 'Overdue by 1 day' : `Overdue by ${overdueDays} days`;
  }
  if (dayDiff === 0) return 'Due today';
  if (dayDiff === 1) return 'Due tomorrow';
  return `Due in ${dayDiff} days`;
}

/**
 * "Waiting 2 hours" / "Waiting 1 day" / "Waiting 6 days" — from the
 * authoritative ME -> OTHER transition timestamp, never page-load time.
 * For CONFIRMATION/VERIFICATION that is the real ApprovalConfirmationRequest/
 * ManualApprovalDetail creation timestamp (the moment the request was
 * genuinely sent to the other party). For INVESTIGATION, see this
 * function's caller in services/waitingOnOthers.ts for the documented
 * caveat: InvestigationCase has no dedicated "assigned at" timestamp, so
 * its own createdAt is used, matching lib/my-tasks.ts's identical
 * precedent for the same record type.
 */
export function formatWaitingDuration(startedAt: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - startedAt.getTime());
  if (ms < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.floor(ms / 60_000));
    return minutes === 1 ? 'Waiting 1 minute' : `Waiting ${minutes} minutes`;
  }
  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    return hours === 1 ? 'Waiting 1 hour' : `Waiting ${hours} hours`;
  }
  const days = Math.floor(ms / MS_PER_DAY);
  return days === 1 ? 'Waiting 1 day' : `Waiting ${days} days`;
}

/** "Waiting on Sarah Chen" / "Waiting on 2 people" — multi-party
 *  confirmations (a single ApprovalRecord can genuinely have more than one
 *  outstanding ApprovalConfirmationRequest from different approvers — this
 *  schema has no uniqueness constraint preventing it) must never be
 *  reduced to showing only one remaining approver as if the others had
 *  completed. names here must already be exactly the set of people whose
 *  decision is still PENDING — never include anyone who already responded. */
export function formatWaitingOnLabel(names: string[]): string {
  if (names.length === 0) return 'Waiting on someone';
  if (names.length === 1) return `Waiting on ${names[0]}`;
  return `Waiting on ${names.length} people`;
}
