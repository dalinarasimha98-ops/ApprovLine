import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const schema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().trim().min(3).max(2000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(5_000);
  if (!tenant.organization || !tenant.user) {
    return NextResponse.json(
      { error: 'Workspace unavailable.' },
      { status: tenant.status === 'unauthenticated' ? 401 : 503 },
    );
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a verification decision and include a note.' }, { status: 422 });
  }

  const approval = await prisma.approvalRecord.findFirst({
    where: { id, organizationId: tenant.organization.id },
    include: {
      manualDetail: true,
      manualVersions: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
  const detail = approval?.manualDetail;
  if (!detail) return NextResponse.json({ error: 'Manual approval not found.' }, { status: 404 });
  if (!detail.secondPersonRequired) {
    return NextResponse.json({ error: 'This approval does not require second-person verification.' }, { status: 409 });
  }
  const elevated = tenant.user.role === 'ADMIN' || tenant.user.role === 'COMPLIANCE_OFFICER';
  if (detail.secondVerifierUserId !== tenant.user.id && !elevated) {
    return NextResponse.json({ error: 'You are not assigned to verify this approval.' }, { status: 403 });
  }
  if (detail.recorderUserId === tenant.user.id) {
    return NextResponse.json({ error: 'The recorder cannot perform second-person verification.' }, { status: 403 });
  }
  if (detail.secondVerifiedAt || detail.secondVerificationNote) {
    return NextResponse.json({ error: 'Second-person verification has already been recorded.' }, { status: 409 });
  }

  const now = new Date();
  const nextVersion = detail.currentVersion + 1;
  const previousSnapshot = (approval.manualVersions[0]?.snapshot ?? {}) as Prisma.JsonObject;
  const nextSnapshot = {
    ...previousSnapshot,
    version: nextVersion,
    verificationStatus: parsed.data.decision === 'VERIFIED' ? detail.verificationStatus : 'DISPUTED',
    secondVerifiedAt: parsed.data.decision === 'VERIFIED' ? now.toISOString() : null,
    secondVerificationNote: parsed.data.note,
  } satisfies Prisma.JsonObject;

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.manualApprovalDetail.updateMany({
        where: {
          approvalRecordId: id,
          currentVersion: detail.currentVersion,
          secondVerifiedAt: null,
          secondVerificationNote: null,
        },
        data: parsed.data.decision === 'VERIFIED'
          ? {
              secondVerifiedAt: now,
              secondVerificationNote: parsed.data.note,
              currentVersion: nextVersion,
            }
          : {
              secondVerifiedAt: null,
              secondVerificationNote: parsed.data.note,
              verificationStatus: 'DISPUTED',
              currentVersion: nextVersion,
            },
      });
      if (claimed.count !== 1) throw new Error('SECOND_VERIFICATION_ALREADY_RECORDED');

      await tx.manualApprovalVersion.create({
        data: {
          organizationId: tenant.organization.id,
          approvalRecordId: id,
          version: nextVersion,
          snapshot: nextSnapshot,
          previousValues: {
            verificationStatus: detail.verificationStatus,
            secondVerifiedAt: detail.secondVerifiedAt?.toISOString() ?? null,
            secondVerificationNote: detail.secondVerificationNote,
          },
          changeReason: `Second-person verification ${parsed.data.decision.toLowerCase()}: ${parsed.data.note}`,
          actorUserId: tenant.user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: tenant.organization.id,
          actorUserId: tenant.user.id,
          approvalRecordId: id,
          action: `MANUAL_APPROVAL_SECOND_PERSON_${parsed.data.decision}`,
          metadata: {
            decision: parsed.data.decision,
            note: parsed.data.note,
            verifiedAt: parsed.data.decision === 'VERIFIED' ? now.toISOString() : null,
            recorderUserId: detail.recorderUserId,
            version: nextVersion,
          },
        },
      });
    }, { timeout: 15_000 });
  } catch (error) {
    if (error instanceof Error && error.message === 'SECOND_VERIFICATION_ALREADY_RECORDED') {
      return NextResponse.json({ error: 'Second-person verification has already been recorded.' }, { status: 409 });
    }
    console.error('[manual-approval] second-person verification failed', {
      approvalId: id,
      organizationId: tenant.organization.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Second-person verification could not be stored. Please try again.' }, { status: 503 });
  }

  return NextResponse.json({
    accepted: true,
    decision: parsed.data.decision,
    verifiedAt: parsed.data.decision === 'VERIFIED' ? now : null,
    version: nextVersion,
  });
}
