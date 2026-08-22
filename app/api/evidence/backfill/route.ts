import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { backfillUnifiedEvidenceForApproval, runEvidenceSidecar } from '@/services/evidence/pipeline';
import { invalidateUnifiedEvidenceCache } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

// Bounded per invocation so this stays well inside a serverless function's
// own timeout even under this app's demonstrated connection-pool latency
// (individual queries have taken up to ~2s under contention elsewhere in
// this codebase - see lib/env.ts's normalizeDatabaseUrlForPrisma comments).
// Idempotent: already-linked approvals are excluded from the query below on
// every call, so clicking the trigger again just processes the next batch
// until none remain - the response reports how many are left.
const BATCH_SIZE = 25;

/**
 * Self-service version of scripts/backfill-unified-evidence-from-approvals.ts
 * for organizations that don't have someone with database CLI access -
 * triggered from the "Backfill Unified Evidence" button on
 * /dashboard/approvals whenever some approvals there have no linked
 * UnifiedEvidenceRecord yet (pre-dating the fix that makes new approvals get
 * one automatically). Same underlying write logic
 * (backfillUnifiedEvidenceForApproval), same idempotency guarantee, wrapped
 * in runEvidenceSidecar per approval so one failure can't abort the batch -
 * the exact resilience gap that previously caused a demo-seed run to abort
 * partway through and leave the dashboard looking empty.
 */
export async function POST(request: Request) {
  const tenant = await getDashboardTenant(2000);

  // Submitted as a plain HTML form (see the "Backfill Unified Evidence"
  // button on /dashboard/approvals) - a full-page navigation, not fetch.
  // NextResponse.redirect() defaults to a 307, which per HTTP semantics
  // requires the browser to replay the *same method* (POST) against the
  // redirect target - and every target below is a GET-only Next.js page
  // route, so that POST would 405. Every redirect here uses the standard
  // Post/Redirect/Get status (303) instead, which tells the browser to
  // switch to GET. app/api/demo/seed/route.ts and several others had this
  // exact same latent bug - see that file's fix in this same change.
  if (tenant.status === 'unauthenticated') {
    return NextResponse.redirect(new URL('/sign-in', request.url), { status: 303 });
  }
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    return NextResponse.redirect(new URL('/onboarding', request.url), { status: 303 });
  }
  if (!tenant.organization || !tenant.user) {
    return NextResponse.redirect(new URL('/dashboard/approvals?evidenceBackfill=error', request.url), { status: 303 });
  }
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.redirect(new URL('/dashboard/approvals?evidenceBackfill=error&evidenceBackfillReason=forbidden', request.url), { status: 303 });
  }

  const organizationId = tenant.organization.id;

  try {
    const alreadyLinkedIds = new Set(
      (
        await prisma.unifiedEvidenceRecord.findMany({
          where: { organizationId, primaryApprovalId: { not: null } },
          select: { primaryApprovalId: true },
        })
      ).map((row) => row.primaryApprovalId!),
    );

    const approvals = await prisma.approvalRecord.findMany({
      where: { organizationId, id: { notIn: [...alreadyLinkedIds] } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE + 1, // +1 just to detect whether more remain after this batch
    });

    const batch = approvals.slice(0, BATCH_SIZE);
    const remaining = approvals.length > BATCH_SIZE;

    let backfilled = 0;
    let failed = 0;
    for (const approval of batch) {
      const result = await runEvidenceSidecar(
        () => prisma.$transaction((tx) => backfillUnifiedEvidenceForApproval(tx, approval)),
        'manual-backfill',
      );
      if (result === null) failed += 1;
      else backfilled += 1;
    }

    if (backfilled > 0) invalidateUnifiedEvidenceCache(organizationId);

    const url = new URL('/dashboard/approvals', request.url);
    url.searchParams.set('evidenceBackfill', failed > 0 && backfilled === 0 ? 'error' : 'success');
    url.searchParams.set('evidenceBackfillCount', String(backfilled));
    if (failed > 0) url.searchParams.set('evidenceBackfillFailed', String(failed));
    if (remaining) url.searchParams.set('evidenceBackfillRemaining', 'true');
    return NextResponse.redirect(url, { status: 303 });
  } catch (error) {
    console.error('[evidence-backfill] batch failed', error);
    return NextResponse.redirect(new URL('/dashboard/approvals?evidenceBackfill=error', request.url), { status: 303 });
  }
}
