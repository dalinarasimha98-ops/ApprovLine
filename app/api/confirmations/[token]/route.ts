import { z } from 'zod';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashConfirmationToken, respondToConfirmation, ConfirmationResponseError } from '@/services/manual-approvals';
import { invalidateApprovalDetailCache } from '@/services/approvalDetail';

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
  const confirmation = await prisma.approvalConfirmationRequest.findUnique({ where: { tokenHash: hashConfirmationToken(token) } });
  if (!confirmation || confirmation.expiresAt < new Date()) return NextResponse.json({ error: 'This confirmation link is invalid or expired.' }, { status: 404 });
  if (confirmation.decision !== 'PENDING') return NextResponse.json({ error: 'A response has already been recorded.' }, { status: 409 });

  let verificationStatus: string | null;
  try {
    const result = await respondToConfirmation(confirmation.id, parsed.data);
    verificationStatus = result.verificationStatus;
  } catch (error) {
    if (error instanceof ConfirmationResponseError && error.code === 'CONFIRMATION_ALREADY_RESPONDED') {
      return NextResponse.json({ error: 'A response has already been recorded.' }, { status: 409 });
    }
    if (error instanceof ConfirmationResponseError && error.code === 'MANUAL_APPROVAL_VERSION_CONFLICT') {
      return NextResponse.json({ error: 'This approval changed while the response was being stored. Please reload the confirmation link.' }, { status: 409 });
    }
    if (error instanceof ConfirmationResponseError && error.code === 'CONFIRMATION_NOT_FOUND') {
      return NextResponse.json({ error: 'This confirmation link is invalid or expired.' }, { status: 404 });
    }
    console.error('[approval-confirmation] response could not be stored', {
      confirmationId: confirmation.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'The confirmation response could not be stored. Please try again.' }, { status: 503 });
  }
  invalidateApprovalDetailCache(confirmation.approvalRecordId);
  return NextResponse.json({ accepted: true, status: verificationStatus });
}
