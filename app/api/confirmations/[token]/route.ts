import { z } from 'zod';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashConfirmationToken } from '@/services/manual-approvals';

export const dynamic = 'force-dynamic';
const responseSchema = z.object({ decision: z.enum(['CONFIRMED', 'REJECTED', 'CORRECTED']), responseNote: z.string().trim().min(3).max(2000), correction: z.record(z.unknown()).optional() });

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const confirmation = await prisma.approvalConfirmationRequest.findUnique({ where: { tokenHash: hashConfirmationToken(token) }, include: { approvalRecord: { include: { manualDetail: true } } } });
  if (!confirmation || confirmation.expiresAt < new Date()) return NextResponse.json({ error: 'This confirmation link is invalid or expired.' }, { status: 404 });
  return NextResponse.json({ subject: confirmation.approvalRecord.subject, approverName: confirmation.approverName, decision: confirmation.decision, expiresAt: confirmation.expiresAt, conditions: confirmation.approvalRecord.conditions, approvalTimestamp: confirmation.approvalRecord.approvalTimestamp, recorderContext: confirmation.approvalRecord.manualDetail?.businessContext });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = responseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a response and include a note.' }, { status: 422 });
  const confirmation = await prisma.approvalConfirmationRequest.findUnique({
    where: { tokenHash: hashConfirmationToken(token) },
    include: {
      approvalRecord: {
        include: {
          manualDetail: true,
          manualVersions: { orderBy: { version: 'desc' }, take: 1 },
        },
      },
    },
  });
  if (!confirmation || confirmation.expiresAt < new Date()) return NextResponse.json({ error: 'This confirmation link is invalid or expired.' }, { status: 404 });
  if (confirmation.decision !== 'PENDING') return NextResponse.json({ error: 'A response has already been recorded.' }, { status: 409 });
  const now = new Date();
  const verificationStatus = parsed.data.decision === 'CONFIRMED' ? 'CONFIRMED_BY_APPROVER' : 'DISPUTED';
  const correction = parsed.data.correction
    ? (JSON.parse(JSON.stringify(parsed.data.correction)) as Prisma.InputJsonValue)
    : Prisma.JsonNull;
  const immutableResponse = {
    decision: parsed.data.decision,
    responseNote: parsed.data.responseNote,
    correction: parsed.data.correction ?? null,
    respondedAt: now.toISOString(),
    approverEmail: confirmation.approverEmail,
  } as Prisma.InputJsonObject;
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.approvalConfirmationRequest.updateMany({
        where: { id: confirmation.id, decision: 'PENDING' },
        data: { decision: parsed.data.decision, respondedAt: now, responseNote: parsed.data.responseNote, correction, immutableResponse },
      });
      if (claimed.count !== 1) throw new Error('CONFIRMATION_ALREADY_RESPONDED');
      const detail = confirmation.approvalRecord.manualDetail;
      let nextVersion: number | null = null;
      if (detail) {
        nextVersion = detail.currentVersion + 1;
        const previousSnapshot = (confirmation.approvalRecord.manualVersions[0]?.snapshot ?? {}) as Prisma.JsonObject;
        const confirmationSnapshot = JSON.parse(JSON.stringify(immutableResponse)) as Prisma.JsonObject;
        const nextSnapshot = {
          ...previousSnapshot,
          version: nextVersion,
          verificationStatus,
          approverConfirmation: confirmationSnapshot,
        } satisfies Prisma.JsonObject;
        const updated = await tx.manualApprovalDetail.updateMany({
          where: { approvalRecordId: confirmation.approvalRecordId, currentVersion: detail.currentVersion },
          data: { verificationStatus, currentVersion: nextVersion },
        });
        if (updated.count !== 1) throw new Error('MANUAL_APPROVAL_VERSION_CONFLICT');
        await tx.manualApprovalVersion.create({
          data: {
            organizationId: confirmation.organizationId,
            approvalRecordId: confirmation.approvalRecordId,
            version: nextVersion,
            snapshot: nextSnapshot,
            previousValues: { verificationStatus: detail.verificationStatus },
            changeReason: `Approver ${parsed.data.decision.toLowerCase()}: ${parsed.data.responseNote}`,
            actorUserId: confirmation.requestedByUserId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: confirmation.organizationId,
          approvalRecordId: confirmation.approvalRecordId,
          action: `APPROVER_CONFIRMATION_${parsed.data.decision}`,
          metadata: { ...immutableResponse, version: nextVersion },
        },
      });
    }, { timeout: 15_000 });
  } catch (error) {
    if (error instanceof Error && error.message === 'CONFIRMATION_ALREADY_RESPONDED') {
      return NextResponse.json({ error: 'A response has already been recorded.' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'MANUAL_APPROVAL_VERSION_CONFLICT') {
      return NextResponse.json({ error: 'This approval changed while the response was being stored. Please reload the confirmation link.' }, { status: 409 });
    }
    console.error('[approval-confirmation] response could not be stored', {
      confirmationId: confirmation.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'The confirmation response could not be stored. Please try again.' }, { status: 503 });
  }
  return NextResponse.json({ accepted: true, status: verificationStatus });
}
