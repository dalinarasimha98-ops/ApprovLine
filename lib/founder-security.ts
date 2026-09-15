/**
 * Founder Security (/founder/security) — pure, client-safe types and
 * display helpers. No DB/framework dependencies (matches lib/founder-
 * audit-logs.ts's and lib/founder-background-jobs.ts's convention).
 *
 * ARCHITECTURE — see services/founder-security.ts's header for the full
 * audit. This module defines the ONE status vocabulary and category
 * taxonomy the security posture model uses — no second scoring system,
 * no numeric "security score." Every control's status is a plain,
 * human-auditable enum with an explicit, honest meaning (see
 * SECURITY_STATUS_LABELS below) — never averaged, weighted, or converted
 * into a percentage anywhere in this codebase.
 */

export type SecurityStatus = 'VERIFIED' | 'ATTENTION' | 'NOT_VERIFIED' | 'FAILED';

export const SECURITY_STATUS_LABELS: Record<SecurityStatus, string> = {
  VERIFIED: 'Verified',
  ATTENTION: 'Attention',
  NOT_VERIFIED: 'Not Verified',
  FAILED: 'Failed',
};

/**
 * Explicit, honest semantics — never inferred, never blurred:
 *   VERIFIED     — real implementation/test/live-check evidence exists and
 *                  was independently confirmed by reading the actual
 *                  source (or running the actual check), not by trusting
 *                  a comment, a variable name, or a prior report.
 *   ATTENTION    — the control exists and functions, but has a known,
 *                  named weakness, architectural limitation, or requires
 *                  Founder review before it can be called fully hardened.
 *   NOT_VERIFIED — the repository does not contain enough authoritative
 *                  evidence, one way or the other, to make a defensible
 *                  claim. Never silently treated as VERIFIED.
 *   FAILED       — a concrete, currently-broken security control.
 */
export function securityStatusTone(status: SecurityStatus): 'green' | 'amber' | 'slate' | 'red' {
  if (status === 'VERIFIED') return 'green';
  if (status === 'ATTENTION') return 'amber';
  if (status === 'NOT_VERIFIED') return 'slate';
  return 'red';
}

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const SECURITY_SEVERITY_LABELS: Record<SecuritySeverity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export type SecurityCategory =
  | 'FOUNDATION'
  | 'ACCESS_CONTROL'
  | 'TENANT_SECURITY'
  | 'AUDIT_GOVERNANCE'
  | 'SECRET_PROTECTION'
  | 'INTEGRATION_SECURITY'
  | 'INFRASTRUCTURE';

export const SECURITY_CATEGORY_LABELS: Record<SecurityCategory, string> = {
  FOUNDATION: 'Foundation',
  ACCESS_CONTROL: 'Access Control',
  TENANT_SECURITY: 'Tenant Security',
  AUDIT_GOVERNANCE: 'Audit & Governance',
  SECRET_PROTECTION: 'Secret Protection',
  INTEGRATION_SECURITY: 'Integration Security',
  INFRASTRUCTURE: 'Infrastructure',
};

export const SECURITY_CATEGORY_FILTER_OPTIONS: { value: SecurityCategory | ''; label: string }[] = [
  { value: '', label: 'All categories' },
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'ACCESS_CONTROL', label: 'Access Control' },
  { value: 'TENANT_SECURITY', label: 'Tenant Security' },
  { value: 'AUDIT_GOVERNANCE', label: 'Audit & Governance' },
  { value: 'SECRET_PROTECTION', label: 'Secret Protection' },
  { value: 'INTEGRATION_SECURITY', label: 'Integration Security' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure' },
];

export const SECURITY_STATUS_FILTER_OPTIONS: { value: SecurityStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'ATTENTION', label: 'Attention' },
  { value: 'NOT_VERIFIED', label: 'Not Verified' },
  { value: 'FAILED', label: 'Failed' },
];

export type SecurityControl = {
  key: string;
  title: string;
  category: SecurityCategory;
  status: SecurityStatus;
  severity: SecuritySeverity | null;
  /** One-line summary shown in the table's Evidence column. */
  summary: string;
  /** Full explanation of why this status was assigned. */
  whyThisStatus: string;
  /** What was actually checked to support the status — spells out the real
   * IMPLEMENTED / TESTED / VERIFIED distinction in prose rather than a
   * second parallel enum, since that distinction is inherently narrative. */
  evidence: string;
  /** File/function/test names — never sensitive file contents or values. */
  sources: string[];
  /** What this control actually protects. */
  securityImplication: string;
  /** Remediation/next-step guidance. Null only when genuinely inapplicable. */
  nextAction: string | null;
};

export {
  fmtDateTime,
  fmtRelativeTime,
  sanitizeActivityMetadata,
  actorDisplayName,
  resolveAuditTarget,
  auditCategoryFor,
  auditCategoryTone,
  auditLabelFor,
  AUDIT_CATEGORY_LABELS,
} from './founder-audit-logs';
