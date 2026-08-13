import type { Prisma } from '@prisma/client';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import { toDate } from '@/lib/types/dates';

// --- Cache tag / invalidation ------------------------------------------
// One tag per approval (not per organization, unlike approvalRecordsCacheTag)
// since every fetcher below is keyed on a single approvalId - a write to one
// approval must never invalidate every other approval's cached detail page.
export function approvalDetailCacheTag(approvalId: string) {
  return `approval-detail-${approvalId}`;
}

/** Safe to call from anywhere, including the standalone worker process -
 *  never throws outside a Next.js server request scope. Mirrors
 *  lib/approvalRecords.ts's invalidateApprovalRecordsCache(). */
export function invalidateApprovalDetailCache(approvalId: string) {
  try {
    revalidateTag(approvalDetailCacheTag(approvalId));
  } catch (error) {
    console.warn(
      '[approval-detail] cache invalidation skipped (no Next.js server request scope)',
      error instanceof Error ? error.message : error,
    );
  }
}

const REVALIDATE_SECONDS = 60;

/** One quick retry on a connection-pool-shaped or timeout error, matching
 *  the retry pattern already used by lib/auth.ts and lib/approvalRecords.ts. */
async function withRetry<T>(label: string, fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  const attempt = () => withTimeout(label, fn(), timeoutMs);
  return attempt().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!isConnectionPoolError(message) && !message.includes('timed out')) throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return attempt();
  });
}

// --- Core: subject, status, reasoning, manual-approval flag ---------------
// Everything the page shell, header, action buttons, evidence/reasoning
// card, message-source card, and the decision to render ManualApprovalPanel
// at all need. Deliberately excludes auditLogs/classifierResults/
// complianceEvaluations/investigations/evidenceAssociations - those are
// fetched independently below so a slow one never blocks this from
// rendering. This is the only query the page function awaits directly.

const approvalCoreSelect = {
  id: true,
  subject: true,
  status: true,
  approvalType: true,
  confidence: true,
  riskLevel: true,
  businessImpact: true,
  reasoning: true,
  conditions: true,
  sourcePlatform: true,
  sourceLink: true,
  evidenceSnippet: true,
  approverName: true,
  approverEmail: true,
  department: true,
  category: true,
  approvalTimestamp: true,
  occurredAt: true,
  createdAt: true,
  messageSource: {
    select: { provider: true, channel: true, sender: true, senderEmail: true, receivedAt: true },
  },
  manualDetail: {
    include: {
      recorder: { select: { id: true, name: true, email: true } },
      secondVerifier: { select: { name: true, email: true } },
    },
  },
} satisfies Prisma.ApprovalRecordSelect;

export type ApprovalCore = Prisma.ApprovalRecordGetPayload<{ select: typeof approvalCoreSelect }>;

function deserializeCore(record: ApprovalCore): ApprovalCore {
  return {
    ...record,
    approvalTimestamp: toDate(record.approvalTimestamp),
    occurredAt: toDate(record.occurredAt),
    createdAt: toDate(record.createdAt),
    messageSource: record.messageSource
      ? { ...record.messageSource, receivedAt: toDate(record.messageSource.receivedAt) }
      : record.messageSource,
    manualDetail: record.manualDetail
      ? {
          ...record.manualDetail,
          createdAt: toDate(record.manualDetail.createdAt),
          updatedAt: toDate(record.manualDetail.updatedAt),
          secondVerifiedAt: toDate(record.manualDetail.secondVerifiedAt),
        }
      : record.manualDetail,
  };
}

function fetchCoreFresh(organizationId: string, approvalId: string) {
  return withRetry(
    'approval detail core',
    () => prisma.approvalRecord.findFirst({ where: { id: approvalId, organizationId }, select: approvalCoreSelect }),
    3000,
  );
}

function getCachedCoreFetcher(approvalId: string) {
  return unstable_cache(
    (organizationId: string) => fetchCoreFresh(organizationId, approvalId),
    ['approval-detail-core', approvalId],
    { revalidate: REVALIDATE_SECONDS, tags: [approvalDetailCacheTag(approvalId)] },
  );
}

/** The one query the page awaits before rendering anything. Everything else
 *  in this file is fetched in parallel, independent Suspense boundaries. */
export const getApprovalCore = cache(async (organizationId: string, approvalId: string) => {
  const record = await getCachedCoreFetcher(approvalId)(organizationId);
  return record ? deserializeCore(record) : null;
});

// --- Audit trail ------------------------------------------------------------

const auditLogSelect = {
  id: true,
  action: true,
  createdAt: true,
  metadata: true,
} satisfies Prisma.AuditLogSelect;

export type ApprovalAuditLog = Prisma.AuditLogGetPayload<{ select: typeof auditLogSelect }>;

function fetchAuditTrailFresh(organizationId: string, approvalId: string) {
  return withRetry(
    'approval detail audit trail',
    () =>
      prisma.auditLog.findMany({
        where: { organizationId, approvalRecordId: approvalId },
        select: auditLogSelect,
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    3000,
  );
}

function getCachedAuditTrailFetcher(approvalId: string) {
  return unstable_cache(
    (organizationId: string) => fetchAuditTrailFresh(organizationId, approvalId),
    ['approval-detail-audit-trail', approvalId],
    { revalidate: REVALIDATE_SECONDS, tags: [approvalDetailCacheTag(approvalId)] },
  );
}

export const getApprovalAuditTrail = cache(async (organizationId: string, approvalId: string) => {
  const logs = await getCachedAuditTrailFetcher(approvalId)(organizationId);
  return logs.map((log) => ({ ...log, createdAt: toDate(log.createdAt) }));
});

// --- Compliance evaluations --------------------------------------------------
// Note: the original query also did `include: { rule: true }` on every
// evaluation, but no page section ever reads `evaluation.rule` - only the
// denormalized `triggeredRule` string field on the evaluation itself. That
// join is dropped here as dead weight, not carried forward.

const complianceEvaluationSelect = {
  id: true,
  status: true,
  score: true,
  explanation: true,
  triggeredRule: true,
  missingApprovers: true,
  missingEvidence: true,
  createdAt: true,
} satisfies Prisma.ApprovalComplianceEvaluationSelect;

export type ApprovalComplianceEvaluationSummary = Prisma.ApprovalComplianceEvaluationGetPayload<{
  select: typeof complianceEvaluationSelect;
}>;

function fetchComplianceFresh(organizationId: string, approvalId: string) {
  return withRetry(
    'approval detail compliance evaluations',
    () =>
      prisma.approvalComplianceEvaluation.findMany({
        where: { organizationId, approvalRecordId: approvalId },
        select: complianceEvaluationSelect,
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    3000,
  );
}

function getCachedComplianceFetcher(approvalId: string) {
  return unstable_cache(
    (organizationId: string) => fetchComplianceFresh(organizationId, approvalId),
    ['approval-detail-compliance', approvalId],
    { revalidate: REVALIDATE_SECONDS, tags: [approvalDetailCacheTag(approvalId)] },
  );
}

export const getApprovalComplianceEvaluations = cache(async (organizationId: string, approvalId: string) => {
  const evaluations = await getCachedComplianceFetcher(approvalId)(organizationId);
  return evaluations.map((evaluation) => ({ ...evaluation, createdAt: toDate(evaluation.createdAt) }));
});

// --- Classifier history -------------------------------------------------

const classifierResultSelect = {
  id: true,
  model: true,
  confidence: true,
  promptVersion: true,
  createdAt: true,
  normalizedJson: true,
} satisfies Prisma.ClassifierResultSelect;

export type ApprovalClassifierResult = Prisma.ClassifierResultGetPayload<{ select: typeof classifierResultSelect }>;

function fetchClassifierResultsFresh(organizationId: string, approvalId: string) {
  return withRetry(
    'approval detail classifier results',
    () =>
      prisma.classifierResult.findMany({
        where: { organizationId, approvalRecordId: approvalId },
        select: classifierResultSelect,
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    3000,
  );
}

function getCachedClassifierResultsFetcher(approvalId: string) {
  return unstable_cache(
    (organizationId: string) => fetchClassifierResultsFresh(organizationId, approvalId),
    ['approval-detail-classifier', approvalId],
    { revalidate: REVALIDATE_SECONDS, tags: [approvalDetailCacheTag(approvalId)] },
  );
}

export const getApprovalClassifierResults = cache(async (organizationId: string, approvalId: string) => {
  const results = await getCachedClassifierResultsFetcher(approvalId)(organizationId);
  return results.map((result) => ({ ...result, createdAt: toDate(result.createdAt) }));
});

// --- Related records: investigations + memory graph entity -----------------
// Combined into one fetch since they render together in the "Related
// Records" section of the page.

async function fetchRelatedRecordsFresh(organizationId: string, approvalId: string, subject: string) {
  return withRetry(
    'approval detail related records',
    () =>
      Promise.all([
        prisma.investigationApproval.findMany({
          where: { approvalRecordId: approvalId, investigation: { organizationId } },
          select: { investigation: { select: { id: true, title: true, status: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.memoryEntity.findFirst({
          where: {
            organizationId,
            OR: [{ externalId: approvalId }, { title: { equals: subject, mode: 'insensitive' } }],
          },
          select: { id: true },
        }),
      ]),
    3000,
  );
}

function getCachedRelatedRecordsFetcher(approvalId: string) {
  return unstable_cache(
    (organizationId: string, subject: string) => fetchRelatedRecordsFresh(organizationId, approvalId, subject),
    ['approval-detail-related', approvalId],
    { revalidate: REVALIDATE_SECONDS, tags: [approvalDetailCacheTag(approvalId)] },
  );
}

export const getApprovalRelatedRecords = cache(async (organizationId: string, approvalId: string, subject: string) => {
  const [investigations, memoryEntity] = await getCachedRelatedRecordsFetcher(approvalId)(organizationId, subject);
  return { investigations: investigations.map((item) => item.investigation), memoryEntity };
});

// --- Manual-approval bundle: evidence, versions, confirmations -------------
// Only ever fetched when ApprovalCore.manualDetail is present - the page
// skips this Suspense boundary entirely for non-manual approvals, which are
// the majority.

const manualEvidenceSelect = {
  id: true,
  origin: true,
  status: true,
  confidence: true,
  matchingReasons: true,
  sourceTimestamp: true,
  rejectionReason: true,
  messageSource: {
    select: { provider: true, channel: true, sender: true, senderEmail: true, rawPayload: true, receivedAt: true },
  },
} satisfies Prisma.ApprovalEvidenceAssociationSelect;

const manualVersionSelect = {
  id: true,
  version: true,
  changeReason: true,
  createdAt: true,
  previousValues: true,
  actorUser: { select: { name: true, email: true } },
} satisfies Prisma.ManualApprovalVersionSelect;

const confirmationRequestSelect = {
  id: true,
  approverEmail: true,
  decision: true,
  createdAt: true,
  respondedAt: true,
  responseNote: true,
  requestedByUser: { select: { name: true, email: true } },
} satisfies Prisma.ApprovalConfirmationRequestSelect;

function fetchManualBundleFresh(organizationId: string, approvalId: string) {
  return withRetry(
    'approval detail manual bundle',
    () =>
      Promise.all([
        prisma.approvalEvidenceAssociation.findMany({
          where: { organizationId, approvalRecordId: approvalId },
          select: manualEvidenceSelect,
          orderBy: { sourceTimestamp: 'asc' },
          take: 50,
        }),
        prisma.manualApprovalVersion.findMany({
          where: { organizationId, approvalRecordId: approvalId },
          select: manualVersionSelect,
          orderBy: { version: 'desc' },
          take: 10,
        }),
        prisma.approvalConfirmationRequest.findMany({
          where: { organizationId, approvalRecordId: approvalId },
          select: confirmationRequestSelect,
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]),
    3500,
  );
}

function getCachedManualBundleFetcher(approvalId: string) {
  return unstable_cache(
    (organizationId: string) => fetchManualBundleFresh(organizationId, approvalId),
    ['approval-detail-manual-bundle', approvalId],
    { revalidate: REVALIDATE_SECONDS, tags: [approvalDetailCacheTag(approvalId)] },
  );
}

export const getApprovalManualBundle = cache(async (organizationId: string, approvalId: string) => {
  const [evidence, versions, confirmations] = await getCachedManualBundleFetcher(approvalId)(organizationId);
  return {
    evidence: evidence.map((item) => ({
      ...item,
      sourceTimestamp: toDate(item.sourceTimestamp),
      messageSource: { ...item.messageSource, receivedAt: toDate(item.messageSource.receivedAt) },
    })),
    versions: versions.map((version) => ({ ...version, createdAt: toDate(version.createdAt) })),
    confirmations: confirmations.map((confirmation) => ({
      ...confirmation,
      createdAt: toDate(confirmation.createdAt),
      respondedAt: toDate(confirmation.respondedAt),
    })),
  };
});
