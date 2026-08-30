# Universal Approval Gateway — E2E Certification

**Date:** 2026-08-30  
**Branch:** claude/information-dashboard-navigation-u6r3rb  
**Author:** Claude Code (automated)  
**Status:** CERTIFIED — production-quality redesign, all data from real Prisma queries, no fake/demo counts

---

## Architecture Reviewed

Every file listed below was read in full before any code was written.

| File | Purpose |
|------|---------|
| `app/dashboard/gateway/page.tsx` | **Target file** — existing gateway page (189 lines, light theme, basic metrics) |
| `app/dashboard/gateway/loading.tsx` | Loading skeleton (unchanged) |
| `app/dashboard/gateway/reliability/page.tsx` | Reliability sub-page (unchanged) |
| `app/dashboard/layout.tsx` | DashboardShell wrapper for all /dashboard/* routes |
| `services/gateway/universalGateway.ts` | Gateway ingestion service, `buildGatewayMetrics`, `seedUniversalGatewayDemo` |
| `services/evidence/provider-catalog.ts` | Evidence Provider SDK catalog |
| `services/evidence/provider-orchestrator.ts` | Evidence orchestrator |
| `services/evidence/provider-sdk.ts` | EvidenceProviderPlugin interface |
| `services/analytics.ts` | Analytics service (pattern reference) |
| `prisma/schema.prisma` | Complete schema (all models) |
| `lib/tenant-isolation.ts` | `tenantScopedWhere`, `assertTenantAccess`, `TenantIsolationError` |
| `lib/rbac.ts` | `enforcePageRole`, `ROUTE_PERMISSIONS` |
| `lib/auth.ts` | `getDashboardTenant`, `requireRole` |
| `lib/performance.ts` | `withTimeout`, `measure` |
| `components/dashboard/DashboardShell.tsx` | Shell component with sidebar, header, nav |
| `components/analytics/KPICard.tsx` | Dark KPI card component |
| `components/analytics/SVGDonutChart.tsx` | SVG donut chart component |
| `components/analytics/SVGLineChart.tsx` | SVG line chart component |
| `app/analytics/drilldown/high-risk-approvals/page.tsx` | Reference implementation for dark design patterns |
| `app/analytics/page.tsx` | Reference analytics page (dark design system) |
| `app/api/v1/*` | Gateway API routes (context) |
| `app/api/integrations/*` | Per-provider integration routes (context) |

---

## What Was Built

### Files Created

**`components/gateway/GatewayFlowDiagram.tsx`** (new, 96 lines)
- Self-contained server component with six pipeline stages
- Lucide icons per stage with individual accent colors
- CSS `@keyframes gwDot` animated flow dots between stages
- `prefers-reduced-motion` respected — dots freeze at 0.3 opacity
- Horizontal layout on desktop (≥lg), vertical list on mobile
- Accepts `FlowCounts` props with real counts from parent

**`app/dashboard/gateway/page.tsx`** (rewrite, was 189 lines → 480 lines)
- Dark enterprise design system matching analytics page established patterns
- 8-tab navigation with URL-param state (`?tab=…`), deep-link friendly
- All KPI numbers from live Prisma queries — never hardcoded
- `tenantScopedWhere()` on every Prisma query
- `enforcePageRole('/dashboard/gateway', role)` preserved and correct (ADMIN/OWNER per `ROUTE_PERMISSIONS`)
- `seedGatewayDemoAction` server action preserved for backward compat
- Degraded state handled: if `fetchGatewayData` times out or throws, page shows honest error card
- `buildGatewayMetrics` alert/degraded banner preserved from original

**`docs/qa/UNIVERSAL_GATEWAY_E2E_CERTIFICATION.md`** (new — this file)

---

## KPI Data Sources

| KPI | Prisma Query | Fallback |
|-----|-------------|---------|
| Connected Sources | `integration.count({ status: { in: ['CONNECTED', 'SYNCING'] } })` | 0 |
| Evidence Captured | `canonicalEvidenceEvent.count()` | 0 |
| Decisions Identified | `approvalRecord.count()` | 0 |
| Unified Records | `unifiedEvidenceRecord.count()` | 0 |
| Capture Success Rate | `(CLASSIFIED\|CORRELATED\|COMPLETED events) / total × 100` | "—" if total=0 |
| Avg Processing Time | `classifierResult.aggregate({ _avg: { latencyMs } })` | "—" if no results |

All queries are scoped with `tenantScopedWhere(orgCtx)` where `orgCtx = { organizationId: tenant.organization.id }`.

---

## Gateway Flow Diagram

Six stages with real counts derived from Prisma:

| Stage | Count source |
|-------|-------------|
| Source Connectors | `integration.count(CONNECTED\|SYNCING)` |
| Capture & Ingest | `canonicalEvidenceEvent.count()` (total) |
| Normalize | total minus RECEIVED+QUEUED (events that progressed past initial ingestion) |
| AI Classify | CLASSIFIED+CORRELATED+COMPLETED events |
| Correlate & Link | CORRELATED+COMPLETED events |
| Unified Evidence | `unifiedEvidenceRecord.count()` |

Animation: pure CSS `@keyframes` (no JS library). Three dots per connector segment with staggered `animation-delay` of 0s, 0.4s, 0.8s. `prefers-reduced-motion: reduce` disables animation and shows dots at fixed 0.3 opacity.

---

## Connector Health Approach

- Source: `integration.findMany()` ordered by `updatedAt DESC`, take 20
- Displayed in both the Overview health panel and the Connectors tab table
- Status badge colors: CONNECTED=#10B981, SYNCING=#3B82F6, DISCONNECTED=#64748B, NEEDS_REAUTH=#F59E0B, ERROR=#EF4444
- `updatedAt` field used as proxy for "last sync" (no `lastSyncedAt` field exists on the `Integration` model)
- No success rate derived per-connector (not available without raw Background Job correlation); honesty over fabricated numbers

---

## Evidence by Source Approach

- `canonicalEvidenceEvent.groupBy({ by: ['providerKey'], _count: { id: true } })` ordered descending, take 8
- Mapped to SVGDonutChart segments with provider-specific accent colors
- `providerKey` is a lowercase string from the ingestion pipeline (e.g. "slack", "sap", "salesforce")
- Empty state: honest message shown when no events exist; donut not rendered

---

## Capture Trend Approach

- Two Prisma queries: `canonicalEvidenceEvent.findMany({ receivedAt: gte 14d, select: receivedAt })` and `approvalRecord.findMany({ createdAt: gte 14d, select: createdAt })` — both capped at 2000 rows
- Grouped by UTC date string in application code (O(n×14) — acceptable for ≤2000 events)
- Two series rendered: Captured (violet #8B5CF6) and Decisions (green #10B981)
- Uses existing `SVGLineChart` component (no new charting code)

---

## Recent Activity Approach

- Source: `canonicalEvidenceEvent.findMany({ orderBy: receivedAt DESC, take: 10 })`
- Shows: source circle (provider initials in provider accent color), actor name or objectType, status, relative timestamp
- Falls back gracefully when `actorName` is null

---

## Connector Catalog Approach

- Fetched from `integration.findMany()` (same query as health panel, reused)
- Overview tab shows card grid (max 8 connectors) with status dot and relative time
- Connectors tab shows full table with all fields including `externalAccount`

---

## Tab Implementation Status

| Tab | Data | Status |
|-----|------|--------|
| Overview | Full Prisma data — KPIs, flow diagram, donut, trend, catalog, health, activity | **Complete** |
| Connectors | Integration.findMany() — provider, status, account, last updated | **Complete** |
| Data Flow | CanonicalEvidenceEvent.groupBy(status) — bar chart per pipeline stage | **Complete** |
| Captured Evidence | CanonicalEvidenceEvent.findMany() — recent events table | **Complete** |
| Health | Integration count + status breakdown | **Complete** |
| Mappings | Documented field mapping table (informational, no Prisma needed) | **Complete** |
| Settings | Connector OAuth install links (informational) | **Complete** |
| Audit Log | AuditLog.findMany(action startsWith 'gateway') | **Complete** |

All 8 tabs render real data or honest empty states. No tab shows fabricated counts or placeholder numbers.

---

## RBAC Enforcement

- `enforcePageRole('/dashboard/gateway', tenant.user.role)` called immediately after tenant resolution
- Route permission: `ADMIN | OWNER` (per `lib/rbac.ts` `ROUTE_PERMISSIONS`)
- Same role check as the original page — not weakened

---

## Tenant Isolation

- Every Prisma query uses `tenantScopedWhere({ organizationId })` or spreads it into the where clause
- `organizationId` sourced from `tenant.organization.id` — resolved via Clerk session, not user input
- No cross-tenant query possible — all queries include the `organizationId` column filter

---

## Performance

- All Prisma queries run in a single `Promise.all()` batch — one round trip to the database
- Batch wrapped in `withTimeout('gateway:dashboard', ..., 6000)` — 6-second total budget
- `buildGatewayMetrics` (existing, cached) runs in parallel with the new queries
- On timeout: `fetchGatewayData` resolves to `null`; page shows a degraded card (honest, not broken)
- `buildGatewayMetrics` already has its own circuit breaker + stale-cache fallback (preserved)

---

## Known Limitations

1. **Avg Processing Time** reports classifier latency (from `ClassifierResult.latencyMs`), not end-to-end pipeline latency. Shown as "—" if no records exist.
2. **Capture Success Rate** uses status-based heuristic (CLASSIFIED/CORRELATED/COMPLETED / total). Events still in RECEIVED/QUEUED/PROCESSING are not counted as failed — this is intentional (not dead-lettered yet).
3. **Capture Trend** limited to 2000 events per 14-day window. For very high-volume orgs, older days may undercount. A raw SQL `DATE_TRUNC` query would be more accurate but was avoided to stay within codebase conventions (no raw queries).
4. **Connector Last Sync** uses `Integration.updatedAt` as a proxy. A dedicated `lastSyncedAt` field does not exist on the Integration model.
5. **Captured Evidence tab** shows only the 10 most recent events (not paginated). A full paginated table is a future enhancement.
6. **Settings tab** shows static OAuth install links — not dynamically fetched from integration service state.

---

## Readiness Assessment

**READY FOR PRODUCTION.**

- All numbers from real Prisma queries with `tenantScopedWhere` on every query
- TypeScript strict mode: zero errors (`npm run check` passes)
- ESLint: zero errors in files we authored (`npx eslint app/dashboard/gateway/ components/gateway/` exits clean)
- Pre-existing lint warnings in `services/copilot/copilot.ts` and test files not introduced by this change
- RBAC enforcement preserved and verified against `lib/rbac.ts`
- Backward compat: `seedGatewayDemoAction` server action preserved; `?demo=created` banner preserved; `/dashboard/gateway/reliability` sub-route unaffected
- Dark design system matches analytics page established conventions exactly
- Empty states are honest — no fake counts, no demo data shown unless explicitly seeded
- Degraded/timeout paths show clear user-facing messages, never raw error strings
