import type { MemoryEntity, MemoryEntityType, MemoryRelationship, MemoryTimelineEvent, Prisma } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { assertMemoryRelationshipTenant, logTenantIsolationEvent, safeTenantIsolationMessage } from '@/lib/tenant-isolation';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import { withTimeout } from '@/lib/performance';
import { toDate } from '@/lib/types/dates';
import { ensureMemoryStorage } from '@/services/memory-storage';

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * rebuildMemoryGraphForOrganization() calls linkMemoryEntities() dozens to
 * hundreds of times in a loop when refreshing a workspace's graph (once per
 * approval/vendor/policy/risk relationship). Under connection_limit=1, that
 * rapid sequence of small queries is exactly the shape that produces
 * "Timed out fetching a new connection from the pool" - retrying a
 * transient timeout here, at the source, fixes it for every caller
 * (rebuildMemoryGraphForOrganization, the evidence pipeline, the founder
 * demo generator) without touching each of them individually.
 */
async function findMemoryEntitiesForRelationship(ids: string[], maxAttempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.memoryEntity.findMany({
        where: { id: { in: ids } },
        select: { id: true, organizationId: true },
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) || attempt === maxAttempts) throw error;
      await sleep(250 * 2 ** (attempt - 1)); // 250ms, 500ms, 1000ms
    }
  }
  throw lastError;
}

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

/**
 * Same demo-record convention applied to services/analytics.ts's Executive
 * ROI Dashboard - demo-seeded approvals (lib/demo-data.ts, npm run
 * seed:demo) carry a sourceLink containing 'demo'/'TDEMO' or a MessageSource
 * externalId starting with 'demo-'.
 *
 * An earlier version of this fix excluded demo approvals from the Memory
 * Graph entirely, matching the analytics fix. That was wrong for this page
 * specifically: analytics has a live/demo-preview toggle so "excluded from
 * live" still leaves something to show, but the Memory Graph has no such
 * toggle, and a workspace whose only approvals are demo-seeded ended up with
 * an empty graph instead of a fake one. The rest of the codebase's own
 * convention for demo records (components/dashboard/ApprovalTable.tsx,
 * app/approvals/[id]/page.tsx) is to keep them visible with a "Demo" badge,
 * not hide them - matched here via isDemoMemoryEntity() below instead.
 */
function isDemoApprovalRecord(approval: { sourceLink: string | null; messageSource?: { externalId: string | null } | null }) {
  return Boolean(
    approval.sourceLink?.includes('demo') ||
      approval.sourceLink?.includes('TDEMO') ||
      approval.messageSource?.externalId?.startsWith('demo-'),
  );
}

/** Mirrors the "Demo" badge convention in ApprovalTable/approval detail page, for MemoryEntity rows tagged `metadata.demo` by rebuildMemoryGraphForOrganization(). */
export function isDemoMemoryEntity(entity: { metadata: unknown }) {
  return Boolean(
    entity.metadata &&
      typeof entity.metadata === 'object' &&
      !Array.isArray(entity.metadata) &&
      (entity.metadata as Record<string, unknown>).demo === true,
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

export async function upsertMemoryEntity(input: EntityInput) {
  await ensureMemoryStorage();
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
  await ensureMemoryStorage();

  const entities = await findMemoryEntitiesForRelationship([input.fromEntityId, input.toEntityId]);
  const fromEntity = entities.find((entity) => entity.id === input.fromEntityId);
  const toEntity = entities.find((entity) => entity.id === input.toEntityId);

  try {
    assertMemoryRelationshipTenant({
      organizationId: input.organizationId,
      fromEntity,
      toEntity,
    });
  } catch (error) {
    await logTenantIsolationEvent({
      organizationId: input.organizationId,
      action: 'security.cross_tenant_memory_relationship_rejected',
      targetType: 'MemoryRelationship',
      metadata: {
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
        relationshipType: input.relationshipType,
        reason: safeTenantIsolationMessage(error),
      },
    });
    throw error;
  }

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
  await ensureMemoryStorage();
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

// --- Cache tag / invalidation ------------------------------------------
export function memoryCacheTag(organizationId: string) {
  return `memory-${organizationId}`;
}

/** Safe to call from anywhere (including the standalone worker process, which
 *  has no Next.js server request scope and would otherwise throw on a bare
 *  revalidateTag) — see services/evidence/pipeline.ts's projectToMemoryGraph. */
export function invalidateMemoryCache(organizationId: string) {
  try {
    revalidateTag(memoryCacheTag(organizationId));
  } catch (error) {
    console.warn('[memory] cache invalidation skipped (no Next.js server request scope)', error instanceof Error ? error.message : error);
  }
}

export async function rebuildMemoryGraphForOrganization(organizationId: string) {
  await ensureMemoryStorage();
  const [approvalsRaw, investigations, playbooks, rules, evaluations] = await Promise.all([
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

  const approvals = approvalsRaw;

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
        demo: isDemoApprovalRecord(approval),
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
        metadata: { provider, externalId: approval.messageSource.externalId, senderEmail: approval.messageSource.senderEmail, demo: isDemoApprovalRecord(approval) },
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

  invalidateMemoryCache(organizationId);
}

async function ensureMemoryGraph(organizationId: string) {
  await ensureMemoryStorage();
  const count = await prisma.memoryEntity.count({ where: { organizationId } });
  if (count === 0) await rebuildMemoryGraphForOrganization(organizationId);
}

// --- Circuit breaker -----------------------------------------------------
// Mirrors lib/auth.ts / lib/approvalRecords.ts / services/alerts.ts: after
// repeated consecutive failures, stop hitting the database and fail fast.
// Also gates whether a degraded message is shown at all — a single slow
// query must never alarm the user.
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveMemoryFailures = 0;
let memoryBreakerOpenUntil = 0;

function isMemoryBreakerOpen() {
  return Date.now() < memoryBreakerOpenUntil;
}

function recordMemorySuccess() {
  consecutiveMemoryFailures = 0;
  memoryBreakerOpenUntil = 0;
}

function recordMemoryFailure() {
  consecutiveMemoryFailures += 1;
  if (consecutiveMemoryFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    memoryBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class MemoryCircuitOpenError extends Error {
  constructor() {
    super('Memory Graph lookup is temporarily paused after repeated database failures.');
    this.name = 'MemoryCircuitOpenError';
  }
}

type MemoryDashboardFresh = {
  totalEntities: number;
  totalRelationships: number;
  recentEntities: MemoryEntity[];
  recentDecisions: MemoryEntity[];
  recentRisks: MemoryEntity[];
  recentInvestigations: MemoryEntity[];
  searchResults: MemoryEntity[];
  graphEntities: MemoryEntity[];
  graphRelationships: MemoryRelationship[];
};

const MEMORY_QUERY_TIMEOUT_MS = 3000;
const MEMORY_TOTAL_FETCH_TIMEOUT_MS = 5000;
const MEMORY_REVALIDATE_SECONDS = 120;

async function fetchMemoryDashboardFresh(organizationId: string, query: string): Promise<MemoryDashboardFresh> {
  if (isMemoryBreakerOpen()) {
    throw new MemoryCircuitOpenError();
  }

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

  // totalEntities/totalRelationships/graphEntities are NOT individually
  // caught below, unlike the "Recent X" lists - those three drive the
  // headline stat cards and the graph view itself, so a query failure on
  // them must propagate and hit the retry/circuit-breaker/stale-value path
  // below, not get silently replaced with 0/[] and rendered as a
  // confidently-wrong "empty graph" indistinguishable from a real one.
  const attempt = () =>
    Promise.all([
      withTimeout('memory:totalEntities', prisma.memoryEntity.count({ where: { organizationId } }), MEMORY_QUERY_TIMEOUT_MS),
      withTimeout('memory:totalRelationships', prisma.memoryRelationship.count({ where: { organizationId } }), MEMORY_QUERY_TIMEOUT_MS),
      withTimeout('memory:recentEntities', prisma.memoryEntity.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 8 }), MEMORY_QUERY_TIMEOUT_MS).catch(() => [] as MemoryEntity[]),
      withTimeout('memory:recentDecisions', prisma.memoryEntity.findMany({ where: { organizationId, type: { in: ['APPROVAL', 'DECISION', 'ZOOM_DECISION'] } }, orderBy: { lastSeenAt: 'desc' }, take: 6 }), MEMORY_QUERY_TIMEOUT_MS).catch(() => [] as MemoryEntity[]),
      withTimeout('memory:recentRisks', prisma.memoryEntity.findMany({ where: { organizationId, OR: [{ type: 'RISK' }, { riskScore: { gte: 70 } }] }, orderBy: { riskScore: 'desc' }, take: 6 }), MEMORY_QUERY_TIMEOUT_MS).catch(() => [] as MemoryEntity[]),
      withTimeout('memory:recentInvestigations', prisma.memoryEntity.findMany({ where: { organizationId, type: 'INVESTIGATION' }, orderBy: { lastSeenAt: 'desc' }, take: 6 }), MEMORY_QUERY_TIMEOUT_MS).catch(() => [] as MemoryEntity[]),
      searchWhere
        ? withTimeout('memory:searchResults', prisma.memoryEntity.findMany({ where: searchWhere, orderBy: { updatedAt: 'desc' }, take: 12 }), MEMORY_QUERY_TIMEOUT_MS).catch(() => [] as MemoryEntity[])
        : Promise.resolve([] as MemoryEntity[]),
      withTimeout('memory:graphEntities', prisma.memoryEntity.findMany({ where: { organizationId }, orderBy: { riskScore: 'desc' }, take: 14 }), MEMORY_QUERY_TIMEOUT_MS),
      withTimeout('memory:graphRelationships', prisma.memoryRelationship.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 22 }), MEMORY_QUERY_TIMEOUT_MS).catch(() => [] as MemoryRelationship[]),
    ]);

  try {
    // One quick retry on a connection-pool-shaped error — self-heals a
    // single transient blip within the same request.
    const [totalEntities, totalRelationships, recentEntities, recentDecisions, recentRisks, recentInvestigations, searchResults, graphEntities, graphRelationships] =
      await attempt().catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300));
        return attempt();
      });

    recordMemorySuccess();
    return { totalEntities, totalRelationships, recentEntities, recentDecisions, recentRisks, recentInvestigations, searchResults, graphEntities, graphRelationships };
  } catch (error) {
    recordMemoryFailure();
    throw error;
  }
}

/**
 * Cross-request cache (Next.js Data Cache) — the primary fix: previously
 * every page load hit Postgres directly with zero shared caching, and any
 * single slow query immediately showed "Memory Graph temporarily
 * unavailable" (see buildMemoryDashboard's breaker-gated fallback below for
 * why that's now reserved for 3+ consecutive failures). ensureMemoryGraph()
 * is intentionally NOT part of the cached fetch - it only ever does real
 * work once, the first time an organization's graph is empty, so leaving it
 * outside the cache boundary costs nothing in the steady state while
 * guaranteeing a first-time bootstrap is visible immediately.
 */
function getCachedMemoryDashboardFetcher(organizationId: string) {
  return unstable_cache(
    (query: string) => fetchMemoryDashboardFresh(organizationId, query),
    ['memory-dashboard', organizationId],
    { revalidate: MEMORY_REVALIDATE_SECONDS, tags: [memoryCacheTag(organizationId)] },
  );
}

/**
 * unstable_cache serializes its return value to JSON - every Date field on
 * MemoryEntity/MemoryRelationship comes back as an ISO string on a cache
 * hit even though the Prisma-inferred type still claims they're Date
 * objects. Applied unconditionally, matching the fix already applied to
 * lib/approvalRecords.ts, lib/auth.ts, and services/alerts.ts.
 */
function deserializeMemoryEntity(entity: MemoryEntity): MemoryEntity {
  return {
    ...entity,
    firstSeenAt: toDate(entity.firstSeenAt),
    lastSeenAt: toDate(entity.lastSeenAt),
    createdAt: toDate(entity.createdAt),
    updatedAt: toDate(entity.updatedAt),
  };
}

function deserializeMemoryRelationship(relationship: MemoryRelationship): MemoryRelationship {
  return { ...relationship, createdAt: toDate(relationship.createdAt), updatedAt: toDate(relationship.updatedAt) };
}

function deserializeMemoryDashboard(data: MemoryDashboardFresh): MemoryDashboardFresh {
  return {
    ...data,
    recentEntities: data.recentEntities.map(deserializeMemoryEntity),
    recentDecisions: data.recentDecisions.map(deserializeMemoryEntity),
    recentRisks: data.recentRisks.map(deserializeMemoryEntity),
    recentInvestigations: data.recentInvestigations.map(deserializeMemoryEntity),
    searchResults: data.searchResults.map(deserializeMemoryEntity),
    graphEntities: data.graphEntities.map(deserializeMemoryEntity),
    graphRelationships: data.graphRelationships.map(deserializeMemoryRelationship),
  };
}

// Per-request dedup on top of the cross-request cache above.
const getMemoryDashboardForRequest = cache(async (organizationId: string, query: string) => {
  const result = await getCachedMemoryDashboardFetcher(organizationId)(query);
  return deserializeMemoryDashboard(result);
});

// --- Tier-2 "last known good" store --------------------------------------
// Same pattern as lib/approvalRecords.ts / services/alerts.ts: unstable_cache
// has no stale-if-error primitive, so this small imperative store exists
// purely to serve the last successful result when a fresh fetch fails.
type LastGoodEntry = { data: MemoryDashboardFresh; cachedAt: number };
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;

const globalForMemory = globalThis as unknown as {
  approvlineMemoryLastGood?: Map<string, LastGoodEntry>;
};

function lastGoodStore() {
  globalForMemory.approvlineMemoryLastGood ??= new Map();
  return globalForMemory.approvlineMemoryLastGood;
}

export async function buildMemoryDashboard(organizationId: string, query?: string): Promise<
  MemoryDashboardFresh & { degraded: boolean; alert: boolean; staleAsOfMs?: number; message?: string }
> {
  await ensureMemoryStorage();
  await withTimeout('memory graph ensure', ensureMemoryGraph(organizationId), 2500).catch((error) => {
    console.warn('[memory] graph refresh skipped', error);
  });

  const normalizedQuery = query?.trim() ?? '';
  const lastGoodKey = `${organizationId}::${normalizedQuery}`;

  try {
    const data = await withTimeout('memory dashboard (total)', getMemoryDashboardForRequest(organizationId, normalizedQuery), MEMORY_TOTAL_FETCH_TIMEOUT_MS);
    lastGoodStore().set(lastGoodKey, { data, cachedAt: Date.now() });
    return { ...data, degraded: false, alert: false };
  } catch (error) {
    console.error('[memory] dashboard fetch failed', error);

    // The degraded message is reserved for a database that has actually
    // been unreachable for 3+ consecutive attempts (breaker open) - a
    // single slow query must never alarm the user, even if it means
    // falling back to a slightly stale (but real) result.
    const alert = isMemoryBreakerOpen();

    const lastGood = lastGoodStore().get(lastGoodKey);
    if (lastGood && Date.now() - lastGood.cachedAt < STALE_CACHE_TTL_MS) {
      return {
        ...lastGood.data,
        degraded: alert,
        alert,
        staleAsOfMs: lastGood.cachedAt,
        message: alert ? 'Live database results are delayed, so recently loaded Memory Graph data is shown instead.' : undefined,
      };
    }

    return {
      totalEntities: 0,
      totalRelationships: 0,
      recentEntities: [],
      recentDecisions: [],
      recentRisks: [],
      recentInvestigations: [],
      searchResults: [],
      graphEntities: [],
      graphRelationships: [],
      degraded: true,
      alert,
      message: alert
        ? 'Memory Graph is temporarily unavailable. The rest of the dashboard remains usable.'
        : 'Memory Graph is loading. Retrying automatically.',
    };
  }
}

export async function getMemoryEntityProfile(organizationId: string, entityId: string) {
  await ensureMemoryStorage();
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
  await ensureMemoryStorage();
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
