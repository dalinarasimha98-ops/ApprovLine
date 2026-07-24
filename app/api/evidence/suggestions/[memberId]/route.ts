import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import { reviewEvidenceSuggestion } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

const reviewSchema = z.object({
  decision: z.enum(['VERIFY', 'REJECT']),
  reason: z.string().trim().min(3).max(1000).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  const access = await requireEvidenceAccess('write');
  if (!access.ok) return access.response;
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Review decision is invalid.' }, { status: 422 });
  }
  const { memberId } = await context.params;
  try {
    const member = await reviewEvidenceSuggestion({
      organizationId: access.organization.id,
      memberId,
      reviewerUserId: access.user.id,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ member });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evidence review failed.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
