# Playbook AI Advisory — E2E Certification

**Date:** 2026-08-29  
**Branch:** `claude/information-dashboard-navigation-u6r3rb`  
**Scope:** End-to-end certification of the Playbook AI Advisory feature redesign

---

## 1. Architecture Review

### Backend (unchanged, existing services)

| Layer | Component | Status |
|---|---|---|
| Service | `services/playbooks.ts` | Unchanged — all existing functions preserved |
| API — list/seed | `app/api/playbooks/route.ts` | Unchanged |
| API — upload | `app/api/playbooks/upload/route.ts` | Unchanged |
| API — query | `app/api/playbooks/query/route.ts` | Unchanged |
| API — evaluate | `app/api/playbooks/evaluate/route.ts` | Unchanged |
| API — single doc GET | `app/api/playbooks/[id]/route.ts` | **Added GET handler** |
| API — single doc DELETE | `app/api/playbooks/[id]/route.ts` | Unchanged |
| DB schema | `prisma/schema.prisma` | Unchanged — no new migrations |

### Frontend (redesigned)

| File | Change |
|---|---|
| `app/playbooks/page.tsx` | Extended server component: passes `currentUserId`, `canManage`, full `answer` JSON |
| `components/playbooks/PlaybookClient.tsx` | Complete UI redesign — dark navy enterprise theme, advisory panel, approval path |

### New GET `/api/playbooks/[id]`

- Requires authentication (Clerk)
- Requires role: `OWNER`, `ADMIN`, or `AUDITOR`
- Tenant-scoped: document fetched with `organizationId: tenant.organization.id`
- Returns document with `_count: { chunks, rules }`
- Returns 404 (not 403) when document doesn't belong to tenant — prevents existence leak

---

## 2. Features Implemented

### Advisory Workspace

- Natural-language input with "Get Advisory" button and panel chat input
- Suggestion chips for common use cases (vendor onboarding, marketing budget, etc.)
- Advisory response rendered in AI Advisor right panel with:
  - User message bubble
  - AI preamble
  - Answer summary (first 200 chars)
  - Step-by-step recommended approval path (derived from `requiredDepartments` + `requiredApprovers`)
  - Compliance status badge (Compliant / Non-compliant / Needs review)
  - Likely Outcome card (confidence %, risk level, estimated time)
  - Policy References (up to 3 policy sections with excerpt)
  - Missing Information warnings (`evidenceMissing` array)
  - View Similar Past Approvals link

### Playbooks & Policies Table

- 4 tabs: All Playbooks / My Playbooks / Department Playbooks / Shared With Me
- Columns: Name, Category, Version, Last Updated, Compliance Score (bar + %), Status, Actions
- Upload modal: category select + file input + Upload & Index button
- Demo playbooks seeding for empty state
- Delete per-row (OWNER/ADMIN only)

### Stats Tiles (5)

- Total Playbooks
- Active Policies (rule count from insights)
- Advisories Generated (evaluation count or query count fallback)
- Compliance Score (from `getPlaybookComplianceInsights`)
- Avg. Resolution

### AI Insights & Recommendations (4 cards)

All cards derive data from `getPlaybookComplianceInsights()` — never hardcoded:

- Policy Gap Detected — most violated policy, violation count
- Approval Bottleneck — department with highest violation count
- Compliance Alert — non-compliant approval count
- Optimization Suggestion — indexed playbook count, automation hint

### Advisory History Panel

- Last 5 advisories shown as clickable list
- Each entry shows question (truncated), compliance badge, timestamp
- Clicking an entry restores the full advisory in the panel

### Initial Advisory on Load

- Most recent `PlaybookQuery.answer` JSON is parsed on server render
- Pre-populates the AI Advisor panel without requiring a new AI request

---

## 3. AI Grounding Behavior

Advisory answers come from `services/playbooks.ts → queryPlaybooks()`:

1. Semantic search via Voyage AI embeddings (cosine similarity in TypeScript)
2. Top matching chunks passed to Anthropic Claude as context
3. Structured JSON response validated against `PlaybookAnswer` shape
4. If no playbooks indexed: fallback answer returned with `confidence: 0`
5. All answers stored in `PlaybookQuery` table with `organizationId`, `actorUserId`, `confidence`

Advisory answers are **never hardcoded** — they are AI-generated from the tenant's own uploaded policy documents.

---

## 4. RBAC Validation

| Operation | Allowed Roles | Enforcement |
|---|---|---|
| View playbooks page | OWNER, ADMIN, AUDITOR | `enforcePageRole('/playbooks', role)` in page.tsx |
| Upload playbook | OWNER, ADMIN | API: `hasAnyRole(['OWNER', 'ADMIN'])` + UI: `canManage` prop |
| Delete playbook | OWNER, ADMIN | API: `hasAnyRole(['OWNER', 'ADMIN'])` + UI: `canManage` prop |
| Query advisory | OWNER, ADMIN, AUDITOR | API: `hasAnyRole(['OWNER', 'ADMIN', 'AUDITOR'])` |
| Evaluate approvals | OWNER, ADMIN | API: `hasAnyRole(['OWNER', 'ADMIN'])` + UI: `canManage` prop |
| GET single playbook | OWNER, ADMIN, AUDITOR | New GET handler: `hasAnyRole(['OWNER', 'ADMIN', 'AUDITOR'])` |

MANAGER, MEMBER, VIEWER: no playbook access at any level.

---

## 5. Tenant Isolation

| Concern | Mechanism |
|---|---|
| Document fetch | `where: { id, organizationId: tenant.organization.id }` in all queries |
| Query storage | `PlaybookQuery` created with `organizationId` — never cross-tenant |
| Compliance insights | `getPlaybookComplianceInsights(organizationId)` — scoped by org |
| Advisory answer | `queryPlaybooks({ organizationId, question })` — chunk search scoped by org |
| 404 not 403 | Non-existent or other-tenant document returns 404, preventing existence leak |
| Audit log | All upload/delete actions logged with `organizationId` + `actorUserId` |

---

## 6. Test Matrix

| Test | Category | Location |
|---|---|---|
| parseAdvisoryAnswer: null inputs | Unit | `tests/playbook-ai-advisory.test.ts` |
| parseAdvisoryAnswer: missing answer field | Unit | ibid |
| parseAdvisoryAnswer: well-formed response | Unit | ibid |
| parseAdvisoryAnswer: missing arrays default to [] | Unit | ibid |
| parseAdvisoryAnswer: unknown compliant defaults to needs_review | Unit | ibid |
| parseAdvisoryAnswer: non-number confidence defaults to 0 | Unit | ibid |
| parseAdvisoryAnswer: prompt injection in answer field | Security | ibid |
| buildApprovalPath: always starts with Submit | Unit | ibid |
| buildApprovalPath: deduplicated departments | Unit | ibid |
| buildApprovalPath: approver covered by dept is skipped | Unit | ibid |
| buildApprovalPath: Final Approval only when > 2 steps | Unit | ibid |
| buildApprovalPath: high approver count | Unit | ibid |
| RBAC: only OWNER/ADMIN can upload/delete | RBAC | ibid |
| RBAC: OWNER/ADMIN/AUDITOR can query | RBAC | ibid |
| RBAC: AUDITOR cannot manage | RBAC | ibid |
| RBAC: VIEWER has no access | RBAC | ibid |
| extractPlaybookRules: extracts from policy text | Unit | ibid |
| extractPlaybookRules: capped at 20 | Unit | ibid |
| extractPlaybookRules: trivially short content → [] | Unit | ibid |
| extractPlaybookRules: spending threshold detection | Unit | ibid |
| extractPlaybookRules: security risk trigger detection | Unit | ibid |
| chunkPlaybookContent: at least one chunk | Unit | ibid |
| chunkPlaybookContent: splits long content | Unit | ibid |
| chunkPlaybookContent: chunks under size limit | Unit | ibid |
| chunkPlaybookContent: empty string | Unit | ibid |
| Compliance: yes maps to high confidence | Unit | ibid |
| Compliance: no surfaces evidenceMissing | Unit | ibid |
| Advisory: multiple policy sections parsed | Unit | ibid |
| Tenant isolation: organizationId required | Contract | ibid |
| Tenant isolation: cross-tenant WHERE clause | Contract | ibid |
| Missing evidence: populated list surfaced | Unit | ibid |
| Missing evidence: clean advisory | Unit | ibid |
| Confidence thresholds: all breakpoints | Unit | ibid |
| Empty state: no queries → null advisory | Unit | ibid |
| Short question: rejected below 5 chars | Unit | ibid |

---

## 7. Build Verification

Run on branch `claude/information-dashboard-navigation-u6r3rb`:

```
npm run lint    → (no output = clean)
npm run check   → (no output = clean)
```

TypeScript strict mode enforced. All new code uses proper null-safety (`?.`, `?? fallback`).

---

## 8. Remaining Dependencies

| Item | Status | Notes |
|---|---|---|
| Voyage AI embeddings | External dependency | Required for semantic search; advisory falls back gracefully if unavailable |
| Anthropic API | External dependency | Required for AI answers; `generateText` falls back to OpenAI |
| PostgreSQL | Required | All data persistence; local dev needs `DATABASE_URL` |
| Playbook indexing | Operational | At least one `READY` status document needed for advisory to return grounded answers |
| E2E browser tests | Not yet automated | Playwright E2E spec for advisory flow pending |
| `playbook_ai` entitlement | Partial | Enforced on upload; not yet enforced on query/evaluate endpoints |

---

## 9. Production Readiness Assessment

**What works:**
- Complete UI redesign with dark navy enterprise theme matching reference design
- All existing backend functionality preserved (upload, index, query, evaluate, delete, seed)
- Advisory history, approval path visualization, compliance status, policy references, missing evidence
- Full RBAC at both UI and API layers
- Tenant isolation via `organizationId` scoping on all queries
- Audit logging for upload and delete operations
- New GET `/api/playbooks/[id]` endpoint for single document retrieval
- 35+ unit/contract tests covering pure logic, RBAC, and tenant isolation contracts

**Not production-blocking but worth noting:**
- `playbook_ai` feature flag not enforced on query/evaluate (advisory runs for all eligible roles)
- No Playwright E2E spec for the full advisory workflow
- Advisory confidence is AI-generated; displayed as-is without calibration

**Honest assessment:** The feature is ready for internal use and staged rollout. The advisory AI quality depends entirely on the quality of uploaded policy documents. The UI correctly surfaces this: empty-state messages guide admins to upload playbooks before expecting grounded answers.
