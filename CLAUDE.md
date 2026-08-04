# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ApprovLine — an AI-powered Universal Approval Intelligence Platform. It ingests approval-related events from integrations (Slack, Gmail, Teams, Jira, Zoom) and enterprise systems (SAP, Oracle, Coupa, Workday, Salesforce, HubSpot via a universal gateway), classifies them with an LLM, evaluates them against compliance playbooks, and produces an auditable evidence trail per tenant organization.

Stack: Next.js 15 (App Router) + TypeScript (strict), TailwindCSS, Prisma + PostgreSQL, Clerk (auth/orgs), Anthropic (primary classifier) with OpenAI fallback, Redis + BullMQ (async processing), Sentry.

## Rules

- Never remove existing functionality.
- Never delete migrations.
- Always reuse existing abstractions.
- Keep files modular.
- Follow App Router conventions.
- Use strict TypeScript.
- Use Prisma for database access.
- Never hardcode secrets.
- Prefer server actions when appropriate.
- Always explain architectural decisions.
- Always run lint before finishing.
- Always fix TypeScript errors.
- Never change authentication logic without approval.
- Always preserve backward compatibility.

## Commands

```bash
npm install
npm run db:generate        # prisma generate
npm run db:migrate         # prisma migrate dev (local schema changes)
npm run db:deploy          # prisma migrate deploy (apply to production DB)
npm run dev                # next dev
npm run build              # scripts/production-build.mjs (generates Prisma client, builds Next.js)
npm run lint                # eslint .
npm run check               # tsc --noEmit
npm run readiness           # scripts/readiness.ts — deployment/config readiness check
```

### Tests

There is no Jest/Vitest runner — each test is a standalone script executed directly via `tsx`, one command per concern:

```bash
npm run test:ingestion             # tests/ingestion-pipeline.test.ts
npm run test:slack                 # tests/slack-integration.test.ts
npm run test:gmail                 # tests/gmail-integration.test.ts
npm run test:teams                 # tests/teams-integration.test.ts
npm run test:tenant-isolation       # tests/tenant-isolation.test.ts
npm run test:reliability            # tests/reliability-hardening.test.ts
npm run test:founder                 # tests/founder-hardening.test.ts
npm run test:certification           # tests/production-certification.test.ts
npm run test:production-hardening    # tests/production-hardening.test.ts
npm run test:manual-approvals        # tests/manual-approvals.test.ts
npm run test:evidence                # tests/evidence-platform.test.ts
npm run test:approval-records        # tests/approval-records-dashboard.test.ts
npm run test:classifier-corpus       # scripts/validate-classifier-corpus.mjs, validates tests/fixtures/classifier-enterprise-cases.json
npm run test:e2e:approvals           # playwright test tests/e2e/approval-timeline.spec.ts
```

To run a single test file directly, mirror the script it corresponds to, e.g. `node --import tsx tests/manual-approvals.test.ts` or `tsx tests/ingestion-pipeline.test.ts`. Playwright (`playwright.config.ts`) boots `npm run dev` against `http://127.0.0.1:3000` unless `E2E_BASE_URL` is set.

Several test suites are explicitly hardening/certification-oriented (`tenant-isolation`, `reliability-hardening`, `production-hardening`, `founder-hardening`, `production-certification`) — production readiness is a first-class, continuously-verified concern in this repo, not an afterthought.

### Other scripts

```bash
npm run seed:demo      # scripts/seed-demo.ts
npm run db:seed        # prisma/seed.ts
npm run gmail:sync     # scripts/gmail-sync.ts
npm run worker         # services/queue/worker.ts — starts the BullMQ worker process
npm run audit:ci       # scripts/audit-ci.mjs
```

## Architecture

### Multi-tenancy

Tenant isolation is column-based, not routing-based: nearly every table carries its own `organizationId` FK with cascading deletes, and `Organization.clerkOrgId` links a tenant to its Clerk organization. `middleware.ts` only handles authentication (Clerk `clerkMiddleware`, redirects unauthenticated users) — it does **not** enforce tenant scoping. Enforcement lives in `lib/tenant-isolation.ts`:

- `tenantScopedWhere()` injects `organizationId` into Prisma queries.
- `assertTenantAccess()` rejects cross-tenant record access, throwing `TenantIsolationError` which callers map to a 404 (not 403) so a resource's existence isn't leaked to other tenants.
- `validateTenantJobPayload()` guards background job payloads crossing the queue boundary.
- `logTenantIsolationEvent()` writes violations into `AuditLog` as security events.

Any code that queries tenant-scoped tables must go through these helpers rather than filtering ad hoc.

### Approval classification pipeline

End-to-end flow from external event to audited record:

1. **Ingestion** — a provider webhook (e.g. `app/api/integrations/slack/events`) or `app/api/ingest` enqueues a `StandardJobEnvelope`-wrapped job (idempotency + correlation IDs) via `services/queue/approvalQueue.ts`.
2. **Worker** — `services/queue/worker.ts` runs a BullMQ `Worker` (concurrency 10) calling `processIncomingMessage`; failures are classified (RATE_LIMIT/TIMEOUT/AUTH/VALIDATION/etc.) with retry-delay logic, and unrecoverable jobs are dead-lettered via `services/queue/reliability.ts`.
3. **Evidence capture** — `services/evidence/pipeline.ts` records an idempotent, content-hashed `CanonicalEvidenceEvent` before classification runs.
4. **Classification** — `services/classifier/openai.ts` calls the LLM (Anthropic primary, OpenAI fallback per README) against a Zod-validated result schema; prompts are versioned in `services/classifier/prompts.ts`.
5. **Persistence** — `services/classifier/persistence.ts` writes `ClassifierResult` + `ApprovalRecord` and updates the source `Integration`'s status/metadata.
6. **Compliance evaluation** — the result is scored against uploaded playbook rules, producing an `ApprovalComplianceEvaluation` (risk/severity).
7. **Audit** — `services/audit.ts` (`writeAuditLog`) persists an `AuditLog` entry tied to org/actor/record.
8. **Correlation** — on completion, evidence is folded into cross-source `UnifiedEvidenceRecord`s feeding the memory graph/timeline.

### Integrations

Two coexisting patterns — check which a provider uses before adding to it:

- **Legacy per-provider connectors**: `services/integrations/{slack,gmail,outlook,teams,jira,servicenow,zoom}.ts`, each handling OAuth state signing/verification, install-URL construction, and token exchange, paired with routes under `app/api/integrations/<provider>/{install,callback,webhook,sync}`. `resolveTenant.ts` maps an inbound webhook/account back to its owning `Organization`/`Integration` row.
- **Evidence Provider SDK** (newer, intended standard going forward): `services/evidence/{provider-sdk,provider-catalog,provider-orchestrator}.ts` define a common `EvidenceProviderPlugin` interface (`Authenticate`, `Subscribe`, `Fetch`, `Normalize`, `HealthCheck`, `Disconnect`) — documented in `docs/universal-evidence-platform.md`.
- **Universal Approval Gateway**: `services/gateway/universalGateway.ts` is a separate ingestion path for enterprise systems (SAP, Oracle, Coupa, Workday, Salesforce, HubSpot, custom) under `app/api/v1/*`, authenticated by static API key via `lib/gateway-auth.ts` (timing-safe comparison) instead of OAuth. Also accepts email-forwarded approvals (`approvals+tenant@approvline.ai`) and CSV/document/transcript intelligence imports.

All connector tokens are encrypted at rest with AES-256-GCM (`utils/encryption.ts`, key from `ENCRYPTION_KEY`) — Clerk stores identity/OAuth-login tokens, ApprovLine only stores tenant user/org mapping plus connector tokens for integrations like Slack/Gmail.

### Database (prisma/schema.prisma)

- **Tenant root**: `Organization` (hub for nearly everything via `organizationId`), `User`, `Team`/`TeamMember`.
- **Integrations**: `Integration` (OAuth tokens/status), `MessageSource` (normalized inbound messages), `Event`.
- **Approval core**: `ApprovalRecord` ↔ `ClassifierResult` ↔ `MessageSource`, plus `ManualApprovalDetail`/`ManualApprovalVersion` (versioned verbal/manual approvals), `ApprovalConfirmationRequest`, `ApprovalEvidenceAssociation`.
- **Evidence platform**: `EvidenceProviderConnection` → `CanonicalEvidenceEvent` → `UnifiedEvidenceRecord`/`UnifiedEvidenceMember`, with `EvidenceProviderHealth`/`EvidenceProcessingFailure` for connector health.
- **Compliance**: `PlaybookDocument` → `PlaybookChunk`/`PlaybookRule` → `ApprovalComplianceEvaluation`, `PlaybookQuery`.
- **Reliability/queue**: `BackgroundJob`, `DeadLetterJob`, `OutboxEvent`, `IdempotencyRecord`, `WorkerHeartbeat`.
- **Audit/investigations**: `AuditLog`, `InvestigationCase` ↔ `InvestigationApproval`/`InvestigationNote`.
- **Memory graph**: `MemoryEntity` ↔ `MemoryRelationship` (self-referential), `MemoryGraphEvent`, `MemoryTimelineEvent`.
- **Founder/internal ops** (separate hierarchy from tenant data): `PlatformAdmin`, `CustomerAccount` (1:1 with `Organization`) → `CustomerWorkspace`, `CustomerSeatAllocation`, `CustomerFeatureFlag`, `CustomerIntegrationStatus`, `CustomerHealth`, `FounderManagedUser`, `FounderAuditLog`, `CustomerNote`.
- `PublicLeadSubmission` has no org FK — it's pre-tenant marketing lead capture.

Run `npm run db:migrate` for local schema changes; use `npm run db:deploy` (never `db:migrate`) against production, since production builds only run `prisma generate`, not a migration.

### Config/env validation

`config/env.ts` is the single source of truth for environment variables: a Zod schema (`envSchema`) parsed eagerly at import, covering DB, Anthropic/OpenAI, Redis, Clerk, encryption key, and every integration's OAuth credentials. This is distinct from `lib/env.ts`, which is a narrower `DATABASE_URL`-specific diagnostics helper (used for surfacing Prisma connection errors), not a duplicate of the schema.

### Internal ops console

`app/founder/*` and `app/api/founder/*` are an internal-only console (provisioning, customer health, revenue, certification) gated by founder-specific roles (`SUPER_ADMIN`/`FOUNDER_ADMIN`/`SUPPORT_ADMIN`, env-based super-admin bootstrap) — see `docs/founder-control-center.md`. This is operationally separate from the tenant-facing dashboard and its own data model (`CustomerAccount` etc., not `Organization` directly).

### Docs worth checking before large changes

- `docs/universal-evidence-platform.md` — evidence pipeline architecture and the `EvidenceProviderPlugin` SDK contract.
- `docs/founder-control-center.md` — internal ops console roles and access model.
- `docs/integrations/CONNECTOR_CERTIFICATION_MATRIX.md` — per-connector certification/readiness status.
- `docs/qa/*` — production-readiness and certification sign-off records.
- `docs/operations/*` — disaster recovery, backup/restore, business continuity, and release-checklist runbooks.

## Environment

Copy `.env.example` to `.env.local`. Required variables (DB, Redis, Anthropic/OpenAI, Clerk, `ENCRYPTION_KEY`, `APP_URL`) and per-integration OAuth credentials (Slack, Google/Gmail, Microsoft/Teams, Jira, Zoom) are enumerated in `README.md`. Each integration's OAuth scopes are read-only by design; redirect URLs must match exactly what's registered with each provider's developer console. `/health` in production reports live status of Postgres, Redis, Anthropic, OpenAI fallback, and each integration's configuration.
