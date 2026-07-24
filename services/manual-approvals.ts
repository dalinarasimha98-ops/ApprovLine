import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type ApprovalStatus, type ApprovalType, type ManualApprovalKind, type ManualApprovalVerificationStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const manualApprovalInputSchema = z.object({
  kind: z.enum(['VERBAL', 'MANUAL']),
  subject: z.string().trim().min(3).max(240),
  outcome: z.enum(['APPROVED', 'PENDING_REVIEW', 'REJECTED']),
  approvalType: z.enum(['EXPLICIT', 'IMPLICIT', 'CONDITIONAL', 'REJECTION', 'ESCALATION']).default('EXPLICIT'),
  approverName: z.string().trim().min(2).max(160),
  approverEmail: z.string().trim().email().optional().or(z.literal('')),
  approverRole: z.string().trim().min(2).max(160),
  approvalTimestamp: z.coerce.date(),
  communicationChannel: z.string().trim().min(2).max(120),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  businessContext: z.string().trim().min(10).max(4000),
  conditions: z.string().trim().max(4000).optional().or(z.literal('')),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  category: z.string().trim().max(120).optional().or(z.literal('')),
  relatedEntityType: z.string().trim().max(80).optional().or(z.literal('')),
  relatedEntityId: z.string().trim().max(240).optional().or(z.literal('')),
  supportingNotes: z.string().trim().max(8000).optional().or(z.literal('')),
  verificationStatus: z.enum(['PENDING_CONFIRMATION', 'CONFIRMED_BY_APPROVER', 'DISPUTED', 'SUPERSEDED']).default('PENDING_CONFIRMATION'),
  confidenceLevel: z.coerce.number().int().min(0).max(100).default(50),
  secondPersonRequired: z.coerce.boolean().default(false),
  secondVerifierUserId: z.string().cuid().optional().or(z.literal('')),
  changeReason: z.string().trim().min(5).max(1000),
});

export type ManualApprovalInput = z.infer<typeof manualApprovalInputSchema>;

export function canManageManualApprovals(role: string) {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'COMPLIANCE_OFFICER';
}

export class ManualApprovalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualApprovalTransitionError';
  }
}

export function assertManualVerificationTransition(
  previous: ManualApprovalVerificationStatus | null,
  next: ManualApprovalVerificationStatus,
) {
  if (next === 'CONFIRMED_BY_APPROVER' && previous !== 'CONFIRMED_BY_APPROVER') {
    throw new ManualApprovalTransitionError(
      'Confirmed by approver can only be recorded through the secure approver confirmation workflow.',
    );
  }
}

function optional(value?: string) {
  return value?.trim() || null;
}

function snapshot(input: ManualApprovalInput, recorderUserId: string, version: number) {
  return {
    version,
    kind: input.kind,
    subject: input.subject,
    outcome: input.outcome,
    approvalType: input.approvalType,
    approverName: input.approverName,
    approverEmail: optional(input.approverEmail),
    approverRole: input.approverRole,
    approvalTimestamp: input.approvalTimestamp.toISOString(),
    communicationChannel: input.communicationChannel,
    location: optional(input.location),
    recorderUserId,
    businessContext: input.businessContext,
    conditions: optional(input.conditions),
    department: optional(input.department),
    category: optional(input.category),
    relatedEntityType: optional(input.relatedEntityType),
    relatedEntityId: optional(input.relatedEntityId),
    supportingNotes: optional(input.supportingNotes),
    verificationStatus: input.verificationStatus,
    confidenceLevel: input.confidenceLevel,
    secondPersonRequired: input.secondPersonRequired,
    secondVerifierUserId: optional(input.secondVerifierUserId),
  } satisfies Prisma.JsonObject;
}

function changedValues(before: Prisma.JsonObject, after: Prisma.JsonObject): Prisma.JsonObject {
  return Object.fromEntries(Object.entries(before).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(after[key]))) as Prisma.JsonObject;
}

export async function createManualApproval(args: {
  organizationId: string;
  actorUserId: string;
  input: ManualApprovalInput;
}) {
  const { organizationId, actorUserId, input } = args;
  assertManualVerificationTransition(null, input.verificationStatus as ManualApprovalVerificationStatus);
  const recordSnapshot = snapshot(input, actorUserId, 1);

  return prisma.$transaction(async (tx) => {
    const approval = await tx.approvalRecord.create({
      data: {
        organizationId,
        approverName: input.approverName,
        approverEmail: optional(input.approverEmail),
        subject: input.subject,
        department: optional(input.department),
        category: optional(input.category),
        approvalType: input.approvalType as ApprovalType,
        status: input.outcome as ApprovalStatus,
        confidence: input.confidenceLevel,
        riskLevel: input.verificationStatus === 'DISPUTED' ? 'high' : 'medium',
        businessImpact: input.businessContext,
        reasoning: `Recorded by an authorized user as a ${input.kind === 'VERBAL' ? 'verbal approval' : 'manual approval'}.`,
        conditions: optional(input.conditions),
        sourcePlatform: input.kind === 'VERBAL' ? 'Verbal' : 'Manual',
        sourceSystem: 'MANUAL_ENTRY',
        evidenceSnippet: optional(input.supportingNotes) ?? input.businessContext,
        approvalTimestamp: input.approvalTimestamp,
        occurredAt: input.approvalTimestamp,
      },
    });

    await tx.manualApprovalDetail.create({
      data: {
        organizationId,
        approvalRecordId: approval.id,
        kind: input.kind as ManualApprovalKind,
        approverRole: input.approverRole,
        communicationChannel: input.communicationChannel,
        location: optional(input.location),
        recorderUserId: actorUserId,
        businessContext: input.businessContext,
        relatedEntityType: optional(input.relatedEntityType),
        relatedEntityId: optional(input.relatedEntityId),
        supportingNotes: optional(input.supportingNotes),
        verificationStatus: input.verificationStatus as ManualApprovalVerificationStatus,
        confidenceLevel: input.confidenceLevel,
        secondPersonRequired: input.secondPersonRequired,
        secondVerifierUserId: optional(input.secondVerifierUserId),
      },
    });

    await tx.manualApprovalVersion.create({
      data: { organizationId, approvalRecordId: approval.id, version: 1, snapshot: recordSnapshot, changeReason: input.changeReason, actorUserId },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        approvalRecordId: approval.id,
        action: 'MANUAL_APPROVAL_CREATED',
        metadata: { provenance: input.kind, verificationStatus: input.verificationStatus, version: 1, reason: input.changeReason },
      },
    });
    return approval;
  }, { timeout: 15_000 });
}

export async function updateManualApproval(args: {
  organizationId: string;
  actorUserId: string;
  approvalId: string;
  input: ManualApprovalInput;
}) {
  const { organizationId, actorUserId, approvalId, input } = args;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.approvalRecord.findFirst({
      where: { id: approvalId, organizationId },
      include: { manualDetail: true, manualVersions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!existing?.manualDetail) throw new Error('Manual approval record not found.');
    assertManualVerificationTransition(
      existing.manualDetail.verificationStatus,
      input.verificationStatus as ManualApprovalVerificationStatus,
    );
    const nextVersion = existing.manualDetail.currentVersion + 1;
    const nextSnapshot = snapshot(input, existing.manualDetail.recorderUserId, nextVersion);
    const previousSnapshot = (existing.manualVersions[0]?.snapshot ?? {}) as Prisma.JsonObject;
    const previousValues = changedValues(previousSnapshot, nextSnapshot);
    const secondVerificationChanged =
      existing.manualDetail.secondPersonRequired !== input.secondPersonRequired
      || (existing.manualDetail.secondVerifierUserId ?? '') !== (input.secondVerifierUserId ?? '');

    await tx.approvalRecord.update({
      where: { id: approvalId },
      data: {
        approverName: input.approverName,
        approverEmail: optional(input.approverEmail),
        subject: input.subject,
        department: optional(input.department),
        category: optional(input.category),
        approvalType: input.approvalType as ApprovalType,
        status: input.outcome as ApprovalStatus,
        confidence: input.confidenceLevel,
        businessImpact: input.businessContext,
        conditions: optional(input.conditions),
        evidenceSnippet: optional(input.supportingNotes) ?? input.businessContext,
        approvalTimestamp: input.approvalTimestamp,
        occurredAt: input.approvalTimestamp,
      },
    });
    await tx.manualApprovalDetail.update({
      where: { approvalRecordId: approvalId },
      data: {
        kind: input.kind as ManualApprovalKind,
        approverRole: input.approverRole,
        communicationChannel: input.communicationChannel,
        location: optional(input.location),
        businessContext: input.businessContext,
        relatedEntityType: optional(input.relatedEntityType),
        relatedEntityId: optional(input.relatedEntityId),
        supportingNotes: optional(input.supportingNotes),
        verificationStatus: input.verificationStatus as ManualApprovalVerificationStatus,
        confidenceLevel: input.confidenceLevel,
        secondPersonRequired: input.secondPersonRequired,
        secondVerifierUserId: optional(input.secondVerifierUserId),
        ...(secondVerificationChanged
          ? { secondVerifiedAt: null, secondVerificationNote: null }
          : {}),
        currentVersion: nextVersion,
      },
    });
    await tx.manualApprovalVersion.create({
      data: { organizationId, approvalRecordId: approvalId, version: nextVersion, snapshot: nextSnapshot, previousValues, changeReason: input.changeReason, actorUserId },
    });
    await tx.auditLog.create({
      data: { organizationId, actorUserId, approvalRecordId: approvalId, action: 'MANUAL_APPROVAL_UPDATED', metadata: { version: nextVersion, reason: input.changeReason, changedFields: Object.keys(previousValues), previousValues } },
    });
    return { id: approvalId, version: nextVersion, changedFields: Object.keys(previousValues) };
  }, { timeout: 15_000 });
}

export function createConfirmationToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashConfirmationToken(token) };
}

export function hashConfirmationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function evidenceMatchScore(input: {
  approvalText: string;
  evidenceText: string;
  approvalTimestamp: Date;
  evidenceTimestamp: Date;
}) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9$]+/g, ' ').trim();
  const ignored = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'approval', 'approved']);
  const approvalTerms = new Set(normalize(input.approvalText).split(/\s+/).filter((term) => term.length > 2 && !ignored.has(term)));
  const evidenceTerms = new Set(normalize(input.evidenceText).split(/\s+/));
  const matches = [...approvalTerms].filter((term) => evidenceTerms.has(term));
  const termScore = approvalTerms.size ? Math.min(70, Math.round((matches.length / approvalTerms.size) * 70)) : 0;
  const distanceHours = Math.abs(input.approvalTimestamp.getTime() - input.evidenceTimestamp.getTime()) / 3_600_000;
  const timeScore = distanceHours <= 24 ? 30 : distanceHours <= 168 ? 20 : distanceHours <= 720 ? 10 : 0;
  return { score: Math.min(100, termScore + timeScore), reasons: [...matches.slice(0, 6).map((term) => `Matching term: ${term}`), ...(timeScore ? [`Time proximity: ${Math.round(distanceHours)} hours`] : [])] };
}
