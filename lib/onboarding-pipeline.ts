// Pure, zero-dependency constants for the Onboarding Pipeline — split out
// from services/founder-onboarding.ts so client components can import them
// without pulling that module's services/founder.ts import (which uses
// server-only next/cache/next/server APIs) into the client bundle. Same
// pattern as lib/customer-health.ts and lib/plans.ts.

// Presentation-only operational bucket for the summary cards/Stage badge —
// never persisted, never a second status enum competing with
// CustomerHealthStatus. "Live" (rather than "Completed") matches the
// existing onboarding-stage vocabulary's own terminal stage name, Go-Live.
export type OnboardingBucket = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'LIVE';

export const ONBOARDING_BUCKET_LABELS: Record<OnboardingBucket, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  LIVE: 'Live',
};
