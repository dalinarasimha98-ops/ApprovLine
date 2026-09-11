import { NextResponse } from 'next/server';
import { getFounderAccess } from '@/services/founder';
import { buildFeatureManagementPortfolio, featureManagementCsv } from '@/services/founder-features';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await getFounderAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === 'unauthenticated' ? 401 : 403 });
  }
  if (access.readOnly) {
    return NextResponse.json({ error: 'founder_admin_required' }, { status: 403 });
  }

  const result = await buildFeatureManagementPortfolio();
  const body = featureManagementCsv(result.data.features);

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="approvline-feature-management.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
