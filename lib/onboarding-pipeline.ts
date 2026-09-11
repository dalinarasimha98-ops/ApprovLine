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

// Who needs to act next on a given blocker — derived from the same real
// fact that produced the blocker itself (an integration's connection
// state, whether the Founder has sent an invite yet, whether the customer
// has accepted/connected/approved anything), never a separate guess. Not a
// new status model: it labels the existing blocker, it doesn't replace the
// bucket or reason.
export type OnboardingWaitingOn = 'FOUNDER' | 'CUSTOMER' | 'TECHNICAL';

export const ONBOARDING_WAITING_ON_LABELS: Record<OnboardingWaitingOn, string> = {
  FOUNDER: 'Waiting on Founder',
  CUSTOMER: 'Waiting on Customer',
  TECHNICAL: 'Technical blocker',
};
