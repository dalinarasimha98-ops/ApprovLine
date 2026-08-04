# ApprovLine Architecture

This document describes how ApprovLine is put together at a system level. It is derived entirely from the current codebase (`app/`, `services/`, `lib/`, `config/`, `prisma/schema.prisma`) — see `docs/database.md` and `docs/integrations.md` for deeper dives into those two areas.

## System overview

ApprovLine is a Next.js 15 App Router application backed by PostgreSQL (via Prisma) and Redis (via BullMQ). Its job is to take approval-related signals from many sources — chat messages, emails, enterprise system webhooks, manual entry — and turn them into a classified, risk-scored, audited `ApprovalRecord` per tenant organization.

At a high level, four subsystems compose the product:

1. **Ingestion & classification pipeline** — turns raw provider events into `ApprovalRecord`s.
2. **Integrations layer** — connects to Slack, Gmail, Outlook, Microsoft Teams, Jira, ServiceNow, Zoom, plus a provider-agnostic Evidence SDK and a Universal Approval Gateway for enterprise systems.
3. **Compliance & investigation layer** — playbook rule evaluation, audit logging, investigation cases, and a cross-source "memory graph".
4. **Founder/internal ops console** — a separate operational surface for provisioning and monitoring customer accounts, distinct from the tenant-facing product.

## Directory map

- **`app/`** — Next.js App Router. Route groups split into tenant-facing product pages (`dashboard`, `approvals`, `audit-logs`, `investigations`, `memory`, `playbooks`, `copilot`, `analytics`, `settings`, `onboarding`, `integrations`, `evidence`, `reliability`), marketing pages (`solutions`, `resources`, `company`, `trust`, `book-demo`, `contact`), auth pages (`sign-in`, `sign-up`, `get-started`), and the internal `founder/*` console. `app/api/*` holds all route handlers.
- **`components/`** — UI components organized to mirror the `app/` feature domains.
- **`services/`** — the domain/business-logic layer. This is where the real behavior of the product lives; `app/api/*` route handlers are thin wrappers that call into `services/`.
- **`lib/`** — cross-cutting utilities used by both `app/` and `services/`: Prisma client singleton, tenant isolation enforcement, Clerk-based auth/session helpers, rate limiting, encryption, CSV export, etc.
- **`config/env.ts`** — the single Zod-validated environment schema, parsed eagerly at import so misconfiguration fails at boot rather than at first use.
- **`types/`** — shared TypeScript types (`classifier.ts`, `evidence.ts`, `rbac.ts`) used across `services/` and `app/`.
- **`prisma/`** — `schema.prisma` plus dated migrations tracking the platform's evolution.
- **`scripts/`** — operational CLI scripts (seeding, readiness checks, Gmail sync, classifier corpus validation, production build).
- **`tests/`** — standalone `tsx` test scripts per concern, plus a Playwright e2e spec (see root `CLAUDE.md` and `docs/coding-standards.md` for how these run).

## Request lifecycle and multi-tenancy

`middleware.ts` uses Clerk's `clerkMiddleware` to gate a fixed list of protected route prefixes (`/dashboard`, `/approvals`, `/founder`, etc.) — unauthenticated requests to those are redirected to `/sign-in`. Middleware only checks *authentication*; it does not scope requests to a tenant.

Tenant scoping happens deeper in the stack:

- `lib/auth.ts` resolves the current Clerk session into an ApprovLine `Organization`/`User` pair (`getCurrentTenant`, `getDashboardTenant`), upserting both on first sign-in. `resolveTenantContext()` builds a `TenantIsolationContext` (organization id, workspace id, role, permissions) that request handlers and services take as an explicit argument.
- `lib/tenant-isolation.ts` provides the actual enforcement primitives: `tenantScopedWhere()` to inject `organizationId` into every Prisma query, `assertTenantAccess()` to reject cross-tenant record access (throwing `TenantIsolationError`, which callers map to an HTTP 404 rather than 403 so a resource's existence isn't leaked to a different tenant), `validateTenantJobPayload()` for background jobs, and `logTenantIsolationEvent()` which writes violations into `AuditLog` as security events.
- Nearly every Prisma model carries its own `organizationId` foreign key with `onDelete: Cascade`, so tenant data is physically partitioned by column, not by separate schemas/databases.
- Role-based permissions (`ADMIN`, `MANAGER`, `EMPLOYEE`, `COMPLIANCE_OFFICER`) are resolved to a permission list in `lib/auth.ts` (`permissionsForRole`) and checked via `requireRole()` / `types/rbac.ts`'s `canAccessRole`.

The internal founder console (`app/founder/*`, `app/api/founder/*`) sits outside this tenant model: it operates against `PlatformAdmin` / `CustomerAccount` records (see `docs/database.md`), gated by its own `PlatformRole` enum (`SUPER_ADMIN`, `FOUNDER_ADMIN`, `SUPPORT_ADMIN`).

## Approval classification pipeline

This is the core data flow of the product, end to end:

1. **Ingestion** — a provider webhook route (e.g. `app/api/integrations/slack/events`) or a gateway endpoint (`app/api/v1/webhooks/approvals`, `app/api/ingest`) builds an `IncomingMessageJob` and calls `enqueueIncomingMessage()` (`services/queue/approvalQueue.ts`), which wraps it in a `StandardJobEnvelope` carrying idempotency and correlation IDs.
2. **Queue** — BullMQ, backed by Redis (`services/queue/connection.ts`). If Redis isn't configured, the worker logs a warning and stays disabled rather than failing hard (see `services/queue/worker.ts`).
3. **Worker** — `services/queue/worker.ts` runs a `Worker` with concurrency 10. For each job it marks the corresponding `BackgroundJob` row as processing, heartbeats it every 5s, and calls `processIncomingMessage()` (`services/ingestion/processIncomingMessage.ts`). On failure it classifies the error (`RATE_LIMIT`, `TIMEOUT`, `TRANSIENT`, `AUTHENTICATION`, `VALIDATION`, `UNKNOWN`) via string-matching on the error message, applies a category-specific retry delay, and once attempts are exhausted (or the failure is inherently non-retryable) moves the job to a `DeadLetterJob` row via `moveToDeadLetter()` (`services/queue/reliability.ts`).
4. **Evidence capture** — before classification, `services/evidence/pipeline.ts` records an idempotent, content-hashed `CanonicalEvidenceEvent` (see `docs/database.md` for the evidence model group).
5. **Classification** — `services/classifier/openai.ts` calls an LLM against a Zod-validated output schema. It prefers Anthropic (trying `ANTHROPIC_MODEL` then a hardcoded list of Claude model fallbacks) and falls back to OpenAI (`gpt-4.1-mini`) only if `ANTHROPIC_API_KEY` is unset. The raw model output is post-processed in TypeScript: approver identity, category, risk level, and a confidence score are all re-derived/adjusted from the raw response plus heuristics (keyword matching for category/risk, regex-based dollar-amount extraction), not taken as-is from the model. Prompts are versioned via `CLASSIFIER_PROMPT_VERSION` in `services/classifier/prompts.ts`.
6. **Persistence** — `services/classifier/persistence.ts` writes the `ClassifierResult` and `ApprovalRecord`, and updates the originating `Integration`'s status/metadata.
7. **Compliance evaluation** — the approval is scored against playbook rules (`PlaybookRule`, uploaded and chunked/embedded from `PlaybookDocument`), producing an `ApprovalComplianceEvaluation` with a severity and list of missing approvers/departments/escalation steps/evidence.
8. **Audit** — `services/audit.ts`'s `writeAuditLog()` persists an `AuditLog` row tied to organization/actor/approval record. Tenant-isolation violations are also logged here via `logTenantIsolationEvent()`.
9. **Correlation** — on completion, evidence can be folded into a `UnifiedEvidenceRecord` linking multiple `CanonicalEvidenceEvent`s across sources (e.g. a Slack message and a Jira ticket about the same decision), and into the `MemoryEntity`/`MemoryRelationship` graph that powers the Memory feature and timelines.

## Integrations layer

Two architectural generations coexist (see `docs/integrations.md` for detail):

- **Legacy per-provider connectors** (`services/integrations/{slack,gmail,outlook,teams,jira,servicenow,zoom}.ts`) each implement OAuth state signing, install-URL construction, and token exchange directly, paired with routes under `app/api/integrations/<provider>/{install,callback,webhook,sync}`.
- **Evidence Provider SDK** (`services/evidence/{provider-sdk,provider-catalog,provider-orchestrator}.ts`) defines a common `EvidenceProviderPlugin` interface (`Authenticate`, `Subscribe`, `Fetch`, `Normalize`, `HealthCheck`, `Disconnect`) via `BaseEvidenceProvider`, documented further in `docs/universal-evidence-platform.md`.
- **Universal Approval Gateway** (`services/gateway/universalGateway.ts`) is a separate ingestion path for enterprise systems (SAP, Oracle, Coupa, Workday, Salesforce, HubSpot, custom) under `app/api/v1/*`, authenticated by a static API key (`lib/gateway-auth.ts`, timing-safe comparison) instead of OAuth, plus bulk/document/transcript/email-forwarding ingestion.

All connector OAuth tokens are encrypted at rest with AES-256-GCM (`utils/encryption.ts`, keyed by `ENCRYPTION_KEY`); Clerk itself holds the user's own login/OAuth session.

## Reliability primitives

`services/queue/reliability.ts` and the corresponding Prisma models (`BackgroundJob`, `DeadLetterJob`, `OutboxEvent`, `IdempotencyRecord`, `WorkerHeartbeat`) implement:

- **Idempotency** — every enqueued job carries an `idempotencyKey`; duplicate submissions are detected rather than reprocessed.
- **Correlation** — a `correlationId` threads through queue jobs, events, classifier results, and approval records so a single external event can be traced across every table it touched.
- **Dead-lettering** — jobs that exhaust retries or hit a non-retryable failure category land in `DeadLetterJob` with a redacted payload for later inspection.
- **Outbox pattern** — `OutboxEvent` exists for at-least-once delivery of events outside the main queue path.
- **Worker heartbeats** — `WorkerHeartbeat` rows let the `/health` endpoint and dashboards see whether queue workers are alive.

## Founder/internal ops console

`app/founder/*` and `app/api/founder/*` are an internal-only surface (provisioning, customer health, revenue, certification) gated by `PlatformRole`. It operates on its own model hierarchy — `PlatformAdmin`, `CustomerAccount` (1:1 with `Organization`), `CustomerWorkspace`, `CustomerSeatAllocation`, `CustomerFeatureFlag`, `CustomerIntegrationStatus`, `CustomerHealth`, `FounderManagedUser`, `FounderAuditLog`, `CustomerNote` — layered on top of, but distinct from, the tenant-facing `Organization` model. See `docs/founder-control-center.md` for the role model.

## Operational surface

- `/health` reports live status of PostgreSQL, Redis, Anthropic, OpenAI fallback, and each configured integration.
- `npm run readiness` (`scripts/readiness.ts`) is a CLI equivalent for deployment checks.
- `docs/qa/` and `docs/operations/` contain production-readiness sign-offs and operational runbooks (disaster recovery, backup/restore, business continuity, release checklist) that reflect real operational practice for this codebase.
