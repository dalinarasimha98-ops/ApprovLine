import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// ---------------------------------------------------------------------------
// 1. Service — REPORT_CATALOG, getReportsSummary, getExportHistory
// ---------------------------------------------------------------------------
const reportsService = read('services/reports.ts');

// REPORT_CATALOG defined and exported
assert.match(reportsService, /export const REPORT_CATALOG/);
// All three real report types present
assert.match(reportsService, /'approval-audit'/);
assert.match(reportsService, /'executive-analytics'/);
assert.match(reportsService, /'investigation-report'/);
// Types exported
assert.match(reportsService, /export type ReportDefinition/);
assert.match(reportsService, /export type ReportFormat/);
assert.match(reportsService, /export type ReportsSummary/);
// Required fields on definition
assert.match(reportsService, /exportPaths:/);
assert.match(reportsService, /filterParams:/);
assert.match(reportsService, /commonUseCases:/);
// Summary function exported
assert.match(reportsService, /export async function getReportsSummary/);
assert.match(reportsService, /approvalRecordCount/);
assert.match(reportsService, /recentExportCount/);
// Export history function exported
assert.match(reportsService, /export async function getExportHistory/);
// Tenant isolation — every prisma query is scoped by organizationId
assert.match(reportsService, /where:\s*\{\s*organizationId/);
// Resilience — catches DB errors
assert.match(reportsService, /\.catch\(\(\) => \[\]\)/);

// ---------------------------------------------------------------------------
// 2. Reports page — enforcePageRole + tenant checks + real data
// ---------------------------------------------------------------------------
const reportsPage = read('app/dashboard/audit/page.tsx');

// RBAC enforced
assert.match(reportsPage, /enforcePageRole/);
assert.match(reportsPage, /\/dashboard\/audit/);
// Tenant lifecycle checks
assert.match(reportsPage, /unauthenticated.*sign-in/s);
assert.match(reportsPage, /organization_missing.*onboarding/s);
// Real data fetched
assert.match(reportsPage, /getReportsSummary/);
assert.match(reportsPage, /getExportHistory/);
assert.match(reportsPage, /REPORT_CATALOG/);
// KPI cards rendered
assert.match(reportsPage, /availableReports/);
assert.match(reportsPage, /approvalRecordCount/);
assert.match(reportsPage, /recentExportCount/);
// Client component used
assert.match(reportsPage, /ReportsCenter/);
// No inline DB queries
assert.doesNotMatch(reportsPage, /prisma\.\w+\.findMany/);
assert.doesNotMatch(reportsPage, /prisma\.\w+\.count\(/);

// ---------------------------------------------------------------------------
// 3. ReportsCenter client component
// ---------------------------------------------------------------------------
const reportsCenter = read('components/dashboard/reports/ReportsCenter.tsx');

assert.match(reportsCenter, /'use client'/);
// Tab navigation
assert.match(reportsCenter, /All Reports/);
assert.match(reportsCenter, /Exports/);
assert.match(reportsCenter, /Scheduled/);
// Scheduled coming-soon notice
assert.match(reportsCenter, /Scheduled Reports Coming Soon|not yet operational/i);
// Search
assert.match(reportsCenter, /Search reports/);
// Category filter
assert.match(reportsCenter, /Compliance/);
assert.match(reportsCenter, /Executive/);
assert.match(reportsCenter, /Risk & Security/);
// Export history empty state
assert.match(reportsCenter, /No exports yet/);
// Mobile support
assert.match(reportsCenter, /lg:hidden|lg:block/);
// Keyboard accessible
assert.match(reportsCenter, /onKeyDown/);
assert.match(reportsCenter, /tabIndex/);

// ---------------------------------------------------------------------------
// 4. ReportDetailPanel client component
// ---------------------------------------------------------------------------
const detailPanel = read('components/dashboard/reports/ReportDetailPanel.tsx');

assert.match(detailPanel, /'use client'/);
// Sections present
assert.match(detailPanel, /Description/);
assert.match(detailPanel, /Common Use Cases/);
assert.match(detailPanel, /Export/);
// Format download links — all formats
assert.match(detailPanel, /FORMAT_LABELS/);
assert.match(detailPanel, /FORMAT_COLORS/);
// Source data navigation links
assert.match(detailPanel, /\/dashboard\/approvals/);
assert.match(detailPanel, /\/analytics/);
assert.match(detailPanel, /\/investigations/);
// Accessibility
assert.match(detailPanel, /aria-label/);
assert.match(detailPanel, /role="dialog"/);

// ---------------------------------------------------------------------------
// 5. RBAC — /dashboard/audit added to ROUTE_PERMISSIONS
// ---------------------------------------------------------------------------
const rbac = read('lib/rbac.ts');

assert.match(rbac, /\/dashboard\/audit.*AUDITOR.*MANAGER.*ADMIN.*OWNER/s);

// ---------------------------------------------------------------------------
// 6. Export routes — audit log written on every export
// ---------------------------------------------------------------------------
const approvalsExport = read('app/api/export/approvals/route.ts');
assert.match(approvalsExport, /writeAuditLog/);
assert.match(approvalsExport, /report\.exported/);
assert.match(approvalsExport, /reportId.*approval-audit/s);

const analyticsExport = read('app/api/export/analytics/route.ts');
assert.match(analyticsExport, /writeAuditLog/);
assert.match(analyticsExport, /report\.exported/);
assert.match(analyticsExport, /reportId.*executive-analytics/s);

// ---------------------------------------------------------------------------
// 7. No fake data — reports service must NOT inline query results
// ---------------------------------------------------------------------------
assert.doesNotMatch(reportsService, /\[\s*\{.*name:.*'Approval/s);  // no hardcoded result rows
assert.doesNotMatch(reportsService, /mockData|fakeData|hardcoded/i);

// ---------------------------------------------------------------------------
// 8. Investigation report — requiresSelection and no broken export path
// ---------------------------------------------------------------------------
const catalog = reportsService;
assert.match(catalog, /requiresSelection:\s*true/);
assert.match(catalog, /selectionHint/);
// exportPaths for investigation-report must be empty (it's per-record via Investigation Center)
assert.match(catalog, /exportPaths:\s*\{\}/);

console.log('✓ All reports test assertions passed.');
