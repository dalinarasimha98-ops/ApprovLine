import type { MemoryEntity, MemoryEntityType, MemoryRelationship, MemoryTimelineEvent, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

export const memoryEntityLabels: Record<MemoryEntityType, string> = {
  VENDOR: 'Vendor',
  CONTRACT: 'Contract',
  APPROVAL: 'Approval',
  APPROVER: 'Approver',
  DEPARTMENT: 'Department',
  PROJECT: 'Project',
  POLICY: 'Policy',
  INVESTIGATION: 'Investigation',
  RISK: 'Risk',
  EMAIL: 'Email',
  OUTLOOK_EMAIL: 'Outlook Email',
  TEAMS_MESSAGE: 'Teams Message',
  SLACK_MESSAGE: 'Slack Message',
  ZOOM_DECISION: 'Zoom Decision',
  JIRA_TICKET: 'Jira Ticket',
  SERVICENOW_RECORD: 'ServiceNow Record',
  GATEWAY_RECORD: 'Gateway Record',
  EMPLOYEE: 'Employee',
  MEETING: 'Meeting',
  TICKET: 'Ticket',
  DECISION: 'Decision',
  MESSAGE: 'Message',
};

const sourceTypeMap: Record<string, MemoryEntityType> = {
  GMAIL: 'EMAIL',
  OUTLOOK: 'OUTLOOK_EMAIL',
  SLACK: 'SLACK_MESSAGE',
  MICROSOFT_TEAMS: 'TEAMS_MESSAGE',
  JIRA: 'JIRA_TICKET',
  SERVICENOW: 'SERVICENOW_RECORD',
  ZOOM: 'ZOOM_DECISION',
};

type EntityInput = {
  organizationId: string;
  type: MemoryEntityType;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  externalType?: string | null;
  externalId?: string | null;
  sourceSystem?: string | null;
  riskScore?: number;
  metadata?: Prisma.InputJsonValue;
  seenAt?: Date;
};

type RelationshipInput = {
  organizationId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  confidence?: number;
  evidenceSnippet?: string | null;
  sourceSystem?: string | null;
  metadata?: Prisma.InputJsonValue;
};

type TimelineInput = {
  organizationId: string;
  entityId: string;
  title: string;
  description?: string | null;
  eventType: string;
  sourceSystem?: string | null;
  occurredAt: Date;
  sourceLink?: string | null;
  metadata?: Prisma.InputJsonValue;
};

function riskScore(value?: string | null) {
  const risk = value?.toLowerCase();
  if (risk === 'critical') return 95;
  if (risk === 'high') return 82;
  if (risk === 'medium') return 55;
  if (risk === 'low') return 25;
  return 10;
}

function key(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 120);
}

function truncate(value?: string | null, length = 280) {
  if (!value) return null;
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function vendorFromText(text: string) {
  const match = text.match(/\b(?:vendor|supplier|partner)\s+([A-Z][A-Za-z0-9&., -]{2,48})/);
  return match?.[1]?.replace(/\s+(approval|contract|payment|invoice).*$/i, '').trim() ?? null;
}

function projectFromText(text: string) {
  const match = text.match(/\b(Project\s+[A-Z][A-Za-z0-9 -]{2,48})/i);
  return match?.[1]?.trim() ?? null;
}

export async function upsertMemoryEntity(input: EntityInput) {
  const seenAt = input.seenAt ?? new Date();
  const externalId = input.externalId ?? `${input.type}:${key(input.title)}`;
  return prisma.memoryEntity.upsert({
    where: {
      organizationId_type_externalId: {
        organizationId: input.organizationId,
        type: input.type,
        externalId,
      },
    },
    create: {
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      subtitle: input.subtitle ?? null,
      summary: input.summary ?? null,
      externalType: input.externalType ?? null,
      externalId,
      sourceSystem: input.sourceSystem ?? null,
      riskScore: input.riskScore ?? 0,
      metadata: input.metadata ?? undefined,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
    },
    update: {
      title: input.title,
      subtitle: input.subtitle ?? null,
      summary: input.summary ?? null,
      sourceSystem: input.sourceSystem ?? null,
      riskScore: input.riskScore ?? 0,
      metadata: input.metadata ?? undefined,
      lastSeenAt: seenAt,
    },
  });
}

export async function linkMemoryEntities(input: RelationshipInput) {
  if (input.fromEntityId === input.toEntityId) return null;
  return prisma.memoryRelationship.upsert({
    where: {
      organizationId_fromEntityId_toEntityId_relationshipType: {
        organizationId: input.organizationId,
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        relationshipType: input.relationshipType,
      },
    },
    create: {
      organizationId: input.organizationId,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      relationshipType: input.relationshipType,
      confidence: input.confidence ?? 100,
      evidenceSnippet: truncate(input.evidenceSnippet),
      sourceSystem: input.sourceSystem ?? null,
      metadata: input.metadata ?? undefined,
    },
    update: {
      confidence: input.confidence ?? 100,
      evidenceSnippet: truncate(input.evidenceSnippet),
      sourceSystem: input.sourceSystem ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function addMemoryTimelineEvent(input: TimelineInput) {
  return prisma.memoryTimelineEvent.create({
    data: {
      organizationId: input.organizationId,
      entityId: input.entityId,
      title: input.title,
      description: truncate(input.description),
      eventType: input.eventType,
      sourceSystem: input.sourceSystem ?? null,
      occurredAt: input.occurredAt,
      sourceLink: input.sourceLink ?? null,
      metadata: input.metadata ?? undefined,
    },
  }).catch(() => null);
}

export async function rebuildMemoryGraphForOrganization(organizationId: string) {
  const [approvals, investigations, playbooks, rules, evaluations] = await Promise.all([
    prisma.approvalRecord.findMany({
      where: { organizationId },
      include: { messageSource: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.investigationCase.findMany({
      where: { organizationId },
      include: { approvals: true },
      orderBy: { createdAt: 'desc' },
      take: 120,
    }).catch(() => []),
    prisma.playbookDocument.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }).catch(() => []),
    prisma.playbookRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 180,
    }).catch(() => []),
    prisma.approvalComplianceEvaluation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 240,
    }).catch(() => []),
  ]);

  const approvalEntityIds = new Map<string, string>();
  const policyEntityIds = new Map<string, string>();

  for (const document of playbooks) {
    const entity = await upsertMemoryEntity({
      organizationId,
      type: 'POLICY',
      title: document.name,
      subtitle: document.fileType,
      summary: `Uploaded ${document.fileType.toLowerCase()} playbook.`,
      externalType: 'playbook_document',
      externalId: `playbook:${document.id}`,
      sourceSystem: 'Playbook AI',
      metadata: { status: document.status, ownerUserId: document.ownerUserId },
      seenAt: document.createdAt,
    });
    policyEntityIds.set(document.id, entity.id);
  }

  for (const rule of rules) {
    const entity = await upsertMemoryEntity({
      organizationId,
      type: 'POLICY',
      title: rule.title,
      subtitle: `${rule.category} · ${rule.severity}`,
      summary: rule.description || rule.sourceExcerpt,
      externalType: 'playbook_rule',
      externalId: `playbook-rule:${rule.id}`,
      sourceSystem: 'Playbook AI',
      riskScore: riskScore(rule.severity),
      metadata: { requiredApprovers: rule.requiredApprovers, requiredDepartments: rule.requiredDepartments, spendingLimit: rule.spendingLimit },
      seenAt: rule.createdAt,
    });
    policyEntityIds.set(rule.id, entity.id);
    const documentEntityId = policyEntityIds.get(rule.documentId);
    if (documentEntityId) {
      await linkMemoryEntities({
        organizationId,
        fromEntityId: entity.id,
        toEntityId: documentEntityId,
        relationshipType: 'PART_OF_POLICY',
        sourceSystem: 'Playbook AI',
      });
    }
  }

  for (const approval of approvals) {
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
      },
      seenAt: approval.approvalTimestamp ?? approval.occurredAt,
    });
    approvalEntityIds.set(approval.id, approvalEntity.id);

    await addMemoryTimelineEvent({
      organizationId,
      entityId: approvalEntity.id,
      title: `${approval.status.replaceAll('_', ' ')}: ${approval.subject}`,
      description: approval.evidenceSnippet ?? approval.reasoning,
      eventType: 'APPROVAL_RECORDED',
      sourceSystem: approval.sourcePlatform ?? approval.messageSource?.provider ?? null,
      occurredAt: approval.approvalTimestamp ?? approval.occurredAt,
      sourceLink: approval.sourceLink,
      metadata: { approvalRecordId: approval.id },
    });

    if (approval.approverEmail || approval.approverName) {
      const approver = await upsertMemoryEntity({
        organizationId,
        type: 'APPROVER',
        title: approval.approverName ?? approval.approverEmail ?? 'Unknown approver',
        subtitle: approval.approverEmail,
        externalType: 'approval_approver',
        externalId: `approver:${key(approval.approverEmail ?? approval.approverName ?? approval.id)}`,
        sourceSystem: approval.sourcePlatform,
        metadata: { email: approval.approverEmail },
        seenAt: approval.approvalTimestamp ?? approval.occurredAt,
      });
      await linkMemoryEntities({
        organizationId,
        fromEntityId: approvalEntity.id,
        toEntityId: approver.id,
        relationshipType: 'APPROVED_BY',
        evidenceSnippet: approval.evidenceSnippet,
        sourceSystem: approval.sourcePlatform,
      });
    }

    if (approval.department) {
      const department = await upsertMemoryEntity({
        organizationId,
        type: 'DEPARTMENT',
        title: approval.department,
        externalType: 'department',
        externalId: `department:${key(approval.department)}`,
      });
      await linkMemoryEntities({
        organizationId,
        fromEntityId: approvalEntity.id,
        toEntityId: department.id,
        relationshipType: 'OWNED_BY_DEPARTMENT',
        sourceSystem: approval.sourcePlatform,
      });
    }

    if (approval.messageSource) {
      const provider = approval.messageSource.provider;
      const sourceEntity = await upsertMemoryEntity({
        organizationId,
        type: sourceTypeMap[provider] ?? 'MESSAGE',
        title: approval.messageSource.channel ?? `${provider} evidence`,
        subtitle: approval.messageSource.sender ?? approval.messageSource.senderEmail,
        summary: approval.evidenceSnippet,
        externalType: 'message_source',
        externalId: `message-source:${approval.messageSource.id}`,
        sourceSystem: provider,
        metadata: { provider, externalId: approval.messageSource.externalId, senderEmail: approval.messageSource.senderEmail },
        seenAt: approval.messageSource.receivedAt,
      });
      await linkMemoryEntities({
        organizationId,
        fromEntityId: approvalEntity.id,
        toEntityId: sourceEntity.id,
        relationshipType: 'CREATED_FROM',
        evidenceSnippet: approval.evidenceSnippet,
        sourceSystem: provider,
      });
    }

    const text = [approval.subject, approval.businessImpact, approval.reasoning, approval.evidenceSnippet].filter(Boolean).join(' ');
    const vendor = vendorFromText(text);
    if (vendor) {
      const vendorEntity = await upsertMemoryEntity({
        organizationId,
        type: 'VENDOR',
        title: vendor,
        externalType: 'detected_vendor',
        externalId: `vendor:${key(vendor)}`,
        sourceSystem: approval.sourcePlatform,
        riskScore: riskScore(approval.riskLevel),
        metadata: { detectedFromApprovalId: approval.id },
        seenAt: approval.occurredAt,
      });
      await linkMemoryEntities({
        organizationId,
        fromEntityId: vendorEntity.id,
        toEntityId: approvalEntity.id,
        relationshipType: 'HAS_APPROVAL',
        evidenceSnippet: approval.evidenceSnippet,
        sourceSystem: approval.sourcePlatform,
      });
    }
    const project = projectFromText(text);
    if (project) {
      const projectEntity = await upsertMemoryEntity({
        organizationId,
        type: 'PROJECT',
        title: project,
        externalType: 'detected_project',
        externalId: `project:${key(project)}`,
        sourceSystem: approval.sourcePlatform,
        riskScore: riskScore(approval.riskLevel),
      });
      await linkMemoryEntities({
        organizationId,
        fromEntityId: projectEntity.id,
        toEntityId: approvalEntity.id,
        relationshipType: 'HAS_DECISION',
        evidenceSnippet: approval.evidenceSnippet,
        sourceSystem: approval.sourcePlatform,
      });
    }
  }

  for (const evaluation of evaluations) {
    const approvalEntityId = approvalEntityIds.get(evaluation.approvalRecordId);
    const policyEntityId = evaluation.ruleId ? policyEntityIds.get(evaluation.ruleId) : undefined;
    if (!approvalEntityId) continue;
    const risk = await upsertMemoryEntity({
      organizationId,
      type: 'RISK',
      title: `${evaluation.severity} compliance finding`,
      subtitle: evaluation.status,
      summary: evaluation.explanation,
      externalType: 'compliance_evaluation',
      externalId: `compliance:${evaluation.id}`,
      sourceSystem: 'Playbook AI',
      riskScore: evaluation.score,
      metadata: {
        missingApprovers: evaluation.missingApprovers,
        missingDepartments: evaluation.missingDepartments,
        missingEvidence: evaluation.missingEvidence,
      },
      seenAt: evaluation.createdAt,
    });
    await linkMemoryEntities({ organizationId, fromEntityId: approvalEntityId, toEntityId: risk.id, relationshipType: 'HAS_RISK', sourceSystem: 'Playbook AI' });
    if (policyEntityId) {
      await linkMemoryEntities({ organizationId, fromEntityId: approvalEntityId, toEntityId: policyEntityId, relationshipType: 'GOVERNED_BY', sourceSystem: 'Playbook AI' });
      await linkMemoryEntities({ organizationId, fromEntityId: risk.id, toEntityId: policyEntityId, relationshipType: 'TRIGGERED_POLICY', sourceSystem: 'Playbook AI' });
    }
  }

  for (const investigation of investigations) {
    const investigationEntity = await upsertMemoryEntity({
      organizationId,
      type: 'INVESTIGATION',
      title: investigation.title,
      subtitle: `${investigation.status} · ${investigation.riskLevel ?? 'unscored'} risk`,
      summary: investigation.summary,
      externalType: 'investigation_case',
      externalId: `investigation:${investigation.id}`,
      sourceSystem: 'Investigation Center',
      riskScore: riskScore(investigation.riskLevel),
      metadata: { status: investigation.status, department: investigation.department },
      seenAt: investigation.createdAt,
    });
    await addMemoryTimelineEvent({
      organizationId,
      entityId: investigationEntity.id,
      title: `Investigation opened: ${investigation.title}`,
      description: investigation.summary,
      eventType: 'INVESTIGATION_OPENED',
      sourceSystem: 'Investigation Center',
      occurredAt: investigation.createdAt,
      sourceLink: `/investigations/${investigation.id}`,
    });
    for (const item of investigation.approvals) {
      const approvalEntityId = approvalEntityIds.get(item.approvalRecordId);
      if (approvalEntityId) {
        await linkMemoryEntities({
          organizationId,
          fromEntityId: investigationEntity.id,
          toEntityId: approvalEntityId,
          relationshipType: 'INVESTIGATES',
          sourceSystem: 'Investigation Center',
        });
      }
    }
  }

  await prisma.memoryGraphEvent.create({
    data: {
      organizationId,
      action: 'memory_graph.rebuilt',
      sourceSystem: 'ApprovLine',
      payload: { approvals: approvals.length, investigations: investigations.length, playbooks: playbooks.length, rules: rules.length },
    },
  }).catch(() => null);
}

async function ensureMemoryGraph(organizationId: string) {
  const count = await prisma.memoryEntity.count({ where: { organizationId } });
  if (count === 0) await rebuildMemoryGraphForOrganization(organizationId);
}

export async function buildMemoryDashboard(organizationId: string, query?: string) {
  await withTimeout('memory graph ensure', ensureMemoryGraph(organizationId), 2500).catch((error) => {
    console.warn('[memory] graph refresh skipped', error);
  });

  const searchWhere: Prisma.MemoryEntityWhereInput | undefined = query
    ? {
        organizationId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { subtitle: { contains: query, mode: 'insensitive' } },
          { summary: { contains: query, mode: 'insensitive' } },
          { sourceSystem: { contains: query, mode: 'insensitive' } },
        ],
      }
    : undefined;

  const [totalEntities, totalRelationships, recentEntities, recentDecisions, recentRisks, recentInvestigations, searchResults, graphEntities, graphRelationships] =
    await Promise.all([
      prisma.memoryEntity.count({ where: { organizationId } }),
      prisma.memoryRelationship.count({ where: { organizationId } }),
      prisma.memoryEntity.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 8 }),
      prisma.memoryEntity.findMany({ where: { organizationId, type: { in: ['APPROVAL', 'DECISION', 'ZOOM_DECISION'] } }, orderBy: { lastSeenAt: 'desc' }, take: 6 }),
      prisma.memoryEntity.findMany({ where: { organizationId, OR: [{ type: 'RISK' }, { riskScore: { gte: 70 } }] }, orderBy: { riskScore: 'desc' }, take: 6 }),
      prisma.memoryEntity.findMany({ where: { organizationId, type: 'INVESTIGATION' }, orderBy: { lastSeenAt: 'desc' }, take: 6 }),
      searchWhere ? prisma.memoryEntity.findMany({ where: searchWhere, orderBy: { updatedAt: 'desc' }, take: 12 }) : Promise.resolve([]),
      prisma.memoryEntity.findMany({ where: { organizationId }, orderBy: { riskScore: 'desc' }, take: 14 }),
      prisma.memoryRelationship.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 22 }),
    ]);

  return {
    totalEntities,
    totalRelationships,
    recentEntities,
    recentDecisions,
    recentRisks,
    recentInvestigations,
    searchResults,
    graphEntities,
    graphRelationships,
  };
}

export async function getMemoryEntityProfile(organizationId: string, entityId: string) {
  await withTimeout('memory graph profile ensure', ensureMemoryGraph(organizationId), 2500).catch(() => null);
  return prisma.memoryEntity.findFirst({
    where: { id: entityId, organizationId },
    include: {
      outgoingRelationships: { include: { toEntity: true }, orderBy: { updatedAt: 'desc' }, take: 80 },
      incomingRelationships: { include: { fromEntity: true }, orderBy: { updatedAt: 'desc' }, take: 80 },
      timelineEvents: { orderBy: { occurredAt: 'desc' }, take: 80 },
    },
  });
}

export async function queryMemoryGraphForCopilot(organizationId: string, question: string) {
  const terms = question
    .toLowerCase()
    .match(/[a-z0-9#.-]+/g)
    ?.filter((term) => term.length > 2)
    .slice(0, 8) ?? [];
  if (terms.length === 0) return [];
  await withTimeout('memory graph copilot ensure', ensureMemoryGraph(organizationId), 2200).catch(() => null);
  return prisma.memoryEntity.findMany({
    where: {
      organizationId,
      OR: terms.flatMap((term) => [
        { title: { contains: term, mode: 'insensitive' as const } },
        { subtitle: { contains: term, mode: 'insensitive' as const } },
        { summary: { contains: term, mode: 'insensitive' as const } },
      ]),
    },
    include: {
      outgoingRelationships: { include: { toEntity: true }, take: 6 },
      incomingRelationships: { include: { fromEntity: true }, take: 6 },
    },
    orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
    take: 8,
  });
}

export type MemoryDashboardData = Awaited<ReturnType<typeof buildMemoryDashboard>>;
export type MemoryEntityProfile = NonNullable<Awaited<ReturnType<typeof getMemoryEntityProfile>>>;
export type MemoryEntityWithRelations = MemoryEntity & {
  outgoingRelationships?: Array<MemoryRelationship & { toEntity: MemoryEntity }>;
  incomingRelationships?: Array<MemoryRelationship & { fromEntity: MemoryEntity }>;
  timelineEvents?: MemoryTimelineEvent[];
};
