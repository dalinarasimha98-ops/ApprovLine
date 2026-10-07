/**
 * My Approvals (/dashboard/approvals?view=mine) — pure, DB-independent
 * derivation/sorting logic. Mirrors the lib/action-center.ts +
 * services/action-center.ts split already established in this codebase:
 * the Prisma-wiring layer (services/myApprovals.ts) imports these, so the
 * genuinely pure parts run as real executed unit tests (tests/my-approvals.
 * test.ts) rather than only static source-regex assertions.
 *
 * See services/myApprovals.ts's own header comment for the full
 * architecture/reuse rationale this module is part of.
 */

export type MyApprovalPersonalStatus = 'PENDING_REVIEW' | 'CONFIRMATION_REQUIRED' | 'APPROVED' | 'REJECTED';
export type MyApprovalsSort = 'priority' | 'due' | 'newest' | 'oldest' | 'lastActivity';
export type MyApprovalsStatusFilter = 'PENDING_REVIEW' | 'CONFIRMATION_REQUIRED' | 'APPROVED' | 'REJECTED';

const DUE_SOON_HORIZON_DAYS = 14;

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

/** A real, deterministic bucket (overdue → due today → due soon → open
 *  high/critical risk → other open → closed) built from actual fields
 *  (confirmationRequest.expiresAt, riskLevel, status) — never a fabricated
 *  priority score. */
export function priorityBucket(r: MinimalApprovalForMyApprovals, now: number, email: string): number {
  const personalStatus = derivePersonalStatus(r);
  const isOpen = personalStatus === 'PENDING_REVIEW' || personalStatus === 'CONFIRMATION_REQUIRED';
  const dueAt = viewerConfirmationRequest(r, email)?.expiresAt ?? null;
  if (isOpen && dueAt) {
    if (dueAt.getTime() < now) return 0; // overdue
    const dueDay = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate()).getTime();
    const today = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
    if (dueDay === today) return 1; // due today
    if (dueAt.getTime() <= now + DUE_SOON_HORIZON_DAYS * 86_400_000) return 2; // due soon
  }
  if (isOpen && ['high', 'critical'].includes((r.riskLevel ?? '').toLowerCase())) return 3; // open, high/critical risk
  if (isOpen) return 4; // other open
  return 5; // closed/historical
}

export function sortRows<T extends MinimalApprovalForMyApprovals>(rows: T[], sort: MyApprovalsSort, now: number, email: string): T[] {
  const withIndex = rows.map((r, index) => ({ r, index }));
  withIndex.sort((a, b) => {
    let primary: number;
    if (sort === 'newest') primary = b.r.occurredAt.getTime() - a.r.occurredAt.getTime();
    else if (sort === 'oldest') primary = a.r.occurredAt.getTime() - b.r.occurredAt.getTime();
    else if (sort === 'lastActivity') primary = b.r.updatedAt.getTime() - a.r.updatedAt.getTime();
    else if (sort === 'due') {
      const aDue = viewerConfirmationRequest(a.r, email)?.expiresAt?.getTime() ?? Infinity;
      const bDue = viewerConfirmationRequest(b.r, email)?.expiresAt?.getTime() ?? Infinity;
      primary = aDue !== bDue ? aDue - bDue : b.r.occurredAt.getTime() - a.r.occurredAt.getTime();
    } else {
      // 'priority' (default)
      const aBucket = priorityBucket(a.r, now, email);
      const bBucket = priorityBucket(b.r, now, email);
      if (aBucket !== bBucket) {
        primary = aBucket - bBucket;
      } else {
        const aDue = viewerConfirmationRequest(a.r, email)?.expiresAt?.getTime();
        const bDue = viewerConfirmationRequest(b.r, email)?.expiresAt?.getTime();
        primary = aDue !== undefined && bDue !== undefined && aDue !== bDue
          ? aDue - bDue
          : b.r.occurredAt.getTime() - a.r.occurredAt.getTime();
      }
    }
    // Explicit tiebreaker on original index — never rely on sort stability alone.
    return primary !== 0 ? primary : a.index - b.index;
  });
  return withIndex.map(({ r }) => r);
}
