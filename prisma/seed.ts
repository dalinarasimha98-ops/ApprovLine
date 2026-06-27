import { PrismaClient, ApprovalType, ApprovalStatus } from '@prisma/client';

const prisma = new PrismaClient();

const demoApprovals = [
  ['Finance budget approval', 'Priya Sharma', 'priya@company.com', 'Finance', 'Finance', ApprovalType.EXPLICIT, ApprovalStatus.APPROVED, 97, 'high', 'Approves Q3 budget expansion for marketing.', 'slack'],
  ['Vendor payment approved', 'Sarah Chen', 'sarah@company.com', 'Procurement', 'Procurement', ApprovalType.EXPLICIT, ApprovalStatus.APPROVED, 94, 'medium', 'Allows vendor invoice payment to proceed.', 'gmail'],
  ['Contract terms conditionally approved', 'James Okafor', 'james@company.com', 'Legal', 'Legal', ApprovalType.CONDITIONAL, ApprovalStatus.PENDING_REVIEW, 92, 'high', 'Allows contract execution after revised terms are used.', 'teams'],
  ['Production migration rejected', 'Maya Singh', 'maya@company.com', 'Engineering', 'Engineering', ApprovalType.REJECTION, ApprovalStatus.REJECTED, 91, 'high', 'Blocks database migration until rollback testing is complete.', 'slack'],
  ['Security access exception approved', 'Nora Ellis', 'nora@company.com', 'Security', 'Security', ApprovalType.CONDITIONAL, ApprovalStatus.PENDING_REVIEW, 95, 'critical', 'Grants temporary elevated access under time-bound controls.', 'teams'],
  ['Compliance filing approved', 'Victor Lane', 'victor@company.com', 'Compliance', 'Compliance', ApprovalType.EXPLICIT, ApprovalStatus.APPROVED, 96, 'high', 'Authorizes submission of quarterly compliance certification.', 'gmail'],
  ['Candidate offer approved', 'Rachel Moore', 'rachel@company.com', 'HR', 'HR', ApprovalType.EXPLICIT, ApprovalStatus.APPROVED, 90, 'medium', 'Approves employment offer package.', 'zoom'],
] as const;

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: 'public-demo' },
    update: {},
    create: {
      name: 'Public Demo',
      slug: 'public-demo',
      departments: ['Finance', 'Legal', 'Procurement', 'Engineering'],
      approvalCategories: ['Finance', 'Legal', 'Procurement', 'Engineering', 'Security', 'Compliance'],
    },
  });

  for (const [subject, approverName, approverEmail, department, category, approvalType, status, confidence, riskLevel, businessImpact, sourcePlatform] of demoApprovals) {
    const record = await prisma.approvalRecord.create({
      data: {
        organizationId: organization.id,
        subject,
        approverName,
        approverEmail,
        department,
        category,
        approvalType,
        status,
        confidence,
        riskLevel,
        businessImpact,
        sourcePlatform,
        reasoning: `${approverName} made a clear ${approvalType.toLowerCase()} decision for ${department}.`,
        conditions: approvalType === ApprovalType.CONDITIONAL ? 'Requires stated control or contract condition before execution.' : null,
        evidenceSnippet: `${approverName}: ${subject}.`,
        approvalTimestamp: new Date(),
        occurredAt: new Date(),
      },
    });

    await prisma.classifierResult.create({
      data: {
        organizationId: organization.id,
        approvalRecordId: record.id,
        model: 'seed-demo',
        promptVersion: 'seed-v1',
        inputHash: `seed-${record.id}`,
        approvalDetected: true,
        approvalType,
        confidence,
        normalizedJson: {
          approval_detected: true,
          approval_type: approvalType.toLowerCase(),
          confidence,
          approver_name: approverName,
          approver_email: approverEmail,
          subject,
          category,
          risk_level: riskLevel,
          business_impact: businessImpact,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        approvalRecordId: record.id,
        action: 'seed.approval_record.created',
        metadata: { sourcePlatform, category, riskLevel },
      },
    });
  }

  console.log(`Seeded ${demoApprovals.length} ApprovLine demo approval records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
