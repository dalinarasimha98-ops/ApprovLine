/**
 * Awaiting My Response (/dashboard/responses) — pure, DB-independent
 * presentation helpers. Mirrors the lib/my-tasks.ts / lib/my-approvals.ts
 * split already established in this codebase. See services/
 * awaitingMyResponse.ts's own header comment for the full architecture/
 * reuse rationale.
 *
 * This is a focused projection over ONE real existing model —
 * ApprovalConfirmationRequest — never a second request/response engine.
 * Unlike My Tasks (which spans ApprovalRecord+InvestigationCase) or My
 * Approvals (ApprovalRecord as the primary entity), here the confirmation
 * REQUEST itself is the primary record: "what is explicitly waiting for my
 * response" is a property of the request (decision/expiresAt/approverEmail),
 * not of the underlying approval.
 */

export type AwaitingResponseStatusFilter = 'ACTIONABLE' | 'OVERDUE' | 'RESPONDED';
export type AwaitingResponseSort = 'priority' | 'due' | 'newest' | 'oldest';
export type AwaitingResponseDecision = 'CONFIRMED' | 'REJECTED' | 'CORRECTED';

export const AWAITING_RESPONSE_STATUS_LABELS: Record<AwaitingResponseStatusFilter, string> = {
  ACTIONABLE: 'Awaiting Response',
  OVERDUE: 'Overdue',
  RESPONDED: 'Responded',
};

/** The real, canonical decision->outcome-label mapping — the exact same 3
 *  values ApprovalConfirmationDecision's non-PENDING states already use
 *  (confirmed real in My Approvals' hardening pass: PENDING|CONFIRMED|
 *  REJECTED|CORRECTED). Never a fabricated 4th outcome. */
export const RESPONSE_OUTCOME_LABELS: Record<AwaitingResponseDecision, string> = {
  CONFIRMED: 'Confirmed',
  CORRECTED: 'Corrected',
  REJECTED: 'Rejected',
};

export type RequestState = {
  statusLabel: string;
  isActionable: boolean;
  isOverdue: boolean;
  outcome: AwaitingResponseDecision | null;
  actionLabel: string;
};

/**
 * THE single authoritative derivation of a request's display state — pure,
 * DB-independent, so it can be real-executed tested (see
 * tests/awaiting-my-response.test.ts) rather than only regex-matched
 * against the service file that calls it.
 *
 * `isActionable` here is — by construction — the EXACT same condition
 * components/approvals/ManualApprovalPanel.tsx's myPendingConfirmation
 * uses to decide whether the real Confirm/Correct/Reject buttons render:
 * decision === 'PENDING' AND expiresAt > now. A row this function ever
 * marks actionable (actionLabel: 'Respond') is therefore always a row
 * whose destination page genuinely has a working response control — never
 * a dead CTA. An expired-but-still-PENDING request is "Overdue", not
 * "Awaiting Response" — the response window has genuinely closed
 * (respondToConfirmation() itself refuses an expired request with
 * CONFIRMATION_NOT_FOUND), so its only honest action is to view the
 * approval, never a misleading Respond/Confirm/Correct/Reject control.
 */
export function deriveRequestState(decision: 'PENDING' | AwaitingResponseDecision, expiresAt: Date, now: Date): RequestState {
  if (decision === 'PENDING') {
    const isActionable = expiresAt > now;
    return {
      statusLabel: isActionable ? AWAITING_RESPONSE_STATUS_LABELS.ACTIONABLE : AWAITING_RESPONSE_STATUS_LABELS.OVERDUE,
      isActionable,
      isOverdue: !isActionable,
      outcome: null,
      actionLabel: isActionable ? 'Respond' : 'View Approval',
    };
  }
  return {
    statusLabel: RESPONSE_OUTCOME_LABELS[decision],
    isActionable: false,
    isOverdue: false,
    outcome: decision,
    actionLabel: 'View Approval',
  };
}
