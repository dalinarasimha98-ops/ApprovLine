/**
 * Isolated demo workspace for testing the Individual User Dashboard
 * (/dashboard/me) with realistic, populated data - without ever touching a
 * real customer's Organization.
 *
 * REUSE, NOT A SECOND DEMO ENGINE:
 *  - Follows the exact real write shapes services/manual-approvals.ts's
 *    createManualApproval() already uses (ApprovalRecord + ManualApprovalDetail
 *    + ManualApprovalVersion + AuditLog written together) and the exact shape
 *    app/api/approvals/[id]/confirmations/route.ts uses for
 *    ApprovalConfirmationRequest (tokenHash via the same
 *    createConfirmationToken() helper) - never a parallel/simplified schema.
 *  - Registers into lib/demo-detection.ts's EXISTING correlationId-prefix
 *    convention (isDemoApprovalRecord()) instead of inventing a second
 *    "is this demo data" check.
 *  - Does not duplicate lib/demo-data.ts's org-wide workspace-demo engine
 *    (Integrations/MessageSources/20 unattributed approvals) - that engine
 *    injects into the CALLER's own real Organization and never links a real
 *    User as approver, which is the opposite of what testing a PERSONAL
 *    dashboard needs. This module's data lives in its own disposable
 *    Organization instead, so "reset" can never touch a real tenant.
 *
 * ISOLATION: every row this module creates belongs to one dedicated
 * Organization (slug = INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG), created fresh by
 * seedIndividualDashboardDemo() and fully removable by
 * resetIndividualDashboardDemo() - which refuses to delete anything unless
 * the target Organization's slug matches that exact constant, the same
 * guard services/founderDemoGenerator.ts's deleteFounderDemoWorkspace()
 * uses before deleting a founder-demo-* sandbox. No production Organization
 * can ever match this slug, so reset can never delete real customer data.
 */

import { prisma } from '@/lib/prisma';
import type { ApprovalStatus, Role } from '@prisma/client';
import { createConfirmationToken } from '@/services/manual-approvals';
import { invalidateApprovalRecordsCache } from '@/lib/approvalRecords';
import { backfillUnifiedEvidenceForApproval, runEvidenceSidecar } from '@/services/evidence/pipeline';

export const INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG = 'individual-dashboard-demo';
export const INDIVIDUAL_DASHBOARD_DEMO_USER_EMAIL = 'demo-user@approvline.local';

const DEMO_RUN_ID = 'individual-dashboard-demo-v1';
const CLERK_ID_PREFIX = 'demo_clerk_individual_dashboard_';

function daysAgoAt(days: number, hour = 12): Date {
  const d = new Date(Date.now() - days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function daysFromNowAt(days: number, hour = 12): Date {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function todayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function confirmationToken() {
  const { tokenHash } = createConfirmationToken();
  return tokenHash;
}

type DemoUserSeed = { key: 'john' | 'sarah' | 'priya' | 'mike'; name: string; email: string; role: Role };

const DEMO_USERS: DemoUserSeed[] = [
  { key: 'john', name: 'John Doe', email: INDIVIDUAL_DASHBOARD_DEMO_USER_EMAIL, role: 'MANAGER' },
  { key: 'sarah', name: 'Sarah Miller', email: 'sarah.miller@colleague.approvline.local', role: 'MEMBER' },
  { key: 'priya', name: 'Priya Sharma', email: 'priya.sharma@colleague.approvline.local', role: 'MEMBER' },
  { key: 'mike', name: 'Mike Johnson', email: 'mike.johnson@colleague.approvline.local', role: 'MEMBER' },
];

/**
 * The 8 ApprovalRecords that make up John's own "My Approvals" (decisions)
 * - plain, non-manual records with John as the real approver
 * (approverUserId/approverEmail), spanning the last 7/30/90 days so
 * date-range filtering has something real to filter. None of these carry a
 * ManualApprovalDetail or ApprovalConfirmationRequest: in this app's real
 * current architecture a confirmation request is only ever created for a
 * recorded manual/verbal approval (the one real call site is
 * app/api/approvals/[id]/confirmations), so a plain decision genuinely has
 * no due-date mechanism today - these correctly show no due date, matching
 * "Do not invent due dates" (Section 12). Due-date-bearing work lives in
 * JOHN_TASKS below instead, which is what this app's real architecture
 * actually supports carrying a deadline.
 */
const JOHN_APPROVALS: Array<{
  subject: string;
  department: string;
  category: string;
  riskLevel: string;
  businessImpact: string;
  reasoning: string;
  conditions?: string;
  status: ApprovalStatus;
  daysAgo: number;
  /** When set, this record's sourcePlatform is the real integration named
   *  here (not the default 'Manual') and a genuine UnifiedEvidenceRecord
   *  is backfilled for it via services/evidence/pipeline.ts's existing
   *  backfillUnifiedEvidenceForApproval() - the exact helper lib/demo-data.ts's
   *  org-wide demo engine already uses - so "My Approvals"/the approval
   *  detail page can show a genuinely populated evidence source rather
   *  than every demo record reading "no evidence." */
  richEvidenceSource?: string;
}> = [
  {
    subject: 'Q3 marketing budget increase to $250,000',
    department: 'Finance',
    category: 'Finance',
    riskLevel: 'high',
    businessImpact: 'Increases the Q3 marketing budget by $250,000 to fund enterprise pipeline campaigns. Requested by Sarah Miller.',
    reasoning: 'Explicit budget-increase request awaiting your decision.',
    status: 'PENDING_REVIEW',
    daysAgo: 1,
    richEvidenceSource: 'slack',
  },
  {
    subject: 'Northstar Analytics vendor approval',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'high',
    businessImpact: 'Unblocks the Northstar Analytics vendor payment once approved. Requested by Priya Sharma.',
    reasoning: 'Vendor payment approval awaiting your decision.',
    conditions: 'Updated SOC 2 report must be attached before payment release.',
    status: 'PENDING_REVIEW',
    daysAgo: 4,
    richEvidenceSource: 'gmail',
  },
  {
    subject: 'Software license renewal - design tooling suite',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'medium',
    businessImpact: 'Renews the annual design tooling license before expiration.',
    reasoning: 'Approved - standard renewal, no changes to terms.',
    status: 'APPROVED',
    daysAgo: 12,
  },
  {
    subject: 'Travel policy exception - client site visit',
    department: 'Legal',
    category: 'Legal',
    riskLevel: 'medium',
    businessImpact: 'Allows an above-policy travel booking for an upcoming client site visit.',
    reasoning: 'Policy exception request awaiting your decision.',
    status: 'PENDING_REVIEW',
    daysAgo: 20,
  },
  {
    subject: 'Contract amendment - regional distributor',
    department: 'Legal',
    category: 'Legal',
    riskLevel: 'high',
    businessImpact: 'Would have amended the regional distributor contract; declined.',
    reasoning: 'Rejected - the proposed indemnity language did not meet legal requirements.',
    status: 'REJECTED',
    daysAgo: 45,
    richEvidenceSource: 'gmail',
  },
  {
    subject: 'Security review - production database access exception',
    department: 'Security',
    category: 'Security',
    riskLevel: 'high',
    businessImpact: 'Grants temporary privileged production database access pending approval.',
    reasoning: 'Security exception request awaiting your decision.',
    status: 'PENDING_REVIEW',
    daysAgo: 2,
  },
  {
    subject: 'Marketing campaign approval - Q3 launch creative',
    department: 'Marketing',
    category: 'Marketing',
    riskLevel: 'low',
    businessImpact: 'Approves the Q3 launch creative for release across paid channels.',
    reasoning: 'Approved - creative meets brand and compliance guidelines.',
    status: 'APPROVED',
    daysAgo: 60,
  },
  {
    subject: 'Vendor onboarding - regional logistics partner',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'medium',
    businessImpact: 'Onboards a new regional logistics vendor.',
    reasoning: 'Vendor onboarding request awaiting your decision.',
    status: 'PENDING_REVIEW',
    daysAgo: 6,
  },
];

/**
 * John's "My Tasks" - confirmations/acknowledgments assigned to him,
 * modeled as real manual/verbal ApprovalRecords recorded by a colleague
 * with John as ManualApprovalDetail.secondVerifierUserId, exactly the
 * manual-approval flow services/manual-approvals.ts already writes. This
 * is Action Center's own existing CONFIRMATION_REQUEST ActionType
 * (lib/action-center.ts's deriveActionType()) - never a second task model.
 *
 * `confirmationRequested` deliberately varies: being ASSIGNED
 * (ManualApprovalDetail.secondVerifierUserId = John) and being explicitly
 * ASKED to respond (a real ApprovalConfirmationRequest addressed to John,
 * via app/api/approvals/[id]/confirmations) are two different real states
 * this schema already models - a colleague can record that John is the
 * designated verifier without yet sending the formal confirmation
 * request. 3 of the 5 tasks have one (My Tasks and Awaiting My Response
 * both see them); 2 do not (My Tasks only) - so the two KPIs are related
 * but never mechanically identical, without inventing any field.
 *
 * One item (Q3 campaign plan) is recorded and confirmed by John himself
 * immediately (verificationStatus CONFIRMED_BY_APPROVER from creation) so
 * it shows as completed in My Recent Activity rather than sitting in the
 * open task list - My Tasks, like My Approvals, only lists currently-open
 * work.
 *
 * `dualSecondVerifier` deliberately defaults to false: ManualApprovalDetail.
 * secondPersonRequired/secondVerifierUserId is a genuinely separate real
 * obligation from ApprovalRecord.approverEmail (the confirmer) - see
 * services/myTasks.ts's own header comment - and the My Tasks page (Section
 * 138+) correctly surfaces a CONFIRMATION row and a VERIFICATION row
 * separately when both are real. Only ONE item below (the overdue expense
 * report) sets it true, to demonstrate that real dual-obligation case
 * explicitly and honestly, rather than defaulting every demo record to
 * both roles - which would read as duplicated tasks rather than two
 * genuinely distinct ones.
 */
const JOHN_TASKS: Array<{
  subject: string;
  department: string;
  category: string;
  riskLevel: string;
  businessImpact: string;
  reasoning: string;
  recorder: 'sarah' | 'priya' | 'mike';
  expiresAt: Date;
  daysAgo: number;
  confirmationRequested: boolean;
  dualSecondVerifier?: boolean;
}> = [
  {
    subject: 'Complete security training',
    department: 'Security',
    category: 'Compliance',
    riskLevel: 'medium',
    businessImpact: 'Annual security awareness training requirement.',
    reasoning: 'Sarah recorded that you completed security training verbally during the team sync; needs your confirmation today.',
    recorder: 'sarah',
    expiresAt: todayAt(23, 45),
    daysAgo: 1,
    confirmationRequested: true,
  },
  {
    subject: 'Provide budget justification',
    department: 'Finance',
    category: 'Finance',
    riskLevel: 'medium',
    businessImpact: 'Budget justification needed to support the Q3 marketing increase.',
    reasoning: 'Priya recorded your verbal commitment to provide budget justification; needs your confirmation.',
    recorder: 'priya',
    expiresAt: daysFromNowAt(1),
    daysAgo: 2,
    confirmationRequested: true,
  },
  {
    subject: 'Review vendor questionnaire',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'medium',
    businessImpact: 'Vendor security questionnaire requires your review before onboarding proceeds.',
    reasoning: 'Mike recorded that you agreed to review the questionnaire. No formal confirmation request has been sent yet, so this is assigned to you but not yet awaiting an explicit response.',
    recorder: 'mike',
    expiresAt: daysFromNowAt(3),
    daysAgo: 3,
    confirmationRequested: false,
  },
  {
    subject: 'Acknowledge policy update',
    department: 'Compliance',
    category: 'Compliance',
    riskLevel: 'medium',
    businessImpact: 'Acknowledges the updated Q3 data handling policy.',
    reasoning: 'Sarah recorded your verbal acknowledgment of the policy update. No formal confirmation request has been sent yet, so this is assigned to you but not yet awaiting an explicit response.',
    recorder: 'sarah',
    expiresAt: daysFromNowAt(5),
    daysAgo: 10,
    confirmationRequested: false,
  },
  {
    subject: 'Confirm Q2 expense report accuracy',
    department: 'Finance',
    category: 'Finance',
    riskLevel: 'low',
    businessImpact: 'Confirms the accuracy of the submitted Q2 expense report - now overdue.',
    reasoning: 'Mike recorded your verbal confirmation of the expense report; still awaiting your confirmation.',
    recorder: 'mike',
    expiresAt: daysAgoAt(2),
    daysAgo: 12,
    confirmationRequested: true,
    dualSecondVerifier: true,
  },
];

/**
 * Awaiting My Response (/dashboard/responses) "Responded" history coverage
 * - real ApprovalConfirmationRequest rows whose decision has already moved
 * past PENDING, using the exact write shape services/manual-approvals.ts's
 * respondToConfirmation() itself produces (never a simplified facsimile):
 * ManualApprovalDetail.verificationStatus follows the exact same mapping
 * that function uses (CONFIRMED -> CONFIRMED_BY_APPROVER; CORRECTED and
 * REJECTED both -> DISPUTED - yes, both; that is the function's own real
 * ternary, not an inconsistency introduced here), a version-2
 * ManualApprovalVersion reflecting the response, and the real
 * APPROVER_CONFIRMATION_(CONFIRMED|CORRECTED|REJECTED) audit action.
 * JOHN_TASKS above already covers the 2 awaiting-response + 1 overdue
 * states (Section 39's minimum) - this array exists ONLY to add the 3
 * missing RESPONDED outcomes, never duplicating what already exists there.
 */
const JOHN_RESPONDED: Array<{
  subject: string;
  department: string;
  category: string;
  riskLevel: string;
  businessImpact: string;
  recorder: 'sarah' | 'priya' | 'mike';
  requestedDaysAgo: number;
  respondedDaysAgo: number;
  decision: 'CONFIRMED' | 'CORRECTED' | 'REJECTED';
  responseNote: string;
  correction?: { summary: string };
}> = [
  {
    subject: 'Confirm vendor contract renewal terms',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'medium',
    businessImpact: 'Confirms the renewal terms recorded for the annual vendor services contract.',
    recorder: 'mike',
    requestedDaysAgo: 4,
    respondedDaysAgo: 2,
    decision: 'CONFIRMED',
    responseNote: 'Confirmed - terms match what we agreed on the call.',
  },
  {
    subject: 'Correct Q1 travel expense total',
    department: 'Finance',
    category: 'Finance',
    riskLevel: 'low',
    businessImpact: 'Corrects the total recorded for the Q1 client-visit travel expense.',
    recorder: 'sarah',
    requestedDaysAgo: 7,
    respondedDaysAgo: 5,
    decision: 'CORRECTED',
    responseNote: 'The recorded total was wrong; submitting the correct figure.',
    correction: { summary: 'Actual total was $1,240, not $1,450 as recorded.' },
  },
  {
    subject: 'Reject unauthorized software purchase claim',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'high',
    businessImpact: 'Disputes a recorded approval for a software purchase John did not authorize.',
    recorder: 'priya',
    requestedDaysAgo: 3,
    respondedDaysAgo: 1,
    decision: 'REJECTED',
    responseNote: 'This purchase was not approved by me - please escalate.',
  },
];

/**
 * Items John submitted and is waiting on someone else for - real
 * ApprovalRecords with a real ApprovalConfirmationRequest whose
 * requestedByUserId is John, but whose approverEmail is the OTHER party.
 * viewerIdentityWhere() never matches John's identity on any of these
 * (approverUserId/approverEmail belong to the other party), so they
 * correctly never appear in My Pending Approvals/Due Today/Overdue -
 * only in Waiting on Others, exactly as the spec requires.
 *
 * Covers (per Waiting on Others' own demo requirements): 3+ genuinely
 * waiting, 1 due today, 1 overdue, 1 waiting several days, and 1
 * completed/disappeared transition (decision: 'CONFIRMED' - proves by
 * construction that a resolved request drops out of Waiting on Others the
 * moment the other party responds, never lingering as a stale row).
 */
const WAITING_ON_OTHERS: Array<{
  subject: string;
  category: string;
  approverName: string;
  approverEmail: string;
  approverUserKey?: 'mike';
  daysAgo: number;
  expiresInDays?: number;
  expiresAtOverride?: (daysAgo: number) => Date;
  decision?: 'PENDING' | 'CONFIRMED';
}> = [
  { subject: 'Website redesign contract', category: 'Legal', approverName: 'Mike Johnson', approverEmail: 'mike.johnson@colleague.approvline.local', approverUserKey: 'mike', daysAgo: 3, expiresInDays: 11 },
  { subject: 'Team hiring request - Senior Analyst', category: 'HR', approverName: 'HR Team', approverEmail: 'hr-team@approvline-demo.local', daysAgo: 6, expiresInDays: 8 },
  { subject: 'Office equipment purchase - standing desks', category: 'Finance', approverName: 'Finance Team', approverEmail: 'finance-team@approvline-demo.local', daysAgo: 9, expiresInDays: 5 },
  { subject: 'Legal team contract review - NDA template update', category: 'Legal', approverName: 'Legal Team', approverEmail: 'legal-team@approvline-demo.local', daysAgo: 1, expiresInDays: 14 },
  { subject: 'Vendor security questionnaire response', category: 'Security', approverName: 'Sarah Miller', approverEmail: 'sarah.miller@colleague.approvline.local', daysAgo: 2, expiresAtOverride: () => todayAt(23, 45) },
  { subject: 'Expense policy exception request', category: 'Finance', approverName: 'Priya Sharma', approverEmail: 'priya.sharma@colleague.approvline.local', daysAgo: 5, expiresAtOverride: (daysAgo) => daysAgoAt(daysAgo - 3) },
  { subject: 'Marketing budget reallocation - Q4', category: 'Marketing', approverName: 'Finance Team', approverEmail: 'finance-team@approvline-demo.local', daysAgo: 4, expiresInDays: 10, decision: 'CONFIRMED' },
];

/**
 * Investigation-type task coverage for My Tasks (/dashboard/tasks) -
 * real InvestigationCase rows, written directly in the same shape
 * services/investigations.ts's createInvestigationCase() already produces
 * (title/status/riskLevel/department/type/assignedToUserId/createdByUserId/
 * resolvedAt), never a parallel schema. assignedToUserId is the ONLY field
 * that determines My Tasks visibility (see services/myTasks.ts's
 * investigationWhere()) - createdByUserId is deliberately set to a
 * DIFFERENT user on every row below, so these cases prove by construction
 * that "who created it" never leaks into "my tasks" the way it correctly
 * does for "Waiting on Others" on the approval side. One row is left
 * unassigned (assignedToUserId: null) specifically to prove a case nobody
 * is assigned to never appears in anyone's My Tasks.
 */
const JOHN_INVESTIGATIONS: Array<{
  title: string;
  department: string;
  type: string;
  riskLevel: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED';
  assignee: 'john' | null;
  creator: 'sarah' | 'priya' | 'mike';
  daysAgo: number;
  resolvedDaysAgo?: number;
}> = [
  { title: 'Vendor payment duplicate charge review', department: 'Procurement', type: 'Payment Review', riskLevel: 'critical', status: 'ESCALATED', assignee: 'john', creator: 'priya', daysAgo: 5 },
  { title: 'Expense pattern anomaly - Q3 travel claims', department: 'Finance', type: 'Expense Review', riskLevel: 'high', status: 'IN_PROGRESS', assignee: 'john', creator: 'mike', daysAgo: 2 },
  { title: 'Access log review - Q2 security audit', department: 'Security', type: 'Security Audit', riskLevel: 'medium', status: 'RESOLVED', assignee: 'john', creator: 'sarah', daysAgo: 20, resolvedDaysAgo: 3 },
  { title: 'Marketing spend variance - unassigned triage', department: 'Marketing', type: 'Spend Review', riskLevel: 'low', status: 'OPEN', assignee: null, creator: 'priya', daysAgo: 1 },
];

export async function seedIndividualDashboardDemo(): Promise<{ organizationId: string; userEmail: string }> {
  await resetIndividualDashboardDemo();

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: 'Individual Dashboard Demo Workspace',
        slug: INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG,
        departments: ['Finance', 'Procurement', 'Legal', 'Security', 'Marketing', 'Compliance', 'HR'],
        approvalCategories: ['Finance', 'Procurement', 'Legal', 'Security', 'Marketing', 'Compliance', 'HR'],
        onboardingCompletedSteps: [],
      },
    });

    const users: Record<string, { id: string; email: string; name: string }> = {};
    for (const seed of DEMO_USERS) {
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          clerkUserId: `${CLERK_ID_PREFIX}${seed.key}`,
          email: seed.email,
          name: seed.name,
          role: seed.role,
          jobTitle: seed.key === 'john' ? 'Marketing Manager' : undefined,
        },
      });
      users[seed.key] = { id: user.id, email: user.email, name: user.name ?? seed.name };
    }
    const john = users.john;

    // John's 8 decision-type approvals (Section 27) - plain records, no
    // manual/confirmation machinery, matching this app's real constraint
    // that a non-manual decision has no due-date mechanism today.
    for (const approval of JOHN_APPROVALS) {
      const occurredAt = daysAgoAt(approval.daysAgo);
      const record = await tx.approvalRecord.create({
        data: {
          organizationId: organization.id,
          approverUserId: john.id,
          approverName: john.name,
          approverEmail: john.email,
          subject: approval.subject,
          department: approval.department,
          category: approval.category,
          approvalType: approval.status === 'REJECTED' ? 'REJECTION' : 'EXPLICIT',
          status: approval.status,
          confidence: 92,
          riskLevel: approval.riskLevel,
          businessImpact: approval.businessImpact,
          reasoning: approval.reasoning,
          conditions: approval.conditions,
          sourcePlatform: approval.richEvidenceSource ?? 'Manual',
          sourceSystem: approval.richEvidenceSource ? 'INTEGRATION' : 'MANUAL_ENTRY',
          evidenceSnippet: approval.reasoning,
          sourceLink: null,
          correlationId: `${DEMO_RUN_ID}:${occurredAt.getTime()}`,
          approvalTimestamp: occurredAt,
          occurredAt,
          createdAt: occurredAt,
        },
      });
      // Real UnifiedEvidenceRecord backfill (not a fabricated "Evidence
      // available" flag) for the handful of records the spec's demo
      // scenario needs to show a genuinely populated evidence source -
      // the same helper lib/demo-data.ts's org-wide demo engine already
      // uses for every one of its seeded approvals.
      if (approval.richEvidenceSource) {
        await runEvidenceSidecar(() => backfillUnifiedEvidenceForApproval(tx, record), 'individual-dashboard-demo-backfill');
      }
    }

    // John's 5 open task-type confirmations (Section 28) - real manual/
    // verbal ApprovalRecords recorded by a colleague, with John as the
    // designated second verifier and real confirmation target - the exact
    // flow app/api/approvals/[id]/confirmations exercises, reused here
    // rather than a second task model (see JOHN_TASKS's own doc comment).
    for (const task of JOHN_TASKS) {
      const occurredAt = daysAgoAt(task.daysAgo);
      const recorder = users[task.recorder];
      const record = await tx.approvalRecord.create({
        data: {
          organizationId: organization.id,
          approverName: john.name,
          approverEmail: john.email,
          subject: task.subject,
          department: task.department,
          category: task.category,
          approvalType: 'EXPLICIT',
          status: 'APPROVED',
          confidence: 90,
          riskLevel: task.riskLevel,
          businessImpact: task.businessImpact,
          reasoning: task.reasoning,
          sourcePlatform: 'Verbal',
          sourceSystem: 'MANUAL_ENTRY',
          evidenceSnippet: task.reasoning,
          correlationId: `${DEMO_RUN_ID}:${occurredAt.getTime()}`,
          approvalTimestamp: occurredAt,
          occurredAt,
          createdAt: occurredAt,
        },
      });

      await tx.manualApprovalDetail.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          kind: 'VERBAL',
          approverRole: 'Manager',
          communicationChannel: 'In-person / phone',
          recorderUserId: recorder.id,
          businessContext: task.businessImpact,
          supportingNotes: task.reasoning,
          verificationStatus: 'PENDING_CONFIRMATION',
          confidenceLevel: 85,
          secondPersonRequired: Boolean(task.dualSecondVerifier),
          secondVerifierUserId: task.dualSecondVerifier ? john.id : null,
        },
      });
      await tx.manualApprovalVersion.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          version: 1,
          snapshot: {
            kind: 'VERBAL',
            approverRole: 'Manager',
            communicationChannel: 'In-person / phone',
            recorderUserId: recorder.id,
            businessContext: task.businessImpact,
            verificationStatus: 'PENDING_CONFIRMATION',
            confidenceLevel: 85,
            secondPersonRequired: true,
            secondVerifierUserId: john.id,
          },
          changeReason: 'Recorded from a verbal confirmation.',
          actorUserId: recorder.id,
          createdAt: occurredAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: recorder.id,
          approvalRecordId: record.id,
          action: 'MANUAL_APPROVAL_CREATED',
          metadata: { provenance: 'VERBAL', verificationStatus: 'PENDING_CONFIRMATION', version: 1 },
          createdAt: occurredAt,
        },
      });
      // Assignment (ManualApprovalDetail.secondVerifierUserId = John,
      // written above) and an explicit confirmation request are two
      // different real states - only create the request (and its
      // matching audit event) for tasks where one was genuinely sent, so
      // My Tasks and Awaiting My Response are related but never
      // mechanically identical (see JOHN_TASKS's own doc comment).
      if (task.confirmationRequested) {
        await tx.approvalConfirmationRequest.create({
          data: {
            organizationId: organization.id,
            approvalRecordId: record.id,
            tokenHash: confirmationToken(),
            approverName: john.name,
            approverEmail: john.email,
            decision: 'PENDING',
            requestedByUserId: recorder.id,
            expiresAt: task.expiresAt,
            createdAt: occurredAt,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: recorder.id,
            approvalRecordId: record.id,
            action: 'APPROVER_CONFIRMATION_REQUESTED',
            metadata: { approverEmail: john.email, expiresAt: task.expiresAt.toISOString() },
            createdAt: occurredAt,
          },
        });
      }
    }

    // Awaiting My Response "Responded" history coverage - real
    // ApprovalConfirmationRequest rows already past PENDING, written in
    // the exact shape respondToConfirmation() itself produces (see
    // JOHN_RESPONDED's own doc comment for the full mapping rationale).
    for (const item of JOHN_RESPONDED) {
      const requestedAt = daysAgoAt(item.requestedDaysAgo);
      const respondedAt = daysAgoAt(item.respondedDaysAgo);
      const recorder = users[item.recorder];
      const verificationStatus = item.decision === 'CONFIRMED' ? 'CONFIRMED_BY_APPROVER' : 'DISPUTED';
      const record = await tx.approvalRecord.create({
        data: {
          organizationId: organization.id,
          approverName: john.name,
          approverEmail: john.email,
          subject: item.subject,
          department: item.department,
          category: item.category,
          approvalType: 'EXPLICIT',
          status: 'APPROVED',
          confidence: 90,
          riskLevel: item.riskLevel,
          businessImpact: item.businessImpact,
          reasoning: item.businessImpact,
          sourcePlatform: 'Verbal',
          sourceSystem: 'MANUAL_ENTRY',
          evidenceSnippet: item.businessImpact,
          correlationId: `${DEMO_RUN_ID}:responded:${item.decision}`,
          occurredAt: requestedAt,
          createdAt: requestedAt,
        },
      });
      await tx.manualApprovalDetail.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          kind: 'VERBAL',
          approverRole: 'Manager',
          communicationChannel: 'In-person / phone',
          recorderUserId: recorder.id,
          businessContext: item.businessImpact,
          verificationStatus,
          confidenceLevel: 85,
          secondPersonRequired: false,
          currentVersion: 2,
        },
      });
      await tx.manualApprovalVersion.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          version: 1,
          snapshot: { kind: 'VERBAL', recorderUserId: recorder.id, businessContext: item.businessImpact, verificationStatus: 'PENDING_CONFIRMATION', confidenceLevel: 85, secondPersonRequired: false },
          changeReason: 'Recorded from a verbal confirmation.',
          actorUserId: recorder.id,
          createdAt: requestedAt,
        },
      });
      await tx.manualApprovalVersion.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          version: 2,
          snapshot: { verificationStatus, approverConfirmation: { decision: item.decision, responseNote: item.responseNote, correction: item.correction ?? null, respondedAt: respondedAt.toISOString(), approverEmail: john.email } },
          previousValues: { verificationStatus: 'PENDING_CONFIRMATION' },
          changeReason: `Approver ${item.decision.toLowerCase()}: ${item.responseNote}`,
          actorUserId: recorder.id,
          createdAt: respondedAt,
        },
      });
      await tx.approvalConfirmationRequest.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          tokenHash: confirmationToken(),
          approverName: john.name,
          approverEmail: john.email,
          decision: item.decision,
          requestedByUserId: recorder.id,
          expiresAt: daysFromNowAt(14 - item.requestedDaysAgo),
          respondedAt,
          responseNote: item.responseNote,
          correction: item.correction ?? undefined,
          immutableResponse: { decision: item.decision, responseNote: item.responseNote, correction: item.correction ?? null, respondedAt: respondedAt.toISOString(), approverEmail: john.email },
          createdAt: requestedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: recorder.id,
          approvalRecordId: record.id,
          action: 'APPROVER_CONFIRMATION_REQUESTED',
          metadata: { approverEmail: john.email },
          createdAt: requestedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          action: `APPROVER_CONFIRMATION_${item.decision}`,
          metadata: { decision: item.decision, responseNote: item.responseNote, correction: item.correction ?? null, approverEmail: john.email },
          createdAt: respondedAt,
        },
      });
    }

    // Investigation-type My Tasks coverage (Section 138) - real
    // InvestigationCase rows, assigned/unassigned and open/resolved, using
    // the exact audit actions services/dashboard.ts's
    // MEANINGFUL_AUDIT_ACTIONS allowlist already recognizes
    // ('investigation.created', 'investigation.status_changed').
    for (const investigation of JOHN_INVESTIGATIONS) {
      const createdAt = daysAgoAt(investigation.daysAgo);
      const resolvedAt = investigation.resolvedDaysAgo !== undefined ? daysAgoAt(investigation.resolvedDaysAgo) : null;
      const creator = users[investigation.creator];
      const assignedToUserId = investigation.assignee ? users[investigation.assignee].id : null;
      const kase = await tx.investigationCase.create({
        data: {
          organizationId: organization.id,
          title: investigation.title,
          status: investigation.status,
          type: investigation.type,
          department: investigation.department,
          riskLevel: investigation.riskLevel,
          summary: `${investigation.title}, opened for review.`,
          assignedToUserId,
          createdByUserId: creator.id,
          resolvedAt,
          createdAt,
          updatedAt: resolvedAt ?? createdAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: creator.id,
          action: 'investigation.created',
          metadata: { investigationId: kase.id, title: investigation.title, status: investigation.status },
          createdAt,
        },
      });
      if (resolvedAt) {
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: assignedToUserId ?? creator.id,
            action: 'investigation.status_changed',
            metadata: { investigationId: kase.id, title: investigation.title, status: 'RESOLVED' },
            createdAt: resolvedAt,
          },
        });
      }
    }

    for (const item of WAITING_ON_OTHERS) {
      const createdAt = daysAgoAt(item.daysAgo);
      const record = await tx.approvalRecord.create({
        data: {
          organizationId: organization.id,
          approverUserId: item.approverUserKey ? users[item.approverUserKey].id : null,
          approverName: item.approverName,
          approverEmail: item.approverEmail,
          subject: item.subject,
          category: item.category,
          approvalType: 'EXPLICIT',
          status: 'PENDING_REVIEW',
          confidence: 80,
          businessImpact: `Submitted by ${john.name} and awaiting a decision from ${item.approverName}.`,
          reasoning: `${john.name} submitted this for approval and is waiting on ${item.approverName} to respond.`,
          sourcePlatform: 'Manual',
          sourceSystem: 'MANUAL_ENTRY',
          evidenceSnippet: `Awaiting response from ${item.approverName}.`,
          correlationId: `${DEMO_RUN_ID}:${createdAt.getTime()}`,
          occurredAt: createdAt,
          createdAt,
        },
      });

      const decision = item.decision ?? 'PENDING';
      const expiresAt = item.expiresAtOverride ? item.expiresAtOverride(item.daysAgo) : daysFromNowAt(item.expiresInDays ?? 7);
      await tx.approvalConfirmationRequest.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          tokenHash: confirmationToken(),
          approverName: item.approverName,
          approverEmail: item.approverEmail,
          decision,
          requestedByUserId: john.id,
          expiresAt,
          respondedAt: decision === 'PENDING' ? null : daysAgoAt(Math.max(0, item.daysAgo - 2)),
          createdAt,
        },
      });
      if (decision !== 'PENDING') {
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: item.approverUserKey ? users[item.approverUserKey].id : john.id,
            approvalRecordId: record.id,
            action: `APPROVER_CONFIRMATION_${decision}`,
            metadata: { approverEmail: item.approverEmail, provenance: 'waiting-on-others-demo' },
            createdAt: daysAgoAt(Math.max(0, item.daysAgo - 2)),
          },
        });
      }
    }

    // Waiting on Others - VERIFICATION coverage: a manual approval John
    // himself recorded (recorderUserId = John, the real initiator field),
    // requiring second-person verification from someone else - the exact
    // mirror of JOHN_TASKS' VERIFICATION rows above (there, a colleague
    // records and John verifies; here, John records and a colleague
    // verifies), proving the same ManualApprovalDetail fields read from
    // the opposite direction produce the opposite module's row.
    {
      const occurredAt = daysAgoAt(2);
      const record = await tx.approvalRecord.create({
        data: {
          organizationId: organization.id,
          approverName: john.name,
          approverEmail: john.email,
          subject: 'Facilities vendor change - verbal sign-off',
          department: 'Operations',
          category: 'Operations',
          approvalType: 'EXPLICIT',
          status: 'APPROVED',
          confidence: 85,
          riskLevel: 'medium',
          businessImpact: 'Switching the office cleaning vendor, recorded verbally by John.',
          reasoning: 'John recorded this verbal approval and designated Mike Johnson as the required second-person verifier.',
          sourcePlatform: 'Verbal',
          sourceSystem: 'MANUAL_ENTRY',
          evidenceSnippet: 'John recorded this verbal approval and is waiting on second-person verification.',
          correlationId: `${DEMO_RUN_ID}:${occurredAt.getTime()}`,
          approvalTimestamp: occurredAt,
          occurredAt,
          createdAt: occurredAt,
        },
      });
      await tx.manualApprovalDetail.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          kind: 'VERBAL',
          approverRole: 'Manager',
          communicationChannel: 'In-person / phone',
          recorderUserId: john.id,
          businessContext: 'Switching the office cleaning vendor, recorded verbally by John.',
          supportingNotes: 'Requires second-person verification before it is considered confirmed.',
          verificationStatus: 'PENDING_CONFIRMATION',
          confidenceLevel: 85,
          secondPersonRequired: true,
          secondVerifierUserId: users.mike.id,
        },
      });
      await tx.manualApprovalVersion.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          version: 1,
          snapshot: { kind: 'VERBAL', recorderUserId: john.id, businessContext: 'Switching the office cleaning vendor, recorded verbally by John.', verificationStatus: 'PENDING_CONFIRMATION', confidenceLevel: 85, secondPersonRequired: true, secondVerifierUserId: users.mike.id },
          changeReason: 'Recorded from a verbal confirmation.',
          actorUserId: john.id,
          createdAt: occurredAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: john.id,
          approvalRecordId: record.id,
          action: 'MANUAL_APPROVAL_CREATED',
          metadata: { provenance: 'VERBAL', verificationStatus: 'PENDING_CONFIRMATION', version: 1 },
          createdAt: occurredAt,
        },
      });
    }

    // Waiting on Others - INVESTIGATION coverage: a real InvestigationCase
    // John created (createdByUserId = John) but assigned to someone else
    // (assignedToUserId = Priya) - the exact mirror of JOHN_INVESTIGATIONS
    // above, where John is always the assignee; here he is always the
    // creator, proving createdByUserId never leaks into My Tasks and
    // assignedToUserId never leaks into Waiting on Others for the same row.
    {
      const createdAt = daysAgoAt(4);
      await tx.investigationCase.create({
        data: {
          organizationId: organization.id,
          title: 'Duplicate invoice flag - vendor onboarding batch',
          status: 'IN_PROGRESS',
          type: 'Payment Review',
          department: 'Finance',
          riskLevel: 'high',
          summary: 'John opened this investigation and assigned it to Priya Sharma for review.',
          assignedToUserId: users.priya.id,
          createdByUserId: john.id,
          createdAt,
          updatedAt: createdAt,
        },
      });
    }

    // John's own recent activity: manual approvals he personally recorded
    // and confirmed himself immediately - the only real, non-fabricated
    // audit-action strings this schema currently attributes to a specific
    // acting user for approval-adjacent work (see MEANINGFUL_AUDIT_ACTIONS
    // in services/dashboard.ts - there is no generic "user approved/
    // rejected/commented" audit action anywhere in this codebase). "Submit
    // Q3 campaign plan" is the "1 completed" item from Section 28's task
    // list - completed the moment it's recorded, so it correctly never
    // appears in the open My Tasks list, only here.
    const selfRecorded: Array<{ subject: string; category: string; daysAgo: number }> = [
      { subject: 'Submit Q3 campaign plan', category: 'Marketing', daysAgo: 1 },
      { subject: 'Facilities access request - new hire desk setup', category: 'Operations', daysAgo: 3 },
      { subject: 'Client dinner expense approval', category: 'Finance', daysAgo: 8 },
    ];
    for (const item of selfRecorded) {
      const occurredAt = daysAgoAt(item.daysAgo);
      const record = await tx.approvalRecord.create({
        data: {
          organizationId: organization.id,
          approverUserId: john.id,
          approverName: john.name,
          approverEmail: john.email,
          subject: item.subject,
          category: item.category,
          approvalType: 'EXPLICIT',
          status: 'APPROVED',
          confidence: 95,
          businessImpact: `${item.subject}, recorded and confirmed by ${john.name}.`,
          reasoning: `${john.name} recorded and confirmed this approval directly.`,
          sourcePlatform: 'Verbal',
          sourceSystem: 'MANUAL_ENTRY',
          evidenceSnippet: `${john.name} confirmed this approval directly - no second-person confirmation required.`,
          correlationId: `${DEMO_RUN_ID}:${occurredAt.getTime()}`,
          occurredAt,
          createdAt: occurredAt,
        },
      });
      await tx.manualApprovalDetail.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          kind: 'VERBAL',
          approverRole: 'Manager',
          communicationChannel: 'In-person / phone',
          recorderUserId: john.id,
          businessContext: item.subject,
          verificationStatus: 'CONFIRMED_BY_APPROVER',
          confidenceLevel: 95,
          secondPersonRequired: false,
        },
      });
      await tx.manualApprovalVersion.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          version: 1,
          snapshot: { kind: 'VERBAL', recorderUserId: john.id, verificationStatus: 'CONFIRMED_BY_APPROVER' },
          changeReason: 'Recorded and confirmed directly.',
          actorUserId: john.id,
          createdAt: occurredAt,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: john.id,
          approvalRecordId: record.id,
          action: 'MANUAL_APPROVAL_CREATED',
          metadata: { provenance: 'VERBAL', verificationStatus: 'CONFIRMED_BY_APPROVER', version: 1 },
          createdAt: occurredAt,
        },
      });
    }

    return { organizationId: organization.id, userEmail: john.email };
  }, { timeout: 30_000 });

  invalidateApprovalRecordsCache(result.organizationId);
  return result;
}

/**
 * Deletes the isolated demo workspace, if it exists. Guarded to the exact
 * demo slug - the same pattern services/founderDemoGenerator.ts's
 * deleteFounderDemoWorkspace() uses before deleting a founder-demo-*
 * sandbox - so this can never delete a real customer Organization even if
 * called with no arguments. Every model this seed writes to
 * (ApprovalRecord/ManualApprovalDetail/ManualApprovalVersion/
 * ApprovalConfirmationRequest/AuditLog/User) cascades from Organization,
 * so deleting the Organization row removes all of it in one step.
 */
export async function resetIndividualDashboardDemo(): Promise<boolean> {
  const organization = await prisma.organization.findUnique({ where: { slug: INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG } });
  if (!organization) return false;
  if (organization.slug !== INDIVIDUAL_DASHBOARD_DEMO_ORG_SLUG) return false;
  await prisma.organization.delete({ where: { id: organization.id } });
  invalidateApprovalRecordsCache(organization.id);
  return true;
}
