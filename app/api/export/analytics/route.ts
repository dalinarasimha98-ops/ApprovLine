import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { analyticsCsv, analyticsPdf, buildExecutiveAnalytics } from '@/services/analytics';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });

  const format = request.nextUrl.searchParams.get('format') ?? 'csv';
  const demoProjection = request.nextUrl.searchParams.get('demo') === '1';
  let report;
  try {
    report = await withTimeout(
      'executive analytics export',
      buildExecutiveAnalytics(tenant.organization.id, { demoProjection }),
      8000,
    );
  } catch (error) {
    console.warn(
      '[analytics-export] report generation unavailable',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return NextResponse.json(
      { error: 'Executive analytics export is temporarily unavailable. Please retry.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': '3',
        },
      },
    );
  }

  if (format === 'pdf') {
    return new NextResponse(analyticsPdf(report), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="approvline-executive-roi-report.pdf"',
      },
    });
  }

  return new NextResponse(analyticsCsv(report), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="approvline-executive-roi-report.csv"',
    },
  });
}
