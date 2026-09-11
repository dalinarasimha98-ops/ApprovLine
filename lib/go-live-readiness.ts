// Pure, zero-dependency constants for Go-Live Readiness — split out from
// services/founder-go-live-readiness.ts so client components can import
// them without pulling that module's services/founder.ts import (server-only
// next/cache/next/server APIs) into the client bundle. Same pattern as
// lib/customer-health.ts and lib/onboarding-pipeline.ts.

// Per-gate verification state. COMPLETE only when real data proves the
// gate; BLOCKED only for a real, backed failure (an integration
// connectionState of ERROR/NEEDS_REAUTH); IN_PROGRESS for a known,
// non-failed, not-yet-complete state (e.g. an admin invited but not yet
// accepted); NOT_VERIFIED when the existing data model has no way to prove
// or disprove the gate at all — never silently treated as a pass or a fail.
export type GateStatus = 'COMPLETE' | 'IN_PROGRESS' | 'BLOCKED' | 'NOT_VERIFIED';

export const GATE_STATUS_LABELS: Record<GateStatus, string> = {
  COMPLETE: 'Complete',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  NOT_VERIFIED: 'Not Verified',
};

export type GateKey =
  | 'ADMIN'
  | 'WORKSPACE'
  | 'INTEGRATIONS'
  | 'APPROVALS'
  | 'EVIDENCE'
  | 'SECURITY'
  | 'PILOT'
  | 'DECISION';

export const GATE_LABELS: Record<GateKey, string> = {
  ADMIN: 'Customer Administration',
  WORKSPACE: 'Workspace Configuration',
  INTEGRATIONS: 'Integrations',
  APPROVALS: 'Approval Capture',
  EVIDENCE: 'Evidence & Audit',
  SECURITY: 'Security & Access',
  PILOT: 'Pilot Validation',
  DECISION: 'Final Go-Live Decision',
};

// Overall per-customer readiness. READY and NOT_READY are both "we have
// enough evidence to make a call" outcomes; BLOCKED means a real backing
// fact prevents progress (never confused with the weaker NOT_ASSESSED,
// which means there isn't enough evidence yet to make ANY determination —
// see services/founder-go-live-readiness.ts's overallReadiness for the
// exact rule and why Security & Access never gates this computation).
export type ReadinessStatus = 'READY' | 'NOT_READY' | 'BLOCKED' | 'NOT_ASSESSED';

export const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  READY: 'Ready',
  NOT_READY: 'Not Ready',
  BLOCKED: 'Blocked',
  NOT_ASSESSED: 'Not Assessed',
};
