// Go-Live Readiness — an operational decision console answering "does this
// customer have enough verified evidence to safely move from onboarding/
// pilot into production?" This module computes NO new onboarding, health,
// or pilot engine: every gate is either a direct read of an existing
// authoritative field/relation, or (Pilot Validation) a lookup into the
// existing services/founder-pilots.ts Pilot Command Center — never a
// second scoring system. Onboarding Pipeline (services/founder-onboarding.ts)
// answers "where is the customer in the journey?"; this module answers
// "are they ready to go live?" — related, but deliberately separate.
import { prisma } from '@/lib/prisma';
import { csvCell } from '@/lib/csv';
import { deriveProvisioningOnboardingStage } from '@/services/founder';
import { buildFounderPilotCommandCenter, type PilotListItem } from '@/services/founder-pilots';
import {
  GATE_LABELS,
  GATE_STATUS_LABELS,
  READINESS_STATUS_LABELS,
  type GateKey,
  type GateStatus,
  type ReadinessStatus,
} from '@/lib/go-live-readiness';

export { GATE_LABELS, GATE_STATUS_LABELS, READINESS_STATUS_LABELS };
export type { GateKey, GateStatus, ReadinessStatus };

type SafeResult<T> = { data: T; migrationRequired: boolean; safeError?: string };

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 320);
  return String(error).slice(0, 320);
}

function missingFounderStorage(error: unknown) {
  const message = safeError(error);
  return message.includes('does not exist') || message.includes('CustomerAccount') || message.includes('CustomerHealth');
}

export type OnboardingStage = ReturnType<typeof deriveProvisioningOnboardingStage>;

export type ReadinessGate = {
  key: GateKey;
  status: GateStatus;
  reason: string;
  // Optional Customer 360 tab (components/founder/Customer360Tabs.tsx's
  // TabId) or the existing users/pilot-detail page to deep-link the gate's
  // "review" action into — never a fabricated in-place action.
  action?: string;
  tab?: string;
  usersPage?: boolean;
  pilotPage?: boolean;
};

// The 6 gates below are the only ones this module can actually verify from
// existing data, in the fixed priority order used to pick a customer's
// "primary blocker". Security & Access and Final Go-Live Decision are
// intentionally excluded from this list (and from the overall readiness
// computation) — see buildGates' and overallReadiness's doc comments for
// exactly why.
const COUNTABLE_GATES: GateKey[] = ['ADMIN', 'WORKSPACE', 'INTEGRATIONS', 'APPROVALS', 'EVIDENCE', 'PILOT'];

/**
 * Builds all 8 conceptual gates for one customer from real, already-tracked
 * facts — never a fabricated pass/fail:
 *
 *   ADMIN (Customer Administration) — FounderManagedUser status for the
 *     primary admin, the exact same field Onboarding Pipeline already uses.
 *     COMPLETE only once accepted (status ACTIVE) — an invitation being
 *     sent is never treated as acceptance. IN_PROGRESS once invited but
 *     not yet accepted. NOT_VERIFIED if no admin has been invited at all.
 *
 *   WORKSPACE (Workspace Configuration) — CustomerWorkspace is created
 *     unconditionally, in the same transaction as CustomerAccount, by
 *     provisionFounderCustomer(); its existence is itself the real,
 *     provable completeness signal (the schema has no separate partial-
 *     setup tracking to check further). NOT_VERIFIED only for a data
 *     anomaly (a customer with no workspace row) — practically never true
 *     for a customer provisioned through the real flow.
 *
 *   INTEGRATIONS — evaluated only over integrations the Founder has
 *     actually GRANTED this customer (CustomerIntegrationStatus.accessEnabled),
 *     never every catalog integration — the app has no field defining which
 *     integrations are "required" for a given customer beyond that grant.
 *     NOT_VERIFIED when nothing has been granted yet (no known requirement
 *     to evaluate). BLOCKED when any granted integration is in ERROR or
 *     NEEDS_REAUTH — the same definition reused by Customer Health and
 *     Onboarding Pipeline. COMPLETE only once every granted integration is
 *     CONNECTED. IN_PROGRESS otherwise (granted but not yet connected,
 *     with no failure).
 *
 *   APPROVALS (Approval Capture) — CustomerHealth.approvalsProcessed (the
 *     same live-refreshed field already reused by Customer Health/
 *     Onboarding Pipeline). COMPLETE once at least one approval has been
 *     captured. Explicitly never BLOCKED/FAIL on zero — a newly onboarded
 *     customer simply may not have exercised the workflow yet — so zero is
 *     always NOT_VERIFIED, never treated as a failure.
 *
 *   EVIDENCE (Evidence & Audit) — whether this organization has ANY
 *     AuditLog entry at all (batched org->hasAuditLog map, see
 *     buildGoLiveReadinessPortfolio). COMPLETE once at least one exists;
 *     otherwise NOT_VERIFIED (not a failure — same reasoning as Approvals).
 *
 *   SECURITY (Security & Access) — always NOT_VERIFIED. There is no field
 *     anywhere in the schema recording a customer-specific security
 *     review, SSO configuration, or access-control sign-off; ApprovLine's
 *     own RBAC/tenant-isolation are PLATFORM capabilities, not evidence
 *     that THIS customer's security requirements were validated. Showing
 *     anything other than NOT_VERIFIED here would misrepresent platform
 *     capability as customer-specific proof.
 *
 *   PILOT (Pilot Validation) — reuses services/founder-pilots.ts's
 *     existing PilotListItem for this customer (successPercent/status) —
 *     no second pilot scoring engine. COMPLETE once the existing pilot
 *     engine's own successPercent reaches 100 (all of ITS success criteria
 *     met) or its status is Pilot Completed/Converted. NOT_VERIFIED when no
 *     pilot profile exists for this customer at all (buildFounderPilotCommandCenter
 *     caps at the 80 most-recently-created customers — see the Final
 *     Report's data-model/coverage limitations). Otherwise IN_PROGRESS,
 *     carrying the real successPercent for display.
 *
 *   DECISION (Final Go-Live Decision) — not evaluated as an input gate at
 *     all: it's the OUTPUT of this whole page, not a prerequisite. The only
 *     real, authoritative signal for "the decision has already been made
 *     and executed" is CustomerAccountStatus.ACTIVE (the same field
 *     deriveProvisioningOnboardingStage already treats as the Go-Live
 *     stage) — COMPLETE when active, otherwise always "pending Founder
 *     approval", never auto-approved.
 */
function buildGates(input: {
  accountStatus: string;
  adminStatus: string | null;
  hasWorkspace: boolean;
  grantedIntegrations: { connectionState: string }[];
  approvalsProcessed: number;
  hasAuditEvidence: boolean;
  pilot: PilotListItem | null;
}): Record<GateKey, ReadinessGate> {
  const grantedErrors = input.grantedIntegrations.filter((i) => i.connectionState === 'ERROR' || i.connectionState === 'NEEDS_REAUTH').length;
  const grantedConnected = input.grantedIntegrations.filter((i) => i.connectionState === 'CONNECTED').length;

  const admin: ReadinessGate = input.adminStatus === 'ACTIVE'
    ? { key: 'ADMIN', status: 'COMPLETE', reason: 'Admin invitation accepted' }
    : input.adminStatus === 'INVITED'
      ? { key: 'ADMIN', status: 'IN_PROGRESS', reason: 'Admin invitation pending', action: 'Resend invitation', usersPage: true }
      : { key: 'ADMIN', status: 'NOT_VERIFIED', reason: 'No administrator invited yet', action: 'Invite admin', usersPage: true };

  const workspace: ReadinessGate = input.hasWorkspace
    ? { key: 'WORKSPACE', status: 'COMPLETE', reason: 'Basic configuration complete' }
    : { key: 'WORKSPACE', status: 'NOT_VERIFIED', reason: 'Workspace configuration not found', action: 'Open Customer 360' };

  const integrations: ReadinessGate = input.grantedIntegrations.length === 0
    ? { key: 'INTEGRATIONS', status: 'NOT_VERIFIED', reason: 'No integrations granted yet', action: 'Review integrations', tab: 'integrations' }
    : grantedErrors > 0
      ? { key: 'INTEGRATIONS', status: 'BLOCKED', reason: `${grantedErrors} integration${grantedErrors > 1 ? 's' : ''} failed`, action: 'Review integration', tab: 'integrations' }
      : grantedConnected === input.grantedIntegrations.length
        ? { key: 'INTEGRATIONS', status: 'COMPLETE', reason: `${grantedConnected} integration${grantedConnected > 1 ? 's' : ''} connected` }
        : { key: 'INTEGRATIONS', status: 'IN_PROGRESS', reason: `${grantedConnected} of ${input.grantedIntegrations.length} granted integrations connected`, action: 'Review integrations', tab: 'integrations' };

  const approvals: ReadinessGate = input.approvalsProcessed > 0
    ? { key: 'APPROVALS', status: 'COMPLETE', reason: `${input.approvalsProcessed} approval${input.approvalsProcessed > 1 ? 's' : ''} captured` }
    : { key: 'APPROVALS', status: 'NOT_VERIFIED', reason: 'No approval activity yet', action: 'Follow up with customer' };

  const evidence: ReadinessGate = input.hasAuditEvidence
    ? { key: 'EVIDENCE', status: 'COMPLETE', reason: 'Audit evidence available' }
    : { key: 'EVIDENCE', status: 'NOT_VERIFIED', reason: 'No audit evidence available yet', action: 'Open Customer 360', tab: 'activity' };

  // Platform RBAC/tenant isolation are ApprovLine capabilities, not proof
  // that this specific customer's security requirements were reviewed —
  // there is no field to check, so this is never anything but Not Verified.
  const security: ReadinessGate = { key: 'SECURITY', status: 'NOT_VERIFIED', reason: 'Customer security review not recorded' };

  const pilotComplete = input.pilot ? input.pilot.successPercent >= 100 || input.pilot.status === 'Pilot Completed' || input.pilot.status === 'Converted' : false;
  const pilot: ReadinessGate = !input.pilot
    ? { key: 'PILOT', status: 'NOT_VERIFIED', reason: 'Pilot not yet assessed' }
    : pilotComplete
      ? { key: 'PILOT', status: 'COMPLETE', reason: `Pilot requirements complete (${input.pilot.successPercent}%)` }
      : { key: 'PILOT', status: 'IN_PROGRESS', reason: `Pilot requirements not met (${input.pilot.successPercent}%)`, action: 'Review pilot readiness', pilotPage: true };

  const decision: ReadinessGate = input.accountStatus === 'ACTIVE'
    ? { key: 'DECISION', status: 'COMPLETE', reason: 'Customer is live' }
    : { key: 'DECISION', status: 'NOT_VERIFIED', reason: 'Pending Founder approval' };

  return { ADMIN: admin, WORKSPACE: workspace, INTEGRATIONS: integrations, APPROVALS: approvals, EVIDENCE: evidence, SECURITY: security, PILOT: pilot, DECISION: decision };
}

/**
 * Overall readiness from the 6 countable gates (see COUNTABLE_GATES).
 * Security & Access is deliberately excluded: it can never be verified
 * from existing data, so requiring it would make every customer
 * permanently un-READY regardless of real progress — that would be exactly
 * the kind of false, unusable signal this console must not produce. Final
 * Go-Live Decision is excluded because it is the page's OUTPUT, not an
 * input.
 *
 *   BLOCKED — Integrations has a real, backed failure. Checked first: a
 *     broken integration blocks readiness regardless of anything else.
 *   READY — the account is already ACTIVE (the decision has already been
 *     made and executed), or every one of the 6 countable gates is COMPLETE.
 *   NOT_ASSESSED — the Workspace gate itself couldn't be evaluated (no
 *     CustomerWorkspace row at all) — a genuine data gap, not a normal
 *     "still in progress" case. In practice this should be rare/never for
 *     a customer provisioned through the real flow.
 *   NOT_READY — everything else: a normal, expected in-progress state.
 */
function overallReadiness(gates: Record<GateKey, ReadinessGate>, accountStatus: string): ReadinessStatus {
  if (gates.INTEGRATIONS.status === 'BLOCKED') return 'BLOCKED';
  if (accountStatus === 'ACTIVE') return 'READY';
  if (gates.WORKSPACE.status === 'NOT_VERIFIED') return 'NOT_ASSESSED';
  if (COUNTABLE_GATES.every((key) => gates[key].status === 'COMPLETE')) return 'READY';
  return 'NOT_READY';
}

export type ReadinessRow = {
  id: string;
  companyName: string;
  domain: string;
  planTier: string;
  accountStatus: string;
  onboardingStage: OnboardingStage;
  readiness: ReadinessStatus;
  gates: Record<GateKey, ReadinessGate>;
  // The highest-priority (per COUNTABLE_GATES order) gate that isn't
  // COMPLETE — the row's "primary blocker"/"next action". Undefined only
  // when every countable gate is already COMPLETE.
  primaryGate: ReadinessGate | null;
  gatesRemaining: number;
  gatesTotal: number;
};

export type GoLiveReadinessPortfolio = {
  totalCustomers: number;
  counts: Record<ReadinessStatus, number>;
  rows: ReadinessRow[];
  attention: ReadinessRow[];
};

function emptyPortfolio(): GoLiveReadinessPortfolio {
  return {
    totalCustomers: 0,
    counts: { READY: 0, NOT_READY: 0, BLOCKED: 0, NOT_ASSESSED: 0 },
    rows: [],
    attention: [],
  };
}

export async function buildGoLiveReadinessPortfolio(): Promise<SafeResult<GoLiveReadinessPortfolio>> {
  try {
    const [customers, auditLogOrgs, pilotResult] = await Promise.all([
      // One batched query for every customer and its related readiness
      // signals — no per-customer query inside the map below.
      prisma.customerAccount.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          health: true,
          workspace: true,
          integrationStatuses: true,
          managedUsers: { select: { email: true, status: true } },
        },
      }),
      // One batched query for which organizations have ANY audit evidence
      // at all — presence in this set (not the count) is all Evidence &
      // Audit needs.
      prisma.auditLog.groupBy({ by: ['organizationId'] }),
      // Reuses the existing Pilot Command Center aggregate wholesale — no
      // second pilot engine. It internally caps at the 80 most-recently-
      // created customers; see the Final Report for this coverage limit.
      buildFounderPilotCommandCenter(),
    ]);

    const auditOrgSet = new Set(auditLogOrgs.map((row) => row.organizationId));
    const pilotByCustomerId = new Map(pilotResult.data.pilots.map((pilot) => [pilot.id, pilot]));

    const counts: Record<ReadinessStatus, number> = { READY: 0, NOT_READY: 0, BLOCKED: 0, NOT_ASSESSED: 0 };

    const rows: ReadinessRow[] = customers.map((customer) => {
      const grantedIntegrations = customer.integrationStatuses.filter((i) => i.accessEnabled).map((i) => ({ connectionState: i.connectionState }));
      const adminStatus = customer.managedUsers.find((u) => u.email === customer.primaryAdminEmail)?.status ?? null;
      const approvalsProcessed = customer.health?.approvalsProcessed ?? 0;
      const pilot = pilotByCustomerId.get(customer.id) ?? null;

      const gates = buildGates({
        accountStatus: customer.status,
        adminStatus,
        hasWorkspace: !!customer.workspace,
        grantedIntegrations,
        approvalsProcessed,
        hasAuditEvidence: auditOrgSet.has(customer.organizationId),
        pilot,
      });

      const readiness = overallReadiness(gates, customer.status);
      counts[readiness] += 1;

      const incompleteGates = COUNTABLE_GATES.map((key) => gates[key]).filter((gate) => gate.status !== 'COMPLETE');
      const primaryGate = incompleteGates[0] ?? null;

      const onboardingStage = deriveProvisioningOnboardingStage({
        customerStatus: customer.status,
        adminStatus,
        anyIntegrationConnected: grantedIntegrations.some((i) => i.connectionState === 'CONNECTED'),
      });

      return {
        id: customer.id,
        companyName: customer.companyName,
        domain: customer.domain,
        planTier: customer.planTier,
        accountStatus: customer.status,
        onboardingStage,
        readiness,
        gates,
        primaryGate,
        gatesRemaining: incompleteGates.length,
        gatesTotal: COUNTABLE_GATES.length,
      };
    });

    const readinessRank: Record<ReadinessStatus, number> = { BLOCKED: 0, NOT_READY: 1, NOT_ASSESSED: 2, READY: 3 };
    const attention = rows
      .filter((row) => row.readiness === 'BLOCKED' || row.readiness === 'NOT_READY')
      .sort((a, b) => {
        const readinessDiff = readinessRank[a.readiness] - readinessRank[b.readiness];
        if (readinessDiff !== 0) return readinessDiff;
        return b.gatesRemaining - a.gatesRemaining;
      });

    return {
      migrationRequired: false,
      data: { totalCustomers: customers.length, counts, rows, attention },
    };
  } catch (error) {
    return { migrationRequired: missingFounderStorage(error), safeError: safeError(error), data: emptyPortfolio() };
  }
}

export function goLiveReadinessCsv(rows: ReadinessRow[]): string {
  const header = [
    'Company', 'Domain', 'Readiness', 'Onboarding Stage', 'Gates Verified', 'Primary Blocker', 'Next Action',
    ...COUNTABLE_GATES.map((key) => GATE_LABELS[key]),
    GATE_LABELS.SECURITY, GATE_LABELS.DECISION,
  ];
  const lines = rows.map((row) => {
    return [
      row.companyName,
      row.domain,
      READINESS_STATUS_LABELS[row.readiness],
      row.onboardingStage,
      `${row.gatesTotal - row.gatesRemaining} of ${row.gatesTotal}`,
      row.primaryGate?.reason ?? '',
      row.primaryGate?.action ?? '',
      ...COUNTABLE_GATES.map((key) => GATE_STATUS_LABELS[row.gates[key].status]),
      GATE_STATUS_LABELS[row.gates.SECURITY.status],
      GATE_STATUS_LABELS[row.gates.DECISION.status],
    ].map(csvCell).join(',');
  });
  return [header.map(csvCell).join(','), ...lines].join('\n');
}
