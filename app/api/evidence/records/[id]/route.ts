import { NextResponse } from 'next/server';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import { getUnifiedEvidenceDetail } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireEvidenceAccess('read');
  if (!access.ok) return access.response;

  const { id } = await context.params;
  try {
    const record = await getUnifiedEvidenceDetail(access.organization.id, id);
    if (!record) {
      return NextResponse.json({ error: 'Evidence record not found.' }, { status: 404 });
    }
    return NextResponse.json({ record });
  } catch (error) {
    console.error('[evidence-api] record detail failed', error);
    return NextResponse.json(
      { error: 'The unified evidence record could not be loaded.' },
      { status: 500 },
    );
  }
}
