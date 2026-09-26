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
import type { ApprovalStatus, ManualApprovalVerificationStatus, Role } from '@prisma/client';
import { createConfirmationToken } from '@/services/manual-approvals';
import { invalidateApprovalRecordsCache } from '@/lib/approvalRecords';

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
 * The 9 ApprovalRecords that make up John's own "My Approvals" / Total
 * Approvals - a realistic mix of plain (already-resolved) approvals and
 * manual/verbal approvals still awaiting John's confirmation, spanning the
 * last 7/30/90 days so date-range filtering has something real to filter.
 *
 * "confirmation" is set for the 6 items that are genuinely still open
 * (manual/verbal approval recorded by a colleague, awaiting John's
 * confirmation - the exact real flow app/api/approvals/[id]/confirmations
 * exercises) - its expiresAt/decision drives Due Today/Overdue/Due Soon/
 * Awaiting My Response identically to how a real confirmation request
 * would. The 3 plain items have no confirmation and are already resolved
 * (APPROVED/REJECTED), so they correctly do NOT count toward My Pending
 * Approvals.
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
  manual: null | {
    recorder: 'sarah' | 'priya' | 'mike';
    verificationStatus: ManualApprovalVerificationStatus;
    confirmation: null | { expiresAt: Date };
  };
}> = [
  {
    subject: 'Q3 marketing budget increase to $250,000',
    department: 'Finance',
    category: 'Finance',
    riskLevel: 'high',
    businessImpact: 'Increases the Q3 marketing budget by $250,000 to fund enterprise pipeline campaigns.',
    reasoning: 'Sarah verbally approved the budget increase in the Monday finance sync; recorded pending your confirmation.',
    status: 'APPROVED',
    daysAgo: 1,
    manual: { recorder: 'sarah', verificationStatus: 'PENDING_CONFIRMATION', confirmation: { expiresAt: todayAt(23, 45) } },
  },
  {
    subject: 'Northstar Analytics vendor approval',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'high',
    businessImpact: 'Unblocks the Northstar Analytics vendor payment pending your confirmation of the verbal approval.',
    reasoning: 'Priya recorded your verbal approval from the procurement call; needs your confirmation before payment releases.',
    conditions: 'Updated SOC 2 report must be attached before payment release.',
    status: 'APPROVED',
    daysAgo: 4,
    manual: { recorder: 'priya', verificationStatus: 'PENDING_CONFIRMATION', confirmation: { expiresAt: daysFromNowAt(1) } },
  },
  {
    subject: 'Software license renewal - design tooling suite',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'medium',
    businessImpact: 'Renews the annual design tooling license before expiration.',
    reasoning: 'Explicit approval already confirmed; no further action needed.',
    status: 'APPROVED',
    daysAgo: 12,
    manual: null,
  },
  {
    subject: 'Travel policy exception - client site visit',
    department: 'Legal',
    category: 'Legal',
    riskLevel: 'medium',
    businessImpact: 'Allows an above-policy travel booking for an upcoming client site visit.',
    reasoning: 'Mike recorded your verbal approval for the travel exception; needs your confirmation.',
    conditions: 'Manager confirmation required before the exception is finalized.',
    status: 'APPROVED',
    daysAgo: 20,
    manual: { recorder: 'mike', verificationStatus: 'PENDING_CONFIRMATION', confirmation: { expiresAt: daysFromNowAt(3) } },
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
    manual: null,
  },
  {
    subject: 'Security review - production database access exception',
    department: 'Security',
    category: 'Security',
    riskLevel: 'high',
    businessImpact: 'Grants temporary privileged production database access pending your confirmation.',
    reasoning: 'Sarah recorded your verbal approval from the incident bridge; needs your confirmation today.',
    conditions: 'Access must be revoked automatically after 48 hours.',
    status: 'APPROVED',
    daysAgo: 2,
    manual: { recorder: 'sarah', verificationStatus: 'PENDING_CONFIRMATION', confirmation: { expiresAt: todayAt(22, 30) } },
  },
  {
    subject: 'Marketing campaign approval - Q3 launch creative',
    department: 'Marketing',
    category: 'Marketing',
    riskLevel: 'low',
    businessImpact: 'Approves the Q3 launch creative for release across paid channels.',
    reasoning: 'Explicit approval already confirmed; no further action needed.',
    status: 'APPROVED',
    daysAgo: 60,
    manual: null,
  },
  {
    subject: 'Vendor onboarding - regional logistics partner',
    department: 'Procurement',
    category: 'Procurement',
    riskLevel: 'medium',
    businessImpact: 'Onboards a new regional logistics vendor pending your confirmation.',
    reasoning: 'Priya recorded your verbal approval for the vendor onboarding; needs your confirmation.',
    status: 'APPROVED',
    daysAgo: 6,
    manual: { recorder: 'priya', verificationStatus: 'PENDING_CONFIRMATION', confirmation: { expiresAt: daysFromNowAt(5) } },
  },
  {
    subject: 'Compliance policy acknowledgment - Q3 data handling update',
    department: 'Compliance',
    category: 'Compliance',
    riskLevel: 'medium',
    businessImpact: 'Acknowledges the updated Q3 data handling policy pending your confirmation - now overdue.',
    reasoning: 'Mike recorded your verbal acknowledgment of the policy update; still awaiting your confirmation.',
    status: 'APPROVED',
    daysAgo: 10,
    manual: { recorder: 'mike', verificationStatus: 'PENDING_CONFIRMATION', confirmation: { expiresAt: daysAgoAt(2) } },
  },
];

/**
 * 4 items John submitted and is waiting on someone else for - real
 * ApprovalRecords with a real ApprovalConfirmationRequest whose
 * requestedByUserId is John, but whose approverEmail is the OTHER party.
 * viewerIdentityWhere() never matches John's identity on any of these
 * (approverUserId/approverEmail belong to the other party), so they
 * correctly never appear in My Pending Approvals/Due Today/Overdue -
 * only in Waiting on Others, exactly as the spec requires.
 */
const WAITING_ON_OTHERS: Array<{
  subject: string;
  category: string;
  approverName: string;
  approverEmail: string;
  approverUserKey?: 'mike';
  daysAgo: number;
  expiresInDays: number;
}> = [
  { subject: 'Website redesign contract', category: 'Legal', approverName: 'Mike Johnson', approverEmail: 'mike.johnson@colleague.approvline.local', approverUserKey: 'mike', daysAgo: 3, expiresInDays: 11 },
  { subject: 'Team hiring request - Senior Analyst', category: 'HR', approverName: 'HR Team', approverEmail: 'hr-team@approvline-demo.local', daysAgo: 6, expiresInDays: 8 },
  { subject: 'Office equipment purchase - standing desks', category: 'Finance', approverName: 'Finance Team', approverEmail: 'finance-team@approvline-demo.local', daysAgo: 9, expiresInDays: 5 },
  { subject: 'Legal team contract review - NDA template update', category: 'Legal', approverName: 'Legal Team', approverEmail: 'legal-team@approvline-demo.local', daysAgo: 1, expiresInDays: 14 },
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
          sourcePlatform: approval.manual ? 'Verbal' : 'Manual',
          sourceSystem: 'MANUAL_ENTRY',
          evidenceSnippet: approval.reasoning,
          sourceLink: null,
          correlationId: `${DEMO_RUN_ID}:${occurredAt.getTime()}`,
          approvalTimestamp: occurredAt,
          occurredAt,
          createdAt: occurredAt,
        },
      });

      if (approval.manual) {
        const recorder = users[approval.manual.recorder];
        await tx.manualApprovalDetail.create({
          data: {
            organizationId: organization.id,
            approvalRecordId: record.id,
            kind: 'VERBAL',
            approverRole: 'Manager',
            communicationChannel: 'In-person / phone',
            recorderUserId: recorder.id,
            businessContext: approval.businessImpact,
            supportingNotes: approval.reasoning,
            verificationStatus: approval.manual.verificationStatus,
            confidenceLevel: 85,
            secondPersonRequired: true,
            secondVerifierUserId: john.id,
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
              businessContext: approval.businessImpact,
              verificationStatus: approval.manual.verificationStatus,
              confidenceLevel: 85,
              secondPersonRequired: true,
              secondVerifierUserId: john.id,
            },
            changeReason: 'Recorded from a verbal approval.',
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
            metadata: { provenance: 'VERBAL', verificationStatus: approval.manual.verificationStatus, version: 1 },
            createdAt: occurredAt,
          },
        });

        if (approval.manual.confirmation) {
          await tx.approvalConfirmationRequest.create({
            data: {
              organizationId: organization.id,
              approvalRecordId: record.id,
              tokenHash: confirmationToken(),
              approverName: john.name,
              approverEmail: john.email,
              decision: 'PENDING',
              requestedByUserId: recorder.id,
              expiresAt: approval.manual.confirmation.expiresAt,
              createdAt: occurredAt,
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId: organization.id,
              actorUserId: recorder.id,
              approvalRecordId: record.id,
              action: 'APPROVER_CONFIRMATION_REQUESTED',
              metadata: { approverEmail: john.email, expiresAt: approval.manual.confirmation.expiresAt.toISOString() },
              createdAt: occurredAt,
            },
          });
        }
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

      await tx.approvalConfirmationRequest.create({
        data: {
          organizationId: organization.id,
          approvalRecordId: record.id,
          tokenHash: confirmationToken(),
          approverName: item.approverName,
          approverEmail: item.approverEmail,
          decision: 'PENDING',
          requestedByUserId: john.id,
          expiresAt: daysFromNowAt(item.expiresInDays),
          createdAt,
        },
      });
    }

    // John's own recent activity: two manual approvals he personally
    // recorded and confirmed himself - the only real, non-fabricated
    // audit-action strings this schema currently attributes to a specific
    // acting user for approval-adjacent work (see MEANINGFUL_AUDIT_ACTIONS
    // in services/dashboard.ts - there is no generic "user approved/
    // rejected/commented" audit action anywhere in this codebase).
    const selfRecorded: Array<{ subject: string; category: string; daysAgo: number }> = [
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
