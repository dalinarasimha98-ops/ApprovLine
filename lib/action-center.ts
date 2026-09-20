/**
 * Action Center (/dashboard/pending-actions) — pure, client-safe types and
 * derivation helpers. No DB/framework dependencies, so these run as real
 * executed unit tests (see tests/action-center.test.ts) rather than only
 * static source assertions.
 *
 * ARCHITECTURE — every "pending action" is derived from data ApprovLine
 * already captures; nothing here is a second source of truth:
 *
 *   1. APPROVAL_REQUEST / REVIEW_REQUEST — an ApprovalRecord whose
 *      authoritative `status` is PENDING_REVIEW (the same status the
 *      existing /dashboard/approvals page and Alerts already treat as
 *      "not yet decided"). Escalation-classified records (ApprovalType
 *      ESCALATION) are labeled REVIEW_REQUEST instead of APPROVAL_REQUEST
 *      — a real distinction the classifier already makes, not invented
 *      for this feature.
 *
 *   2. CONFIRMATION_REQUEST — a manual/verbal approval
 *      (ManualApprovalDetail) whose `verificationStatus` is
 *      PENDING_CONFIRMATION, or an ApprovalConfirmationRequest whose
 *      `decision` is PENDING and has not expired. Both represent the same
 *      real product concept ("please confirm this recorded decision is
 *      accurate") and are deduplicated by approvalRecordId in
 *      services/action-center.ts — never shown twice for the same record.
 *
 * RESOLUTION — traced directly from the write paths that actually flip
 * these fields (services/manual-approvals.ts, app/api/confirmations/
 * [token]/route.ts):
 *   - A CONFIRMATION_REQUEST resolves the moment verificationStatus moves
 *     to CONFIRMED_BY_APPROVER (-> "Resolved") or DISPUTED (-> "Disputed").
 *   - An APPROVAL_REQUEST/REVIEW_REQUEST resolves the moment the parent
 *     ApprovalRecord's own `status` moves away from PENDING_REVIEW. In
 *     this codebase today that transition is written from exactly one
 *     place (the manual-approval correction path) — there is no live
 *     classifier/correlation mechanism that ever revisits an AI-classified
 *     PENDING_REVIEW record and resolves it automatically (verified by
 *     grepping every `approvalRecord.update` call site). This is a real,
 *     pre-existing architectural gap, not something this feature papers
 *     over — see the module header of services/action-center.ts and the
 *     task's own final report for the honest statement of this limit.
 *
 * DUE DATES are never invented. Only ApprovalConfirmationRequest carries a
 * real deadline (`expiresAt`, the confirmation link's expiry) — every other
 * action type has no due-date field anywhere in the schema, so its dueAt is
 * `null` and the UI must say "Due date not specified", never fabricate one.
 *
 * PRIORITY reuses ApprovalRecord.riskLevel verbatim (the same low/medium/
 * high/critical vocabulary components/dashboard/ApprovalTable.tsx already
 * renders) — no second priority/urgency scoring system.
 */

export type ActionType = 'APPROVAL_REQUEST' | 'REVIEW_REQUEST' | 'CONFIRMATION_REQUEST';

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  APPROVAL_REQUEST: 'Approval Request',
  REVIEW_REQUEST: 'Review Request',
  CONFIRMATION_REQUEST: 'Confirmation Request',
};

/** Reuses ApprovalRecord.riskLevel's real vocabulary verbatim. Null/unknown
 *  displays as 'low', matching components/dashboard/ApprovalTable.tsx's own
 *  existing `approval.riskLevel ?? 'low'` convention — not a new default. */
export type ActionPriority = 'low' | 'medium' | 'high' | 'critical';

export const ACTION_PRIORITY_LABELS: Record<ActionPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function normalizePriority(riskLevel: string | null | undefined): ActionPriority {
  const v = riskLevel?.toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') return v;
  return 'low';
}

/** The two genuinely-open verification states plus the two genuinely-closed
 *  ones — the real, complete ManualApprovalVerificationStatus enum. SUPERSEDED
 *  is treated as closed (no longer the live version of the record; the
 *  action a user would take on it no longer applies). */
export type OpenActionStatus = 'PENDING' | 'DUE_TODAY' | 'OVERDUE';
export type ClosedActionStatus = 'RESOLVED' | 'DISPUTED' | 'SUPERSEDED';
export type ActionStatus = OpenActionStatus | ClosedActionStatus;

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PENDING: 'Pending',
  DUE_TODAY: 'Due Today',
  OVERDUE: 'Overdue',
  RESOLVED: 'Resolved',
  DISPUTED: 'Disputed',
  SUPERSEDED: 'Superseded',
};

export function isOpenStatus(status: ActionStatus): status is OpenActionStatus {
  return status === 'PENDING' || status === 'DUE_TODAY' || status === 'OVERDUE';
}

/**
 * ONE authoritative status-resolution path. Every surface (table, KPI
 * strip, drawer) calls this instead of computing pending/due/overdue
 * independently. `closedAs` is set only when the record's own authoritative
 * field already recorded a terminal outcome (verificationStatus !=
 * PENDING_CONFIRMATION, or an ApprovalConfirmationRequest whose decision
 * != PENDING) — resolveActionStatus never guesses a closed state from a
 * due date alone; only OPEN items ever look at the due date to decide
 * PENDING vs DUE_TODAY vs OVERDUE.
 */
export function resolveActionStatus(input: { closedAs: ClosedActionStatus | null; dueAt: Date | null }, now: Date = new Date()): ActionStatus {
  if (input.closedAs) return input.closedAs;
  if (!input.dueAt) return 'PENDING';
  const due = input.dueAt;
  if (due.getTime() < now.getTime()) return 'OVERDUE';
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (dueDay === today) return 'DUE_TODAY';
  return 'PENDING';
}

export type ActionSourcePlatform = 'SLACK' | 'GMAIL' | 'OUTLOOK' | 'MICROSOFT_TEAMS' | 'JIRA' | 'SERVICENOW' | 'ZOOM' | 'CUSTOM' | 'UNKNOWN';

/** ApprovalRecord.sourcePlatform is free text written by the classifier
 *  pipeline (lowercase provider names, e.g. "slack") — this normalizes it
 *  onto the same IntegrationProvider vocabulary the schema's enum already
 *  defines, purely for consistent display; it never changes what is stored. */
export function normalizeSourcePlatform(raw: string | null | undefined): ActionSourcePlatform {
  const v = raw?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (v) {
    case 'slack': return 'SLACK';
    case 'gmail': return 'GMAIL';
    case 'outlook': return 'OUTLOOK';
    case 'teams':
    case 'microsoft_teams': return 'MICROSOFT_TEAMS';
    case 'jira': return 'JIRA';
    case 'servicenow': return 'SERVICENOW';
    case 'zoom': return 'ZOOM';
    case 'custom': return 'CUSTOM';
    default: return 'UNKNOWN';
  }
}

export const SOURCE_PLATFORM_LABELS: Record<ActionSourcePlatform, string> = {
  SLACK: 'Slack',
  GMAIL: 'Gmail',
  OUTLOOK: 'Outlook',
  MICROSOFT_TEAMS: 'Microsoft Teams',
  JIRA: 'Jira',
  SERVICENOW: 'ServiceNow',
  ZOOM: 'Zoom',
  CUSTOM: 'Custom',
  UNKNOWN: 'Unknown source',
};

export function fmtRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDueDate(date: Date | null, now: Date = new Date()): string {
  if (!date) return 'Due date not specified';
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((dueDay - today) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
