# Compliance Hub Architecture

Route: `/trust/compliance`  
Feature branch: `claude/information-dashboard-navigation-u6r3rb`

## Purpose

Compliance Hub is the central compliance command center for ApprovLine. It enables enterprise customers to:

- Monitor compliance posture across active regulatory frameworks (SOC2, ISO27001, GDPR, HIPAA, PCI-DSS, NIST CSF)
- Track control effectiveness and evidence completeness
- Manage remediation issues and attestations
- Produce an auditable evidence trail aligned to each tenant organization

## Data Model

Five new Prisma models back the Compliance Hub. All carry `organizationId` for tenant isolation.

| Model | Purpose |
|---|---|
| `ComplianceFramework` | Regulatory frameworks enabled per org (SOC2, ISO27001, GDPR, …) |
| `ComplianceControl` | Individual controls within a framework; tracks status and effectiveness |
| `ComplianceIssue` | Compliance violations or gaps with severity and remediation status |
| `ComplianceAttestation` | Policy and control attestations requiring sign-off |
| `ComplianceDeadline` | Upcoming audit, review, and assessment deadlines |

All five models are linked back to `Organization` via FK + cascade delete, matching the multi-tenancy pattern used throughout ApprovLine.

Migration: `prisma/migrations/20260901000000_add_compliance_hub/migration.sql`

## Service Layer

**`services/compliance.ts`** is the sole service for Compliance Hub data. It:

- Uses `tenantScopedWhere()` for all reads (no ad-hoc `where: { organizationId }` patterns)
- Uses `assertTenantAccess()` before every mutation (IDOR prevention)
- Writes `writeAuditLog()` entries for: `COMPLIANCE_ISSUE_CREATED`, `COMPLIANCE_ISSUE_RESOLVED`, `COMPLIANCE_ATTESTATION_COMPLETED`, `COMPLIANCE_CONTROL_UPDATED`
- Derives compliance score from `ApprovalComplianceEvaluation` (existing model); no new scoring engine
- Reuses `PlaybookRule`/`PlaybookDocument` for policy data (Policy Center tab links to `/playbooks`)
- Reuses `InvestigationCase` for risk correlation (Risk & Issues tab links to `/investigations`)
- Wraps all Prisma calls in `withTimeout()` (8 s for the overview, 4 s for sub-fetches)
- Caches with `cache(unstable_cache(..., { revalidate: 120 }))` for GET endpoints

Key exported functions:

```
getComplianceOverview(organizationId) → ComplianceOverview
getComplianceTrend(organizationId, days) → ComplianceTrendPoint[]
getComplianceFrameworks(organizationId) → FrameworkSummary[]
getComplianceControls(organizationId, frameworkId?) → ControlSummary[]
getComplianceIssues(organizationId, filters?) → IssueSummary[]
getComplianceAttestations(organizationId) → AttestationSummary[]
seedComplianceFrameworks(organizationId) → void (idempotent)
createComplianceIssue(ctx, input) → ComplianceIssue
updateComplianceIssueStatus(ctx, issueId, status) → void
completeAttestation(ctx, attestationId, notes?) → void
updateControlStatus(ctx, controlId, status, effectiveness?) → void
```

## API Routes

| Route | Methods | RBAC |
|---|---|---|
| `/api/compliance/overview` | GET | ADMIN, AUDITOR, OWNER |
| `/api/compliance/trend` | GET `?days=30` | ADMIN, AUDITOR, OWNER |
| `/api/compliance/frameworks` | GET | ADMIN, AUDITOR, OWNER |
| `/api/compliance/controls` | GET `?frameworkId` · PATCH | GET: ADMIN, AUDITOR, OWNER · PATCH: ADMIN, OWNER |
| `/api/compliance/issues` | GET `?status&severity&frameworkId` · POST · PATCH | GET: ADMIN, AUDITOR, OWNER, MANAGER · POST/PATCH: ADMIN, OWNER, MANAGER |
| `/api/compliance/attestations` | GET · PATCH (complete) | GET: ADMIN, AUDITOR, OWNER, MANAGER · PATCH: ADMIN, OWNER, MANAGER |
| `/api/compliance/seed` | POST | ADMIN, OWNER |

All routes call `getDashboardTenant()` and `hasAnyRole()` before touching the database. Tenant ID is always sourced from the authenticated session — never from request parameters.

## Page Architecture

**`app/trust/compliance/page.tsx`** — Server Component

1. Authenticates via `getDashboardTenant()`; redirects unauthenticated users to `/sign-in`
2. Enforces RBAC via `enforcePageRole('/trust/compliance', role)` (requires ADMIN, AUDITOR, or OWNER)
3. Auto-seeds default frameworks via `seedComplianceFrameworks(orgId)` if org has none (idempotent)
4. Fetches `getComplianceOverview()` and `getComplianceTrend(30)` in parallel
5. Renders `<DashboardShell>` wrapping the page header + `<ComplianceHubShell>` client component

**`components/compliance/ComplianceHubShell.tsx`** — Client Component

Receives `initialData: ComplianceOverview`, `trendPoints: ComplianceTrendPoint[]`, `orgId: string` as server-fetched props.

Tabs:
- **Overview** — KPI strip (score arc gauge, controls, open issues, attestations, evidence coverage), framework posture table, score trend SVG chart, top risk areas, control status donut, recent activities, upcoming deadlines sidebar
- **Frameworks** — card grid with live data from `/api/compliance/frameworks`
- **Controls** — inline status editing via `/api/compliance/controls`
- **Policy Center** — links to existing Playbook AI (`/playbooks`) and AI Copilot
- **Risk & Issues** — filterable issue table via `/api/compliance/issues`; links to Investigation Center
- **Attestations** — attestation table with completion action via `/api/compliance/attestations`
- **Audit Trail** — links to existing `/dashboard/audit`; fetches from existing `/api/analytics/compliance`

All SVG charts (arc gauge, donut, sparkline trend) are inline — no third-party chart library.

## Tenant Isolation

Isolation is enforced at four layers:

1. **UI** — server component resolves `orgId` from authenticated session; client tabs fetch from API routes that also enforce session
2. **API** — every route calls `getDashboardTenant()` + `hasAnyRole()`; `organizationId` always comes from session, never from the request body or query string
3. **Service** — `tenantScopedWhere(scope, ...)` injects `organizationId` into every Prisma query; `assertTenantAccess()` guards every mutation
4. **Database** — all tables have `organizationId` FK with index; cascade delete on `Organization`

Tenant A cannot see Tenant B's frameworks, controls, issues, attestations, deadlines, or compliance metrics.

## Reuse of Existing Infrastructure

The Compliance Hub does not duplicate any existing ApprovLine engine:

| Capability | Existing infrastructure reused |
|---|---|
| Compliance scoring | `ApprovalComplianceEvaluation` table |
| Policy / playbooks | `PlaybookDocument`, `PlaybookRule` (Policy Center tab links to `/playbooks`) |
| Risk correlation | `InvestigationCase` (Risk & Issues tab links to `/investigations`) |
| Audit trail | `AuditLog` table + `writeAuditLog()` service |
| Evidence | `CanonicalEvidenceEvent`, `UnifiedEvidenceRecord` (evidence coverage metric) |
| Auth / RBAC | `getDashboardTenant()`, `enforcePageRole()`, `hasAnyRole()` |
| Tenant isolation | `tenantScopedWhere()`, `assertTenantAccess()`, `TenantIsolationError` |

## Performance

- Overview data is cached for 120 seconds per org via `unstable_cache`
- All Prisma calls wrapped in `withTimeout()` to prevent waterfall hangs
- Framework, control, and issue queries are paginated (max 200 rows)
- SVG charts are rendered inline — zero runtime JS for chart drawing
