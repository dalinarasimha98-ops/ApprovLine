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
 *
 * The actual per-approval write logic lives in
 * services/evidence/pipeline.ts's backfillUnifiedEvidenceForApproval() -
 * this script just finds the approvals that need it and calls that function
 * inside a transaction per approval. lib/demo-data.ts and prisma/seed.ts now
 * call the same function when creating new approvals, so this script should
 * only ever need to run once against data seeded before that change.
 */
import { prisma } from '../lib/prisma';
import { backfillUnifiedEvidenceForApproval } from '../services/evidence/pipeline';

function parseArgs(argv: string[]) {
  const orgIndex = argv.indexOf('--org');
  const organizationId = orgIndex >= 0 ? argv[orgIndex + 1] : undefined;
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run') || !apply;
  return { organizationId, apply, dryRun };
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
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(`Already-linked approvals (skipped): ${alreadyLinkedIds.size}`);
  console.log(`Approvals needing a backfilled UnifiedEvidenceRecord: ${approvals.length}`);
  console.log(dryRun ? '\nMode: DRY RUN - nothing will be written.\n' : '\nMode: APPLY - writing to the database.\n');

  for (const approval of approvals) {
    console.log(
      `- ${approval.id} :: "${approval.subject}" :: provider=${approval.sourcePlatform ?? 'custom'} :: risk=${approval.riskLevel ?? 'unscored'} :: occurredAt=${approval.occurredAt.toISOString()}`,
    );

    if (dryRun) continue;

    await prisma.$transaction((tx) => backfillUnifiedEvidenceForApproval(tx, approval));
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
