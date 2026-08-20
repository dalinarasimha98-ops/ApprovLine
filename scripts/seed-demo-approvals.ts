/**
 * Seeds 15 realistic ApprovalRecords for one organization, correlated into
 * 7 UnifiedEvidenceRecords (5 multi-source groups + 2 standalone) via
 * CanonicalEvidenceEvent + UnifiedEvidenceMember - the same structure the
 * real evidence-correlation pipeline (services/evidence/pipeline.ts)
 * produces, so the Unified Evidence page's "N sources" / correlation UI
 * has real grouped data to render, not just single-source records like
 * lib/demo-data.ts's synthetic seed does.
 *
 * Fields the ticket asked for that don't exist on these models (verified
 * against prisma/schema.prisma before writing this):
 *   - ApprovalRecord has no riskScore or requester fields - only
 *     riskLevel (string) and approverName/approverEmail. Requester
 *     context is folded into reasoning/evidenceSnippet text instead.
 *   - UnifiedEvidenceRecord has no riskScore either - riskLevel only.
 * Not created, out of this script's stated table scope (ApprovalRecord /
 * UnifiedEvidenceRecord / CanonicalEvidenceEvent only): MessageSource,
 * AuditLog, Integration/EvidenceProviderConnection rows. The dashboard's
 * "Recent Audit" widget will stay empty after seeding as a result - see
 * the summary printed at the end.
 * Added beyond the literal spec, because the correlation UI needs it to
 * actually render sources/counts correctly: UnifiedEvidenceMember rows
 * linking each event to its UnifiedEvidenceRecord.
 *
 * Idempotent via ApprovalRecord.correlationId, prefixed with SEED_RUN_ID -
 * a readable marker (not a hash) so a re-run can find prior seeded rows
 * before creating anything, and so a future cleanup script can identify
 * these rows precisely the way clear-demo-data.ts does for lib/demo-data.ts's
 * seed. sourceLink/sourcePlatform values are realistic, not tagged with
 * 'demo'/'TDEMO' - see the summary for why that's a deliberate tradeoff.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-approvals.ts --org <organizationId> --dry-run
 *   npx tsx scripts/seed-demo-approvals.ts --org <organizationId> --apply
 */
import { createHash } from 'node:crypto';
import type { ApprovalStatus, ApprovalType } from '@prisma/client';
import { prisma } from '../lib/prisma';

const SEED_RUN_ID = 'seed-demo-approvals-v1';

function parseArgs(argv: string[]) {
  const orgIndex = argv.indexOf('--org');
  const organizationId = orgIndex >= 0 ? argv[orgIndex + 1] : undefined;
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run') || !apply;
  return { organizationId, apply, dryRun };
}

function daysAgo(days: number, hoursOffset = 0): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000 + hoursOffset * 60 * 60 * 1000);
}

function evidenceHash(key: string): string {
  return createHash('sha256').update(`${SEED_RUN_ID}:${key}`).digest('hex');
}

type ApprovalSeed = {
  key: string;
  subject: string;
  approverName: string;
  approverEmail: string;
  approvalType: ApprovalType;
  status: ApprovalStatus;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  businessImpact: string;
  reasoning: string;
  conditions?: string;
  sourcePlatform: string;
  sourceLink: string;
  evidenceSnippet: string;
  occurredAt: Date;
  providerKey: string;
  providerEventType: string;
};

type GroupSeed = {
  title: string;
  department: string;
  category: string;
  amount?: number;
  currency?: string;
  primaryIndex: number;
  approvals: ApprovalSeed[];
};

const RISK_RANK: Record<ApprovalSeed['riskLevel'], number> = { low: 0, medium: 1, high: 2, critical: 3 };

const groups: GroupSeed[] = [
  {
    title: 'Master Service Agreement — Acme Corp $2.4M',
    department: 'Legal',
    category: 'Legal',
    amount: 2_400_000,
    currency: 'USD',
    primaryIndex: 2,
    approvals: [
      {
        key: 'group-1-legal:gmail',
        subject: 'Master Service Agreement — Acme Corp ($2.4M) approved by Legal',
        approverName: 'Elena Vasquez',
        approverEmail: 'elena.vasquez@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 96,
        riskLevel: 'high',
        businessImpact: 'Unblocks execution of the largest vendor contract signed this fiscal year.',
        reasoning: 'Legal Director confirms all terms have been reviewed and approved for execution.',
        sourcePlatform: 'gmail',
        sourceLink: 'https://mail.google.com/mail/u/0/#inbox/msa-acme-legal-thread-892',
        evidenceSnippet: 'Reviewed final redlines with outside counsel. Terms are acceptable — approved to proceed to signature.',
        occurredAt: daysAgo(25),
        providerKey: 'gmail',
        providerEventType: 'approval_decision',
      },
      {
        key: 'group-1-legal:slack',
        subject: 'MSA — Acme Corp $2.4M confirmed by CFO in #legal-approvals',
        approverName: 'Marcus Chen',
        approverEmail: 'marcus.chen@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 94,
        riskLevel: 'high',
        businessImpact: 'Confirms financial terms align with FY24 vendor spend plan before execution.',
        reasoning: 'CFO confirms budget and financial terms align with the approved vendor spend plan.',
        sourcePlatform: 'slack',
        sourceLink: 'https://acme.slack.com/archives/C02LEGAL01/p1755600000000100',
        evidenceSnippet: 'Numbers check out on our end. Good to move forward — approved.',
        occurredAt: daysAgo(24, -4),
        providerKey: 'slack',
        providerEventType: 'approval_decision',
      },
      {
        key: 'group-1-legal:jira',
        subject: 'LEGAL-892: MSA Acme Corp $2.4M — status changed to Approved',
        approverName: 'David Okonkwo',
        approverEmail: 'david.okonkwo@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 97,
        riskLevel: 'high',
        businessImpact: 'Formal contract-tracking record of the approval, closing out the review workflow.',
        reasoning: 'Formal contract tracking ticket closed out with Approved status after Legal and Finance sign-off.',
        sourcePlatform: 'jira',
        sourceLink: 'https://acme.atlassian.net/browse/LEGAL-892',
        evidenceSnippet: 'Status transitioned: In Review → Approved. All required approvals attached.',
        occurredAt: daysAgo(24, -6),
        providerKey: 'jira',
        providerEventType: 'ticket_status_changed',
      },
    ],
  },
  {
    title: 'Q4 Infrastructure Budget — $850,000',
    department: 'Finance',
    category: 'Finance',
    amount: 850_000,
    currency: 'USD',
    primaryIndex: 2,
    approvals: [
      {
        key: 'group-2-finance:zoom',
        subject: 'Q4 Infrastructure Budget $850K — verbal approval on Zoom',
        approverName: 'Marcus Chen',
        approverEmail: 'marcus.chen@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 89,
        riskLevel: 'medium',
        businessImpact: 'Funds infrastructure scaling ahead of the holiday traffic spike.',
        reasoning: "CFO gives verbal approval during the budget review meeting after VP Engineering's scaling presentation.",
        sourcePlatform: 'zoom',
        sourceLink: 'https://acme.zoom.us/rec/share/q4-infra-budget-review-2026',
        evidenceSnippet: "Transcript excerpt: 'This is approved — let's get infra scaled before the holiday traffic spike.'",
        occurredAt: daysAgo(18),
        providerKey: 'zoom',
        providerEventType: 'meeting_decision',
      },
      {
        key: 'group-2-finance:outlook',
        subject: 'Q4 Infrastructure Budget $850K — CFO written confirmation',
        approverName: 'Marcus Chen',
        approverEmail: 'marcus.chen@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 97,
        riskLevel: 'medium',
        businessImpact: 'Provides a written record of the verbal budget approval for audit purposes.',
        reasoning: 'Written follow-up confirming the verbal approval from the budget review call, for the record.',
        sourcePlatform: 'outlook',
        sourceLink: 'https://outlook.office.com/mail/inbox/id/q4-infra-budget-confirmation',
        evidenceSnippet: 'Confirming in writing: Q4 infrastructure budget of $850,000 is approved as discussed.',
        occurredAt: daysAgo(17, -2),
        providerKey: 'outlook',
        providerEventType: 'approval_decision',
      },
      {
        key: 'group-2-finance:servicenow',
        subject: 'Q4 Infrastructure Budget $850K — Finance Committee approval (ServiceNow)',
        approverName: 'Priya Nair',
        approverEmail: 'priya.nair@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 95,
        riskLevel: 'medium',
        businessImpact: 'Formal capital expenditure sign-off releasing budget for the initiative.',
        reasoning: 'Finance committee formally approves the capital expenditure request after budget review.',
        sourcePlatform: 'servicenow',
        sourceLink: 'https://acme.service-now.com/nav_to.do?uri=sc_request.do?number=REQ0091823',
        evidenceSnippet: 'Request approved. Funds allocated from the FY24 Q4 infrastructure capex line.',
        occurredAt: daysAgo(17, -5),
        providerKey: 'servicenow',
        providerEventType: 'request_approved',
      },
    ],
  },
  {
    title: 'Production Database Migration — Critical Change',
    department: 'Engineering',
    category: 'Engineering',
    primaryIndex: 2,
    approvals: [
      {
        key: 'group-3-engineering:slack',
        subject: 'Production DB Migration — CTO approval in #eng-approvals',
        approverName: 'Rachel Kim',
        approverEmail: 'rachel.kim@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 93,
        riskLevel: 'critical',
        businessImpact: 'Enables a critical production database migration with defined rollback coverage.',
        reasoning: 'CTO approves the critical production database migration plan after reviewing rollback procedures.',
        sourcePlatform: 'slack',
        sourceLink: 'https://acme.slack.com/archives/C02ENGAPPR/p1755700000000200',
        evidenceSnippet: 'Reviewed the migration runbook and rollback plan. Approved — proceed during the Sunday maintenance window.',
        occurredAt: daysAgo(10),
        providerKey: 'slack',
        providerEventType: 'approval_decision',
      },
      {
        key: 'group-3-engineering:jira',
        subject: 'INFRA-441: Production DB Migration — Approved',
        approverName: 'Tom Bradley',
        approverEmail: 'tom.bradley@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 95,
        riskLevel: 'critical',
        businessImpact: 'Confirms staging validation passed before the production change proceeds.',
        reasoning: 'Engineering change ticket approved after peer review and staging validation.',
        sourcePlatform: 'jira',
        sourceLink: 'https://acme.atlassian.net/browse/INFRA-441',
        evidenceSnippet: 'Status: Approved. Staging migration dry-run completed successfully with zero data integrity issues.',
        occurredAt: daysAgo(10, -3),
        providerKey: 'jira',
        providerEventType: 'ticket_status_changed',
      },
      {
        key: 'group-3-engineering:servicenow',
        subject: 'Emergency Change Request — Production DB Migration — Approved',
        approverName: 'Sofia Marin',
        approverEmail: 'sofia.marin@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 96,
        riskLevel: 'critical',
        businessImpact: 'Formal Change Advisory Board sign-off required for any production emergency change.',
        reasoning: 'Change Advisory Board grants emergency change approval given the critical nature and defined rollback window.',
        sourcePlatform: 'servicenow',
        sourceLink: 'https://acme.service-now.com/nav_to.do?uri=change_request.do?sys_id=CHG0044120',
        evidenceSnippet: 'CAB approval granted. Change window: Sunday 02:00–05:00 UTC. Rollback plan validated.',
        occurredAt: daysAgo(9),
        providerKey: 'servicenow',
        providerEventType: 'change_approved',
      },
    ],
  },
  {
    title: 'Senior Engineering Hire — Compensation Band Exception',
    department: 'HR',
    category: 'HR',
    primaryIndex: 1,
    approvals: [
      {
        key: 'group-4-hr:gmail',
        subject: 'Senior Engineering Hire — Compensation Band Exception approved by HR',
        approverName: 'Janet Foster',
        approverEmail: 'janet.foster@acme.example',
        approvalType: 'CONDITIONAL',
        status: 'APPROVED',
        confidence: 90,
        riskLevel: 'medium',
        businessImpact: 'Secures a competitive senior engineering candidate against a competing offer.',
        reasoning: 'HR Director approves a compensation band exception to secure a competitive senior engineering candidate.',
        conditions: 'Subject to CEO sign-off given the band exception exceeds standard delegation of authority.',
        sourcePlatform: 'gmail',
        sourceLink: 'https://mail.google.com/mail/u/0/#inbox/comp-exception-senior-eng-hire',
        evidenceSnippet: "Approved — exception justified given the candidate's specialized distributed-systems experience and competing offer.",
        occurredAt: daysAgo(6),
        providerKey: 'gmail',
        providerEventType: 'approval_decision',
      },
      {
        key: 'group-4-hr:teams',
        subject: 'Comp Band Exception — CEO confirmation on Teams',
        approverName: 'Alex Rivera',
        approverEmail: 'alex.rivera@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 92,
        riskLevel: 'medium',
        businessImpact: "Finalizes the exception, clearing the offer to go out before the candidate's deadline.",
        reasoning: "CEO confirms sign-off on the compensation exception per HR's recommendation.",
        sourcePlatform: 'microsoft_teams',
        sourceLink: 'https://teams.microsoft.com/l/message/19:hr-leadership@acme.example/1755800000100',
        evidenceSnippet: "Agreed, approved. Let's get the offer out before we lose the candidate.",
        occurredAt: daysAgo(6, -3),
        providerKey: 'microsoft_teams',
        providerEventType: 'approval_decision',
      },
    ],
  },
  {
    title: 'Vendor Access Exception — AWS Root Credentials',
    department: 'Security',
    category: 'Security',
    primaryIndex: 0,
    approvals: [
      {
        key: 'group-5-security:slack',
        subject: 'Vendor Access Exception — AWS Root Credentials — CISO approval',
        approverName: 'Derek Huang',
        approverEmail: 'derek.huang@acme.example',
        approvalType: 'CONDITIONAL',
        status: 'APPROVED',
        confidence: 91,
        riskLevel: 'critical',
        businessImpact: 'Unblocks a time-critical incident response requiring vendor AWS access.',
        reasoning: 'CISO grants a time-boxed exception for a vendor to access AWS root credentials for critical incident response.',
        conditions: 'Access limited to a 4-hour window with mandatory session recording; must be revoked immediately after use.',
        sourcePlatform: 'slack',
        sourceLink: 'https://acme.slack.com/archives/C02SECAPPR/p1755900000000300',
        evidenceSnippet: 'Approved for a 4-hour window only, MFA + session recording required. Revoke immediately after.',
        occurredAt: daysAgo(3),
        providerKey: 'slack',
        providerEventType: 'approval_decision',
      },
      {
        key: 'group-5-security:servicenow',
        subject: 'Security Exception Request — AWS Root Vendor Access — Approved',
        approverName: 'Nina Petrova',
        approverEmail: 'nina.petrova@acme.example',
        approvalType: 'CONDITIONAL',
        status: 'PENDING_REVIEW',
        confidence: 88,
        riskLevel: 'critical',
        businessImpact: 'Formal exception record with compensating controls, pending final audit closure.',
        reasoning: 'Security exception ticket approved with compensating controls documented; closure pending final audit review.',
        conditions: 'Exception closure pending confirmation that session recording and MFA logs were captured.',
        sourcePlatform: 'servicenow',
        sourceLink: 'https://acme.service-now.com/nav_to.do?uri=sec_exception.do?sys_id=SEC0002210',
        evidenceSnippet: 'Exception approved with compensating controls: session recording, MFA enforcement, 4-hour TTL. Awaiting audit closure.',
        occurredAt: daysAgo(2),
        providerKey: 'servicenow',
        providerEventType: 'exception_approved',
      },
    ],
  },
  {
    title: 'Purchase Order — Office Equipment $125,000',
    department: 'Operations',
    category: 'Procurement',
    amount: 125_000,
    currency: 'USD',
    primaryIndex: 0,
    approvals: [
      {
        key: 'standalone-1-sap',
        subject: 'Purchase Order Approval — Office Equipment $125,000 (SAP)',
        approverName: 'Carlos Mendez',
        approverEmail: 'carlos.mendez@acme.example',
        approvalType: 'EXPLICIT',
        status: 'PENDING_REVIEW',
        confidence: 92,
        riskLevel: 'low',
        businessImpact: 'Refreshes office equipment across two floors ahead of the office expansion.',
        reasoning: 'Procurement manager approves a purchase order for an office equipment refresh, pending final finance release.',
        sourcePlatform: 'sap',
        sourceLink: 'https://acme.sap.com/erp/po/4500123456',
        evidenceSnippet: 'PO #4500123456 approved. Budget confirmed against FY24 facilities capex — awaiting finance release.',
        occurredAt: daysAgo(14),
        providerKey: 'sap',
        providerEventType: 'purchase_order_approved',
      },
    ],
  },
  {
    title: 'Q1 Marketing Campaign Budget — $320,000',
    department: 'Marketing',
    category: 'Marketing',
    amount: 320_000,
    currency: 'USD',
    primaryIndex: 0,
    approvals: [
      {
        key: 'standalone-2-zoom',
        subject: 'Q1 Marketing Campaign Budget $320,000 — approved on Zoom',
        approverName: 'Isabelle Laurent',
        approverEmail: 'isabelle.laurent@acme.example',
        approvalType: 'EXPLICIT',
        status: 'APPROVED',
        confidence: 93,
        riskLevel: 'medium',
        businessImpact: 'Funds the Q1 integrated marketing campaign ahead of the launch calendar.',
        reasoning: 'CMO approves the Q1 integrated marketing campaign budget during the quarterly planning review.',
        sourcePlatform: 'zoom',
        sourceLink: 'https://acme.zoom.us/rec/share/q1-marketing-budget-review-2026',
        evidenceSnippet: "Approved as presented. Let's move fast on the Q1 launch calendar.",
        occurredAt: daysAgo(1),
        providerKey: 'zoom',
        providerEventType: 'meeting_decision',
      },
    ],
  },
];

function summarize() {
  const totalApprovals = groups.reduce((sum, group) => sum + group.approvals.length, 0);
  const totalEvents = totalApprovals;
  const totalUnifiedRecords = groups.length;
  const pendingCount = groups.flatMap((group) => group.approvals).filter((approval) => approval.status === 'PENDING_REVIEW').length;

  console.log('Planned structure:\n');
  for (const group of groups) {
    console.log(`- ${group.title} [${group.department}] — ${group.approvals.length} source(s) → 1 UnifiedEvidenceRecord`);
    for (const approval of group.approvals) {
      const primary = group.approvals[group.primaryIndex] === approval ? ' (primary)' : '';
      console.log(`    · ${approval.sourcePlatform.padEnd(15)} ${approval.status.padEnd(15)} ${approval.riskLevel.padEnd(9)}${primary} — ${approval.subject}`);
    }
  }

  console.log('\nPlanned counts:');
  console.log(`  ApprovalRecord         : ${totalApprovals}`);
  console.log(`  UnifiedEvidenceRecord  : ${totalUnifiedRecords}`);
  console.log(`  CanonicalEvidenceEvent : ${totalEvents}`);
  console.log(`  UnifiedEvidenceMember  : ${totalEvents}`);
  console.log(`  APPROVED / PENDING_REVIEW split: ${totalApprovals - pendingCount} / ${pendingCount}`);
}

async function main() {
  const { organizationId, dryRun } = parseArgs(process.argv.slice(2));
  if (!organizationId) {
    console.error('Usage: npx tsx scripts/seed-demo-approvals.ts --org <organizationId> [--dry-run|--apply]');
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!organization) {
    console.error(`No organization found with id ${organizationId}`);
    process.exit(1);
  }

  const alreadySeeded = await prisma.approvalRecord.count({
    where: { organizationId, correlationId: { startsWith: SEED_RUN_ID } },
  });

  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(dryRun ? '\nMode: DRY RUN - nothing will be written.\n' : '\nMode: APPLY - writing to the database.\n');

  if (alreadySeeded > 0) {
    console.log(`Already seeded: found ${alreadySeeded} ApprovalRecord row(s) with correlationId starting with "${SEED_RUN_ID}". Skipping - this run is idempotent.`);
    return;
  }

  summarize();

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to write these records.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const group of groups) {
      const createdApprovals = [];
      for (const approval of group.approvals) {
        const created = await tx.approvalRecord.create({
          data: {
            organizationId,
            approverName: approval.approverName,
            approverEmail: approval.approverEmail,
            subject: approval.subject,
            department: group.department,
            category: group.category,
            approvalType: approval.approvalType,
            status: approval.status,
            confidence: approval.confidence,
            riskLevel: approval.riskLevel,
            businessImpact: approval.businessImpact,
            reasoning: approval.reasoning,
            conditions: approval.conditions,
            sourcePlatform: approval.sourcePlatform,
            sourceLink: approval.sourceLink,
            evidenceSnippet: approval.evidenceSnippet,
            correlationId: `${SEED_RUN_ID}:${approval.key}`,
            approvalTimestamp: approval.occurredAt,
            occurredAt: approval.occurredAt,
            createdAt: approval.occurredAt,
          },
        });
        createdApprovals.push({ approval, record: created });
      }

      const primaryApproval = createdApprovals[group.primaryIndex];
      const groupRiskLevel = group.approvals.reduce<ApprovalSeed['riskLevel']>(
        (highest, approval) => (RISK_RANK[approval.riskLevel] > RISK_RANK[highest] ? approval.riskLevel : highest),
        group.approvals[0].riskLevel,
      );
      const occurredTimes = group.approvals.map((approval) => approval.occurredAt.getTime());
      const firstSeenAt = new Date(Math.min(...occurredTimes));
      const lastSeenAt = new Date(Math.max(...occurredTimes));
      const anyPending = group.approvals.some((approval) => approval.status === 'PENDING_REVIEW');

      const unifiedRecord = await tx.unifiedEvidenceRecord.create({
        data: {
          organizationId,
          primaryApprovalId: primaryApproval.record.id,
          subject: group.title,
          decision: anyPending ? 'PENDING_REVIEW' : 'APPROVED',
          outcome: primaryApproval.approval.approvalType,
          category: group.category,
          department: group.department,
          approverName: primaryApproval.approval.approverName,
          approverEmail: primaryApproval.approval.approverEmail,
          amount: group.amount,
          currency: group.currency,
          riskLevel: groupRiskLevel,
          confidence: Math.round(group.approvals.reduce((sum, approval) => sum + approval.confidence, 0) / group.approvals.length),
          verificationStatus: group.approvals.length > 1 ? 'HUMAN_VERIFIED' : 'UNVERIFIED',
          sourceCount: group.approvals.length,
          evidenceCount: group.approvals.length,
          firstSeenAt,
          lastSeenAt,
          metadata: {
            seedScript: 'scripts/seed-demo-approvals.ts',
            seedRunId: SEED_RUN_ID,
          },
        },
      });

      for (const { approval, record } of createdApprovals) {
        const event = await tx.canonicalEvidenceEvent.create({
          data: {
            organizationId,
            approvalRecordId: record.id,
            unifiedRecordId: unifiedRecord.id,
            providerKey: approval.providerKey,
            providerEventType: approval.providerEventType,
            occurredAt: approval.occurredAt,
            receivedAt: approval.occurredAt,
            actorName: approval.approverName,
            actorEmail: approval.approverEmail,
            objectType: 'approval_record',
            objectId: record.id,
            relatedIds: [],
            participants: [{ name: approval.approverName, email: approval.approverEmail, role: 'approver' }],
            content: approval.evidenceSnippet,
            metadata: {
              seedScript: 'scripts/seed-demo-approvals.ts',
              seedRunId: SEED_RUN_ID,
              group: group.title,
            },
            evidenceHash: evidenceHash(approval.key),
            correlationId: `${SEED_RUN_ID}:${approval.key}`,
            correlationKeys: [`${SEED_RUN_ID}:${approval.key}`],
            confidence: approval.confidence,
            status: 'CORRELATED',
          },
        });

        await tx.unifiedEvidenceMember.create({
          data: {
            unifiedRecordId: unifiedRecord.id,
            eventId: event.id,
            status: 'AUTO_LINKED',
            matchConfidence: approval.confidence,
            matchingReasons:
              group.approvals.length > 1
                ? ['Same decision correlated across multiple source platforms.']
                : ['Single-source evidence record.'],
          },
        });
      }

      console.log(`Created: ${group.title} — ${group.approvals.length} approval(s), 1 UnifiedEvidenceRecord, ${group.approvals.length} CanonicalEvidenceEvent(s)`);
    }
  });

  console.log('\nDone. This script cannot call revalidateTag() outside a Next.js request scope, so unstable_cache entries for this org will keep serving pre-seed data until you redeploy or call /api/admin/bust-cache.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
