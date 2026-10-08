/**
 * My Approvals (/dashboard/approvals?view=mine) — pure, DB-independent
 * derivation logic. Mirrors the lib/action-center.ts + services/
 * action-center.ts split already established in this codebase: the
 * Prisma-wiring layer (services/myApprovals.ts) imports these, so the
 * genuinely pure parts run as real executed unit tests (tests/my-approvals.
 * test.ts) rather than only static source-regex assertions.
 *
 * SORTING NOTE: an earlier version of this module also held a JS-side
 * priorityBucket()/sortRows() pair, used to sort a JS-fetched page of rows.
 * That was replaced by a real database ORDER BY (see services/myApprovals.ts's
 * fetchSortedPageIds()) so sorting is correct across the viewer's ENTIRE
 * matching set, not just a bounded fetch — so there is no pure-JS sort
 * function left to unit-test here; the SQL expression's correctness is
 * instead proven against a real Postgres instance (see this module's own
 * users and the task's real-Postgres verification report). derivePersonalStatus()
 * and viewerConfirmationRequest() remain here because they are still used
 * for real, independent of sorting: deriving each already-fetched page row's
 * displayed personalStatus/dueAt/action-eligibility in services/myApprovals.ts.
 *
 * See services/myApprovals.ts's own header comment for the full
 * architecture/reuse rationale this module is part of.
 */

export type MyApprovalPersonalStatus = 'PENDING_REVIEW' | 'CONFIRMATION_REQUIRED' | 'APPROVED' | 'REJECTED';
export type MyApprovalsSort = 'priority' | 'due' | 'newest' | 'oldest' | 'lastActivity';
export type MyApprovalsStatusFilter = 'PENDING_REVIEW' | 'CONFIRMATION_REQUIRED' | 'APPROVED' | 'REJECTED';

type MinimalConfirmationRequest = { expiresAt: Date; approverEmail: string };

/** The minimum shape every sort/derivation helper below needs — kept
 *  deliberately narrower than the full Prisma row so this file never
 *  imports @prisma/client, matching lib/action-center.ts's own
 *  DB-independence. services/myApprovals.ts's richer MyApprovalRecord type
 *  satisfies this structurally; no cast is needed at the call site. */
export type MinimalApprovalForMyApprovals = {
  status: string;
  riskLevel: string | null;
  occurredAt: Date;
  updatedAt: Date;
  manualDetail: { verificationStatus: string | null } | null;
  confirmationRequests: MinimalConfirmationRequest[];
};

/** The one real "what state is this in, from the viewer's point of view"
 *  derivation — mirrors services/action-center.ts's deriveActionType()
 *  priority (a pending confirmation always wins over the raw status) so
 *  this page can never disagree with Action Center about the same record. */
export function derivePersonalStatus(r: Pick<MinimalApprovalForMyApprovals, 'status' | 'manualDetail'>): MyApprovalPersonalStatus {
  if (r.manualDetail?.verificationStatus === 'PENDING_CONFIRMATION') return 'CONFIRMATION_REQUIRED';
  if (r.status === 'APPROVED') return 'APPROVED';
  if (r.status === 'REJECTED') return 'REJECTED';
  return 'PENDING_REVIEW';
}

/** The pending confirmation request on this row that is actually addressed
 *  to the viewer — never just "the earliest pending one," since a record
 *  could in principle carry a confirmation thread addressed to someone
 *  else (e.g. after a correction re-addressed it). Keeps dueAt/sort/action
 *  gating from ever showing or acting on another recipient's thread. */
export function viewerConfirmationRequest(r: MinimalApprovalForMyApprovals, email: string): MinimalConfirmationRequest | null {
  const req = r.confirmationRequests[0];
  if (!req) return null;
  return req.approverEmail.toLowerCase() === email.toLowerCase() ? req : null;
}

