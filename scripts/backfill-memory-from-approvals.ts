/**
 * Backfill Memory Graph entities for an organization from its existing
 * ApprovalRecord rows, processing one approval at a time with live progress.
 *
 * Unlike backfill-memory-graph.ts (which delegates to
 * rebuildMemoryGraphForOrganization() in a single batch), this script
 * processes each approval individually so progress is visible in real time
 * and a partial run leaves the graph in a useful, consistent state.
 * All writes use upsert — re-running is safe.
 *
 * Usage:
 *   npx tsx scripts/backfill-memory-from-approvals.ts --org <organizationId> [--apply]
 *
 * --dry-run  (default) Print what would be created without writing.
 * --apply              Write entities and relationships to the database.
 */

import { prisma } from '@/lib/prisma';
import { addMemoryTimelineEvent, linkMemoryEntities, upsertMemoryEntity } from '@/services/memory';

type ApprovalWithSource = Awaited<ReturnType<typeof fetchApprovals>>[number];

function parseArgs() {
  const args = process.argv.slice(2);
  const orgIndex = args.indexOf('--org');
  const orgId = orgIndex !== -1 ? args[orgIndex + 1] : undefined;
  const apply = args.includes('--apply');
  return { orgId, apply };
}

function riskScore(value?: string | null) {
  const risk = value?.toLowerCase();
  if (risk === 'critical') return 95;
  if (risk === 'high') return 82;
  if (risk === 'medium') return 55;
  if (risk === 'low') return 25;
  return 10;
}

function entityKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120);
}

function isDemoApprovalRecord(approval: { sourceLink: string | null; messageSource?: { externalId: string | null } | null }) {
  return Boolean(
    approval.sourceLink?.includes('demo') ||
      approval.sourceLink?.includes('TDEMO') ||
      approval.messageSource?.externalId?.startsWith('demo-'),
  );
}

function vendorFromText(text: string) {
  const match = text.match(/\b(?:vendor|supplier|partner)\s+([A-Z][A-Za-z0-9&., -]{2,48})/);
  return match?.[1]?.replace(/\s+(approval|contract|payment|invoice).*$/i, '').trim() ?? null;
}

function projectFromText(text: string) {
  const match = text.match(/\b(Project\s+[A-Z][A-Za-z0-9 -]{2,48})/i);
  return match?.[1]?.trim() ?? null;
}

const sourceTypeMap: Record<string, string> = {
  GMAIL: 'EMAIL',
  OUTLOOK: 'OUTLOOK_EMAIL',
  SLACK: 'SLACK_MESSAGE',
  MICROSOFT_TEAMS: 'TEAMS_MESSAGE',
  JIRA: 'JIRA_TICKET',
  SERVICENOW: 'SERVICENOW_RECORD',
  ZOOM: 'ZOOM_DECISION',
};

async function fetchApprovals(organizationId: string) {
  return prisma.approvalRecord.findMany({
    where: { organizationId },
    include: { messageSource: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
}

type EntitiesCreated = {
  approval: boolean;
  approver: boolean;
  department: boolean;
  messageSource: boolean;
  vendor: boolean;
  project: boolean;
};

function describeApproval(approval: ApprovalWithSource): EntitiesCreated {
  const text = [approval.subject, approval.businessImpact, approval.reasoning, approval.evidenceSnippet]
    .filter(Boolean)
    .join(' ');
  return {
    approval: true,
    approver: Boolean(approval.approverEmail || approval.approverName),
    department: Boolean(approval.department),
    messageSource: Boolean(approval.messageSource),
    vendor: Boolean(vendorFromText(text)),
    project: Boolean(projectFromText(text)),
  };
}

async function processApproval(organizationId: string, approval: ApprovalWithSource): Promise<EntitiesCreated> {
  const isDemo = isDemoApprovalRecord(approval);
  const seenAt = approval.occurredAt;
  const text = [approval.subject, approval.businessImpact, approval.reasoning, approval.evidenceSnippet]
    .filter(Boolean)
    .join(' ');
  const vendor = vendorFromText(text);
  const project = projectFromText(text);

  const approvalEntity = await upsertMemoryEntity({
    organizationId,
    type: 'APPROVAL',
    title: approval.subject,
    subtitle: `${approval.department ?? 'Unassigned'} · ${approval.sourcePlatform ?? 'Unknown source'}`,
    summary: approval.evidenceSnippet ?? approval.reasoning,
    externalType: 'approval_record',
    externalId: `approval:${approval.id}`,
    sourceSystem: approval.sourcePlatform ?? approval.messageSource?.provider ?? null,
    riskScore: riskScore(approval.riskLevel),
    metadata: {
      status: approval.status,
      approvalType: approval.approvalType,
      confidence: approval.confidence,
      category: approval.category,
      department: approval.department,
      demo: isDemo,
    },
    seenAt,
  });

  await addMemoryTimelineEvent({
    organizationId,
    entityId: approvalEntity.id,
    title: `${approval.status.replaceAll('_', ' ')}: ${approval.subject}`,
    description: approval.evidenceSnippet ?? approval.reasoning,
    eventType: 'APPROVAL_RECORDED',
    sourceSystem: approval.sourcePlatform ?? approval.messageSource?.provider ?? null,
    occurredAt: seenAt,
    sourceLink: approval.sourceLink,
    metadata: { approvalRecordId: approval.id },
  });

  const created: EntitiesCreated = {
    approval: true,
    approver: false,
    department: false,
    messageSource: false,
    vendor: false,
    project: false,
  };

  await Promise.all([
    approval.approverEmail || approval.approverName
      ? (async () => {
          const approver = await upsertMemoryEntity({
            organizationId,
            type: 'APPROVER',
            title: approval.approverName ?? approval.approverEmail ?? 'Unknown approver',
            subtitle: approval.approverEmail,
            externalType: 'approval_approver',
            externalId: `approver:${entityKey(approval.approverEmail ?? approval.approverName ?? approval.id)}`,
            sourceSystem: approval.sourcePlatform,
            metadata: { email: approval.approverEmail, demo: isDemo },
            seenAt,
          });
          await linkMemoryEntities({
            organizationId,
            fromEntityId: approvalEntity.id,
            toEntityId: approver.id,
            relationshipType: 'APPROVED_BY',
            evidenceSnippet: approval.evidenceSnippet,
            sourceSystem: approval.sourcePlatform,
          });
          created.approver = true;
        })()
      : null,

    approval.department
      ? (async () => {
          const department = await upsertMemoryEntity({
            organizationId,
            type: 'DEPARTMENT',
            title: approval.department!,
            externalType: 'department',
            externalId: `department:${entityKey(approval.department!)}`,
          });
          await linkMemoryEntities({
            organizationId,
            fromEntityId: approvalEntity.id,
            toEntityId: department.id,
            relationshipType: 'OWNED_BY_DEPARTMENT',
            sourceSystem: approval.sourcePlatform,
          });
          created.department = true;
        })()
      : null,

    approval.messageSource
      ? (async () => {
          const provider = approval.messageSource!.provider;
          const sourceEntity = await upsertMemoryEntity({
            organizationId,
            type: (sourceTypeMap[provider] ?? 'MESSAGE') as Parameters<typeof upsertMemoryEntity>[0]['type'],
            title: approval.messageSource!.channel ?? `${provider} evidence`,
            subtitle: approval.messageSource!.sender ?? approval.messageSource!.senderEmail,
            summary: approval.evidenceSnippet,
            externalType: 'message_source',
            externalId: `message-source:${approval.messageSource!.id}`,
            sourceSystem: provider,
            metadata: {
              provider,
              externalId: approval.messageSource!.externalId,
              senderEmail: approval.messageSource!.senderEmail,
              demo: isDemo,
            },
            seenAt: approval.messageSource!.receivedAt,
          });
          await linkMemoryEntities({
            organizationId,
            fromEntityId: approvalEntity.id,
            toEntityId: sourceEntity.id,
            relationshipType: 'CREATED_FROM',
            evidenceSnippet: approval.evidenceSnippet,
            sourceSystem: provider,
          });
          created.messageSource = true;
        })()
      : null,

    vendor
      ? (async () => {
          const vendorEntity = await upsertMemoryEntity({
            organizationId,
            type: 'VENDOR',
            title: vendor,
            externalType: 'detected_vendor',
            externalId: `vendor:${entityKey(vendor)}`,
            sourceSystem: approval.sourcePlatform,
            riskScore: riskScore(approval.riskLevel),
            metadata: { detectedFromApprovalId: approval.id, demo: isDemo },
            seenAt,
          });
          await linkMemoryEntities({
            organizationId,
            fromEntityId: vendorEntity.id,
            toEntityId: approvalEntity.id,
            relationshipType: 'HAS_APPROVAL',
            evidenceSnippet: approval.evidenceSnippet,
            sourceSystem: approval.sourcePlatform,
          });
          created.vendor = true;
        })()
      : null,

    project
      ? (async () => {
          const projectEntity = await upsertMemoryEntity({
            organizationId,
            type: 'PROJECT',
            title: project,
            externalType: 'detected_project',
            externalId: `project:${entityKey(project)}`,
            sourceSystem: approval.sourcePlatform,
            riskScore: riskScore(approval.riskLevel),
            metadata: { detectedFromApprovalId: approval.id, demo: isDemo },
            seenAt,
          });
          await linkMemoryEntities({
            organizationId,
            fromEntityId: projectEntity.id,
            toEntityId: approvalEntity.id,
            relationshipType: 'HAS_DECISION',
            evidenceSnippet: approval.evidenceSnippet,
            sourceSystem: approval.sourcePlatform,
          });
          created.project = true;
        })()
      : null,
  ]);

  return created;
}

async function main() {
  const { orgId, apply } = parseArgs();

  if (!orgId) {
    console.error('Error: --org <organizationId> is required');
    process.exit(1);
  }

  const mode = apply ? 'APPLY' : 'DRY-RUN';
  console.log(`\n=== Memory Graph Backfill from Approvals [${mode}] ===`);
  console.log(`Organization: ${orgId}\n`);

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

  const approvals = await fetchApprovals(orgId);

  console.log(`\nFetched ${approvals.length} approval records.\n`);

  if (!apply) {
    console.log('DRY-RUN — would create/update the following per approval:\n');
    const totals = { approver: 0, department: 0, messageSource: 0, vendor: 0, project: 0 };
    for (const approval of approvals) {
      const idx = approvals.indexOf(approval) + 1;
      const plan = describeApproval(approval);
      const extras: string[] = [];
      if (plan.approver) { extras.push('APPROVER'); totals.approver++; }
      if (plan.department) { extras.push('DEPARTMENT'); totals.department++; }
      if (plan.messageSource) { extras.push('MSG_SOURCE'); totals.messageSource++; }
      if (plan.vendor) { extras.push('VENDOR'); totals.vendor++; }
      if (plan.project) { extras.push('PROJECT'); totals.project++; }
      const tag = isDemoApprovalRecord(approval) ? ' [demo]' : '';
      console.log(`  [${idx}/${approvals.length}] APPROVAL + ${extras.join(', ') || '(none)'}${tag}`);
      console.log(`         "${approval.subject.slice(0, 72)}"`);
    }
    console.log('\nPROJECTED TOTALS (new or updated):');
    console.log(`  APPROVAL:    ${approvals.length}`);
    console.log(`  APPROVER:    up to ${totals.approver} (deduped by email/name key)`);
    console.log(`  DEPARTMENT:  up to ${totals.department} (deduped by name key)`);
    console.log(`  MSG_SOURCE:  up to ${totals.messageSource} (deduped by source ID)`);
    console.log(`  VENDOR:      up to ${totals.vendor} (deduped by name key)`);
    console.log(`  PROJECT:     up to ${totals.project} (deduped by name key)`);
    console.log('\nRun with --apply to write these to the database.');
    process.exit(0);
  }

  // --- APPLY ---
  const summary = { ok: 0, failed: 0, approvers: 0, departments: 0, messageSources: 0, vendors: 0, projects: 0 };

  for (const approval of approvals) {
    const idx = approvals.indexOf(approval) + 1;
    const label = approval.subject.slice(0, 60);
    process.stdout.write(`  [${idx}/${approvals.length}] "${label}"… `);
    try {
      const created = await processApproval(orgId, approval);
      const extras: string[] = [];
      if (created.approver) { extras.push('approver'); summary.approvers++; }
      if (created.department) { extras.push('dept'); summary.departments++; }
      if (created.messageSource) { extras.push('src'); summary.messageSources++; }
      if (created.vendor) { extras.push('vendor'); summary.vendors++; }
      if (created.project) { extras.push('project'); summary.projects++; }
      console.log(`OK${extras.length ? ` +${extras.join('+')  }` : ''}`);
      summary.ok++;
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      summary.failed++;
    }
  }

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

  console.log('\nSUMMARY');
  console.log(`  Processed: ${summary.ok} OK, ${summary.failed} failed`);
  console.log(`  Approvers linked:      ${summary.approvers}`);
  console.log(`  Departments linked:    ${summary.departments}`);
  console.log(`  Message sources:       ${summary.messageSources}`);
  console.log(`  Vendors detected:      ${summary.vendors}`);
  console.log(`  Projects detected:     ${summary.projects}`);

  console.log('\nAFTER STATE');
  console.log(`  MemoryEntity count:       ${entityCountAfter}`);
  console.log(`  MemoryRelationship count: ${relCountAfter}`);
  console.log('\nEntity type breakdown:');
  for (const row of breakdown) {
    console.log(`  ${row.type}: ${row._count.id}`);
  }

  if (summary.failed > 0) {
    console.log(`\n${summary.failed} approval(s) failed — re-run with --apply to retry (idempotent).`);
    process.exit(1);
  }

  console.log('\nBackfill complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
