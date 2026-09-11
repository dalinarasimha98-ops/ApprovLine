// Customer Health command center — the Founder's portfolio-level operational
// risk view. This module deliberately computes NO health score of its own:
// CustomerHealth.status/score (services/founder.ts's calculateHealthScore /
// healthStatusForScore, written by refreshCustomerHealth) remains the one
// authoritative health engine. Everything here is presentation-layer
// derivation on top of that authoritative record plus other already-real,
// already-tracked signals (onboarding stage, integration connection state,
// seat utilization, real audit activity) — never a second scoring system.
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { deriveProvisioningOnboardingStage } from '@/services/founder';
import { HEALTH_STATUS_LABELS, type HealthStatus } from '@/lib/customer-health';

export { HEALTH_STATUS_LABELS };
export type { HealthStatus };

// Matches the same pattern used by services/founder-pilots.ts: each
// dedicated Founder service module keeps its own small copy of this
// generic error-classification boilerplate rather than importing
// module-private helpers from services/founder.ts.
type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown) {
  const message = safeError(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerHealth');
}

// Implementation constants for bucketing real signals into a reason list —
// not a second health score/threshold. The health status itself always
// comes from the authoritative CustomerHealth record.
const INACTIVITY_DAYS = 14;
const LOW_ADOPTION_THRESHOLD_PERCENT = 25;

// Priority 0 is a distinct category from 1-6: it means "this account has
// never really started," not "something is going wrong." See
// deriveHealthSignals's doc comment for the full rule.
export type PrimaryReasonPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Optional Customer 360 tab (components/founder/Customer360Tabs.tsx's TabId)
// a signal's recommended action should deep-link into, when a more specific
// destination than the Overview tab genuinely exists.
const RECOMMENDED_ACTION_BY_PRIORITY: Record<PrimaryReasonPriority, { label: string; tab?: string }> = {
  0: { label: 'Follow up on onboarding', tab: 'onboarding' },
  1: { label: 'Reach out to customer' },
  2: { label: 'Review integration issues', tab: 'integrations' },
  3: { label: 'Follow up on onboarding', tab: 'onboarding' },
  4: { label: 'Schedule success call' },
  5: { label: 'Check in with customer' },
  6: { label: 'Open Customer 360' },
};

// Severity is derived only from which real signal fired (priority) plus a
// single floor: a CRITICAL health status normally reads as High severity
// regardless of which specific signal triggered it — EXCEPT priority 0
// ("never activated yet"), which is deliberately never escalated by that
// floor. A brand-new customer's score is low purely because it has no usage
// data at all, not because something is failing, so treating it as
// High-severity would make it outrank customers with real operational
// problems (integration failures, genuine inactivity regressions) in
// Founder Attention — the exact miscategorization this task asked to fix.
// This is intentionally NOT a second 0-100 score — just a 3-bucket mapping
// from the same deterministic priority rule used to pick reasons below.
const SEVERITY_BY_PRIORITY: Record<PrimaryReasonPriority, 'High' | 'Medium' | 'Low'> = {
  0: 'Medium',
  1: 'High',
  2: 'High',
  3: 'Medium',
  4: 'Medium',
  5: 'Low',
  6: 'Low',
};

function severityFor(status: HealthStatus, priority: PrimaryReasonPriority): 'High' | 'Medium' | 'Low' {
  if (priority === 0) return SEVERITY_BY_PRIORITY[0];
  if (status === 'CRITICAL') return 'High';
  return SEVERITY_BY_PRIORITY[priority];
}

// Truthful, stage-specific text for a customer that has never had any real
// recorded activity — reusing deriveProvisioningOnboardingStage's own
// existing 5-stage pipeline rather than inventing new onboarding vocabulary.
function activationReason(stage: OnboardingStage): string {
  if (stage === 'Provisioned') return 'Not yet activated';
  if (stage === 'Admin Invited') return 'Admin invitation pending';
  return 'Onboarding in progress';
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

export type OnboardingStage = ReturnType<typeof deriveProvisioningOnboardingStage>;

export type HealthSignal = {
  reason: string;
  priority: PrimaryReasonPriority;
  severity: 'High' | 'Medium' | 'Low';
  action: string;
  tab?: string;
};

export type CustomerHealthRow = {
  id: string;
  companyName: string;
  domain: string;
  status: string;
  planTier: string;
  healthStatus: HealthStatus;
  healthScore: number;
  activeSeats: number;
  allocatedSeats: number | null;
  adoptionPercent: number | null;
  integrationsConnected: number;
  integrationsTotal: number;
  integrationErrors: number;
  approvalsProcessed: number;
  onboardingStage: OnboardingStage;
  lastActivityAt: string | null;
  lastActivityDays: number | null;
  // Every real signal that matched, in priority order — the detail panel's
  // "Why this status?" and "Recommended Actions" lists render all of these;
  // the Founder Attention table shows only signals[0] as the primary reason.
  signals: HealthSignal[];
};

export type CustomerHealthCommandCenter = {
  totalCustomers: number;
  counts: Record<HealthStatus, number>;
  rows: CustomerHealthRow[];
  attention: CustomerHealthRow[];
};

function emptyCommandCenter(): CustomerHealthCommandCenter {
  return {
    totalCustomers: 0,
    counts: { HEALTHY: 0, NEEDS_ATTENTION: 0, AT_RISK: 0, CRITICAL: 0 },
    rows: [],
    attention: [],
  };
}

/**
 * Deterministic signal rule, evaluated only for accounts whose authoritative
 * CustomerHealth.status isn't HEALTHY. Every matching signal is returned, in
 * this fixed priority order (lower number = higher priority):
 *
 *   0. The account has never really started: onboarding hasn't reached
 *      Go-Live and there is no recorded activity at all. This is NOT "no
 *      activity in N days" (priority 1) — it's a brand-new/demo customer for
 *      whom zero usage is expected, not a regression. Reusing
 *      deriveProvisioningOnboardingStage's existing pipeline, the reason
 *      names the real stage ("Not yet activated", "Admin invitation
 *      pending", "Onboarding in progress") instead of implying the customer
 *      is failing. Because it's a distinct condition from a real problem, it
 *      also suppresses the otherwise-overlapping "onboarding not completed" /
 *      "low adoption" / "no approvals yet" signals below (3-5) — those raw
 *      numbers are still shown, truthfully, in the Key Metrics panel.
 *   1. No real activity (AuditLog entry) in the last INACTIVITY_DAYS days,
 *      or no activity ever recorded, for an account that HAS activated.
 *   2. Any granted integration is in ERROR or NEEDS_REAUTH connection state
 *      — the same definition services/founder.ts's buildFounderOperationsCenter
 *      already uses for its platform-wide integration-failure count. Applies
 *      regardless of activation state: a broken integration is a real
 *      problem even for a newly provisioned customer.
 *   3. Onboarding hasn't reached Go-Live yet (deriveProvisioningOnboardingStage),
 *      and the account isn't churned.
 *   4. Seat utilization (active seats / allocated seats) is below
 *      LOW_ADOPTION_THRESHOLD_PERCENT, when seat data exists.
 *   5. Zero approvals have ever been recorded for this account.
 *
 * If none of 0-5 match, a single fallback signal (priority 6) is returned:
 * "Health requires review" — never an invented explanation.
 *
 * The returned list is sorted by severity (High, then Medium, then Low),
 * preserving the priority order above among equal severities. The Founder
 * Attention table and CSV export use only signals[0] as the primary reason
 * and its severity for sorting, so a genuine High-severity problem (e.g. an
 * integration error) always leads even when a lower-severity "never
 * activated" signal was evaluated first — see severityFor's doc comment for
 * why priority 0 is deliberately capped at Medium. The detail panel's "Why
 * this status?" and "Recommended Actions" lists show the full set.
 */
function deriveHealthSignals(input: {
  lastActivityDays: number | null;
  integrationErrors: number;
  onboardingStage: OnboardingStage;
  accountStatus: string;
  adoptionPercent: number | null;
  approvalsProcessed: number;
  healthStatus: HealthStatus;
}): HealthSignal[] {
  const signals: HealthSignal[] = [];
  const push = (priority: PrimaryReasonPriority, reason: string) => {
    const action = RECOMMENDED_ACTION_BY_PRIORITY[priority];
    signals.push({ reason, priority, severity: severityFor(input.healthStatus, priority), action: action.label, tab: action.tab });
  };

  const neverActivated = input.onboardingStage !== 'Go-Live' && input.lastActivityDays === null;

  if (neverActivated) {
    push(0, activationReason(input.onboardingStage));
  } else if (input.lastActivityDays === null) {
    push(1, 'No activity recorded yet');
  } else if (input.lastActivityDays >= INACTIVITY_DAYS) {
    push(1, `No activity in ${input.lastActivityDays} days`);
  }
  if (input.integrationErrors > 0) {
    push(2, `Integration error${input.integrationErrors > 1 ? 's' : ''} (${input.integrationErrors} failing)`);
  }
  if (!neverActivated && input.onboardingStage !== 'Go-Live' && input.accountStatus !== 'CHURNED') {
    push(3, 'Onboarding not completed');
  }
  if (!neverActivated && input.adoptionPercent !== null && input.adoptionPercent < LOW_ADOPTION_THRESHOLD_PERCENT) {
    push(4, `Low adoption (${input.adoptionPercent}% usage)`);
  }
  if (!neverActivated && input.approvalsProcessed === 0) {
    push(5, 'No approval activity recorded yet');
  }
  if (signals.length === 0) {
    push(6, 'Health requires review');
  }

  const severityRank: Record<'High' | 'Medium' | 'Low', number> = { High: 0, Medium: 1, Low: 2 };
  return [...signals].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export async function buildCustomerHealthCommandCenter(): Promise<SafeResult<CustomerHealthCommandCenter>> {
  try {
    const [customers, lastActivityByOrg] = await Promise.all([
      prisma.customerAccount.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          health: true,
          seatAllocation: true,
          integrationStatuses: true,
          managedUsers: { select: { email: true, status: true } },
        },
      }),
      // One batched aggregate query for every organization's most recent
      // real activity — never a per-customer query (no N+1).
      prisma.auditLog.groupBy({ by: ['organizationId'], _max: { createdAt: true } }),
    ]);

    const lastActivityMap = new Map(lastActivityByOrg.map((row) => [row.organizationId, row._max.createdAt]));
    const counts: Record<HealthStatus, number> = { HEALTHY: 0, NEEDS_ATTENTION: 0, AT_RISK: 0, CRITICAL: 0 };

    const rows: CustomerHealthRow[] = customers.map((customer) => {
      const healthStatus = (customer.health?.status ?? 'NEEDS_ATTENTION') as HealthStatus;
      const healthScore = customer.health?.score ?? 50;
      counts[healthStatus] += 1;

      const activeSeats = customer.managedUsers.filter((u) => u.status === 'ACTIVE').length;
      const allocatedSeats = customer.seatAllocation?.allocatedSeats ?? null;
      const adoptionPercent = allocatedSeats && allocatedSeats > 0 ? Math.round((activeSeats / allocatedSeats) * 100) : null;

      const integrationsConnected = customer.integrationStatuses.filter((i) => i.connectionState === 'CONNECTED').length;
      const integrationsTotal = customer.integrationStatuses.filter((i) => i.accessEnabled).length;
      const integrationErrors = customer.integrationStatuses.filter((i) => i.connectionState === 'ERROR' || i.connectionState === 'NEEDS_REAUTH').length;

      const adminStatus = customer.managedUsers.find((u) => u.email === customer.primaryAdminEmail)?.status ?? null;
      const onboardingStage = deriveProvisioningOnboardingStage({
        customerStatus: customer.status,
        adminStatus,
        anyIntegrationConnected: integrationsConnected > 0,
      });

      const lastActivityAt = lastActivityMap.get(customer.organizationId) ?? null;
      const lastActivityDays = daysSince(lastActivityAt);
      const approvalsProcessed = customer.health?.approvalsProcessed ?? 0;

      const signals: HealthSignal[] = healthStatus !== 'HEALTHY'
        ? deriveHealthSignals({
            lastActivityDays,
            integrationErrors,
            onboardingStage,
            accountStatus: customer.status,
            adoptionPercent,
            approvalsProcessed,
            healthStatus,
          })
        : [];

      return {
        id: customer.id,
        companyName: customer.companyName,
        domain: customer.domain,
        status: customer.status,
        planTier: customer.planTier,
        healthStatus,
        healthScore,
        activeSeats,
        allocatedSeats,
        adoptionPercent,
        integrationsConnected,
        integrationsTotal,
        integrationErrors,
        approvalsProcessed,
        onboardingStage,
        lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
        lastActivityDays,
        signals,
      };
    });

    const priorityRank: Record<'High' | 'Medium' | 'Low', number> = { High: 0, Medium: 1, Low: 2 };
    const attention = rows
      .filter((row) => row.healthStatus !== 'HEALTHY')
      .sort((a, b) => {
        const severityDiff = priorityRank[a.signals[0]?.severity ?? 'Low'] - priorityRank[b.signals[0]?.severity ?? 'Low'];
        if (severityDiff !== 0) return severityDiff;
        return a.healthScore - b.healthScore;
      });

    return {
      migrationRequired: false,
      data: { totalCustomers: customers.length, counts, rows, attention },
    };
  } catch (error) {
    return { migrationRequired: missingFounderStorage(error), safeError: safeError(error), data: emptyCommandCenter() };
  }
}

export function customerHealthCsv(rows: CustomerHealthRow[]): string {
  const header = [
    'Company', 'Domain', 'Health Status', 'Health Score', 'Adoption %', 'Active Seats', 'Allocated Seats',
    'Integrations Connected', 'Integrations Total', 'Integration Errors', 'Approvals Processed',
    'Onboarding Stage', 'Last Activity', 'Primary Reason', 'Severity', 'Recommended Action',
  ];
  const lines = rows.map((row) => {
    const top = row.signals[0];
    return [
      row.companyName,
      row.domain,
      HEALTH_STATUS_LABELS[row.healthStatus],
      row.healthScore,
      row.adoptionPercent ?? '',
      row.activeSeats,
      row.allocatedSeats ?? '',
      row.integrationsConnected,
      row.integrationsTotal,
      row.integrationErrors,
      row.approvalsProcessed,
      row.onboardingStage,
      row.lastActivityAt ?? '',
      top?.reason ?? '',
      top?.severity ?? '',
      top?.action ?? '',
    ].map(csvCell).join(',');
  });
  return [header.map(csvCell).join(','), ...lines].join('\n');
}
