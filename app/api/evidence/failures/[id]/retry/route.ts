import { NextResponse } from 'next/server';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import { retryEvidenceFailure } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireEvidenceAccess('manage');
  if (!access.ok) return access.response;
  const { id } = await context.params;
  try {
    const result = await retryEvidenceFailure({
      organizationId: access.organization.id,
      failureId: id,
      actorUserId: access.user.id,
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evidence retry failed.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
