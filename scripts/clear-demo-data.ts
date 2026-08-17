/**
 * Deletes demo-seeded data for one organization: the same records
 * `createDemoDataForOrganization()` (lib/demo-data.ts) writes when someone
 * clicks "Generate demo data" on /dashboard/approvals.
 *
 * This is NOT a blanket "delete everything for this org" script. It only
 * targets records identifiable as demo data via the same markers
 * `resetDemoDataForOrganization()` (lib/demo-data.ts) already uses in
 * production:
 *   - ApprovalRecord.sourceLink containing '/demo-' or 'TDEMO'
 *   - ApprovalRecord.messageSourceId pointing at a MessageSource whose
 *     externalId starts with 'demo-'
 *   - AuditLog.action starting with 'demo.', or linked to a demo approval
 * A real, non-demo approval/audit-log/evidence record for this
 * organization is never touched, even though this script also runs
 * against production orgs that have a mix of both.
 *
 * Two tables the existing resetDemoDataForOrganization() does not cover
 * are handled here in addition, since demo approvals can be backfilled
 * into the evidence platform (scripts/backfill-unified-evidence-from-approvals.ts)
 * after being seeded:
 *   - CanonicalEvidenceEvent where approvalRecordId or unifiedRecordId
 *     traces back to a demo approval
 *   - UnifiedEvidenceRecord where primaryApprovalId traces back to a demo
 *     approval
 * Both relations are onDelete: SetNull on the ApprovalRecord side (see
 * prisma/schema.prisma), so deleting a demo ApprovalRecord alone would
 * silently orphan these rather than remove them - they're identified and
 * deleted explicitly instead.
 *
 * Never touched: Organization, User, non-demo Integration rows, settings,
 * or any non-demo ApprovalRecord/AuditLog/evidence row.
 *
 * Usage:
 *   npx tsx scripts/clear-demo-data.ts --org <organizationId> --dry-run
 *   npx tsx scripts/clear-demo-data.ts --org <organizationId> --apply
 *
 * Idempotent: running twice with --apply is safe - the second run finds
 * zero matching demo records and deletes nothing.
 */
import { prisma } from '../lib/prisma';
import { resetDemoDataForOrganization } from '../lib/demo-data';

function parseArgs(argv: string[]) {
  const orgIndex = argv.indexOf('--org');
  const organizationId = orgIndex >= 0 ? argv[orgIndex + 1] : undefined;
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run') || !apply;
  return { organizationId, apply, dryRun };
}

async function findDemoIds(organizationId: string) {
  const demoSources = await prisma.messageSource.findMany({
    where: { organizationId, externalId: { startsWith: 'demo-' } },
    select: { id: true },
  });
  const demoSourceIds = demoSources.map((source) => source.id);

  const demoApprovals = await prisma.approvalRecord.findMany({
    where: {
      organizationId,
      OR: [
        { sourceLink: { contains: '/demo-' } },
        { sourceLink: { contains: 'TDEMO' } },
        { messageSourceId: { in: demoSourceIds.length ? demoSourceIds : ['__none__'] } },
      ],
    },
    select: { id: true, subject: true, sourceLink: true },
  });
  const demoApprovalIds = demoApprovals.map((approval) => approval.id);

  const demoUnifiedRecords = await prisma.unifiedEvidenceRecord.findMany({
    where: { organizationId, primaryApprovalId: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] } },
    select: { id: true, subject: true },
  });
  const demoUnifiedRecordIds = demoUnifiedRecords.map((record) => record.id);

  const demoEvents = await prisma.canonicalEvidenceEvent.findMany({
    where: {
      organizationId,
      OR: [
        { approvalRecordId: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] } },
        { unifiedRecordId: { in: demoUnifiedRecordIds.length ? demoUnifiedRecordIds : ['__none__'] } },
      ],
    },
    select: { id: true, providerKey: true },
  });

  const demoAuditLogCount = await prisma.auditLog.count({
    where: {
      organizationId,
      OR: [
        { action: { startsWith: 'demo.' } },
        { approvalRecordId: { in: demoApprovalIds.length ? demoApprovalIds : ['__none__'] } },
      ],
    },
  });

  return { demoApprovals, demoApprovalIds, demoSourceIds, demoUnifiedRecords, demoEvents, demoAuditLogCount };
}

async function main() {
  const { organizationId, dryRun } = parseArgs(process.argv.slice(2));
  if (!organizationId) {
    console.error('Usage: npx tsx scripts/clear-demo-data.ts --org <organizationId> [--dry-run|--apply]');
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!organization) {
    console.error(`No organization found with id ${organizationId}`);
    process.exit(1);
  }

  const totalApprovals = await prisma.approvalRecord.count({ where: { organizationId } });
  const totalAuditLogs = await prisma.auditLog.count({ where: { organizationId } });
  const totalUnifiedRecords = await prisma.unifiedEvidenceRecord.count({ where: { organizationId } });
  const totalEvents = await prisma.canonicalEvidenceEvent.count({ where: { organizationId } });

  const { demoApprovals, demoApprovalIds, demoUnifiedRecords, demoEvents, demoAuditLogCount } = await findDemoIds(organizationId);

  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(dryRun ? '\nMode: DRY RUN - nothing will be deleted.\n' : '\nMode: APPLY - deleting matched demo records.\n');

  console.log('Scope: only records identifiable as demo-seeded data (sourceLink containing /demo- or TDEMO, or linked to one) are matched below. Non-demo records for this organization are never touched.\n');

  console.log(`ApprovalRecord      : ${demoApprovalIds.length} demo of ${totalApprovals} total`);
  for (const approval of demoApprovals) {
    console.log(`  - ${approval.id} :: "${approval.subject}" :: ${approval.sourceLink}`);
  }
  console.log(`UnifiedEvidenceRecord: ${demoUnifiedRecords.length} demo of ${totalUnifiedRecords} total`);
  for (const record of demoUnifiedRecords) {
    console.log(`  - ${record.id} :: "${record.subject}"`);
  }
  console.log(`CanonicalEvidenceEvent: ${demoEvents.length} demo of ${totalEvents} total`);
  for (const event of demoEvents) {
    console.log(`  - ${event.id} :: ${event.providerKey}`);
  }
  console.log(`AuditLog             : ${demoAuditLogCount} demo of ${totalAuditLogs} total`);
  console.log(`\n${totalApprovals - demoApprovalIds.length} non-demo ApprovalRecord, ${totalAuditLogs - demoAuditLogCount} non-demo AuditLog, ${totalUnifiedRecords - demoUnifiedRecords.length} non-demo UnifiedEvidenceRecord, and ${totalEvents - demoEvents.length} non-demo CanonicalEvidenceEvent row(s) will NOT be touched.`);

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to delete the demo records listed above.');
    return;
  }

  if (demoEvents.length || demoUnifiedRecords.length) {
    await prisma.$transaction([
      prisma.canonicalEvidenceEvent.deleteMany({ where: { id: { in: demoEvents.map((event) => event.id) } } }),
      prisma.unifiedEvidenceRecord.deleteMany({ where: { id: { in: demoUnifiedRecords.map((record) => record.id) } } }),
    ]);
  }

  await resetDemoDataForOrganization(organizationId);

  console.log(`\nDone. Deleted ${demoEvents.length} CanonicalEvidenceEvent, ${demoUnifiedRecords.length} UnifiedEvidenceRecord, ${demoApprovalIds.length} ApprovalRecord, and ${demoAuditLogCount} AuditLog demo row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
