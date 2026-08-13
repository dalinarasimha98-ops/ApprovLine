/**
 * Backfills UnifiedEvidenceRecord (+ one CanonicalEvidenceEvent +
 * UnifiedEvidenceMember per record) from existing ApprovalRecord rows, for a
 * single organization, for approvals that have no UnifiedEvidenceRecord yet.
 *
 * Why this exists: /evidence (Unified Evidence) only ever reads
 * UnifiedEvidenceRecord - never ApprovalRecord directly (see
 * services/evidence/records.ts). UnifiedEvidenceRecord is normally populated
 * by the newer Evidence Provider SDK correlation pipeline
 * (services/evidence/pipeline.ts's captureCanonicalEvidence()), which is a
 * separate code path from the legacy classifier pipeline and demo-data
 * seeding (lib/demo-data.ts) that create ApprovalRecord rows directly.
 * Approvals created through the legacy path never get folded into
 * UnifiedEvidenceRecord automatically - this script closes that gap using
 * only real data already on each ApprovalRecord. It fabricates no content:
 * every field below is copied from the approval (or its linked
 * MessageSource) it's derived from.
 *
 * NOT executed as part of this change - review the --dry-run output first.
 *
 * Usage:
 *   npx tsx scripts/backfill-unified-evidence-from-approvals.ts --org <organizationId> --dry-run
 *   npx tsx scripts/backfill-unified-evidence-from-approvals.ts --org <organizationId> --apply
 *
 * Idempotent:
 *   - Skips any approval that already has a UnifiedEvidenceRecord pointing
 *     at it via primaryApprovalId.
 *   - The CanonicalEvidenceEvent's evidenceHash is a deterministic hash of
 *     the approval's own id + occurredAt (not random), and the write uses
 *     the schema's existing @@unique([organizationId, providerKey,
 *     evidenceHash]) constraint via upsert - so re-running this script
 *     against the same data is a no-op, never a duplicate.
 */
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';

function parseArgs(argv: string[]) {
  const orgIndex = argv.indexOf('--org');
  const organizationId = orgIndex >= 0 ? argv[orgIndex + 1] : undefined;
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run') || !apply;
  return { organizationId, apply, dryRun };
}

function normalizeProviderKey(value: string | null | undefined): string {
  if (!value) return 'custom';
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_') || 'custom';
}

function deterministicEvidenceHash(approvalId: string, occurredAt: Date): string {
  return createHash('sha256').update(`approval-backfill:${approvalId}:${occurredAt.toISOString()}`).digest('hex');
}

async function main() {
  const { organizationId, dryRun } = parseArgs(process.argv.slice(2));
  if (!organizationId) {
    console.error('Usage: npx tsx scripts/backfill-unified-evidence-from-approvals.ts --org <organizationId> [--dry-run|--apply]');
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!organization) {
    console.error(`No organization found with id ${organizationId}`);
    process.exit(1);
  }

  const alreadyLinkedIds = new Set(
    (
      await prisma.unifiedEvidenceRecord.findMany({
        where: { organizationId, primaryApprovalId: { not: null } },
        select: { primaryApprovalId: true },
      })
    ).map((row) => row.primaryApprovalId!),
  );

  const approvals = await prisma.approvalRecord.findMany({
    where: { organizationId, id: { notIn: [...alreadyLinkedIds] } },
    include: { messageSource: { select: { provider: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(`Already-linked approvals (skipped): ${alreadyLinkedIds.size}`);
  console.log(`Approvals needing a backfilled UnifiedEvidenceRecord: ${approvals.length}`);
  console.log(dryRun ? '\nMode: DRY RUN - nothing will be written.\n' : '\nMode: APPLY - writing to the database.\n');

  for (const approval of approvals) {
    const providerKey = normalizeProviderKey(approval.messageSource?.provider ?? approval.sourcePlatform);
    const occurredAt = approval.occurredAt;
    const evidenceHash = deterministicEvidenceHash(approval.id, occurredAt);

    console.log(
      `- ${approval.id} :: "${approval.subject}" :: provider=${providerKey} :: risk=${approval.riskLevel ?? 'unscored'} :: occurredAt=${occurredAt.toISOString()}`,
    );

    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      const event = await tx.canonicalEvidenceEvent.upsert({
        where: { organizationId_providerKey_evidenceHash: { organizationId, providerKey, evidenceHash } },
        update: {},
        create: {
          organizationId,
          approvalRecordId: approval.id,
          providerKey,
          providerEventType: 'approval_decision',
          occurredAt,
          receivedAt: approval.createdAt,
          actorName: approval.approverName,
          actorEmail: approval.approverEmail,
          objectType: 'approval_record',
          objectId: approval.id,
          relatedIds: [],
          content: approval.evidenceSnippet ?? approval.reasoning,
          metadata: {
            backfilledFromApprovalId: approval.id,
            status: approval.status,
            approvalType: approval.approvalType,
            category: approval.category,
            department: approval.department,
          },
          evidenceHash,
          correlationId: approval.correlationId ?? approval.id,
          correlationKeys: [approval.id],
          confidence: approval.confidence,
          status: 'COMPLETED',
        },
      });

      const record = await tx.unifiedEvidenceRecord.create({
        data: {
          organizationId,
          primaryApprovalId: approval.id,
          subject: approval.subject,
          decision: approval.status,
          outcome: approval.approvalType,
          category: approval.category,
          department: approval.department,
          approverName: approval.approverName,
          approverEmail: approval.approverEmail,
          riskLevel: approval.riskLevel,
          confidence: approval.confidence,
          verificationStatus: 'UNVERIFIED',
          sourceCount: 1,
          evidenceCount: 1,
          firstSeenAt: occurredAt,
          lastSeenAt: occurredAt,
          metadata: {
            backfilledFromApprovalId: approval.id,
            backfilledAt: new Date().toISOString(),
            backfillScript: 'scripts/backfill-unified-evidence-from-approvals.ts',
          },
        },
      });

      await tx.canonicalEvidenceEvent.update({ where: { id: event.id }, data: { unifiedRecordId: record.id } });

      await tx.unifiedEvidenceMember.create({
        data: {
          unifiedRecordId: record.id,
          eventId: event.id,
          status: 'AUTO_LINKED',
          matchConfidence: 100,
          matchingReasons: ['Backfilled directly from its own ApprovalRecord (1:1, not a correlation match).'],
        },
      });
    });
  }

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to write these records.');
  } else {
    console.log(`\nDone. Backfilled ${approvals.length} UnifiedEvidenceRecord(s).`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
