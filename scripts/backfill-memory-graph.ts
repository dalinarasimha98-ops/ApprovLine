/**
 * Backfill (or verify) the Memory Graph for an organization from its existing
 * ApprovalRecord rows. Produces APPROVAL, APPROVER, DEPARTMENT, and other
 * MemoryEntity rows plus their MemoryRelationship links — the same set that
 * rebuildMemoryGraphForOrganization() creates at runtime.
 *
 * Usage:
 *   npx tsx scripts/backfill-memory-graph.ts --org <organizationId> [--apply]
 *
 * --dry-run  (default) Print what would be created/updated without writing.
 * --apply              Write entities and relationships to the database.
 */

import { prisma } from '@/lib/prisma';
import { rebuildMemoryGraphForOrganization } from '@/services/memory';

function parseArgs() {
  const args = process.argv.slice(2);
  const orgIndex = args.indexOf('--org');
  const orgId = orgIndex !== -1 ? args[orgIndex + 1] : undefined;
  const apply = args.includes('--apply');
  return { orgId, apply };
}

async function main() {
  const { orgId, apply } = parseArgs();

  if (!orgId) {
    console.error('Error: --org <organizationId> is required');
    process.exit(1);
  }

  const mode = apply ? 'APPLY' : 'DRY-RUN';
  console.log(`\n=== Memory Graph Backfill [${mode}] ===`);
  console.log(`Organization: ${orgId}\n`);

  // --- Diagnostic counts -------------------------------------------------------
  const [entityCount, relCount, approvalCount] = await Promise.all([
    prisma.memoryEntity.count({ where: { organizationId: orgId } }),
    prisma.memoryRelationship.count({ where: { organizationId: orgId } }),
    prisma.approvalRecord.count({ where: { organizationId: orgId } }),
  ]);

  console.log('BEFORE STATE');
  console.log(`  MemoryEntity count:       ${entityCount}`);
  console.log(`  MemoryRelationship count: ${relCount}`);
  console.log(`  ApprovalRecord count:     ${approvalCount}`);

  if (approvalCount === 0) {
    console.log('\nNo ApprovalRecords found for this organization — nothing to backfill.');
    process.exit(0);
  }

  // --- Fetch approvals ---------------------------------------------------------
  const approvals = await prisma.approvalRecord.findMany({
    where: { organizationId: orgId },
    include: { messageSource: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  // --- DRY RUN: show what would be created -------------------------------------
  if (!apply) {
    console.log(`\nWould process ${approvals.length} approval records:`);

    // Unique approver/department/message-source sets
    const approvers = new Set<string>();
    const departments = new Set<string>();
    const messageSources = new Set<string>();
    let vendorCount = 0;
    let projectCount = 0;

    for (const approval of approvals) {
      console.log(`  [${approvals.indexOf(approval) + 1}/${approvals.length}] ${approval.subject.slice(0, 60)}…`);

      if (approval.approverEmail || approval.approverName) {
        approvers.add(approval.approverEmail ?? approval.approverName ?? approval.id);
      }
      if (approval.department) departments.add(approval.department);
      if (approval.messageSource) messageSources.add(approval.messageSource.id);

      const text = [approval.subject, approval.businessImpact, approval.reasoning, approval.evidenceSnippet].filter(Boolean).join(' ');
      if (/\b(?:vendor|supplier|partner)\s+([A-Z][A-Za-z0-9&., -]{2,48})/.test(text)) vendorCount++;
      if (/\b(Project\s+[A-Z][A-Za-z0-9 -]{2,48})/i.test(text)) projectCount++;
    }

    console.log('\nPROJECTED ENTITIES (schema type → count):');
    console.log(`  APPROVAL (approval_record):        ${approvals.length}`);
    console.log(`  APPROVER (approval_approver):      ${approvers.size}`);
    console.log(`  DEPARTMENT (department):           ${departments.size}`);
    console.log(
      `  Message sources (SLACK_MESSAGE/EMAIL/etc): ${messageSources.size}`,
    );
    if (vendorCount) console.log(`  VENDOR (detected_vendor):          ~${vendorCount} (may merge duplicates)`);
    if (projectCount) console.log(`  PROJECT (detected_project):        ~${projectCount} (may merge duplicates)`);

    console.log('\nField name mapping (user spec → actual schema):');
    console.log('  entityType → type (MemoryEntityType enum)');
    console.log('  label      → title');
    console.log('  canonicalId → externalId');
    console.log('  strength   → confidence (int 0–100)');
    console.log('  mentionCount → not in schema, omitted');
    console.log('  PERSON     → APPROVER');
    console.log('  TOPIC      → DEPARTMENT');

    console.log('\nRun with --apply to write these to the database.');
    process.exit(0);
  }

  // --- APPLY: delegate to rebuildMemoryGraphForOrganization --------------------
  // This function is idempotent (uses upsert) and handles all entity types
  // (APPROVAL, APPROVER, DEPARTMENT, message-source, VENDOR, PROJECT, RISK,
  // POLICY, INVESTIGATION) plus their MemoryRelationship links in one pass.
  console.log(`\nProcessing ${approvals.length} approvals via rebuildMemoryGraphForOrganization…`);
  await rebuildMemoryGraphForOrganization(orgId);

  // --- Verify ------------------------------------------------------------------
  const [entityCountAfter, relCountAfter] = await Promise.all([
    prisma.memoryEntity.count({ where: { organizationId: orgId } }),
    prisma.memoryRelationship.count({ where: { organizationId: orgId } }),
  ]);

  const breakdown = await prisma.memoryEntity.groupBy({
    by: ['type'],
    where: { organizationId: orgId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('\nAFTER STATE');
  console.log(`  MemoryEntity count:       ${entityCountAfter}`);
  console.log(`  MemoryRelationship count: ${relCountAfter}`);
  console.log('\nEntity type breakdown:');
  for (const row of breakdown) {
    console.log(`  ${row.type}: ${row._count.id}`);
  }

  console.log('\nBackfill complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
