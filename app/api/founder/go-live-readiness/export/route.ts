import { NextResponse } from 'next/server';
import { getFounderAccess } from '@/services/founder';
import { buildGoLiveReadinessPortfolio, goLiveReadinessCsv } from '@/services/founder-go-live-readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await getFounderAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === 'unauthenticated' ? 401 : 403 });
  }
  if (access.readOnly) {
    return NextResponse.json({ error: 'founder_admin_required' }, { status: 403 });
  }

  const result = await buildGoLiveReadinessPortfolio();
  const body = goLiveReadinessCsv(result.data.rows);

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="approvline-go-live-readiness.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
