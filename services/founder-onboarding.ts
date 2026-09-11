// Onboarding Pipeline — the Founder's operational view of every customer's
// journey from provisioning through Go-Live. This module deliberately
// computes NO second onboarding engine: services/founder.ts's
// deriveProvisioningOnboardingStage (the same 5-stage function Customer
// Health already reuses) remains the one authoritative onboarding-stage
// source. Everything here is presentation-layer bucketing/blocker
// derivation on top of that stage plus other already-real, already-tracked
// facts (admin invite/accept timestamps, integration connection state,
// approval counts) — never a second Customer Health, Customer 360, or
// scoring system.
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { deriveProvisioningOnboardingStage } from '@/services/founder';
import { ONBOARDING_BUCKET_LABELS, ONBOARDING_WAITING_ON_LABELS, type OnboardingBucket, type OnboardingWaitingOn } from '@/lib/onboarding-pipeline';

export { ONBOARDING_BUCKET_LABELS, ONBOARDING_WAITING_ON_LABELS };
export type { OnboardingBucket, OnboardingWaitingOn };

export type OnboardingStage = ReturnType<typeof deriveProvisioningOnboardingStage>;

// Same pattern as services/founder-customer-health.ts and
// services/founder-pilots.ts: each dedicated Founder service module keeps
// its own small copy of this generic error-classification boilerplate
// rather than importing module-private helpers from services/founder.ts.
type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown) {
  const message = safeError(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerHealth');
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

// The same 5-stage sequence deriveProvisioningOnboardingStage returns,
// ordered — used only to compute an ordinal progress percentage (index+1 /
// length). This is NOT a fabricated per-customer number: it is a
// deterministic, equal-weighted function of the same single authoritative
// stage every row already displays, since the data model has no per-step
// effort-weighted "completed steps / total steps" field to calculate a
// truer percentage from (see the Final Report's data-model gaps).
const STAGE_ORDER: OnboardingStage[] = ['Provisioned', 'Admin Invited', 'Admin Accepted', 'Integrations Connected', 'Go-Live'];

function progressPercent(stage: OnboardingStage): number {
  const index = STAGE_ORDER.indexOf(stage);
  return Math.round(((index + 1) / STAGE_ORDER.length) * 100);
}

// "Current Step" names the next real milestone the customer is working
// through — derived only from the authoritative stage plus, once
// integrations are connected, the real approvalsProcessed count (never a
// fabricated sub-stage). A customer stuck in an integration error never
// reaches the "Integrations Connected" stage (that stage requires an
// actually-CONNECTED integration, the same definition used everywhere else
// in the app), so "Integrations" correctly remains their current step.
function currentStepLabel(stage: OnboardingStage, approvalsProcessed: number): string {
  if (stage === 'Go-Live') return 'Live';
  if (stage === 'Provisioned') return 'Admin Invitation';
  if (stage === 'Admin Invited') return 'Admin Acceptance';
  if (stage === 'Admin Accepted') return 'Integrations';
  return approvalsProcessed > 0 ? 'Go-Live' : 'First Approval';
}

// The authoritative timestamp for when the customer entered their CURRENT
// stage — never CustomerAccount.updatedAt, which bumps on any unrelated
// edit (a note, a plan change) and would not genuinely represent a stage
// transition. Each source here is a real, stage-specific fact:
//   - Provisioned: the account's own creation time.
//   - Admin Invited: FounderManagedUser.invitedAt for the primary admin.
//   - Admin Accepted: FounderManagedUser.acceptedAt for the primary admin.
//   - Integrations Connected: the earliest updatedAt among currently-
//     CONNECTED integrations — that row's own updatedAt reflects a change
//     to THAT SPECIFIC integration's connection state (not an unrelated
//     edit), so using the earliest one approximates "since first connected".
//   - Go-Live: the schema has no "went live at" timestamp at all — no
//     authoritative source exists, so this returns null and the UI shows
//     "—" rather than inventing a number (see the Final Report).
function stageEnteredAt(input: {
  stage: OnboardingStage;
  createdAt: Date;
  adminInvitedAt: Date | null;
  adminAcceptedAt: Date | null;
  earliestConnectedIntegrationAt: Date | null;
}): Date | null {
  if (input.stage === 'Provisioned') return input.createdAt;
  if (input.stage === 'Admin Invited') return input.adminInvitedAt;
  if (input.stage === 'Admin Accepted') return input.adminAcceptedAt;
  if (input.stage === 'Integrations Connected') return input.earliestConnectedIntegrationAt;
  return null;
}

export type OnboardingBlockerPriority = 1 | 2 | 3 | 4 | 5;

export type OnboardingBlocker = {
  reason: string;
  priority: OnboardingBlockerPriority;
  action: string;
  // Optional Customer 360 tab (components/founder/Customer360Tabs.tsx's
  // TabId) to deep-link into, when a more specific destination than the
  // Overview tab genuinely exists.
  tab?: string;
  // The real "resend invitation"/"invite admin" actions live on the
  // existing /founder/customers/[id]/users page (services/founder.ts's
  // updateFounderManagedUser 'resend' action), not on this page or
  // Customer 360 — so these two blockers link there instead of fabricating
  // an in-place email-send action.
  linkToUsersPage?: boolean;
  // Who needs to act next — see lib/onboarding-pipeline.ts's doc comment.
  // A presentation label on the existing blocker, not a second status model.
  waitingOn: OnboardingWaitingOn;
};

const BLOCKER_ACTION_BY_PRIORITY: Record<OnboardingBlockerPriority, { label: string; tab?: string; linkToUsersPage?: boolean; waitingOn: OnboardingWaitingOn }> = {
  // A broken integration is a real system fact, not something either party
  // is "waiting" on in the invite/accept sense.
  1: { label: 'Review integration', tab: 'integrations', waitingOn: 'TECHNICAL' },
  // The Founder already sent the invite; the customer's admin hasn't
  // accepted it yet.
  2: { label: 'Resend invitation', linkToUsersPage: true, waitingOn: 'CUSTOMER' },
  // Nobody has been invited yet — that's the Founder's own outstanding step.
  3: { label: 'Invite admin', linkToUsersPage: true, waitingOn: 'FOUNDER' },
  // The admin is in; connecting an integration is the customer's own step.
  4: { label: 'Review integrations', tab: 'integrations', waitingOn: 'CUSTOMER' },
  // Integrations are connected; generating an approval is the customer's
  // own usage of the product.
  5: { label: 'Follow up with customer', waitingOn: 'CUSTOMER' },
};

/**
 * Deterministic blocker rule — every matching, real condition is returned,
 * in this fixed priority order (lower number = higher priority):
 *
 *   1. Any granted integration is in ERROR or NEEDS_REAUTH connection state
 *      — the same definition services/founder-customer-health.ts and
 *      services/founder.ts's buildFounderOperationsCenter already use for
 *      integration-failure detection. The only condition that classifies
 *      the row's bucket as BLOCKED (see bucketFor) — the schema has no
 *      other field (e.g. a per-integration "access request pending"
 *      status) to justify a second blocking condition without fabricating
 *      one.
 *   2. The primary admin has been invited but hasn't accepted yet.
 *   3. No admin has been invited at all yet (stage is still Provisioned).
 *   4. The admin has accepted but no integration has ever connected.
 *   5. At least one integration is connected but zero approvals have ever
 *      been recorded for this account.
 *
 * Never evaluated for a CHURNED account (nudging a churned customer to
 * finish onboarding isn't a real, actionable condition) or once the
 * customer has reached Go-Live. Returns an empty array — never a fabricated
 * "Health requires review"-style fallback — when the customer has a real
 * onboarding condition that doesn't match any of the above; the row simply
 * doesn't appear in Needs Attention.
 *
 * Each blocker also carries a "waitingOn" label (Waiting on Founder /
 * Waiting on Customer / Technical blocker) — see BLOCKER_ACTION_BY_PRIORITY.
 * This is not a new status model: it's a deterministic label on the same
 * real fact that already produced the blocker (whether the Founder has
 * sent an invite yet, whether the customer has accepted/connected/approved
 * anything, or a genuine integration failure), computed alongside the
 * reason/action — never a separate guess or a second source of truth.
 */
function deriveBlockers(input: {
  stage: OnboardingStage;
  accountStatus: string;
  adminStatus: string | null;
  integrationErrors: number;
  integrationsConnected: number;
  approvalsProcessed: number;
}): OnboardingBlocker[] {
  if (input.stage === 'Go-Live' || input.accountStatus === 'CHURNED') return [];

  const blockers: OnboardingBlocker[] = [];
  const push = (priority: OnboardingBlockerPriority, reason: string) => {
    const action = BLOCKER_ACTION_BY_PRIORITY[priority];
    blockers.push({ reason, priority, action: action.label, tab: action.tab, linkToUsersPage: action.linkToUsersPage, waitingOn: action.waitingOn });
  };

  if (input.integrationErrors > 0) {
    push(1, `Integration error${input.integrationErrors > 1 ? 's' : ''} (${input.integrationErrors} failing)`);
  }
  if (input.stage === 'Provisioned') {
    push(3, 'Admin not yet invited');
  } else if (input.adminStatus === 'INVITED') {
    push(2, 'Admin invitation pending');
  } else if (input.stage === 'Admin Accepted' && input.integrationsConnected === 0) {
    push(4, 'No integrations connected yet');
  } else if (input.stage === 'Integrations Connected' && input.approvalsProcessed === 0) {
    push(5, 'First approval not yet recorded');
  }

  return blockers.sort((a, b) => a.priority - b.priority);
}

// Only a real integration failure (priority 1) is treated as BLOCKED — the
// one condition backed by a genuine "this is broken" fact
// (connectionState ERROR/NEEDS_REAUTH). Everything else (a pending invite,
// no integrations yet, no approvals yet) is a normal, expected part of an
// in-progress onboarding journey, not a fabricated "blocked" state.
function bucketFor(stage: OnboardingStage, blockers: OnboardingBlocker[]): OnboardingBucket {
  if (stage === 'Go-Live') return 'LIVE';
  if (blockers.some((b) => b.priority === 1)) return 'BLOCKED';
  if (stage === 'Provisioned') return 'NOT_STARTED';
  return 'IN_PROGRESS';
}

export type OnboardingRow = {
  id: string;
  companyName: string;
  domain: string;
  planTier: string;
  accountStatus: string;
  stage: OnboardingStage;
  bucket: OnboardingBucket;
  currentStep: string;
  progressPercent: number;
  daysInStage: number | null;
  // No CustomerAccount field or related model defines a target Go-Live
  // date anywhere in the schema — always null, rendered as "Not set" by the
  // UI rather than a computed guess.
  targetGoLive: null;
  approvalsProcessed: number;
  integrationsConnected: number;
  integrationErrors: number;
  blockers: OnboardingBlocker[];
};

export type OnboardingPipeline = {
  totalCustomers: number;
  counts: Record<OnboardingBucket, number>;
  rows: OnboardingRow[];
  needsAttention: OnboardingRow[];
};

function emptyPipeline(): OnboardingPipeline {
  return {
    totalCustomers: 0,
    counts: { NOT_STARTED: 0, IN_PROGRESS: 0, BLOCKED: 0, LIVE: 0 },
    rows: [],
    needsAttention: [],
  };
}

export async function buildOnboardingPipeline(): Promise<SafeResult<OnboardingPipeline>> {
  try {
    // One batched query for every customer and its related onboarding
    // signals — the exact same include shape services/founder-customer-health.ts
    // already uses, so no second query pattern and no N+1 (no per-customer
    // query inside the map below).
    const customers = await prisma.customerAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        health: true,
        seatAllocation: true,
        integrationStatuses: true,
        managedUsers: { select: { email: true, status: true, invitedAt: true, acceptedAt: true } },
      },
    });

    const counts: Record<OnboardingBucket, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, BLOCKED: 0, LIVE: 0 };

    const rows: OnboardingRow[] = customers.map((customer) => {
      const integrationsConnected = customer.integrationStatuses.filter((i) => i.connectionState === 'CONNECTED').length;
      const integrationErrors = customer.integrationStatuses.filter((i) => i.connectionState === 'ERROR' || i.connectionState === 'NEEDS_REAUTH').length;

      const adminUser = customer.managedUsers.find((u) => u.email === customer.primaryAdminEmail) ?? null;
      const adminStatus = adminUser?.status ?? null;

      const stage = deriveProvisioningOnboardingStage({
        customerStatus: customer.status,
        adminStatus,
        anyIntegrationConnected: integrationsConnected > 0,
      });

      const connectedTimestamps = customer.integrationStatuses
        .filter((i) => i.connectionState === 'CONNECTED')
        .map((i) => i.updatedAt.getTime());
      const earliestConnectedIntegrationAt = connectedTimestamps.length ? new Date(Math.min(...connectedTimestamps)) : null;

      const enteredAt = stageEnteredAt({
        stage,
        createdAt: customer.createdAt,
        adminInvitedAt: adminUser?.invitedAt ?? null,
        adminAcceptedAt: adminUser?.acceptedAt ?? null,
        earliestConnectedIntegrationAt,
      });

      const approvalsProcessed = customer.health?.approvalsProcessed ?? 0;
      const blockers = deriveBlockers({
        stage,
        accountStatus: customer.status,
        adminStatus,
        integrationErrors,
        integrationsConnected,
        approvalsProcessed,
      });
      const bucket = bucketFor(stage, blockers);
      counts[bucket] += 1;

      return {
        id: customer.id,
        companyName: customer.companyName,
        domain: customer.domain,
        planTier: customer.planTier,
        accountStatus: customer.status,
        stage,
        bucket,
        currentStep: currentStepLabel(stage, approvalsProcessed),
        progressPercent: progressPercent(stage),
        daysInStage: daysSince(enteredAt),
        targetGoLive: null,
        approvalsProcessed,
        integrationsConnected,
        integrationErrors,
        blockers,
      };
    });

    const needsAttention = rows
      .filter((row) => row.blockers.length > 0)
      .sort((a, b) => {
        const priorityDiff = a.blockers[0].priority - b.blockers[0].priority;
        if (priorityDiff !== 0) return priorityDiff;
        return (b.daysInStage ?? 0) - (a.daysInStage ?? 0);
      });

    return {
      migrationRequired: false,
      data: { totalCustomers: customers.length, counts, rows, needsAttention },
    };
  } catch (error) {
    return { migrationRequired: missingFounderStorage(error), safeError: safeError(error), data: emptyPipeline() };
  }
}

export function onboardingPipelineCsv(rows: OnboardingRow[]): string {
  const header = [
    'Company', 'Domain', 'Stage', 'Current Step', 'Progress %', 'Days in Stage', 'Target Go-Live',
    'Integrations Connected', 'Integration Errors', 'Approvals Processed', 'Blocking Issue', 'Waiting On', 'Next Action',
  ];
  const lines = rows.map((row) => {
    const top = row.blockers[0];
    return [
      row.companyName,
      row.domain,
      ONBOARDING_BUCKET_LABELS[row.bucket],
      row.currentStep,
      row.progressPercent,
      row.daysInStage ?? '',
      row.targetGoLive ?? 'Not set',
      row.integrationsConnected,
      row.integrationErrors,
      row.approvalsProcessed,
      top?.reason ?? '',
      top ? ONBOARDING_WAITING_ON_LABELS[top.waitingOn] : '',
      top?.action ?? '',
    ].map(csvCell).join(',');
  });
  return [header.map(csvCell).join(','), ...lines].join('\n');
}
