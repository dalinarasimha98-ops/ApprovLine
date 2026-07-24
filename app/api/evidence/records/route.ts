import { NextResponse } from 'next/server';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import { searchUnifiedEvidence } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireEvidenceAccess('read');
  if (!access.ok) return access.response;

  const params = new URL(request.url).searchParams;
  try {
    const result = await searchUnifiedEvidence({
      organizationId: access.organization.id,
      query: params.get('query') ?? undefined,
      providerKey: params.get('provider') ?? undefined,
      riskLevel: params.get('risk') ?? undefined,
      page: Number(params.get('page') ?? 1),
      pageSize: Number(params.get('pageSize') ?? 25),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[evidence-api] record search failed', error);
    return NextResponse.json(
      { error: 'Unified evidence records could not be loaded.' },
      { status: 500 },
    );
  }
}
