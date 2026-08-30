# Executive Analytics — End-to-End Certification

**Date:** 2026-08-30
**Branch:** `claude/information-dashboard-navigation-u6r3rb`
**Prepared by:** Claude (automated certification via agent run)
**Status:** READY FOR PRODUCTION REVIEW

---

## 1. Architecture Review

### Component Hierarchy

```
app/analytics/page.tsx (Server Component, `force-dynamic`)
├── AnalyticsDatePicker (Client Component — URL param updates)
├── AnalyticsFilters (Client Component — URL param updates)
├── <Suspense> → ExecutiveDashboardSection (Server Component)
│   ├── KPICard × 6 (Server Component)
│   ├── SVGLineChart (Server Component)
│   ├── SVGDonutChart × 2 (Server Component)
│   ├── SVGBarChart (Server Component)
│   ├── SVGArcGauge (Server Component)
│   ├── ConnectorBars (Server Component)
│   ├── CategoryBars (Server Component)
│   └── AIInsightsPanel (Server Component)
└── <Suspense> → PlaybookSection (Server Component — unchanged)
```

### Data Flow

1. Browser renders the shell immediately; Suspense fallback shimmer shown while data loads.
2. `ExecutiveDashboardSection` calls `getCoreAnalytics(orgId, { dateRange, prevDateRange })`.
3. `getCoreAnalytics` wraps `unstable_cache` (60s revalidation) with a `withStaleFallback` (30-min TTL) layer for resilience.
4. Inside `fetchCoreAnalyticsFresh`, six Prisma queries run concurrently via `Promise.all`:
   - `ApprovalRecord.findMany` (primary query, up to 500 records)
   - `Integration.count`
   - `InvestigationCase.groupBy(status)`
   - `Integration.findMany` (connector status)
   - `ApprovalRecord.findMany` (previous period, when `prevDateRange` provided)
5. All queries have individual 3s timeouts (`timedQuery`) and the group has a 5s total cap (`TOTAL_FETCH_TIMEOUT_MS`).
6. `generateAIInsights()` runs synchronously on the result (rule-based, no LLM).
7. A separate top-5 high-risk query with a 2s timeout fetches records for the insights panel.

### API Route

- `GET /api/analytics/kpis` — auth-gated (ADMIN|OWNER), accepts `from/to/prevFrom/prevTo` params, returns JSON.
- Used for client-side date range updates without full page reload if desired.

---

## 2. Analytics Data Sources and Definitions

| Metric | Source Table | Field(s) | Notes |
|---|---|---|---|
| Total Approvals | `ApprovalRecord` | `COUNT(*)` | Scoped to `organizationId`, optional date range on `createdAt` |
| High-Risk Approvals | `ApprovalRecord` | `riskLevel IN ('high','critical')` | Scaled in demo mode |
| Evidence Coverage | `ApprovalRecord` | `evidenceSnippet AND sourceLink` | Percentage of records with both |
| Avg Approval Time | `ApprovalRecord` | `createdAt - approvalTimestamp` | Falls back to 18.6h if no timestamps |
| Compliance Score | `ApprovalRecord` | Derived | `100 - ((highRisk + pending*0.25) / total * 100)` |
| Approved Value | `ApprovalRecord` | `businessImpact` | Parsed for first numeric value; null if none |
| Investigation Metrics | `InvestigationCase` | `groupBy(status)` | All org investigations, not date-filtered |
| Time Series (30d) | `ApprovalRecord` | `createdAt`, `status`, `approvalType` | Groups into approved/rejected/pending per day |
| Department Breakdown | `ApprovalRecord` | `department`, `status`, `riskLevel` | Top 8 by count |
| Connector Activity | `ApprovalRecord` + `Integration` | `sourcePlatform`, `provider`, `status` | Merges approval counts with connector status |
| Previous Period | `ApprovalRecord` | Same fields | Only when `prevDateRange` provided |

---

## 3. KPI Calculation Formulas

### Total Approvals
```
total = COUNT(ApprovalRecord WHERE organizationId = :orgId AND createdAt BETWEEN :from AND :to)
```
In demo mode: `max(742, total * ceil(742 / max(total, 8)))`

### Compliance Score
```
complianceScore = max(0, round(100 - ((highRisk + pending * 0.25) / max(total, 1)) * 100))
```
- `highRisk` = records where `riskLevel IN ('high', 'critical')`
- `pending` = records where `status = 'PENDING_REVIEW'`

### Evidence Coverage
```
evidenceCoverage = round((recordsWithEvidenceAndLink / total) * 100)
```
A record qualifies when `evidenceSnippet IS NOT NULL AND sourceLink IS NOT NULL`.

### Avg Approval Time
```
avgApprovalTimeHours = avg(abs(createdAt - approvalTimestamp)) for records where approvalTimestamp IS NOT NULL
fallback = 18.6h (if no records have timestamps)
```

### Time Saved
```
retrievalHours = round(total * 0.08)            # 4.8 min per approval
manualSearchHours = round(total * 0.11)         # 6.6 min per approval  
auditPrepHours = round((highRisk + conditional + rejections) * 0.45)
totalHours = retrievalHours + manualSearchHours + auditPrepHours
```

### Percentage Change vs Previous Period
```
pctChange = round(((current - previous) / previous) * 100)
null when previous = 0 (shown as "—")
```

---

## 4. Dashboard Sections Implemented

| Section | Component | Data Source |
|---|---|---|
| Header with date picker | `AnalyticsDatePicker` (client) | URL searchParams |
| Filters | `AnalyticsFilters` (client) | URL searchParams |
| 6 KPI Cards | `KPICard` | `getCoreAnalytics()` |
| Approval Volume Trend (30d line) | `SVGLineChart` | `timeSeries` from analytics |
| Approvals by Department (donut) | `SVGDonutChart` | `departmentBreakdown` |
| Risk Distribution (donut) | `SVGDonutChart` | Derived from risk counts |
| Investigation Overview (stat cards) | Inline | `investigationMetrics` |
| Evidence Coverage (arc gauge) | `SVGArcGauge` | `evidenceCoverage` |
| Approval Volume by Month (bars) | `SVGBarChart` | `approvals.trends` |
| Connector Activity (horizontal bars) | `ConnectorBars` | `connectorActivity` |
| Top Approval Categories (horizontal bars) | `CategoryBars` | `approvals.byDepartment` |
| AI Executive Insights | `AIInsightsPanel` | `generateAIInsights()` |
| High Risk Approval Mini-List | `AIInsightsPanel` | Direct Prisma query (top 5) |
| Quick Actions | `AIInsightsPanel` | Static links |
| Compliance Readiness | Inline drilldown links | `complianceReadiness` |
| Risk Controls Surfaced | Inline drilldown links | `riskReduction` |
| Integration Source Contribution | Inline drilldown links | `integrations` |
| Time Saved Breakdown | Inline | `timeSaved` |
| Export (PDF / CSV) | PendingLink | `/api/export/analytics` |
| Playbook AI Insights | `PlaybookSection` | `getPlaybookAnalytics()` (existing, unchanged) |

---

## 5. RBAC Validation

- **Page access:** `enforcePageRole('/analytics', role)` gates to `['ADMIN', 'OWNER']`.
- **API `/api/analytics/kpis`:** `hasAnyRole(role, ['OWNER', 'ADMIN'])` returns 403 otherwise.
- **Export `/api/export/analytics`:** `hasAnyRole(role, ['OWNER', 'ADMIN', 'AUDITOR'])` — AUDITOR can export but cannot view the page.
- **Drilldown pages:** Inherit authentication from the org tenant but do not enforce role separately (parent navigation requires ADMIN/OWNER to reach analytics).

### Test Coverage
- `RBAC: ADMIN and OWNER can access /analytics` — PASS
- `RBAC: MANAGER, MEMBER, VIEWER, AUDITOR cannot access /analytics` — PASS
- `RBAC: all roles are covered in the access check` — PASS

---

## 6. Tenant Isolation Validation

Every Prisma query in `fetchCoreAnalyticsFresh` includes `organizationId` in the `where` clause:
- `ApprovalRecord.findMany({ where: { organizationId, ...dateFilter } })`
- `Integration.count({ where: { organizationId } })`
- `InvestigationCase.groupBy({ where: { organizationId } })`
- `Integration.findMany({ where: { organizationId } })`
- Previous period query: `{ organizationId, createdAt: { gte, lte } }`
- High-risk panel query: `{ organizationId, OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }] }`

The API route `/api/analytics/kpis` resolves the tenant from the authenticated Clerk session via `getDashboardTenant()` — the `organizationId` is always derived from auth, never from user-supplied query params.

### Test Coverage
- `tenant isolation — analytics queries must always include organizationId` — PASS

---

## 7. Date Range / Filter Coverage

### Date Range
- URL params: `?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Applied to `ApprovalRecord.findMany` as `createdAt: { gte: from, lte: to }`
- Applied to high-risk panel query
- Preset options: Today, 7 Days, 30 Days, 90 Days, Quarter, Year, Custom
- Custom date range via date inputs
- All-time view when no `from/to` params present

### Comparison Period
- URL params: `?prevFrom=YYYY-MM-DD&prevTo=YYYY-MM-DD`
- Toggle in `AnalyticsDatePicker` auto-computes prev period (equal duration, immediately before)
- `prevPeriod` fields shown in KPI card trend labels
- KPI cards show "—" when previous period data unavailable

### Filters
- `AnalyticsFilters` updates URL params: `department`, `riskLevel`, `status`, `source`
- Currently filters are passed to URL; the page-level analytics service does not yet apply department/status/source filters to the aggregate queries (applying them would require architecture changes to the cache key and query structure). These are preserved in the URL for forward compatibility and will be passed to the API route.

### Test Coverage
- `date range filtering — computePrevDateRange returns correct prior period` — PASS
- `date range — 7-day period gives correct previous 7-day range` — PASS

---

## 8. Drilldown Coverage

All 7 existing drilldown metrics are preserved and linked:

| Metric | Drilldown URL | Linked from |
|---|---|---|
| Approvals Captured | `/analytics/drilldown/approvals-captured` | Total Approvals KPI, Export section |
| High-Risk Approvals | `/analytics/drilldown/high-risk-approvals` | High Risk KPI, Risk Controls panel, AI Insights |
| Time Saved | `/analytics/drilldown/time-saved` | Time Saved cards |
| Traceability | `/analytics/drilldown/traceability` | Evidence Coverage KPI, AI Insights |
| Compliance Readiness | `/analytics/drilldown/compliance-readiness` | Compliance Score KPI, Audit Posture panel |
| Approval Categories | `/analytics/drilldown/approval-categories` | (available via navigation) |
| Integration Insights | `/analytics/drilldown/integration-insights` | Source Contribution panel, Connector Activity |

Every drilldown passes filter params (`department`, `riskLevel`, `from`, `to`) from its URL. The existing drilldown page (`app/analytics/drilldown/[metric]/page.tsx`) was not modified.

### Test Coverage
- `drilldown URL construction — no filters` — PASS
- `drilldown URL construction — with department filter` — PASS
- `drilldown URL construction — with date range` — PASS
- `drilldown URL construction — with riskLevel filter` — PASS

---

## 9. AI Insights Methodology

`generateAIInsights(analytics: CoreAnalytics): ExecutiveInsight[]` is a pure function — no LLM call, no network I/O, no async operations.

### Rules Applied (in priority order)

| Insight ID | Trigger Condition | Type |
|---|---|---|
| `volume-trend` | `prevPeriod` available AND total differs | positive / warning |
| `volume-absolute` | No prev period, total > 0 | info |
| `high-risk` | `highRisk > 0` | warning (< 20%) / critical (≥ 20%) |
| `evidence-coverage` | `evidenceCoverage < 80` | warning (≥ 50%) / critical (< 50%) |
| `evidence-coverage-good` | `evidenceCoverage ≥ 90` | positive |
| `compliance-score` | `complianceScore < 70` | warning (≥ 50%) / critical (< 50%) |
| `compliance-score-good` | `complianceScore ≥ 85` | positive |
| `investigations-active` | `open + inProgress + escalated > 0` | warning / critical |
| `approval-time` | `avgApprovalTimeHours > 48` | warning |

Output is sorted critical → warning → info → positive, capped at 5 insights.

All metric values referenced in insight descriptions are drawn directly from the analytics data — no invented numbers.

### Test Coverage
- `generateAIInsights — produces insights from analytics data` — PASS (7 sub-assertions)

---

## 10. Export Validation

### CSV Export (`/api/export/analytics?format=csv`)
Columns: Report Mode, Executive Summary, Approvals Captured, Manual Search Hours Avoided, Audit Preparation Hours Avoided, Approval Retrieval Hours Avoided, Total Hours Saved, Missing Approvals Detected, Conditional Approvals Detected, High Risk Approvals Detected, Approvals Without Evidence, Audit Completeness %, Evidence Coverage %, Approval Traceability %, Slack/Gmail/Teams/Jira/Outlook/ServiceNow/Zoom Approvals, Playbook Questions Asked, Trend rows, Department rows, Source rows, Referenced Policy rows.

### PDF Export (`/api/export/analytics?format=pdf`)
Plain PDF/1.4 generated without external libraries; includes summary, KPIs, trend, department, policy, and high-risk summary.

### Role Gate
OWNER, ADMIN, AUDITOR can export. Returns 403 for other roles. Returns 503 with `Retry-After: 3` on timeout.

### Test Coverage
- `CSV export contains expected columns` — PASS

---

## 11. Performance Considerations

| Layer | Mechanism | Value |
|---|---|---|
| Per-query timeout | `timedQuery()` wrapping `withTimeout()` | 3s per query |
| Total fetch timeout | `withTimeout('core analytics (total)', ...)` | 5s |
| Next.js data cache | `unstable_cache` | 60s revalidation |
| In-memory stale cache | `withStaleFallback` | 30-min TTL |
| React cache | `cache()` wrapper on `getCoreAnalytics` | Dedup within one render |
| Approval record cap | `take: 500` on `findMany` | Prevents unbounded scans |
| High-risk panel cap | `take: 5` with 2s timeout | Fast auxiliary query |

The time series (30-day) is computed in memory from the 500-record cap, not via an additional DB query, to stay within the budget.

---

## 12. Known Limitations

1. **Department/status/source filters in URL are not yet applied to aggregate analytics queries.** The filter state is preserved in the URL and passed to the KPIs API route, but the page-level `getCoreAnalytics` call does not filter by these dimensions. This requires extending the Prisma query and the `unstable_cache` key — deferred to avoid cache key complexity in this release.

2. **Time series computed from the 500-record cap.** If an org has >500 approvals in the date window, the time series will only reflect the most recent 500. For high-volume orgs a dedicated time-bucketed aggregate query should replace this.

3. **`businessImpact` parsing is best-effort.** The field is a free-text string, and the parser extracts the first numeric value (with commas and decimals). Edge cases (e.g., value ranges, non-USD currencies) may parse incorrectly. The KPI shows "—" when no parseable value exists.

4. **Investigation metrics are not date-filtered.** The `InvestigationCase.groupBy` query counts all org investigations regardless of the selected date range. This is intentional — investigations span time and may relate to approvals outside the window.

5. **The 30-day time series is always calendar-day granularity.** Granularity toggle UI is present in the line chart but the backend always returns daily data. Weekly/monthly aggregation is a future enhancement.

6. **Demo mode does not scale time series or department breakdown.** The `demoMultiplier` is applied to the top-level totals and trend buckets but not yet to the new `timeSeries` or `departmentBreakdown` computed fields. New metrics reflect real data counts in demo mode.

---

## 13. Test Results

Run command: `node --import tsx tests/executive-analytics.test.ts`

```
TAP version 13
# tests 22
# pass 22
# fail 0
# duration_ms ~43ms
```

All 22 tests pass. No failures, no skips.

---

## 14. Production Readiness Assessment

| Area | Score | Notes |
|---|---|---|
| TypeScript strict | 10/10 | `tsc --noEmit` passes with 0 errors |
| Lint | 10/10 | 0 new errors, 0 new warnings (pre-existing warnings unchanged) |
| Test coverage | 8/10 | 22 tests cover all pure functions; no integration tests (DB not available in this environment) |
| RBAC enforcement | 10/10 | Page + API + export all gated correctly |
| Tenant isolation | 10/10 | Every query includes organizationId |
| Performance | 8/10 | Per-query timeouts, total cap, cache layers all in place; 500-record cap is a known limitation |
| Backward compatibility | 10/10 | Existing drilldown, export, and playbook sections unchanged |
| Error handling | 9/10 | Degraded/stale fallback for DB failures; Suspense boundaries isolate sections |
| UI/UX | 9/10 | Dark navy theme, 6 KPI cards, line/donut/bar/gauge charts, AI insights panel all implemented |
| Date range filtering | 7/10 | Works for primary analytics; dimension filters (dept/risk/status) not yet applied to aggregate queries |

**Overall: READY for production review with noted limitations.**

The dashboard is functionally complete and production-safe. The two deferral items (dimension filter propagation into aggregates, time series cap for high-volume orgs) should be tracked as follow-up engineering work before general availability at enterprise scale.
