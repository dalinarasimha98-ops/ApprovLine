import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import { withTimeout } from '@/lib/performance';
import { toDate } from '@/lib/types/dates';
import { writeAuditLog } from '@/services/audit';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { buildGatewayIdempotencyKey, createCorrelationId } from '@/services/queue/reliability';
import type { ApprovalCategory } from '@/types/classifier';

// --- Cache tag / invalidation ------------------------------------------
export function gatewayMetricsCacheTag(organizationId: string) {
  return `gateway-metrics-${organizationId}`;
}

/** Safe to call from anywhere - never throws outside a Next.js server request scope. */
export function invalidateGatewayMetricsCache(organizationId: string) {
  try {
    revalidateTag(gatewayMetricsCacheTag(organizationId));
  } catch (error) {
    console.warn('[gateway] cache invalidation skipped (no Next.js server request scope)', error instanceof Error ? error.message : error);
  }
}

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
    providerKey: normalizedSource,
    providerEventType: `${options?.receivedVia ?? 'api'}.approval.received`,
    externalId,
    objectType: options?.receivedVia === 'document'
      ? 'document'
      : options?.receivedVia === 'transcript'
        ? 'transcript'
        : 'approval',
    objectId: externalId,
    threadId: metadataString(input.metadata, ['thread_id', 'conversation_id', 'case_id']),
    parentId: metadataString(input.metadata, ['parent_id', 'request_id']),
    relatedIds: [
      metadataString(input.metadata, ['contract_id']),
      metadataString(input.metadata, ['ticket_id']),
      metadataString(input.metadata, ['project_id']),
      metadataString(input.metadata, ['vendor_id']),
    ].filter((value): value is string => Boolean(value)),
    participants: input.approver || input.approver_email
      ? [{ name: input.approver, email: input.approver_email, role: 'approver' }]
      : [],
    links: sourceLink ? [{ type: 'source', name: input.source_system, url: sourceLink }] : [],
    metadata: {
      gateway: true,
      receivedVia: options?.receivedVia ?? 'api',
      sourceSystem: normalizedSource,
      amount: input.amount,
      department: input.department,
      category: normalizeCategory(input.category),
      subject: input.subject,
      ...(input.metadata ?? {}),
    },
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

  invalidateGatewayMetricsCache(organization.id);

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

const gatewayApprovalSelect = {
  id: true,
  subject: true,
  sourcePlatform: true,
  department: true,
  approverName: true,
  confidence: true,
  createdAt: true,
} satisfies Prisma.ApprovalRecordSelect;

type GatewayMetricsFresh = {
  apiTraffic: number;
  webhookTraffic: number;
  imports: number;
  documentsProcessed: number;
  transcriptsProcessed: number;
  recentApprovals: Prisma.ApprovalRecordGetPayload<{ select: typeof gatewayApprovalSelect }>[];
  gatewayEmail: string;
};

function sleepGateway(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Circuit breaker -----------------------------------------------------
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveGatewayFailures = 0;
let gatewayBreakerOpenUntil = 0;

function isGatewayBreakerOpen() {
  return Date.now() < gatewayBreakerOpenUntil;
}

function recordGatewaySuccess() {
  consecutiveGatewayFailures = 0;
  gatewayBreakerOpenUntil = 0;
}

function recordGatewayFailure() {
  consecutiveGatewayFailures += 1;
  if (consecutiveGatewayFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    gatewayBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

class GatewayMetricsCircuitOpenError extends Error {
  constructor() {
    super('Gateway metrics lookup is temporarily paused after repeated database failures.');
    this.name = 'GatewayMetricsCircuitOpenError';
  }
}

const GATEWAY_QUERY_TIMEOUT_MS = 3000;
const GATEWAY_TOTAL_FETCH_TIMEOUT_MS = 5000;
const GATEWAY_REVALIDATE_SECONDS = 120;
const GATEWAY_STALE_CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchGatewayMetricsFresh(organizationId: string): Promise<GatewayMetricsFresh> {
  if (isGatewayBreakerOpen()) {
    throw new GatewayMetricsCircuitOpenError();
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // sourceBreakdown (an approvalRecord.groupBy) was computed here but never
  // read anywhere in the app - dropped rather than cached, since the
  // cheapest query is the one you don't run.
  const attempt = () =>
    Promise.all([
      withTimeout(
        'gateway:events',
        prisma.event.findMany({
          where: { organizationId, type: { startsWith: 'gateway.' }, createdAt: { gte: since } },
          select: { type: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        GATEWAY_QUERY_TIMEOUT_MS,
      ),
      withTimeout(
        'gateway:recentApprovals',
        prisma.approvalRecord.findMany({
          where: {
            organizationId,
            OR: [
              { sourcePlatform: { in: ['sap', 'oracle', 'coupa', 'workday', 'salesforce', 'hubspot', 'custom'] } },
              { sourcePlatform: { contains: 'gateway', mode: 'insensitive' } },
            ],
          },
          select: gatewayApprovalSelect,
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
        GATEWAY_QUERY_TIMEOUT_MS,
      ),
    ]);

  try {
    // One quick retry on a connection-pool-shaped error.
    const [events, approvals] = await attempt().catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
      await sleepGateway(300);
      return attempt();
    });

    recordGatewaySuccess();
    const countBy = (needle: string) => events.filter((event) => event.type.includes(needle)).length;
    return {
      apiTraffic: countBy('.api.'),
      webhookTraffic: countBy('.webhook.'),
      imports: countBy('.csv.'),
      documentsProcessed: countBy('.document.'),
      transcriptsProcessed: countBy('.transcript.'),
      recentApprovals: approvals,
      gatewayEmail: `approvals+${organizationId.slice(0, 8)}@approvline.ai`,
    };
  } catch (error) {
    recordGatewayFailure();
    throw error;
  }
}

/**
 * Cross-request cache - the same fix already applied to every other
 * timeout fixed this session: previously every page load hit Postgres
 * directly with zero shared caching, and a single slow query immediately
 * showed the "warming up" banner and hid the entire metrics section.
 */
function getCachedGatewayMetricsFetcher(organizationId: string) {
  return unstable_cache(
    () => fetchGatewayMetricsFresh(organizationId),
    ['gateway-metrics', organizationId],
    { revalidate: GATEWAY_REVALIDATE_SECONDS, tags: [gatewayMetricsCacheTag(organizationId)] },
  );
}

/**
 * unstable_cache serializes its return value to JSON - each approval's
 * createdAt comes back as an ISO string on a cache hit. Applied
 * unconditionally, matching the fix already applied everywhere else this
 * session.
 */
function deserializeGatewayMetrics(metrics: GatewayMetricsFresh): GatewayMetricsFresh {
  return {
    ...metrics,
    recentApprovals: metrics.recentApprovals.map((approval) => ({ ...approval, createdAt: toDate(approval.createdAt) })),
  };
}

// Per-request dedup on top of the cross-request cache above.
const getGatewayMetricsForRequest = cache(async (organizationId: string) => {
  const metrics = await getCachedGatewayMetricsFetcher(organizationId)();
  return deserializeGatewayMetrics(metrics);
});

// --- Tier-2 "last known good" store --------------------------------------
type LastGoodEntry = { metrics: GatewayMetricsFresh; cachedAt: number };
const globalForGateway = globalThis as unknown as {
  approvlineGatewayLastGood?: Map<string, LastGoodEntry>;
};

function lastGoodStore() {
  globalForGateway.approvlineGatewayLastGood ??= new Map();
  return globalForGateway.approvlineGatewayLastGood;
}

export async function buildGatewayMetrics(organizationId: string): Promise<
  GatewayMetricsFresh & { degraded: boolean; alert: boolean; staleAsOfMs?: number; message?: string }
> {
  try {
    const metrics = await withTimeout('gateway metrics (total)', getGatewayMetricsForRequest(organizationId), GATEWAY_TOTAL_FETCH_TIMEOUT_MS);
    lastGoodStore().set(organizationId, { metrics, cachedAt: Date.now() });
    return { ...metrics, degraded: false, alert: false };
  } catch (error) {
    console.error('[gateway] metrics fetch failed', error);

    // The degraded banner is reserved for a database that has actually
    // been unreachable for 3+ consecutive attempts (breaker open) - a
    // single slow query must never alarm the user.
    const alert = isGatewayBreakerOpen();

    const lastGood = lastGoodStore().get(organizationId);
    if (lastGood && Date.now() - lastGood.cachedAt < GATEWAY_STALE_CACHE_TTL_MS) {
      return {
        ...lastGood.metrics,
        degraded: alert,
        alert,
        staleAsOfMs: lastGood.cachedAt,
        message: alert ? 'Live database results are delayed, so recently loaded gateway metrics are shown instead.' : undefined,
      };
    }

    return {
      apiTraffic: 0,
      webhookTraffic: 0,
      imports: 0,
      documentsProcessed: 0,
      transcriptsProcessed: 0,
      recentApprovals: [],
      gatewayEmail: `approvals+${organizationId.slice(0, 8)}@approvline.ai`,
      degraded: true,
      alert,
      message: alert
        ? 'Gateway metrics are temporarily unavailable. The gateway stays available even though analytics are delayed.'
        : 'Gateway metrics are loading. Retrying automatically.',
    };
  }
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
