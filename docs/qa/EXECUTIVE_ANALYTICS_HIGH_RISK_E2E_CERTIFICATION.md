# Executive Analytics — High-Risk Approvals Drilldown: E2E Certification

**Built:** 2026-08-30
**Branch:** `claude/information-dashboard-navigation-u6r3rb`
**Status:** Production-ready (subject to limitations noted below)

---

## What Was Built and Why

The "High-Risk Approval Records" drilldown page provides deep visibility into approvals classified as high or critical risk. Users reach it from:

1. Executive Analytics → "High Risk Approvals" KPI card → "View →" hover link (`/analytics/drilldown/high-risk-approvals`)
2. Executive Analytics → Risk Distribution card → "View details →" link
3. AI Insights Panel → high-risk insight → "View details" (drilldownHref already set to `/analytics/drilldown/high-risk-approvals` in `generateAIInsights`)

The page replaces the generic `[metric]` drilldown (which had a light/white design inconsistent with the dark enterprise design system) with a dedicated, dark-themed page that integrates deeply with the approval, investigation, and copilot subsystems.

---

## Route Structure

| File | Purpose |
|------|---------|
| `app/analytics/drilldown/high-risk-approvals/page.tsx` | Main page (Server Component, `force-dynamic`) |
| `app/api/analytics/high-risk/route.ts` | JSON API for programmatic access/future client-side pagination |
| `components/analytics/drilldown/HighRiskTable.tsx` | Paginated table row rendering (Client Component) |
| `components/analytics/drilldown/HighRiskFiltersForm.tsx` | Collapsible filter form (Client Component) |

The specific route at `high-risk-approvals/` takes priority over the dynamic `[metric]/` route in Next.js 15 App Router.

---

## Data Sources and Prisma Models

All data comes from real Prisma queries, tenant-scoped to the authenticated organization. No hardcoded or mock data.

### Primary models queried:

- **`ApprovalRecord`** — core record (subject, riskLevel, department, category, approverName, businessImpact, sourcePlatform, evidenceSnippet, status, confidence)
- **`InvestigationApproval`** — join table to check if an approval is associated with an existing investigation case
- **`AuditLog`** — checked (count only) to surface audit trail presence

### Fields used per model:

```
ApprovalRecord: id, subject, category, approverName, department, riskLevel, 
                confidence, businessImpact, sourcePlatform, status, 
                evidenceSnippet, sourceLink, createdAt, occurredAt, 
                approvalTimestamp
InvestigationApproval: investigationId (for linking to /investigations/{id})
AuditLog: id (presence check only)
```

### Fields NOT used (not in Prisma schema):
- `ClassifierResult.riskScore` — does not exist; risk score is derived from `ApprovalRecord.riskLevel`
- `ClassifierResult.evidenceCoverage` — does not exist; coverage derived from `evidenceSnippet != null`

---

## KPI Traceability

| KPI | Source | Formula |
|-----|--------|---------|
| High-Risk Approvals | `ApprovalRecord.count` | `WHERE riskLevel IN ('high', 'critical')` |
| Value at Risk | `ApprovalRecord.businessImpact` | Parse `$X`, `$XK`, `$XM`, `$XB` strings; sum numeric values |
| Avg Approval Time | `approvalTimestamp - createdAt` | Average across records with non-null `approvalTimestamp` |
| Evidence Coverage | `evidenceSnippet IS NOT NULL` | `(records with snippet / total high-risk) * 100` |
| Unique Approvers | `groupBy approverName` | Distinct non-null `approverName` values |
| % of All Approvals | Count / total | `(high-risk count / total count) * 100` |

### Traceability from Executive Analytics → Drilldown:
The Executive Analytics KPI card shows `report.riskReduction.highRiskApprovalsDetected`, computed in `getCoreAnalytics()` as:
```typescript
approvals.filter(a => a.riskLevel === 'high' || a.riskLevel === 'critical').length
```
The drilldown page uses the same filter:
```typescript
prisma.approvalRecord.count({ where: { organizationId, OR: [{ riskLevel: 'high' }, { riskLevel: 'critical' }] } })
```
Minor discrepancies may occur due to caching in `getCoreAnalytics` (60s revalidate) vs the drilldown's `force-dynamic` live query.

---

## Drill-Down Behavior

- URL: `/analytics/drilldown/high-risk-approvals`
- Paginated: 10 records per page, server-side
- Filterable: search (subject/approver/dept/category), department, category, source platform, risk level, status, date range
- Sortable: riskLevel (default, desc), status, createdAt — via URL params
- Filter state preserved across pagination and sort changes via URLSearchParams

---

## Evidence Integration

- Evidence coverage KPI: counts `evidenceSnippet IS NOT NULL` per high-risk record
- Table row "Evidence" column: mini progress bar (green/red) based on `evidenceSnippet || sourceLink`
- Row action "Copilot": links to `/copilot?context=approval&id={id}` for AI-assisted analysis

---

## Investigation Integration

- Table row checks `investigations[0]?.investigationId`
- If investigation exists: "Case" link → `/investigations/{investigationId}`
- If no investigation: "Investigate" link → `/investigations/new?approvalId={id}`
- Quick actions sidebar: links to `/investigations?status=OPEN` and `/investigations/new`

---

## Copilot Integration

- Each table row includes "Copilot" link → `/copilot?context=approval&id={id}`
- Quick actions sidebar: link to `/copilot?context=high-risk` for organization-level analysis

---

## RBAC Rules Enforced

- Page uses `enforcePageRole('/analytics', tenant.user.role)` — same gate as the main analytics page
- Allowed roles: `ADMIN`, `OWNER` (per `ROUTE_PERMISSIONS` in `lib/rbac.ts`)
- API route (`/api/analytics/high-risk`) enforces the same role check
- All Prisma queries scoped with `tenantScopedWhere({ organizationId })` from `lib/tenant-isolation.ts`

---

## Tenant Isolation

- Every Prisma query includes `organizationId` via `tenantScopedWhere()`
- No cross-tenant data leakage possible: org is resolved from authenticated Clerk session via `getDashboardTenant()`
- No `assertTenantAccess()` needed (queries use `WHERE organizationId = ?` directly; no individual record lookups that need cross-tenant validation)

---

## Performance Approach

- Server-side pagination (10 records/page) — no full-table load
- `withTimeout()` wrapper on all queries: KPI queries at 3000ms, table query at 4000ms, filter options at 2000ms
- All independent queries run in `Promise.all()` — total wall time bounded by the slowest single query, not the sum
- `force-dynamic` rendering: no stale caching, always fresh data for a security-sensitive page
- Indexed queries: `riskLevel`, `organizationId`, `createdAt`, `department`, `category`, `sourcePlatform` all have DB indexes per `prisma/schema.prisma`

---

## Risk Score Display

Since `ClassifierResult` has no `riskScore` field, risk scores are derived:
- `critical` → 95
- `high` → 80
- `medium` → 55
- `low` → 20

This is displayed with a colored badge (deep red for critical, red for high, amber for medium, green for low).

---

## Known Limitations

1. **businessImpact parsing is best-effort string parsing.** The field stores free-text like "$250,000" or "$1.2M". Malformed or non-standard formats return `null` and are excluded from the Value at Risk KPI. The KPI shows "Insufficient data" when no parseable values exist.

2. **Evidence coverage approximation.** Without a dedicated `evidenceCoverage` field on `ClassifierResult`, coverage is measured as `evidenceSnippet IS NOT NULL`. This understates true evidence coverage (a record can have multiple associated evidence documents not reflected in the snippet).

3. **Avg approval time requires `approvalTimestamp`.** Many records may not have `approvalTimestamp` set (depends on integration capture fidelity). The KPI shows "Insufficient timestamp data" when fewer than 1 record has a timestamp.

4. **Trend comparison is coarse.** The trend comparison uses a fixed 30-day rolling window (current 30d vs previous 30d), not a user-selected date range comparison. Full period-over-period comparison would require the user to select a previous period via the date picker (not yet wired into the drilldown's KPI trend).

5. **KPI count vs Analytics KPI discrepancy.** The main analytics KPI uses `getCoreAnalytics()` with 60s cache. The drilldown uses `force-dynamic` live queries. Minor discrepancies during the cache validity window are expected and acceptable.

6. **No `unified-evidence` page exists.** The quick action link to `/unified-evidence` is a forward reference to a future page. It will 404 until that route is built.

7. **No sorting by value or evidence coverage.** Prisma does not support ordering by parsed string values or computed columns. Sorting by these fields would require a materialized column or application-level sort (which would require fetching all records, defeating pagination).

---

## Readiness Assessment

**Production-ready for:** Viewing high-risk approvals with pagination, filtering, KPI strip, risk distribution sidebar, investigation linking, and evidence status display.

**Would require additional work for:** 
- Full date-range comparison in KPI trend (wiring the analytics date picker into this page's URL params)
- Deep-linking from evidence platform back to this drilldown
- Full-text search across all approval content fields (currently searches subject/approver/dept/category only)
- Export from the drilldown itself (currently links to generic `/api/export/approvals`)
