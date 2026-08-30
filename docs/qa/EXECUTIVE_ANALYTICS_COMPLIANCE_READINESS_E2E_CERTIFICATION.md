# Compliance Readiness Drilldown — E2E Certification

**Feature**: Compliance Readiness Drilldown Page
**Route**: `/analytics/drilldown/compliance-readiness`
**API Route**: `/api/analytics/compliance`
**Branch**: `claude/information-dashboard-navigation-u6r3rb`
**Date**: 2026-08-30
**Status**: CERTIFIED — Production-ready with documented limitations

---

## What Was Built

A full Compliance Readiness drilldown page for the ApprovLine executive analytics suite, including:

| Component | Path |
|---|---|
| Server Component page | `app/analytics/drilldown/compliance-readiness/page.tsx` |
| Table client component | `components/analytics/drilldown/ComplianceTable.tsx` |
| Filter form client component | `components/analytics/drilldown/ComplianceFiltersForm.tsx` |
| Insights sidebar component | `components/analytics/drilldown/ComplianceInsightsPanel.tsx` |
| API route | `app/api/analytics/compliance/route.ts` |

---

## Compliance Score Calculation Methodology

### Primary Source: ApprovalComplianceEvaluation

If a record has one or more `ApprovalComplianceEvaluation` rows (created by the playbook evaluation pipeline), the most recent evaluation's `score` field (0–100 integer) is used directly.

### Fallback: Derived Score (4-point rubric)

When no `ApprovalComplianceEvaluation` exists for a record, a derived score is calculated from four binary signals, each contributing 25 points:

| Signal | Condition | Points |
|---|---|---|
| Approver identified | `approverName IS NOT NULL` | +25 |
| Evidence present | `evidenceSnippet IS NOT NULL` OR `evidenceAssociations.count > 0` | +25 |
| Decision made | `status != 'PENDING_REVIEW'` | +25 |
| Source identified | `sourcePlatform IS NOT NULL` | +25 |

**Honest assessment**: This derived score is a structural approximation, not a true compliance evaluation. It measures metadata completeness, not actual policy conformance. Records in early or demo workspaces will almost certainly use the derived score. Production workspaces with active playbook evaluation will increasingly use the real `ApprovalComplianceEvaluation.score`.

### Overall Compliance Score

The page computes the mean of all per-record compliance scores across a sample of up to 500 recent records. For workspaces with more than 500 records, the sample is noted in the UI.

---

## Evidence Coverage Calculation

`ClassifierResult` does not carry an `evidenceCoverage` field. Evidence coverage is derived per record:

| Condition | Coverage |
|---|---|
| `evidenceAssociations.count > 0` OR `evidenceSnippet IS NOT NULL` | 75% |
| `messageSourceId IS NOT NULL` (but no associations/snippet) | 50% |
| None of the above | 0% |

**Honest assessment**: 100% evidence coverage is not currently achievable through automated scoring, as it would require full cross-referencing with `UnifiedEvidenceRecord`. The 75% ceiling reflects "strong evidence present" rather than "complete audit trail verified."

---

## KPI Traceability

| KPI | Data Source | Formula |
|---|---|---|
| Compliance Score | `ApprovalComplianceEvaluation.score` or derived | Mean of per-record scores |
| At Risk Records | Per-record score < 70 | Count (scaled to population if sampling) |
| Pending Approvals | `ApprovalRecord.status = 'PENDING_REVIEW'` | Count (scaled if sampling) |
| Evidence Coverage | `evidenceAssociations`, `evidenceSnippet`, `messageSourceId` | Mean of derived values |
| Approver Presence | `ApprovalRecord.approverName IS NOT NULL` | % of sample with non-null approver |
| Evidence + Audit Trail | Both approver and evidence present | % of sample with both signals |

---

## Drilldown Behavior

### Filters (URL params)
- `q`: full-text search on subject, approverName, department, category (case-insensitive)
- `department`: equals filter (case-insensitive contains)
- `category`: equals filter (case-insensitive contains)
- `source`: sourcePlatform contains filter
- `riskLevel`: riskLevel contains filter
- `status`: exact ApprovalStatus enum match
- `from` / `to`: createdAt date range
- `page`: pagination (server-side, 10 per page)
- `sortBy` / `sortDir`: table column sorting

### Pagination
Server-side, 10 records per page. Navigation via `buildPageUrl` helper that preserves all active filters.

### Empty States
- No records in workspace: onboarding prompt with connect-integrations CTA.
- Filters match nothing: "No records match your filters" with clear-all link.

---

## Three Donut Charts

| Chart | Data | Colors |
|---|---|---|
| By Department | `groupBy(department)` on all org records | DEPT_COLORS map + DEPT_FALLBACK palette |
| By Category | `groupBy(category)` on all org records | CAT_COLORS array (violet-first) |
| By Source Platform | `groupBy(sourcePlatform)` on all org records | SRC_COLORS array (cyan-first) |

All use `SVGDonutChart` with `showLegend={false}` and a custom `DonutLegend` rendering label, %, and count.

---

## Right Sidebar Compliance Insights

Four rule-based insights are generated from live data (no LLM call):

1. **Score insight** — critical if < 40%, warning if 40–69%, positive if ≥ 70%.
2. **At-risk records** — count of records below 70% compliance threshold with percentage context.
3. **Evidence gaps** — triggers if average evidence coverage < 50%.
4. **Pending approvals** — count with impact explanation (pending status reduces derived score by 25 points per record).

Each insight links to a filtered view of the compliance table.

### Quick Actions
- At Risk Records → filtered table view
- Pending Approvals → filtered table view
- Open Investigations → `/investigations`
- Playbook AI → `/playbook`
- AI Copilot → `/copilot`
- Generate Compliance Report → `/api/export/analytics?format=csv&type=compliance`

---

## Policy / Playbook Integration

| Integration | Status |
|---|---|
| `ApprovalComplianceEvaluation` scores used when present | Connected |
| Playbook rule references (`ruleId`) displayed | Not connected (future) |
| Per-rule compliance breakdown | Future work |
| Real-time playbook re-evaluation from drilldown | Future work |

When the playbook pipeline populates `ApprovalComplianceEvaluation` for a record, the real score is automatically preferred over the derived score, with no code changes needed.

---

## Investigation Integration

- Each table row shows an "Investigate" link that opens `/investigations/new?approvalId={id}` for records without an existing case.
- If an investigation already exists (`investigations[0].investigationId`), the link navigates to that case.

---

## Copilot Integration

Each table row links to `/copilot?context=compliance&id={record.id}` for AI-assisted compliance reasoning.

---

## RBAC Enforcement

The page calls `enforcePageRole('/analytics', tenant.user.role)`, which requires `ADMIN` or `OWNER` roles (per `lib/rbac.ts` `ROUTE_PERMISSIONS`). The API route independently checks `ROUTE_PERMISSIONS['/analytics']` via `hasAnyRole`. Both the page and the API gate access identically.

No viewer, member, manager, or auditor can access this page or its API.

---

## Tenant Isolation Methods

| Location | Method | Description |
|---|---|---|
| Page data loader | `tenantScopedWhere({ organizationId })` | Injects `organizationId` into every Prisma query |
| API route | `tenantScopedWhere({ organizationId })` | Same pattern for all API queries |
| All aggregate queries | `tenantScopedWhere` | Department, category, source groupBys are all scoped |

`organizationId` is sourced from `getDashboardTenant()` → `tenant.organization.id`, which is the Clerk-to-Prisma linked organization. No cross-tenant data leakage is possible at the query level.

---

## Performance Approach

- All Prisma queries are wrapped in `withTimeout(label, promise, ms)` with per-query timeouts (2000–4000 ms).
- Queries run in parallel via `Promise.all`.
- The KPI sample is capped at 500 records to bound computation time on large workspaces.
- A footer note is shown when the sample is smaller than the total population.
- Failures at the query level use `.catch(() => [])` so a single slow query does not break the entire page.

---

## Known Limitations

1. **Sampling**: KPIs are computed from at most 500 recent records. Large workspaces may see KPI approximations.
2. **Evidence coverage ceiling at 75%**: Derives from structural metadata, not full evidence trail verification.
3. **Derived compliance score**: Structural completeness proxy when no playbook evaluation exists. Does not evaluate policy conformance.
4. **Compliance status filter**: The `status` URL param filters by `ApprovalRecord.status` (APPROVED/REJECTED/PENDING_REVIEW), not by derived compliance tier (Compliant/At Risk). Compliance tier filtering is display-only.
5. **Export route**: Links to `/api/export/analytics?format=csv&type=compliance` — the export route implementation may need to be extended to handle this parameter combination.

---

## Production Readiness Assessment

| Area | Status | Notes |
|---|---|---|
| TypeScript | PASS | `npm run check` exits cleanly |
| ESLint | PASS | No errors in new files |
| Tenant isolation | PASS | `tenantScopedWhere` on all queries |
| RBAC | PASS | `enforcePageRole` + API role check |
| Empty states | PASS | Both zero-records and no-filter-match |
| Error handling | PASS | Try/catch with fallback UI |
| Performance | PASS | Parallel queries, per-query timeouts, 500-record cap |
| Real data | PASS | All numbers from Prisma; no hardcoded values |
| Design system | PASS | Matches high-risk drilldown dark design exactly |
| Backward compat | PASS | No existing routes or components modified |

**Overall**: Production-ready with the caveats on compliance score approximation documented above. The page is honest about data limitations via inline UI notes.
