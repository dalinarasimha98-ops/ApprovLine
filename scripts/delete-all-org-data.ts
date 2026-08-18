/**
 * Permanently deletes ALL CanonicalEvidenceEvent, UnifiedEvidenceRecord,
 * and ApprovalRecord rows for one organization - not scoped to demo data,
 * everything. Confirmed intentional for org cmqxxswk80000ju0408i26m0o.
 *
 * NOT touched (their FKs to ApprovalRecord are onDelete: SetNull, not
 * Cascade - see prisma/schema.prisma): ClassifierResult and AuditLog rows
 * referencing a deleted approval survive with approvalRecordId set to
 * null, rather than being deleted. Everything else with a Cascade FK to
 * ApprovalRecord (ManualApprovalDetail, ManualApprovalVersion,
 * ApprovalEvidenceAssociation, ApprovalConfirmationRequest,
 * ApprovalComplianceEvaluation, InvestigationApproval) is removed
 * automatically by the database when its ApprovalRecord is deleted.
 *
 * Never touched: Organization, User, Integration, settings.
 *
 * Deletion order matters for CanonicalEvidenceEvent specifically: it is
 * filtered by its own organizationId column directly, not by traversing
 * unifiedRecord.organizationId - some events may not be linked to a
 * UnifiedEvidenceRecord yet, and those would be silently skipped by a
 * relation-based filter.
 *
 * Usage:
 *   npx tsx scripts/delete-all-org-data.ts --org <organizationId> --dry-run
 *   npx tsx scripts/delete-all-org-data.ts --org <organizationId> --apply
 *
 * Idempotent: running twice with --apply is safe - the second run finds
 * zero remaining rows and deletes nothing.
 */
import { prisma } from '../lib/prisma';

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
    console.error('Usage: npx tsx scripts/delete-all-org-data.ts --org <organizationId> [--dry-run|--apply]');
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!organization) {
    console.error(`No organization found with id ${organizationId}`);
    process.exit(1);
  }

  const eventCount = await prisma.canonicalEvidenceEvent.count({ where: { organizationId } });
  const unifiedRecordCount = await prisma.unifiedEvidenceRecord.count({ where: { organizationId } });
  const approvalCount = await prisma.approvalRecord.count({ where: { organizationId } });
  const willOrphanClassifierResults = await prisma.classifierResult.count({
    where: { organizationId, approvalRecordId: { not: null } },
  });
  const willOrphanAuditLogs = await prisma.auditLog.count({
    where: { organizationId, approvalRecordId: { not: null } },
  });

  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(dryRun ? '\nMode: DRY RUN - nothing will be deleted.\n' : '\nMode: APPLY - permanently deleting all matched rows.\n');

  console.log(`CanonicalEvidenceEvent : ${eventCount} row(s) to delete`);
  console.log(`UnifiedEvidenceRecord  : ${unifiedRecordCount} row(s) to delete`);
  console.log(`ApprovalRecord         : ${approvalCount} row(s) to delete`);
  console.log(`\nNot deleted, but orphaned (approvalRecordId set to null) as a side effect of ApprovalRecord deletion:`);
  console.log(`ClassifierResult       : ${willOrphanClassifierResults} row(s) will be orphaned`);
  console.log(`AuditLog               : ${willOrphanAuditLogs} row(s) will be orphaned`);

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to permanently delete the rows above.');
    return;
  }

  const deletedEvents = await prisma.canonicalEvidenceEvent.deleteMany({ where: { organizationId } });
  console.log(`CanonicalEvidenceEvent deleted: ${deletedEvents.count}`);

  const deletedUnifiedRecords = await prisma.unifiedEvidenceRecord.deleteMany({ where: { organizationId } });
  console.log(`UnifiedEvidenceRecord deleted: ${deletedUnifiedRecords.count}`);

  const deletedApprovals = await prisma.approvalRecord.deleteMany({ where: { organizationId } });
  console.log(`ApprovalRecord deleted: ${deletedApprovals.count}`);

  console.log('\nDone.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
