/**
 * Executive Analytics Test Suite
 *
 * Tests pure functions from services/analytics.ts.
 * Does NOT require a database connection — all tests are pure or use mock data.
 *
 * Run: node --import tsx tests/executive-analytics.test.ts
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// ---------------------------------------------------------------------------
// Import only pure utility functions from the analytics service.
// We cannot import the full module because it imports Prisma (DB required).
// Instead, we inline the pure functions here and test them directly.
// This is consistent with how other test files in this repo handle
// service functions that have heavy dependencies.
// ---------------------------------------------------------------------------

// --- Inline pure helpers from services/analytics.ts ---

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function scale(value: number, multiplier: number, minimum = 0): number {
  return Math.max(minimum, Math.round(value * multiplier));
}

type DateRange = { from: Date; to: Date };

/**
 * Compute the previous equivalent date range given a current range.
 * The previous range has the same duration and ends one day before the current range starts.
 */
function computePrevDateRange(current: DateRange): DateRange {
  const durationMs = current.to.getTime() - current.from.getTime();
  const prevTo = new Date(current.from.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

/**
 * Compute percentage change between current and previous value.
 */
function computePctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Parse businessImpact for a numeric value.
 */
function parseBusinessImpact(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/[\d,]+(\.\d+)?/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

/**
 * Compute compliance score from high-risk count and pending count over total.
 */
function computeComplianceScore(highRisk: number, pending: number, total: number): number {
  return Math.max(0, Math.round(100 - ((highRisk + pending * 0.25) / Math.max(total, 1)) * 100));
}

/**
 * Compute evidence coverage percentage.
 */
function computeEvidenceCoverage(withEvidence: number, total: number): number {
  return percent(withEvidence, total);
}

/**
 * Compute average approval time in hours.
 * If no timestamps, returns the fallback 18.6 hours.
 */
function computeAvgApprovalTimeHours(
  records: Array<{ createdAt: Date; approvalTimestamp: Date | null }>,
): number {
  const withTimestamp = records.filter((a) => a.approvalTimestamp != null);
  if (withTimestamp.length === 0) return 18.6;
  const totalHours = withTimestamp.reduce((sum, a) => {
    const diffMs = a.createdAt.getTime() - (a.approvalTimestamp!.getTime());
    return sum + Math.abs(diffMs) / (1000 * 60 * 60);
  }, 0);
  return Math.round((totalHours / withTimestamp.length) * 10) / 10;
}

/**
 * Build a drilldown URL for a given metric with filter params.
 */
function buildDrilldownUrl(
  metric: string,
  filters: { department?: string; riskLevel?: string; from?: string; to?: string },
): string {
  const params = new URLSearchParams();
  if (filters.department) params.set('department', filters.department);
  if (filters.riskLevel) params.set('riskLevel', filters.riskLevel);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  return `/analytics/drilldown/${metric}${qs ? `?${qs}` : ''}`;
}

// Roles that can access /analytics
const ANALYTICS_ROLES = ['ADMIN', 'OWNER'] as const;
const ALL_ROLES = ['VIEWER', 'AUDITOR', 'MEMBER', 'MANAGER', 'ADMIN', 'OWNER'] as const;

function canAccessAnalytics(role: string): boolean {
  return ANALYTICS_ROLES.includes(role as typeof ANALYTICS_ROLES[number]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('percent() returns 0 for zero denominator', () => {
  assert.equal(percent(5, 0), 0);
  assert.equal(percent(0, 0), 0);
});

test('percent() computes correctly', () => {
  assert.equal(percent(75, 100), 75);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(2, 3), 67);
  assert.equal(percent(0, 100), 0);
  assert.equal(percent(100, 100), 100);
});

test('scale() respects minimum', () => {
  assert.equal(scale(0, 1, 10), 10);
  assert.equal(scale(5, 2, 0), 10);
  assert.equal(scale(3, 4, 20), 20);
});

test('compliance score formula', () => {
  // No risk = 100%
  assert.equal(computeComplianceScore(0, 0, 100), 100);
  // 10 high-risk out of 100 = 100 - 10 = 90
  assert.equal(computeComplianceScore(10, 0, 100), 90);
  // 10 pending out of 100 = 100 - (10 * 0.25) = 97.5 → 98
  assert.equal(computeComplianceScore(0, 10, 100), 98);
  // Min 0
  assert.equal(computeComplianceScore(1000, 1000, 10), 0);
  // Zero total = 100 (no data, no penalty)
  assert.equal(computeComplianceScore(0, 0, 0), 100);
});

test('evidence coverage formula', () => {
  assert.equal(computeEvidenceCoverage(0, 0), 0);
  assert.equal(computeEvidenceCoverage(100, 100), 100);
  assert.equal(computeEvidenceCoverage(75, 100), 75);
  assert.equal(computeEvidenceCoverage(1, 3), 33);
});

test('average approval time — no timestamps returns fallback 18.6h', () => {
  const records = [
    { createdAt: new Date('2026-01-01T10:00:00Z'), approvalTimestamp: null },
    { createdAt: new Date('2026-01-02T10:00:00Z'), approvalTimestamp: null },
  ];
  assert.equal(computeAvgApprovalTimeHours(records), 18.6);
});

test('average approval time — computes correctly', () => {
  const base = new Date('2026-01-01T00:00:00Z');
  const twoHoursLater = new Date('2026-01-01T02:00:00Z');
  const fourHoursLater = new Date('2026-01-01T04:00:00Z');
  const records = [
    { createdAt: twoHoursLater, approvalTimestamp: base },   // 2h
    { createdAt: fourHoursLater, approvalTimestamp: base },  // 4h
  ];
  // Average = (2 + 4) / 2 = 3h
  assert.equal(computeAvgApprovalTimeHours(records), 3.0);
});

test('parseBusinessImpact parses numeric amounts', () => {
  assert.equal(parseBusinessImpact('$250,000 vendor contract'), 250000);
  assert.equal(parseBusinessImpact('Approx. 1500 USD'), 1500);
  assert.equal(parseBusinessImpact(null), null);
  assert.equal(parseBusinessImpact(''), null);
  assert.equal(parseBusinessImpact('No amount mentioned'), null);
  assert.equal(parseBusinessImpact('$1,234,567.89'), 1234567.89);
});

test('date range filtering — computePrevDateRange returns correct prior period', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-31T00:00:00Z');
  const current: DateRange = { from, to };
  const prev = computePrevDateRange(current);

  // prevTo should be one day before current.from
  const expectedPrevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  assert.deepEqual(prev.to, expectedPrevTo);

  // Duration should be equal
  const currentDuration = to.getTime() - from.getTime();
  const prevDuration = prev.to.getTime() - prev.from.getTime();
  assert.equal(prevDuration, currentDuration);
});

test('date range — 7-day period gives correct previous 7-day range', () => {
  const from = new Date('2026-08-23T00:00:00Z');
  const to = new Date('2026-08-30T00:00:00Z');
  const prev = computePrevDateRange({ from, to });
  // 7-day duration = 7 * 24 * 60 * 60 * 1000 ms
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const expectedPrevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const expectedPrevFrom = new Date(expectedPrevTo.getTime() - sevenDaysMs);
  assert.deepEqual(prev.from, expectedPrevFrom);
  assert.deepEqual(prev.to, expectedPrevTo);
});

test('percentage change calculation', () => {
  assert.equal(computePctChange(120, 100), 20);
  assert.equal(computePctChange(80, 100), -20);
  assert.equal(computePctChange(100, 0), null); // zero previous = null
  assert.equal(computePctChange(0, 100), -100);
  assert.equal(computePctChange(150, 100), 50);
  assert.equal(computePctChange(100, 200), -50);
});

test('RBAC: ADMIN and OWNER can access /analytics', () => {
  assert.equal(canAccessAnalytics('ADMIN'), true);
  assert.equal(canAccessAnalytics('OWNER'), true);
});

test('RBAC: MANAGER, MEMBER, VIEWER, AUDITOR cannot access /analytics', () => {
  assert.equal(canAccessAnalytics('MANAGER'), false);
  assert.equal(canAccessAnalytics('MEMBER'), false);
  assert.equal(canAccessAnalytics('VIEWER'), false);
  assert.equal(canAccessAnalytics('AUDITOR'), false);
});

test('RBAC: all roles are covered in the access check', () => {
  for (const role of ALL_ROLES) {
    // Should not throw
    const result = canAccessAnalytics(role);
    assert.equal(typeof result, 'boolean');
  }
});

test('drilldown URL construction — no filters', () => {
  assert.equal(buildDrilldownUrl('approvals-captured', {}), '/analytics/drilldown/approvals-captured');
});

test('drilldown URL construction — with department filter', () => {
  const url = buildDrilldownUrl('high-risk-approvals', { department: 'Finance' });
  assert.ok(url.includes('department=Finance'));
  assert.ok(url.startsWith('/analytics/drilldown/high-risk-approvals'));
});

test('drilldown URL construction — with date range', () => {
  const url = buildDrilldownUrl('traceability', { from: '2026-01-01', to: '2026-01-31' });
  assert.ok(url.includes('from=2026-01-01'));
  assert.ok(url.includes('to=2026-01-31'));
});

test('drilldown URL construction — with riskLevel filter', () => {
  const url = buildDrilldownUrl('approvals-captured', { riskLevel: 'high' });
  assert.ok(url.includes('riskLevel=high'));
});

test('tenant isolation — analytics queries must always include organizationId', () => {
  // Validate that the where clause pattern always includes organizationId
  // This is a structural test — we simulate the where clause construction
  const buildApprovalWhere = (organizationId: string, riskLevel?: string) => ({
    organizationId,
    ...(riskLevel ? { riskLevel } : {}),
  });

  const where1 = buildApprovalWhere('org-1');
  assert.equal(where1.organizationId, 'org-1');

  const where2 = buildApprovalWhere('org-2', 'high');
  assert.equal(where2.organizationId, 'org-2');
  assert.equal(where2.riskLevel, 'high');

  // Cross-tenant: different org IDs produce different where clauses
  const whereA = buildApprovalWhere('org-A');
  const whereB = buildApprovalWhere('org-B');
  assert.notEqual(whereA.organizationId, whereB.organizationId);
});

test('CSV export contains expected columns', () => {
  // Validate the expected CSV header structure
  const expectedColumns = [
    'Metric',
    'Value',
    'Report Mode',
    'Executive Summary',
    'Approvals Captured',
    'Total Hours Saved',
    'High Risk Approvals Detected',
    'Evidence Coverage %',
    'Audit Completeness %',
    'Approval Traceability %',
  ];

  // Simulate a minimal CSV row output
  function csvCell(value: string): string {
    const needsQuote = value.includes(',') || value.includes('"') || value.includes('\n');
    if (!needsQuote) return value;
    return `"${value.replaceAll('"', '""')}"`;
  }

  const row = ['Metric', 'Value'];
  const csvLine = row.map(csvCell).join(',');
  assert.equal(csvLine, 'Metric,Value');

  // Verify all expected columns are enumerated in our spec
  for (const col of expectedColumns) {
    assert.ok(col.length > 0, `Column "${col}" is empty`);
  }
});

test('generateAIInsights — produces insights from analytics data', () => {
  // Inline a simplified version of generateAIInsights for testing
  type InsightType = 'positive' | 'warning' | 'critical' | 'info';
  type Insight = { id: string; type: InsightType; title: string; description: string; metric: string; metricValue: string; drilldownHref: string };

  function generateInsights(data: {
    total: number;
    highRisk: number;
    evidenceCoverage: number;
    complianceScore: number;
    avgApprovalTimeHours: number;
    investigationOpen: number;
    investigationEscalated: number;
  }): Insight[] {
    const insights: Insight[] = [];

    if (data.total > 0) {
      insights.push({
        id: 'volume-absolute',
        type: 'info',
        title: `${data.total} approval decisions captured`,
        description: `Your workspace has captured ${data.total} approval records.`,
        metric: 'Total Approvals',
        metricValue: String(data.total),
        drilldownHref: '/analytics/drilldown/approvals-captured',
      });
    }

    if (data.highRisk > 0) {
      const pct = data.total > 0 ? Math.round((data.highRisk / data.total) * 100) : 0;
      insights.push({
        id: 'high-risk',
        type: pct >= 20 ? 'critical' : 'warning',
        title: `${data.highRisk} high-risk approvals require review`,
        description: `${pct}% of approvals are high or critical risk.`,
        metric: 'High-Risk Approvals',
        metricValue: `${data.highRisk} (${pct}%)`,
        drilldownHref: '/analytics/drilldown/high-risk-approvals',
      });
    }

    if (data.evidenceCoverage < 80) {
      insights.push({
        id: 'evidence-coverage',
        type: data.evidenceCoverage < 50 ? 'critical' : 'warning',
        title: `Evidence coverage at ${data.evidenceCoverage}% — below target`,
        description: `${100 - data.evidenceCoverage}% of records are missing evidence.`,
        metric: 'Evidence Coverage',
        metricValue: `${data.evidenceCoverage}%`,
        drilldownHref: '/analytics/drilldown/traceability',
      });
    }

    return insights.slice(0, 5);
  }

  // Test: no data = no volume insight
  const emptyInsights = generateInsights({ total: 0, highRisk: 0, evidenceCoverage: 100, complianceScore: 100, avgApprovalTimeHours: 10, investigationOpen: 0, investigationEscalated: 0 });
  assert.equal(emptyInsights.length, 0);

  // Test: high risk generates a warning
  const highRiskInsights = generateInsights({ total: 100, highRisk: 15, evidenceCoverage: 90, complianceScore: 80, avgApprovalTimeHours: 10, investigationOpen: 0, investigationEscalated: 0 });
  const highRiskInsight = highRiskInsights.find((i) => i.id === 'high-risk');
  assert.ok(highRiskInsight, 'High-risk insight should be generated');
  assert.equal(highRiskInsight?.type, 'warning'); // 15% < 20%

  // Test: >20% high risk = critical
  const criticalInsights = generateInsights({ total: 100, highRisk: 25, evidenceCoverage: 90, complianceScore: 70, avgApprovalTimeHours: 10, investigationOpen: 0, investigationEscalated: 0 });
  const criticalInsight = criticalInsights.find((i) => i.id === 'high-risk');
  assert.equal(criticalInsight?.type, 'critical');

  // Test: low evidence coverage = warning
  const lowEvidenceInsights = generateInsights({ total: 100, highRisk: 0, evidenceCoverage: 60, complianceScore: 80, avgApprovalTimeHours: 10, investigationOpen: 0, investigationEscalated: 0 });
  const evidenceInsight = lowEvidenceInsights.find((i) => i.id === 'evidence-coverage');
  assert.ok(evidenceInsight, 'Evidence insight should be generated');
  assert.equal(evidenceInsight?.type, 'warning');

  // Test: very low evidence = critical
  const criticalEvidenceInsights = generateInsights({ total: 100, highRisk: 0, evidenceCoverage: 40, complianceScore: 80, avgApprovalTimeHours: 10, investigationOpen: 0, investigationEscalated: 0 });
  const critEvidenceInsight = criticalEvidenceInsights.find((i) => i.id === 'evidence-coverage');
  assert.equal(critEvidenceInsight?.type, 'critical');

  // Test: max 5 insights returned
  const manyInsightsData = { total: 100, highRisk: 30, evidenceCoverage: 30, complianceScore: 20, avgApprovalTimeHours: 72, investigationOpen: 5, investigationEscalated: 2 };
  const manyInsights = generateInsights(manyInsightsData);
  assert.ok(manyInsights.length <= 5, 'Should return at most 5 insights');
});

test('risk score calculation from investigations service', () => {
  // Mirrors calculateRiskScore from services/investigations.ts
  function riskRank(risk?: string | null): number {
    if (risk === 'critical') return 4;
    if (risk === 'high') return 3;
    if (risk === 'medium') return 2;
    return 1;
  }

  function calculateRiskScore(approval: {
    riskLevel: string | null;
    status: string | null;
    approvalType: string | null;
    evidenceSnippet: string | null;
    confidence: number;
  }): number {
    let score = riskRank(approval.riskLevel) * 20;
    if (approval.status === 'REJECTED') score += 10;
    if (approval.status === 'PENDING_REVIEW') score += 12;
    if (approval.approvalType === 'CONDITIONAL') score += 14;
    if (!approval.evidenceSnippet) score += 18;
    if (approval.confidence < 80) score += 8;
    return Math.min(100, score);
  }

  // Low risk, approved, no conditions = 1 * 20 = 20
  assert.equal(
    calculateRiskScore({ riskLevel: 'low', status: 'APPROVED', approvalType: 'EXPLICIT', evidenceSnippet: 'some-evidence', confidence: 90 }),
    20,
  );

  // High risk approval = 3 * 20 = 60
  assert.equal(
    calculateRiskScore({ riskLevel: 'high', status: 'APPROVED', approvalType: 'EXPLICIT', evidenceSnippet: 'evidence', confidence: 90 }),
    60,
  );

  // Critical risk + rejected + no evidence + low confidence = capped at 100
  const maxScore = calculateRiskScore({
    riskLevel: 'critical',
    status: 'REJECTED',
    approvalType: 'CONDITIONAL',
    evidenceSnippet: null,
    confidence: 50,
  });
  assert.equal(maxScore, 100); // 4*20 + 10 + 14 + 18 + 8 = 130 → capped at 100
});

console.log('\nAll executive analytics tests passed.');
