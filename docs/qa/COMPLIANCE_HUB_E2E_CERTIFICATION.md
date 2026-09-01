# Compliance Hub — E2E Certification

Route: `/trust/compliance`  
Status: **CERTIFIED** — 2026-09-01

## Business Flow Verification

### BF-01: Page loads for authorized roles
- Sign in as ADMIN, OWNER, or AUDITOR
- Navigate to `/trust/compliance`
- Assert: Compliance Hub header renders with org name
- Assert: Tab strip shows: Overview | Frameworks | Controls | Policy Center | Risk & Issues | Attestations | Audit Trail
- Assert: Overview KPI strip shows 5 cards (score, controls, issues, attestations, evidence coverage)

### BF-02: Auto-seed on first visit
- New organization with no compliance frameworks
- Navigate to `/trust/compliance`
- Assert: `seedComplianceFrameworks()` runs (idempotent check on count)
- Assert: After seeding, Overview tab shows SOC2, ISO27001, GDPR, HIPAA, PCI-DSS, NIST CSF frameworks

### BF-03: Framework posture table
- Navigate to Frameworks tab
- Assert: Cards display slug, name, score (null = "—" when no controls assessed), open issues count, last assessment date

### BF-04: Control status update (ADMIN/OWNER)
- Navigate to Controls tab
- Change a control's status via the inline select
- Assert: PATCH `/api/compliance/controls` returns 200
- Assert: `AuditLog` records `COMPLIANCE_CONTROL_UPDATED`

### BF-05: Issue creation and resolution (ADMIN/OWNER/MANAGER)
- Navigate to Risk & Issues tab
- Create a CRITICAL severity issue
- Assert: POST `/api/compliance/issues` returns 201
- Assert: Issue appears in table with CRITICAL badge
- Click Resolve
- Assert: PATCH `/api/compliance/issues` returns 200
- Assert: `AuditLog` records `COMPLIANCE_ISSUE_RESOLVED`

### BF-06: Attestation completion (ADMIN/OWNER/MANAGER)
- Navigate to Attestations tab
- Click Complete on a PENDING attestation
- Assert: PATCH `/api/compliance/attestations` returns 200
- Assert: Row status updates to COMPLETED
- Assert: `AuditLog` records `COMPLIANCE_ATTESTATION_COMPLETED`

### BF-07: Audit Trail
- Navigate to Audit Trail tab
- Assert: "Full Audit Log →" link leads to `/dashboard/audit`
- Assert: "Export CSV" link leads to `/api/export/approvals?format=csv`
- Assert: Recent compliance records load from `/api/analytics/compliance`

### BF-08: Policy Center integration
- Navigate to Policy Center tab
- Assert: "Open Playbook AI" link leads to `/playbooks`
- Assert: AI Copilot link includes pre-filled compliance query

### BF-09: Investigation Center integration
- Navigate to Risk & Issues tab
- Assert: "Investigation Center →" link leads to `/investigations`

## Security Verification

### SEC-01: Unauthenticated access denied
- Sign out
- Navigate to `/trust/compliance`
- Assert: Redirect to `/sign-in`

### SEC-02: Insufficient role blocked
- Sign in as MEMBER or VIEWER role
- Navigate to `/trust/compliance`
- Assert: Redirect to `/dashboard` (enforcePageRole behavior)

### SEC-03: API route unauthorized
- Call `GET /api/compliance/overview` without a valid session cookie
- Assert: 401 Unauthorized

### SEC-04: API route forbidden (wrong role)
- Sign in as MEMBER
- Call `PATCH /api/compliance/controls` (requires ADMIN/OWNER)
- Assert: 403 Forbidden

### SEC-05: Tenant isolation — cross-org data inaccessible
- Org A creates a compliance issue (Issue A-1)
- Sign in as Org B admin
- Assert: `GET /api/compliance/issues` does NOT return Issue A-1
- Assert: Direct Prisma query for Issue A-1 with Org B's scope returns empty

### SEC-06: IDOR prevention on mutations
- Org A creates a compliance issue (Issue A-1, id: `abc123`)
- Sign in as Org B admin
- Call `PATCH /api/compliance/issues` with `{ issueId: "abc123", status: "RESOLVED" }`
- Assert: `assertTenantAccess()` throws; response is 403 or 404

### SEC-07: No secrets in responses
- Call all compliance API routes as ADMIN
- Assert: No `accessToken`, `refreshToken`, `ENCRYPTION_KEY`, or OAuth credential fields in any response body

### SEC-08: organizationId always from session
- All compliance API routes must source `organizationId` from `getDashboardTenant()`, never from query params or request body
- Assert: Manually injecting `organizationId` in request body is ignored

## Data Integrity Verification

### DI-01: Compliance score derivation
- Organization with ≥1 `ApprovalComplianceEvaluation` record in last 30 days
- Assert: `getComplianceOverview()` returns `score` equal to average of `score` column in `ApprovalComplianceEvaluation`
- Assert: `scoreTrend` reflects difference from prior 30-day window

### DI-02: Evidence coverage metric
- Assert: `evidenceCoverage` = (approverName present + evidenceSnippet present) / (totalApprovals * 2) * 100
- Edge case: 0 approvals → 0%

### DI-03: Approval compliance metric
- Assert: `approvalCompliance` = (Compliant evaluations / total approvals) * 100
- Edge case: 0 approvals → 0%

### DI-04: Framework score derivation
- Framework with 4 EFFECTIVE controls, 1 INEFFECTIVE, 1 NOT_ASSESSED out of 6 total
- Assert: `fwScore` = round(4/6 * 100) = 67

### DI-05: Seed idempotency
- Call `seedComplianceFrameworks(orgId)` twice
- Assert: `ComplianceFramework` count for org remains 6 (not 12)

## Performance Verification

### PERF-01: Overview caching
- Call `GET /api/compliance/overview` twice within 120 seconds for same org
- Assert: Second call returns same data (from cache); Prisma query count does not double

### PERF-02: Timeout protection
- Simulate DB latency > 8 seconds on overview
- Assert: `withTimeout('compliance-overview', ...)` rejects; page renders error state

## Empty State Verification

### EMPTY-01: No frameworks
- New org with no frameworks (before auto-seed)
- Assert: Frameworks tab shows "No frameworks configured" empty state

### EMPTY-02: No issues
- Org with no compliance issues
- Assert: Risk & Issues tab shows "No compliance issues found"

### EMPTY-03: No attestations
- Org with no attestations
- Assert: Attestations tab shows "No attestations found"

### EMPTY-04: No deadlines
- Org with no compliance deadlines
- Assert: Overview sidebar shows "No upcoming deadlines"

## Certification Sign-Off

| Check | Status |
|---|---|
| `npm run lint` | PASS (no errors in compliance files) |
| `npm run check` | PASS (TypeScript strict) |
| `npm run build` | PASS |
| All API routes have auth + RBAC | VERIFIED |
| All mutations use `assertTenantAccess()` | VERIFIED |
| All queries use `tenantScopedWhere()` | VERIFIED |
| All mutations write `AuditLog` | VERIFIED |
| No duplicate approval/evidence/audit engines | VERIFIED |
| No hardcoded secrets | VERIFIED |
| Backward compatibility preserved | VERIFIED |

Certified: 2026-09-01
