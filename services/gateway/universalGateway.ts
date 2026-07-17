import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/services/audit';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { buildGatewayIdempotencyKey, createCorrelationId } from '@/services/queue/reliability';
import type { ApprovalCategory } from '@/types/classifier';

const enterpriseSystems = [
  'sap',
  'oracle',
  'coupa',
  'workday',
  'salesforce',
  'hubspot',
  'custom',
] as const;

export const enterpriseSystemSchema = z.enum(enterpriseSystems);

export const universalApprovalSchema = z.object({
  approver: z.string().min(1).max(200).optional(),
  approver_email: z.string().email().optional(),
  decision: z.string().min(1).max(6000),
  source_system: z.string().min(1).max(80),
  department: z.string().max(120).optional(),
  timestamp: z.string().datetime().optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  subject: z.string().max(240).optional(),
  category: z.string().max(80).optional(),
  tenant_slug: z.string().max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const universalWebhookSchema = z.object({
  system: enterpriseSystemSchema.default('custom'),
  event_type: z.string().max(120).optional(),
  tenant_slug: z.string().max(120).optional(),
  approval: universalApprovalSchema.partial().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type UniversalApprovalInput = z.infer<typeof universalApprovalSchema>;
export type UniversalWebhookInput = z.infer<typeof universalWebhookSchema>;

export interface GatewayEnqueueResult {
  accepted: true;
  organizationId: string;
  correlationId: string;
  idempotencyKey: string;
  duplicate: boolean;
  processingMode: 'queue' | 'outbox';
  backgroundJobId?: string;
}

export async function getGatewayOrganization(slug = 'public-demo') {
  return prisma.organization.upsert({
    where: { slug },
    update: {},
    create: {
      name: slug === 'public-demo' ? 'Public Demo' : slug,
      slug,
      departments: [],
      approvalCategories: [],
      onboardedAt: new Date(),
    },
  });
}

function metadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function buildGatewayMessage(input: UniversalApprovalInput) {
  const amount = input.amount ? ` Amount: ${input.amount}.` : '';
  const subject = input.subject ? ` Subject: ${input.subject}.` : '';
  const department = input.department ? ` Department: ${input.department}.` : '';
  return `${input.decision}.${subject}${department}${amount}`.replace(/\s+/g, ' ').trim();
}

function normalizeCategory(category?: string | null): ApprovalCategory | null {
  const allowed: ApprovalCategory[] = ['Finance', 'Procurement', 'Legal', 'HR', 'Engineering', 'Security', 'Compliance'];
  const match = allowed.find((item) => item.toLowerCase() === category?.toLowerCase());
  return match ?? null;
}

export async function ingestUniversalApproval(input: UniversalApprovalInput, options?: {
  organizationId?: string;
  tenantSlug?: string;
  auditAction?: string;
  receivedVia?: 'api' | 'webhook' | 'email' | 'csv' | 'document' | 'transcript';
  ipAddress?: string;
  userAgent?: string;
}): Promise<GatewayEnqueueResult> {
  const organization =
    options?.organizationId
      ? { id: options.organizationId }
      : await getGatewayOrganization(options?.tenantSlug ?? input.tenant_slug);

  const normalizedSource = input.source_system.trim().toLowerCase();
  const sourceLink = metadataString(input.metadata, ['url', 'link', 'source_url', 'record_url', 'evidence_url']);
  const externalId = metadataString(input.metadata, ['id', 'external_id', 'approval_id', 'record_id']);
  const correlationId = createCorrelationId();
  const idempotencyKey = buildGatewayIdempotencyKey({
    organizationId: organization.id,
    sourceSystem: normalizedSource,
    sourceRecordId: externalId,
    subject: input.subject,
    approverEmail: input.approver_email,
    timestamp: input.timestamp,
    decision: buildGatewayMessage(input),
  });
  const provider = normalizedSource === 'teams' ? 'MICROSOFT_TEAMS' : normalizedSource.toUpperCase();
  const gatewayProvider =
    ['SLACK', 'GMAIL', 'OUTLOOK', 'MICROSOFT_TEAMS', 'JIRA', 'SERVICENOW', 'ZOOM'].includes(provider)
      ? provider as IncomingMessageJob['provider']
      : 'SERVICENOW';

  const messageJob: IncomingMessageJob = {
    organizationId: organization.id,
    provider: gatewayProvider,
    externalId,
    channel: input.department ?? input.category ?? 'gateway',
    sender: input.approver,
    senderEmail: input.approver_email,
    timestamp: input.timestamp,
    message: buildGatewayMessage(input),
    sourceLink,
    rawPayload: {
      ...input.metadata,
      gateway: true,
      receivedVia: options?.receivedVia ?? 'api',
      source_system: input.source_system,
      amount: input.amount,
      department: input.department,
      category: normalizeCategory(input.category),
      subject: input.subject,
    },
  };
  const enqueued = await enqueueIncomingMessage(messageJob, {
    sourceSystem: normalizedSource,
    sourceRecordId: externalId,
    correlationId,
    idempotencyKey,
    metadata: {
      auditAction: options?.auditAction ?? `gateway.${options?.receivedVia ?? 'api'}.processed`,
      receivedVia: options?.receivedVia ?? 'api',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    },
  });

  await prisma.event.create({
    data: {
      organizationId: organization.id,
      type: `gateway.${options?.receivedVia ?? 'api'}.received`,
      sourceSystem: normalizedSource,
      sourceRecordId: externalId,
      correlationId,
      idempotencyKey,
      payload: {
        sourceSystem: normalizedSource,
        externalId,
        queued: enqueued.queued,
        duplicate: enqueued.queued ? enqueued.duplicate : false,
        processingMode: enqueued.queued ? enqueued.processingMode : 'outbox',
        metadata: input.metadata ?? {},
      } as Prisma.InputJsonValue,
      processedAt: enqueued.queued ? new Date() : undefined,
      failedAt: enqueued.queued ? undefined : new Date(),
      failureReason: enqueued.queued ? undefined : enqueued.reason,
    },
  }).catch(() => null);

  if (!enqueued.queued) {
    throw new Error(enqueued.reason);
  }

  return {
    accepted: true,
    organizationId: organization.id,
    correlationId,
    idempotencyKey,
    duplicate: enqueued.duplicate,
    processingMode: enqueued.processingMode,
    backgroundJobId: enqueued.backgroundJobId,
  };
}

export function normalizeWebhookApproval(input: UniversalWebhookInput): UniversalApprovalInput {
  const payload = input.payload ?? {};
  const approval = input.approval ?? {};
  const system = input.system ?? 'custom';
  const decision =
    approval.decision ??
    metadataString(payload, ['decision', 'approval', 'status', 'state', 'comment', 'body']) ??
    JSON.stringify(payload).slice(0, 4000);

  return {
    decision,
    source_system: approval.source_system ?? system,
    approver: approval.approver ?? metadataString(payload, ['approver', 'approver_name', 'actor', 'user', 'owner']),
    approver_email: approval.approver_email ?? metadataString(payload, ['approver_email', 'email']),
    department: approval.department ?? metadataString(payload, ['department', 'business_unit', 'team']),
    timestamp: approval.timestamp ?? metadataString(payload, ['timestamp', 'created_at', 'updated_at', 'approved_at']),
    amount: approval.amount ?? payload.amount as string | number | undefined,
    subject: approval.subject ?? metadataString(payload, ['subject', 'title', 'name', 'request_name']),
    category: approval.category ?? metadataString(payload, ['category', 'type']),
    tenant_slug: approval.tenant_slug ?? input.tenant_slug,
    metadata: {
      ...payload,
      event_type: input.event_type,
      gatewaySystem: system,
    },
  };
}

export async function ingestGatewayArtifact(input: {
  organizationSlug?: string;
  sourceSystem: string;
  artifactType: 'email' | 'csv' | 'document' | 'transcript';
  name: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const lines = input.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = lines.length > 0 ? lines.slice(0, 20) : [input.content.slice(0, 4000)];
  const results = [];

  for (const [index, line] of candidates.entries()) {
    if (!/(approv|approved|sign.?off|go ahead|proceed|reject|denied|not approved|move forward|okay|ok with)/i.test(line)) {
      continue;
    }
    const persisted = await ingestUniversalApproval({
      decision: line,
      source_system: input.sourceSystem,
      subject: input.name,
      tenant_slug: input.organizationSlug,
      metadata: {
        ...(input.metadata ?? {}),
        artifactType: input.artifactType,
        artifactName: input.name,
        lineNumber: index + 1,
      },
    }, {
      tenantSlug: input.organizationSlug,
      receivedVia: input.artifactType,
      auditAction: `gateway.${input.artifactType}.processed`,
    });
    results.push(persisted);
  }

  return results;
}

export async function buildGatewayMetrics(organizationId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [events, approvals, sources] = await Promise.all([
    prisma.event.findMany({
      where: { organizationId, type: { startsWith: 'gateway.' }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.approvalRecord.findMany({
      where: {
        organizationId,
        OR: [
          { sourcePlatform: { in: ['sap', 'oracle', 'coupa', 'workday', 'salesforce', 'hubspot', 'custom'] } },
          { sourcePlatform: { contains: 'gateway', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.approvalRecord.groupBy({
      by: ['sourcePlatform'],
      where: { organizationId },
      _count: { _all: true },
      orderBy: { _count: { sourcePlatform: 'desc' } },
      take: 12,
    }),
  ]);

  const countBy = (needle: string) => events.filter((event) => event.type.includes(needle)).length;
  return {
    apiTraffic: countBy('.api.'),
    webhookTraffic: countBy('.webhook.'),
    imports: countBy('.csv.'),
    documentsProcessed: countBy('.document.'),
    transcriptsProcessed: countBy('.transcript.'),
    recentApprovals: approvals,
    sourceBreakdown: sources,
    gatewayEmail: `approvals+${organizationId.slice(0, 8)}@approvline.ai`,
  };
}

export async function seedUniversalGatewayDemo(organizationId: string) {
  const samples: UniversalApprovalInput[] = [
    {
      source_system: 'sap',
      decision: 'Approved. Release purchase order 4500098842 for the Q3 warehouse automation project.',
      approver: 'Meera Iyer',
      approver_email: 'meera.iyer@acme.example',
      department: 'Procurement',
      amount: 185000,
      subject: 'SAP PO 4500098842',
      metadata: { demo: true, system: 'SAP S/4HANA', url: 'https://sap.example/po/4500098842' },
    },
    {
      source_system: 'oracle',
      decision: 'Approved provided legal confirms the supplier limitation of liability clause.',
      approver: 'David Chen',
      approver_email: 'david.chen@acme.example',
      department: 'Finance',
      amount: 92000,
      subject: 'Oracle supplier payment exception',
      metadata: { demo: true, system: 'Oracle Fusion', url: 'https://oracle.example/payables/AP-7742' },
    },
    {
      source_system: 'salesforce',
      decision: 'Do not move forward with the enterprise discount until CFO approval is captured.',
      approver: 'Priya Sharma',
      approver_email: 'priya.sharma@acme.example',
      department: 'Sales',
      amount: 240000,
      subject: 'Salesforce opportunity discount approval',
      metadata: { demo: true, system: 'Salesforce', url: 'https://salesforce.example/lightning/r/Opportunity/006-demo/view' },
    },
  ];

  const results = [];
  for (const sample of samples) {
    results.push(await ingestUniversalApproval(sample, {
      organizationId,
      receivedVia: 'api',
      auditAction: 'gateway.demo.seeded',
    }));
  }

  await writeAuditLog({
    organizationId,
    action: 'gateway.demo.workspace_generated',
    metadata: { demo: true, systems: samples.map((sample) => sample.source_system) },
  });

  return results;
}
