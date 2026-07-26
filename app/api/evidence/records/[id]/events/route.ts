import { NextResponse } from 'next/server';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import { getUnifiedEvidenceEventPage } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireEvidenceAccess('read');
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor');
  const requestedLimit = Number(searchParams.get('limit') ?? 40);

  try {
    const result = await getUnifiedEvidenceEventPage({
      organizationId: access.organization.id,
      recordId: id,
      cursor,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 40,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[evidence-api] timeline page failed', {
      recordId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'The next evidence timeline page could not be loaded.' },
      { status: 500 },
    );
  }
}
