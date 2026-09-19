/**
 * Founder Certification (/founder/certification) — pure, client-safe types
 * and display helpers. No DB/framework dependencies (matches lib/founder-
 * security.ts's convention, which this module deliberately mirrors).
 *
 * ARCHITECTURE — see services/founder-certification.ts's header for the
 * full audit. This module defines the ONE status vocabulary the
 * certification checklist uses — no numeric "certification score," no
 * second scoring system.
 *
 * This page replaces services/founderCertification.ts's
 * buildProductionCertificationReport(), which was found to be entirely
 * static/fabricated (every control hardcoded to Pass, every category
 * hardcoded to score 100, invented p95 latency and error-rate numbers with
 * no load-test evidence behind them, invented RPO/RTO figures presented as
 * verified fact). That engine is no longer used by any page — see the
 * services/founder-certification.ts header for the full consumer audit.
 * There is now exactly one certification engine.
 */

export type CertificationStatus = 'VERIFIED' | 'ATTENTION' | 'NOT_VERIFIED' | 'FAILED' | 'NOT_ASSESSED';

export const CERTIFICATION_STATUS_LABELS: Record<CertificationStatus, string> = {
  VERIFIED: 'Verified',
  ATTENTION: 'Attention',
  NOT_VERIFIED: 'Not Verified',
  FAILED: 'Failed',
  NOT_ASSESSED: 'Not Assessed',
};

/**
 * Explicit, honest semantics — never inferred, never blurred:
 *   VERIFIED     — a live, currently-passing check backs this control
 *                  (re-derived from an existing authoritative builder on
 *                  every page load, not cached or hardcoded).
 *   ATTENTION    — a live check ran and found a real, named issue that is
 *                  not a hard failure (e.g. a degraded dependency, a
 *                  documented architectural limitation).
 *   NOT_VERIFIED — a live check ran but there is not enough data to make a
 *                  defensible claim either way (e.g. no data yet).
 *   FAILED       — a live check ran and found a concrete, currently-broken
 *                  control, or the check itself could not run at all.
 *   NOT_ASSESSED — no live, automated check exists for this control in this
 *                  codebase. What is shown is documented policy/target
 *                  content only (e.g. a backup retention policy, a load
 *                  test target) — never presented as a measured result.
 */
export function certificationStatusTone(status: CertificationStatus): 'green' | 'amber' | 'slate' | 'red' | 'blue' {
  if (status === 'VERIFIED') return 'green';
  if (status === 'ATTENTION') return 'amber';
  if (status === 'NOT_VERIFIED') return 'slate';
  if (status === 'FAILED') return 'red';
  return 'blue';
}

// Rank used to sort a checklist worst-first and to compute a single
// worst-of rollup across a set of controls (e.g. one category's overall
// status) without ever averaging statuses into a fake numeric score.
const STATUS_RANK: Record<CertificationStatus, number> = {
  FAILED: 0,
  ATTENTION: 1,
  NOT_VERIFIED: 2,
  NOT_ASSESSED: 3,
  VERIFIED: 4,
};

export function worstCertificationStatus(statuses: CertificationStatus[]): CertificationStatus {
  if (statuses.length === 0) return 'NOT_ASSESSED';
  return statuses.reduce((worst, status) => (STATUS_RANK[status] < STATUS_RANK[worst] ? status : worst));
}

export function sortCertificationControls<T extends { status: CertificationStatus }>(controls: T[]): T[] {
  return [...controls].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

export type CertificationCategory =
  | 'SECURITY_ACCESS'
  | 'TENANT_ISOLATION'
  | 'RELIABILITY_QUEUE'
  | 'SYSTEM_INFRASTRUCTURE'
  | 'INTEGRATIONS'
  | 'OBSERVABILITY'
  | 'AI_SYSTEMS'
  | 'DISASTER_RECOVERY'
  | 'LOAD_PERFORMANCE';

export const CERTIFICATION_CATEGORY_LABELS: Record<CertificationCategory, string> = {
  SECURITY_ACCESS: 'Security & Access',
  TENANT_ISOLATION: 'Tenant Isolation',
  RELIABILITY_QUEUE: 'Reliability & Queue',
  SYSTEM_INFRASTRUCTURE: 'System Infrastructure',
  INTEGRATIONS: 'Integrations',
  OBSERVABILITY: 'Observability & Monitoring',
  AI_SYSTEMS: 'AI Systems',
  DISASTER_RECOVERY: 'Backup & Disaster Recovery',
  LOAD_PERFORMANCE: 'Load & Performance',
};

export const CERTIFICATION_CATEGORY_FILTER_OPTIONS: { value: CertificationCategory | ''; label: string }[] = [
  { value: '', label: 'All categories' },
  { value: 'SECURITY_ACCESS', label: 'Security & Access' },
  { value: 'TENANT_ISOLATION', label: 'Tenant Isolation' },
  { value: 'RELIABILITY_QUEUE', label: 'Reliability & Queue' },
  { value: 'SYSTEM_INFRASTRUCTURE', label: 'System Infrastructure' },
  { value: 'INTEGRATIONS', label: 'Integrations' },
  { value: 'OBSERVABILITY', label: 'Observability & Monitoring' },
  { value: 'AI_SYSTEMS', label: 'AI Systems' },
  { value: 'DISASTER_RECOVERY', label: 'Backup & Disaster Recovery' },
  { value: 'LOAD_PERFORMANCE', label: 'Load & Performance' },
];

export const CERTIFICATION_STATUS_FILTER_OPTIONS: { value: CertificationStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'ATTENTION', label: 'Attention' },
  { value: 'NOT_VERIFIED', label: 'Not Verified' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'NOT_ASSESSED', label: 'Not Assessed' },
];

// Distinguishes a control backed by an automated, re-run-on-every-load
// check from one that only reflects documented policy/targets with no
// automated verification behind it in this codebase.
export type CertificationEvidenceType = 'LIVE_CHECK' | 'DOCUMENTED_POLICY';

export const CERTIFICATION_EVIDENCE_TYPE_LABELS: Record<CertificationEvidenceType, string> = {
  LIVE_CHECK: 'Live check',
  DOCUMENTED_POLICY: 'Documented policy',
};

export type CertificationControl = {
  key: string;
  title: string;
  category: CertificationCategory;
  status: CertificationStatus;
  evidenceType: CertificationEvidenceType;
  /** One-line summary shown in the checklist table. */
  summary: string;
  /** Full explanation of why this status was assigned. */
  whyThisStatus: string;
  /** What was actually checked (or, for DOCUMENTED_POLICY, what is only
   * documented) to support the status. */
  evidence: string;
  /** File/function/page names this control's status was derived from —
   * never sensitive file contents or values. */
  sources: string[];
  /** When the underlying live check last ran. Null for NOT_ASSESSED/
   * documented-only controls, since there is no live check to timestamp. */
  lastVerifiedAt: string | null;
  /** Remediation/next-step guidance. Null only when genuinely inapplicable. */
  requiredAction: string | null;
};

export {
  fmtDateTime,
  fmtRelativeTime,
} from './founder-activity';
