import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { respondToConfirmation, ConfirmationResponseError } from '@/services/manual-approvals';
import { invalidateApprovalDetailCache } from '@/services/approvalDetail';

export const dynamic = 'force-dynamic';

const schema = z.object({
  decision: z.enum(['CONFIRMED', 'REJECTED', 'CORRECTED']),
  responseNote: z.string().trim().min(3).max(2000),
  correction: z.record(z.unknown()).optional(),
});

/**
 * The authenticated, in-app counterpart to the public
 * app/api/confirmations/[token]/route.ts flow. That route exists because a
 * confirmation request is normally answered from an emailed magic link —
 * but the raw token is a bearer secret that is hashed on write and never
 * persisted in recoverable form, so an authenticated viewer looking at
 * "My Approvals" in-app has no way to answer a confirmation addressed to
 * them without it. This route closes that real gap by substituting the
 * session's own verified identity for the token: it never accepts or
 * trusts a client-supplied approverEmail/userId, only the exact
 * case-insensitive match between the authenticated session's email and the
 * PENDING ApprovalConfirmationRequest.approverEmail already stored on this
 * approval — the same exact-identity rule services/action-center.ts's
 * viewerAssignmentWhere() uses everywhere else. The actual state
 * transition reuses services/manual-approvals.ts's respondToConfirmation(),
 * the exact same function (and therefore the exact same audit actions,
 * versioning, and optimistic-locking) the token route calls — this is a
 * second entry point into one real engine, never a second engine.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(5_000);
  if (!tenant.organization || !tenant.user) {
    return NextResponse.json({ error: 'Workspace unavailable.' }, { status: tenant.status === 'unauthenticated' ? 401 : 503 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a response and include a note.' }, { status: 422 });

  const approval = await prisma.approvalRecord.findFirst({ where: { id, organizationId: tenant.organization.id } });
  if (!approval) return NextResponse.json({ error: 'Approval not found.' }, { status: 404 });

  const confirmation = await prisma.approvalConfirmationRequest.findFirst({
    where: {
      approvalRecordId: id,
      organizationId: tenant.organization.id,
      decision: 'PENDING',
      approverEmail: { equals: tenant.user.email, mode: 'insensitive' },
      expiresAt: { gte: new Date() },
    },
    orderBy: { expiresAt: 'asc' },
  });
  if (!confirmation) {
    return NextResponse.json({ error: 'You do not have a pending confirmation request for this approval.' }, { status: 403 });
  }

  let verificationStatus: string | null;
  try {
    const result = await respondToConfirmation(confirmation.id, parsed.data);
    verificationStatus = result.verificationStatus;
  } catch (error) {
    if (error instanceof ConfirmationResponseError && error.code === 'CONFIRMATION_ALREADY_RESPONDED') {
      return NextResponse.json({ error: 'A response has already been recorded.' }, { status: 409 });
    }
    if (error instanceof ConfirmationResponseError && error.code === 'MANUAL_APPROVAL_VERSION_CONFLICT') {
      return NextResponse.json({ error: 'This approval changed while the response was being stored. Please reload and try again.' }, { status: 409 });
    }
    if (error instanceof ConfirmationResponseError && error.code === 'CONFIRMATION_NOT_FOUND') {
      return NextResponse.json({ error: 'This confirmation request is no longer available.' }, { status: 404 });
    }
    console.error('[approval-confirmation] authenticated response could not be stored', {
      approvalId: id,
      confirmationId: confirmation.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'The confirmation response could not be stored. Please try again.' }, { status: 503 });
  }

  invalidateApprovalDetailCache(id);
  return NextResponse.json({ accepted: true, status: verificationStatus });
}
