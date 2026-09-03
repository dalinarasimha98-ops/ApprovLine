import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { getCoreAnalytics, generateAIInsights, type DateRange } from '@/services/analytics';
import { hasAnyRole } from '@/lib/rbac';
import { withTimeout } from '@/lib/performance';
import { EntitlementDeniedError, requireEntitlement } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/kpis
 * Returns KPI data for the executive analytics dashboard.
 * Accepts: from, to, prevFrom, prevTo, department, riskLevel
 * Role gate: ADMIN | OWNER
 */
export async function GET(request: NextRequest) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tenant.organization || !tenant.user) {
    return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });
  }
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Your workspace role cannot access analytics.' }, { status: 403 });
  }
  try {
    await requireEntitlement(tenant.organization.id, 'executive_roi');
  } catch (err) {
    if (err instanceof EntitlementDeniedError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const fromStr = params.get('from');
  const toStr = params.get('to');
  const prevFromStr = params.get('prevFrom');
  const prevToStr = params.get('prevTo');

  const dateRange: DateRange | undefined =
    fromStr && toStr
      ? { from: new Date(fromStr), to: new Date(toStr) }
      : undefined;

  const prevDateRange: DateRange | undefined =
    prevFromStr && prevToStr
      ? { from: new Date(prevFromStr), to: new Date(prevToStr) }
      : undefined;

  let analytics;
  try {
    analytics = await withTimeout(
      'analytics kpis api',
      getCoreAnalytics(tenant.organization.id, { dateRange, prevDateRange }),
      6000,
    );
  } catch (error) {
    console.warn('[analytics/kpis] fetch failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: 'Analytics data is temporarily unavailable. Please retry.' },
      { status: 503, headers: { 'Retry-After': '3' } },
    );
  }

  const insights = generateAIInsights(analytics);

  return NextResponse.json(
    {
      kpis: {
        total: analytics.approvals.total,
        approved: analytics.complianceReadiness.approvalTraceability,
        highRisk: analytics.riskReduction.highRiskApprovalsDetected,
        evidenceCoverage: analytics.evidenceCoverage,
        complianceScore: analytics.complianceScore,
        avgApprovalTimeHours: analytics.avgApprovalTimeHours,
        totalValue: analytics.totalValue,
        timeSaved: analytics.timeSaved.totalHours,
      },
      timeSeries: analytics.timeSeries,
      departments: analytics.departmentBreakdown,
      connectors: analytics.connectorActivity,
      investigations: analytics.investigationMetrics,
      prevPeriod: analytics.prevPeriod,
      insights,
      generatedAt: analytics.generatedAt,
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    },
  );
}
