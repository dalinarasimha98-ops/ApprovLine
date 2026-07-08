import { NextRequest, NextResponse } from 'next/server';
import { exportFounderAuditLogs, getFounderAccess } from '@/services/founder';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await getFounderAccess();
  if (!access.ok) return NextResponse.json({ error: 'founder_access_required' }, { status: access.reason === 'unauthenticated' ? 401 : 403 });

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get('format') === 'json' ? 'json' : 'csv';
  const body = await exportFounderAuditLogs({
    q: searchParams.get('q') ?? undefined,
    customerAccountId: searchParams.get('customerAccountId') ?? undefined,
    actor: searchParams.get('actor') ?? undefined,
    action: searchParams.get('action') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  }, format);

  return new NextResponse(body, {
    headers: {
      'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="approvline-founder-audit.${format}"`,
    },
  });
}
