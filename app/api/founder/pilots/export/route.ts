import { NextRequest, NextResponse } from 'next/server';
import { getFounderAccess } from '@/services/founder';
import { exportFounderPilots } from '@/services/founder-pilots';

export const dynamic = 'force-dynamic';

function filename(format: 'csv' | 'pdf', customerAccountId?: string | null) {
  return customerAccountId ? `approvline-pilot-${customerAccountId}.${format}` : `approvline-pilot-command-center.${format}`;
}

export async function GET(request: NextRequest) {
  const access = await getFounderAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === 'unauthenticated' ? 401 : 403 });
  }
  if (access.readOnly) {
    return NextResponse.json({ error: 'founder_admin_required' }, { status: 403 });
  }

  const format = request.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv';
  const customerAccountId = request.nextUrl.searchParams.get('customerAccountId');
  const body = await exportFounderPilots(format, customerAccountId ?? undefined);

  return new NextResponse(body, {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename(format, customerAccountId)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
