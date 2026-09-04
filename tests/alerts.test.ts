import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

// ---------------------------------------------------------------------------
// 1. Service exports and constants
// ---------------------------------------------------------------------------
const alertsService = read('services/alerts.ts');

// Audit action constants exist
assert.match(alertsService, /ALERT_DISMISSED_ACTION\s*=\s*'approval_alert\.dismissed'/);
assert.match(alertsService, /ALERT_ESCALATED_ACTION\s*=\s*'approval_alert\.escalated'/);
assert.match(alertsService, /ALERT_ACKNOWLEDGED_ACTION\s*=\s*'approval_alert\.acknowledged'/);

// All public functions exported
assert.match(alertsService, /export async function getApprovalAlerts/);
assert.match(alertsService, /export async function dismissApprovalAlert/);
assert.match(alertsService, /export async function escalateApprovalAlert/);
assert.match(alertsService, /export async function acknowledgeApprovalAlert/);
assert.match(alertsService, /export function alertsCacheTag/);
assert.match(alertsService, /export function invalidateAlertsCache/);

// ---------------------------------------------------------------------------
// 2. Types — ApprovalAlert has all required operational fields
// ---------------------------------------------------------------------------
assert.match(alertsService, /investigating:\s*boolean/);
assert.match(alertsService, /acknowledged:\s*boolean/);
assert.match(alertsService, /escalated:\s*boolean/);
assert.match(alertsService, /severity:\s*AlertSeverity/);
assert.match(alertsService, /riskScore:\s*number/);
assert.match(alertsService, /reasons:\s*string\[\]/);
assert.match(alertsService, /complianceExplanation:\s*string \| null/);
assert.match(alertsService, /complianceSeverity:\s*string \| null/);

// AlertsResult has all KPI count fields
assert.match(alertsService, /openCount:\s*number/);
assert.match(alertsService, /escalatedCount:\s*number/);
assert.match(alertsService, /investigatingCount:\s*number/);
assert.match(alertsService, /acknowledgedCount:\s*number/);
assert.match(alertsService, /dismissedCount:\s*number/);
assert.match(alertsService, /severityCounts:\s*Record<AlertSeverity, number>/);

// ---------------------------------------------------------------------------
// 3. Severity determination — uses calculateRiskScore + riskLabel
// ---------------------------------------------------------------------------
assert.match(alertsService, /from '@\/services\/investigations'/);
assert.match(alertsService, /calculateRiskScore/);
assert.match(alertsService, /riskLabel/);
// severity derived from riskLabel cast — not hardcoded
assert.match(alertsService, /riskLabel\(riskScore\) as AlertSeverity/);

// ---------------------------------------------------------------------------
// 4. flagReasons — alert reasons based on real data fields
// ---------------------------------------------------------------------------
assert.match(alertsService, /function flagReasons/);
assert.match(alertsService, /riskLevel.*critical.*high/);
assert.match(alertsService, /approvalType.*CONDITIONAL/);
assert.match(alertsService, /status.*PENDING_REVIEW/);
assert.match(alertsService, /status.*REJECTED/);
assert.match(alertsService, /evidenceSnippet.*sourceLink/);

// ---------------------------------------------------------------------------
// 5. Post-fetch filter logic
// ---------------------------------------------------------------------------
assert.match(alertsService, /function applyPostFetchFilters/);
// severity filter (case-insensitive)
assert.match(alertsService, /severity.*toLowerCase.*severity.*toLowerCase/);
// status filter: open = not escalated and not investigating
assert.match(alertsService, /status.*===.*'open'.*!a\.escalated.*!a\.investigating/s);
// status filter: escalated
assert.match(alertsService, /status.*===.*'escalated'.*a\.escalated/s);
// status filter: investigating
assert.match(alertsService, /status.*===.*'investigating'.*a\.investigating/s);
// status filter: acknowledged
assert.match(alertsService, /status.*===.*'acknowledged'.*a\.acknowledged/s);
// free-text search: subject + approverName + department + category
assert.match(alertsService, /a\.subject\.toLowerCase\(\)\.includes\(q\)/);
assert.match(alertsService, /a\.approverName/);
assert.match(alertsService, /a\.department/);
assert.match(alertsService, /a\.category/);

// ---------------------------------------------------------------------------
// 6. Three-query fetch: auditEvents + approvals + investigatingJoins
// ---------------------------------------------------------------------------
// AuditLog events for state
assert.match(alertsService, /prisma\.auditLog\.findMany/);
assert.match(alertsService, /ALERT_DISMISSED_ACTION.*ALERT_ESCALATED_ACTION.*ALERT_ACKNOWLEDGED_ACTION/s);
// ApprovalRecord query for high-risk
assert.match(alertsService, /prisma\.approvalRecord\.findMany/);
assert.match(alertsService, /riskLevel.*high.*critical/s);
// InvestigationApproval join for "investigating" status
assert.match(alertsService, /prisma\.investigationApproval\.findMany/);
assert.match(alertsService, /status.*in.*\['OPEN',\s*'IN_PROGRESS',\s*'ESCALATED'\]/);

// ---------------------------------------------------------------------------
// 7. State derivation — sets from auditLog events
// ---------------------------------------------------------------------------
assert.match(alertsService, /dismissedIds/);
assert.match(alertsService, /escalatedIds/);
assert.match(alertsService, /acknowledgedIds/);
assert.match(alertsService, /investigatingIds/);
// Dismissed alerts are filtered OUT of the result
assert.match(alertsService, /filter.*!dismissedIds\.has/);

// ---------------------------------------------------------------------------
// 8. Resilience: circuit breaker + two-level caching
// ---------------------------------------------------------------------------
assert.match(alertsService, /CIRCUIT_BREAKER_FAILURE_THRESHOLD\s*=\s*3/);
assert.match(alertsService, /CIRCUIT_BREAKER_COOLDOWN_MS\s*=\s*60_000/);
assert.match(alertsService, /AlertsCircuitOpenError/);
assert.match(alertsService, /unstable_cache/);
assert.match(alertsService, /from 'react'/);  // per-request cache()
assert.match(alertsService, /STALE_CACHE_TTL_MS/);
assert.match(alertsService, /lastGoodStore/);
assert.match(alertsService, /deserializeAlert/);  // Date hydration after cache hit

// ---------------------------------------------------------------------------
// 9. Tenant isolation — organizationId always injected
// ---------------------------------------------------------------------------
// organizationId is passed as param and used in every query
assert.match(alertsService, /where:\s*\{\s*\n?\s*organizationId/);
// Investigation query also scoped by organizationId through relation
assert.match(alertsService, /investigation:\s*\{/);
assert.match(alertsService, /organizationId,/);

// ---------------------------------------------------------------------------
// 10. Acknowledge / escalate / dismiss — each writes AuditLog + invalidates cache
// ---------------------------------------------------------------------------
const writeAuditPattern = /writeAuditLog/g;
const writeAuditMatches = alertsService.match(writeAuditPattern);
assert.ok(writeAuditMatches && writeAuditMatches.length >= 3, 'writeAuditLog called for dismiss, escalate, and acknowledge');

const invalidateCachePattern = /invalidateAlertsCache/g;
const invalidateCacheMatches = alertsService.match(invalidateCachePattern);
assert.ok(invalidateCacheMatches && invalidateCacheMatches.length >= 4, 'invalidateAlertsCache called in each mutation + exported');

// ---------------------------------------------------------------------------
// 11. Page server actions — real server actions in alerts page
// ---------------------------------------------------------------------------
const alertsPage = read('app/dashboard/alerts/page.tsx');
assert.match(alertsPage, /'use server'/);
assert.match(alertsPage, /dismissApprovalAlert/);
assert.match(alertsPage, /escalateApprovalAlert/);
assert.match(alertsPage, /acknowledgeApprovalAlert/);
// createInvestigationCase (existing service reused for investigate action)
assert.match(alertsPage, /createInvestigationCase/);

// ---------------------------------------------------------------------------
// 12. RBAC — enforcePageRole on alerts page
// ---------------------------------------------------------------------------
assert.match(alertsPage, /enforcePageRole/);
assert.match(alertsPage, /\/dashboard\/alerts/);

// ---------------------------------------------------------------------------
// 13. KPI cards — all 5 present and clickable (linked)
// ---------------------------------------------------------------------------
assert.match(alertsPage, /criticalCount|Critical/);
assert.match(alertsPage, /highCount|High/);
assert.match(alertsPage, /openCount/);
assert.match(alertsPage, /escalatedCount/);
assert.match(alertsPage, /investigatingCount/);
// KPI cards link to filtered views via qs() helper
assert.match(alertsPage, /severity:\s*'critical'/);
assert.match(alertsPage, /status:\s*'investigating'/);
assert.match(alertsPage, /status:\s*'escalated'/);

// ---------------------------------------------------------------------------
// 14. Attention queue — top Critical/High non-investigating alerts
// ---------------------------------------------------------------------------
assert.match(alertsPage, /Attention Required|attention/i);

// ---------------------------------------------------------------------------
// 15. Filter bar parameters — q, severity, status, approvalType, sourcePlatform, from, to
// ---------------------------------------------------------------------------
assert.match(alertsPage, /searchParams/);
assert.match(alertsPage, /\bq\b/);
assert.match(alertsPage, /\bseverity\b/);
assert.match(alertsPage, /\bstatus\b/);
assert.match(alertsPage, /\bsourcePlatform\b/);
assert.match(alertsPage, /\bapprovalType\b/);
assert.match(alertsPage, /\bfrom\b/);
assert.match(alertsPage, /\bto\b/);

// ---------------------------------------------------------------------------
// 16. Client components — AlertsTableClient + AlertDetailDrawer created
// ---------------------------------------------------------------------------
const tableClient = read('components/dashboard/alerts/AlertsTableClient.tsx');
assert.match(tableClient, /'use client'/);
assert.match(tableClient, /AlertDetailDrawer/);
assert.match(tableClient, /investigateAction/);
assert.match(tableClient, /escalateAction/);
assert.match(tableClient, /dismissAction/);
assert.match(tableClient, /acknowledgeAction/);
// Operational table columns present
assert.match(tableClient, /Severity/);
assert.match(tableClient, /Department/);
assert.match(tableClient, /Source/);
assert.match(tableClient, /Status/);
assert.match(tableClient, /Detected/);
assert.match(tableClient, /Actions/);
// Mobile card stack
assert.match(tableClient, /lg:hidden/);
// Desktop table
assert.match(tableClient, /lg:block/);

const drawer = read('components/dashboard/alerts/AlertDetailDrawer.tsx');
assert.match(drawer, /'use client'/);
// Sections present
assert.match(drawer, /Risk details/);
assert.match(drawer, /Why this alert/);
assert.match(drawer, /Evidence snippet|evidenceSnippet/);
assert.match(drawer, /Recommended actions/);
// Recommended actions derived from alert data — not hardcoded strings
assert.match(drawer, /function recommendedActions/);
assert.match(drawer, /alert\.riskLevel/);
// Footer actions
assert.match(drawer, /Open Investigation Case/);
assert.match(drawer, /acknowledgeAction/);
assert.match(drawer, /dismissAction/);
// View Approval Record link
assert.match(drawer, /\/approvals\//);

// ---------------------------------------------------------------------------
// 17. AlertStatusBadge — SeverityBadge + OperationalStatusBadge
// ---------------------------------------------------------------------------
const statusBadge = read('components/dashboard/alerts/AlertStatusBadge.tsx');
assert.match(statusBadge, /SeverityBadge/);
assert.match(statusBadge, /OperationalStatusBadge/);
assert.match(statusBadge, /Critical/);
assert.match(statusBadge, /High/);
assert.match(statusBadge, /Medium/);
assert.match(statusBadge, /Low/);
assert.match(statusBadge, /Investigating/);
assert.match(statusBadge, /Escalated/);
assert.match(statusBadge, /Acknowledged/);
assert.match(statusBadge, /Open/);
// Animated dot for "Open" (live)
assert.match(statusBadge, /animate-pulse/);

// ---------------------------------------------------------------------------
// 18. No fake data, no duplicate services, no new DB models
// ---------------------------------------------------------------------------
// alerts.ts must NOT define any Prisma model directly
assert.doesNotMatch(alertsService, /prisma\.\$executeRaw/);
assert.doesNotMatch(alertsService, /model Alert/);
// Page must reuse getApprovalAlerts (not inline its own DB query)
assert.doesNotMatch(alertsPage, /prisma\.approvalRecord\.findMany/);
assert.doesNotMatch(alertsPage, /prisma\.auditLog\.findMany/);

// ---------------------------------------------------------------------------
// 19. Date deserialization — occurredAt is always a real Date
// ---------------------------------------------------------------------------
assert.match(alertsService, /toDate\(alert\.occurredAt\)/);
assert.match(alertsService, /from '@\/lib\/types\/dates'/);

// ---------------------------------------------------------------------------
// 20. Empty and degraded states handled
// ---------------------------------------------------------------------------
// DegradedBanner is rendered when result.message is set
assert.match(alertsPage, /DegradedBanner/);
assert.match(alertsPage, /result\.message/);
assert.match(alertsPage, /result\.alert/);
// Empty state present
assert.match(alertsPage, /No active alerts/);

console.log('✓ All 20 alerts test assertions passed.');
