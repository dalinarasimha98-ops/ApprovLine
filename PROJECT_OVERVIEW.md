# ApprovLine — Project Overview

This document is the primary onboarding guide for anyone (human or AI) working in this repository for the first time. It was compiled by reading the full source tree, `prisma/schema.prisma`, every file under `docs/`, CI/deployment configuration, and representative implementation files across `app/`, `services/`, and `lib/`. Where a claim below reflects a documented but not independently-verified fact (e.g. production readiness scores), the source document is named so it can be re-checked as the codebase evolves.

Companion references in this repo: `README.md` (setup/env), `CLAUDE.md` (command reference for AI coding sessions), and `docs/architecture.md`, `docs/database.md`, `docs/integrations.md`, `docs/coding-standards.md`, `docs/roadmap.md` (deeper dives on those specific topics, written earlier in this repo's history and consistent with this document).

---

## 1. Executive Summary

ApprovLine is an **AI-powered Universal Approval Intelligence Platform**: a multi-tenant Next.js 15 application that ingests approval-related signals from many sources (Slack, Gmail, Outlook, Microsoft Teams, Jira, ServiceNow, Zoom, and enterprise systems like SAP/Oracle/Coupa/Workday/Salesforce/HubSpot via a universal gateway), classifies them with an LLM (Anthropic Claude primary, OpenAI fallback), scores them against uploaded compliance playbooks, and produces an auditable, tenant-isolated evidence trail per organization.

Stack: Next.js 15 (App Router) + TypeScript (strict) + TailwindCSS + Prisma/PostgreSQL + Clerk (auth) + Redis/BullMQ (async queue) + Sentry (error monitoring). Deployed on Vercel, with PostgreSQL on Supabase and Redis apparently intended for Upstash (see §11).

**Current maturity**: per the repository's own `docs/qa/PRODUCTION_READINESS_REVIEW.md` (dated 2026-07-19), the project scores **80/100** on an internal readiness rubric and is explicitly assessed as **"Not ready for unrestricted enterprise production"** — suitable for a controlled pilot only. The codebase is broad, internally coherent, and has a substantial automated test suite (11+ dedicated `tsx`-based test scripts plus a Playwright e2e spec), but billing enforcement, per-tenant gateway credentials, hostile-document handling, live third-party connector certification, and a proven disaster-recovery drill are all explicitly open items (see §12). This assessment is self-reported in-repo documentation, not an external audit — treat it as a strong starting point for verification, not a substitute for one.

The product has three tenant-facing pillars (ingestion/classification, compliance/investigation, and a cross-source "memory graph") plus a separate, non-tenant internal operations console (`/founder`) for provisioning and monitoring customer accounts.

---

## 2. High-Level Architecture

```text
 External sources                Ingestion & processing                 Tenant-facing product
 ───────────────────             ──────────────────────                 ──────────────────────
 Slack / Gmail / Outlook /       app/api/integrations/* webhooks        /dashboard, /approvals,
 Teams / Jira / ServiceNow /     app/api/v1/* (Universal Gateway)       /audit-logs, /investigations,
 Zoom (OAuth connectors)   ───▶  app/api/ingest, app/api/evidence/*     /memory, /playbooks, /copilot,
 Enterprise systems (SAP,        │                                     /analytics, /evidence, /settings
 Oracle, Coupa, Workday,         ▼
 Salesforce, HubSpot, custom,    BullMQ queue (Redis)  ──▶  Worker (services/queue/worker.ts)
 email-forward, CSV/doc/         │                              │
 transcript import)              │                              ▼
                                  │                    services/ingestion/processIncomingMessage.ts
                                  │                              │
                                  │                              ▼
                                  │                    Evidence capture (CanonicalEvidenceEvent)
                                  │                              │
                                  │                              ▼
                                  │                    Classifier (Anthropic / OpenAI fallback)
                                  │                              │
                                  │                              ▼
                                  │                    ApprovalRecord + ClassifierResult persisted
                                  │                              │
                                  │                              ▼
                                  │                    Playbook compliance evaluation
                                  │                              │
                                  │                              ▼
                                  └───────────────▶     AuditLog + cross-source correlation
                                                         (UnifiedEvidenceRecord, MemoryEntity graph)

 Internal ops (separate track)
 ──────────────────────────────
 /founder console  ──▶  PlatformAdmin / CustomerAccount / CustomerWorkspace / CustomerHealth / FounderAuditLog
 (gated by PlatformRole: SUPER_ADMIN, FOUNDER_ADMIN, SUPPORT_ADMIN — not accessible via tenant roles)
```

Four subsystems compose the product:

1. **Ingestion & classification pipeline** — turns raw provider events into `ApprovalRecord`s (§6).
2. **Integrations layer** — three coexisting architectural generations: legacy per-provider OAuth connectors, a newer provider-agnostic Evidence SDK, and a static-key Universal Approval Gateway for enterprise systems (§8).
3. **Compliance & investigation layer** — playbook rule evaluation, audit logging, investigation cases, and the memory graph.
4. **Founder/internal ops console** — a separate operational surface, structurally and access-wise isolated from the tenant data model.

Route protection is handled by Clerk middleware (`middleware.ts`) at the authentication layer only; tenant data isolation is enforced separately, in application code, on every database access (§10).

---

## 3. Folder Structure

```text
app/                      Next.js App Router — pages and API routes
├── api/                  All route handlers (see below for notable groups)
├── dashboard, approvals, audit-logs, investigations, memory, playbooks,
│   copilot, analytics, evidence, reliability, settings, onboarding,
│   integrations             Tenant-facing product pages
├── founder/               Internal-only ops console (provisioning, customer health,
│                          revenue, certification) — gated by PlatformRole, not tenant roles
├── solutions, resources, company, trust, book-demo, contact  Marketing pages
├── sign-in, sign-up, get-started    Clerk-backed auth pages
└── health                 Public health-check page

app/api/                  Notable route groups:
├── integrations/{slack,gmail,outlook,teams,jira,servicenow,zoom,oauth,health}
│                          Legacy OAuth connector install/callback/webhook/sync routes
├── v1/{approvals,webhooks/approvals,imports/csv,documents/intelligence,
│      transcripts/intelligence}          Universal Approval Gateway
├── evidence/{ingest,records,providers,suggestions,failures,health}
│                          Evidence Provider SDK surface
├── classify, ingest, confirmations, approvals, playbooks, copilot,
│   analytics, export, onboarding         Core product APIs
├── founder/{audit,pilots}    Internal ops APIs
├── debug/*                  Diagnostics (now auth-gated per docs/qa readiness review — see §12)
└── health, public/leads      Public/unauthenticated endpoints

components/                UI components, organized to mirror app/'s feature domains
  (dashboard, approvals, evidence, playbooks, copilot, founder, marketing, onboarding, auth, system, providers)

services/                  Domain/business logic layer — the real behavior of the product;
│                          app/api/* route handlers are thin wrappers calling into services/
├── ingestion/              processIncomingMessage.ts — the pipeline entry point
├── classifier/             openai.ts (Anthropic-primary/OpenAI-fallback classifier), persistence.ts, prompts.ts
├── queue/                  approvalQueue.ts, connection.ts, worker.ts, reliability.ts, jobRegistry.ts
├── evidence/                provider-sdk.ts, provider-catalog.ts, provider-orchestrator.ts, pipeline.ts,
│                            normalizer.ts, records.ts, api-access.ts
├── integrations/            slack.ts, gmail.ts, outlook.ts, jira.ts, servicenow.ts, teams.ts, zoom.ts,
│                            resolveTenant.ts, simulation.ts
├── gateway/                 universalGateway.ts — enterprise-system ingestion
├── audit.ts, investigations.ts, playbooks.ts, memory.ts, manual-approvals.ts,
│   confirmation-delivery.ts, analytics.ts, onboarding.ts, identity.ts, pilot.ts, readiness.ts
└── founder*.ts, customerSuccess.ts   Internal ops services

lib/                       Cross-cutting utilities used by both app/ and services/
├── tenant-isolation.ts     Tenant-scoping enforcement primitives (see §10)
├── auth.ts                 Clerk session → ApprovLine Organization/User resolution (see §5)
├── gateway-auth.ts          Static API-key auth for the Universal Gateway
├── prisma.ts                Prisma client singleton
├── env.ts                   DATABASE_URL-specific diagnostics (distinct from config/env.ts)
├── rate-limit.ts             Distributed (Redis-backed) rate limiting
├── entitlements.ts           Plan/entitlement checks (partial — see §12)
├── csv.ts, evidence-links.ts, performance.ts, demo-data.ts, public-leads.ts,
│   approval-observability.ts, approvalRecords.ts, marketing-pages.ts

config/env.ts               Single Zod-validated environment schema, parsed eagerly at import
types/                       Shared TS types: classifier.ts, evidence.ts, rbac.ts
utils/encryption.ts          AES-256-GCM helpers for token/credential encryption
prisma/                      schema.prisma + dated migrations
scripts/                     Operational CLI scripts (seed, readiness, gmail-sync, production-build,
│                            validate-classifier-corpus, audit-ci)
tests/                       Standalone tsx test scripts per concern + tests/e2e/ (Playwright)
docs/                        Architecture, database, integrations, coding-standards, roadmap,
                             founder-control-center, universal-evidence-platform, plus qa/ and operations/
                             (production-readiness reviews and runbooks — see §12)
```

---

## 4. Database Design

PostgreSQL via Prisma (`prisma/schema.prisma`, ~1,500 lines, `cuid()` primary keys throughout). Full model-by-model detail is in `docs/database.md`; the summary here covers the shape of the schema and how the groups relate.

**Isolation model**: nearly every model carries its own `organizationId` foreign key to `Organization` with `onDelete: Cascade`. There is no separate-schema or row-level-security mechanism — tenant partitioning is by column, enforced in application code (§10), not by the database engine itself.

**Model groups**:

| Group | Key models | Purpose |
|---|---|---|
| Tenant root | `Organization`, `User`, `Team`, `TeamMember` | The tenant and its members; `Organization.clerkOrgId` links to Clerk |
| Integrations/ingestion | `Integration`, `MessageSource`, `Event` | Connected provider accounts and normalized/raw inbound events |
| Approval core | `ApprovalRecord`, `ClassifierResult`, `ManualApprovalDetail`/`ManualApprovalVersion`, `ApprovalConfirmationRequest`, `ApprovalEvidenceAssociation` | The central classified-decision object and its supporting evidence/manual-entry/confirmation flows |
| Evidence platform | `EvidenceProviderConnection`, `CanonicalEvidenceEvent`, `UnifiedEvidenceRecord`, `UnifiedEvidenceMember`, `EvidenceProviderHealth`, `EvidenceProcessingFailure` | Provider-agnostic evidence capture, cross-source correlation, and health tracking |
| Compliance | `PlaybookDocument`, `PlaybookChunk`, `PlaybookRule`, `ApprovalComplianceEvaluation`, `PlaybookQuery` | Uploaded policy documents, chunked/embedded for retrieval, compiled into rules, scored against approvals |
| Reliability/queue | `BackgroundJob`, `DeadLetterJob`, `OutboxEvent`, `IdempotencyRecord`, `WorkerHeartbeat` | Queue job state, dead-lettering, outbox delivery, idempotency, worker liveness |
| Audit/investigations/memory | `AuditLog`, `InvestigationCase`/`InvestigationApproval`/`InvestigationNote`, `MemoryEntity`/`MemoryRelationship`/`MemoryGraphEvent`/`MemoryTimelineEvent` | Append-only audit trail, investigation grouping, and a typed cross-source entity graph |
| Billing/growth/marketing | `Subscription`, `FeatureFlag`, `PilotInvite`/`PilotFeedback`/`PilotActivityLog`, `PublicLeadSubmission` | Stripe-backed subscription state, per-org feature flags, pilot program tracking, and pre-tenant lead capture (the only model with no `organizationId`) |
| Founder/internal ops | `PlatformAdmin`, `CustomerAccount`, `CustomerWorkspace`, `CustomerPlan`, `CustomerSeatAllocation`, `CustomerFeatureFlag`, `CustomerIntegrationStatus`, `CustomerHealth`, `FounderManagedUser`, `FounderAuditLog`, `CustomerNote` | A parallel internal-ops hierarchy keyed by `customerAccountId`, 1:1 with `Organization` via `CustomerAccount`, but structurally distinct from the tenant model |

**Reliability conventions baked into the schema**: `correlationId` and `idempotencyKey` fields recur across `MessageSource`, `Event`, `ApprovalRecord`, `ClassifierResult`, `BackgroundJob`, `DeadLetterJob`, and `OutboxEvent`, so a single external event can be traced across every table it touched, and duplicate submissions can be detected rather than reprocessed.

Migrations are dated and additive (e.g. `20260719120000_public_lead_submissions`, `20260724120000_universal_evidence_platform`), tracking the platform's evolution. Production migrations are applied via `npm run db:deploy`, deliberately decoupled from `npm run build` (see §11).

---

## 5. Authentication Flow

Authentication is handled by **Clerk**; ApprovLine stores only the resulting tenant `User`/`Organization` mapping, never Clerk's own credentials.

**Sign-up path**: `SignUp` component at `/sign-up` (email/password, email OTP, Google, or Microsoft 365 — phone sign-in is explicitly disabled per `README.md` and the component copy in `app/sign-in/page.tsx`) → on completion, Clerk redirects to `/onboarding`.

**Sign-in path**: `SignIn` component at `/sign-in` → on completion, Clerk redirects to `/get-started`. `app/get-started/page.tsx` then:
1. Confirms a Clerk session exists (`auth()`); if not, redirects to `/sign-up?redirect_url=/onboarding`.
2. Calls `getCurrentTenant()` (`lib/auth.ts`), which **upserts** an `Organization` (keyed by Clerk `orgId`, or a `personal-<userId>` slug for users without a Clerk org) and a `User` row (keyed by `clerkUserId`) — first sign-in silently provisions the tenant records.
3. Redirects to `/dashboard` if `organization.onboardedAt` is set, otherwise to `/onboarding`.

If `DATABASE_URL` is invalid or the database is unreachable, `getCurrentTenant()` throws a `TenantDatabaseError` (caught in both `/get-started` and dashboard loaders) and the user sees a "Database setup required" page linking to `/health`, rather than a raw crash.

**Middleware** (`middleware.ts`): `clerkMiddleware` + `createRouteMatcher` gates a fixed list of route prefixes (`/dashboard`, `/onboarding`, `/approvals`, `/audit-logs`, `/integrations`, `/settings`, `/playbooks`, `/copilot`, `/analytics`, `/investigations`, `/memory`, `/trust`, `/founder`, plus the `/api/copilot`, `/api/debug`, `/api/playbooks`, and analytics/investigations export APIs) — unauthenticated requests are redirected to `/sign-in` with a `redirect_url` query param. **Middleware only checks authentication; it does not enforce tenant scoping** — that happens deeper in the stack (§10).

**Roles**: `Role` enum (`ADMIN`, `MANAGER`, `EMPLOYEE`, `COMPLIANCE_OFFICER`) with a numeric hierarchy in `types/rbac.ts` (`EMPLOYEE`=1 < `MANAGER`=2 < `COMPLIANCE_OFFICER`=3 < `ADMIN`=4). `canAccessRole()` does a `>=` comparison, so higher roles inherit lower-role access. `lib/auth.ts`'s `permissionsForRole()` maps each role to an explicit permission-string list (e.g. `approvals:write`, `integrations:manage`, `investigations:manage`) consumed via `resolveTenantContext()`, which builds the `TenantIsolationContext` passed through the tenant-isolation helpers.

**Founder console auth** is entirely separate: it uses a `PlatformRole` enum (`SUPER_ADMIN`, `FOUNDER_ADMIN`, `SUPPORT_ADMIN`) bootstrapped via env-var email allowlists (`APPROVLINE_SUPER_ADMIN_EMAILS` etc., or Clerk user metadata `{"platformRole": "SUPER_ADMIN"}`) — tenant workspace roles grant no founder access, and vice versa (`docs/founder-control-center.md`).

Per `docs/qa/PRODUCTION_READINESS_REVIEW.md`: live Clerk email/Google/Microsoft sign-in, expired-session handling, and real Clerk organization membership have **not** been end-to-end certified with production credentials as of that review.

---

## 6. Approval Pipeline

This is the core data flow of the product, end to end:

1. **Ingestion** — a provider webhook route (e.g. `app/api/integrations/slack/events`) or a gateway endpoint (`app/api/v1/webhooks/approvals`, `app/api/ingest`) builds an `IncomingMessageJob` and calls `enqueueIncomingMessage()` (`services/queue/approvalQueue.ts`), which wraps it in a `StandardJobEnvelope` carrying an `idempotencyKey` and `correlationId`.
2. **Queue** — BullMQ over Redis (`services/queue/connection.ts`). If Redis isn't configured, the worker logs a warning and stays disabled rather than failing hard.
3. **Worker** — `services/queue/worker.ts` runs a BullMQ `Worker` at concurrency 10. For each job it marks the corresponding `BackgroundJob` row `PROCESSING`, heartbeats it every 5s, and calls `processIncomingMessage()` (`services/ingestion/processIncomingMessage.ts`). On failure, `classifyFailure()` keyword-matches the error message into `RATE_LIMIT` / `TIMEOUT` / `TRANSIENT` / `AUTHENTICATION` / `VALIDATION` / `UNKNOWN`, applies a category-specific retry delay, and — once attempts are exhausted or the category is inherently non-retryable — moves the job to `DeadLetterJob` via `moveToDeadLetter()`.
4. **Evidence capture** — `services/evidence/pipeline.ts` records an idempotent, SHA-256-hashed `CanonicalEvidenceEvent` before classification runs (`evidenceHash` deduplicated per `[organizationId, providerKey, evidenceHash]`).
5. **Classification** — `services/classifier/openai.ts` (see §7 for detail).
6. **Persistence** — `services/classifier/persistence.ts` writes the `ClassifierResult` and `ApprovalRecord`, and updates the originating `Integration`'s status/metadata.
7. **Compliance evaluation** — the approval is scored against `PlaybookRule`s (extracted from uploaded, chunked/embedded `PlaybookDocument`s), producing an `ApprovalComplianceEvaluation` with a severity and explicit lists of missing approvers/departments/escalation steps/evidence.
8. **Audit** — `services/audit.ts`'s `writeAuditLog()` persists an `AuditLog` row tied to organization/actor/approval record. Tenant-isolation violations are also logged here.
9. **Correlation** — on completion, evidence can be folded into a `UnifiedEvidenceRecord` linking multiple `CanonicalEvidenceEvent`s across sources (e.g. a Slack message and a Jira ticket about the same decision). Per `docs/universal-evidence-platform.md`, correlation scores ≥80 are linked automatically, 55–79 become human-review suggestions, and below 55 a separate unified record is created; rejected suggestions remain stored for audit history. Confirmed/rejected links feed the `MemoryEntity`/`MemoryRelationship` graph and entity timelines.

Manual/verbal approvals bypass steps 1–5 via `services/manual-approvals.ts`, writing directly to `ManualApprovalDetail` with a versioned history (`ManualApprovalVersion`) and an optional second-person verification requirement, still passing through compliance evaluation and audit logging.

---

## 7. AI Components

**Classifier** (`services/classifier/openai.ts`): the sole LLM-driven component in the product today (no separate embedding service is implemented in code, despite `PlaybookChunk.embedding` existing as a schema field — see §12).

- **Model selection**: Anthropic Claude is preferred whenever `ANTHROPIC_API_KEY` is set — `CLASSIFIER_MODEL` resolves to `env.ANTHROPIC_MODEL` or a default of `claude-sonnet-4-5`. The Anthropic call path (`classifyWithAnthropic`) additionally tries a hardcoded fallback list of model IDs (`claude-sonnet-4-5-20250929`, `claude-3-7-sonnet-latest`, `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-latest`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-latest`, `claude-3-5-haiku-20241022`) if the configured model is rejected by the API, so a stale/wrong model name degrades gracefully rather than hard-failing.
- **OpenAI fallback**: used only if `ANTHROPIC_API_KEY` is absent, via `gpt-4.1-mini`, with `response_format: { type: 'json_object' }`.
- **Request shape**: a fixed system + user prompt pair (`services/classifier/prompts.ts`, versioned as `CLASSIFIER_PROMPT_VERSION`), temperature 0, requesting a structured JSON object validated against a Zod schema (`classifierSchema`) covering `approval_detected`, `approval_type` (enum), `confidence`, `approver`/`approver_email`, `risk_level`, `category`, `subject`, `department`, `reasoning`, `conditions`.
- **Post-processing is substantial and deterministic**, not purely model output: `inferApproverIdentity()`, `inferCategory()` (keyword regex matching per category — Finance, Procurement, Legal, HR, Engineering, Security, Compliance), `inferRiskLevel()` (keyword + regex-extracted dollar-amount thresholds: ≥$1M or breach/critical language → `critical`; Legal/Security/Compliance category or ≥$100K → `high`; ≥$10K or conditional/escalation → `medium`; else `low`), and `scoreConfidence()` (an additive/subtractive heuristic adjustment on top of the model's own confidence score, e.g. +4 for a resolved approver name, −8 if neither name nor email could be resolved). This means classification quality depends on both the LLM call **and** this deterministic TypeScript layer — a change to either can shift results.
- **Idempotency**: `hashClassifierInput()` SHA-256-hashes the classifier input; combined with `ClassifierResult`'s unique `[organizationId, idempotencyKey]` constraint, this prevents duplicate classification of the same input.

**Playbook Q&A / Copilot** (`services/playbooks.ts`, `services/copilot/copilot.ts`, `app/api/playbooks/query`, `app/api/copilot/query`): retrieval over `PlaybookChunk.embedding` (stored as `Json`). `embedText()` in `services/playbooks.ts` calls OpenAI's `text-embedding-3-small` (96 dimensions) when `OPENAI_API_KEY` is set; if it's absent, or the OpenAI call fails, it falls back to `localEmbedding()` — a deterministic, non-semantic hash-bucket vector (distributes hashed tokens across 96 buckets). This means playbook retrieval quality is silently degraded to near-random-by-keyword-hash matching in any environment without an OpenAI key configured, even if Anthropic is otherwise fully configured for classification — worth flagging to whoever operates a deployment missing `OPENAI_API_KEY`. Retrieved chunks feed `PlaybookQuery` records with an answer, source chunk IDs, and confidence.

**Document intelligence** (`services/playbooks.ts`, `app/api/v1/documents/intelligence`, `app/api/playbooks/upload`): PDF/DOCX extraction via `pdf-parse` and `mammoth` (per `package.json` dependencies). Per `docs/qa/PRODUCTION_READINESS_ISSUE_REGISTER.md` (PR-P1-05), this was previously placeholder-quality binary-as-text decoding and has since been upgraded to format-aware parsers, but malware scanning, magic-byte validation, encrypted/zip-bomb handling, and OCR-limit behavior remain open (§12).

---

## 8. Integration Architecture

Three architectural generations coexist — check which one a given provider or task actually uses before extending it. Full detail in `docs/integrations.md`; summary here:

**1. Legacy per-provider connectors** (`services/integrations/{slack,gmail,outlook,teams,jira,servicenow,zoom}.ts`, `resolveTenant.ts`): each implements, per provider, an explicitly read-only OAuth scope list, HMAC-signed and time-boxed (10-minute) OAuth `state` handling (`crypto.timingSafeEqual` verification), install-URL construction, token exchange, and — for providers that push events — inbound signature verification with a timestamp window (e.g. Slack's 5-minute window). `resolveTenant.ts` maps an inbound webhook/account identifier back to the owning `Organization`/`Integration` row, since these events carry no Clerk session.

**2. Evidence Provider SDK** (`services/evidence/{provider-sdk,provider-catalog,provider-orchestrator}.ts`, documented in `docs/universal-evidence-platform.md`): a common `EvidenceProviderPlugin` interface (`Authenticate`, `Subscribe`, `Fetch`, `Normalize`, `HealthCheck`, `Disconnect`), implemented via `BaseEvidenceProvider` and registered through `registerEvidenceProvider()` into a module-level registry keyed by a normalized provider key. This is the architecturally-intended standard going forward, meant to replace the ad hoc pattern in (1).

**3. Universal Approval Gateway** (`services/gateway/universalGateway.ts`, routes under `app/api/v1/*`): for enterprise systems without a dedicated OAuth connector (SAP, Oracle, Coupa, Workday, Salesforce, HubSpot, custom) plus bulk CSV/document/transcript/email-forward ingestion. Authenticated by a **static API key** (`lib/gateway-auth.ts`, timing-safe comparison via `Authorization: Bearer` or `x-api-key`) rather than OAuth — notably, in non-production environments an unconfigured key **allows** the request through; production fails closed (503) if unconfigured. Webhook calls are additionally signature-verified (`x-approvline-signature` against `UNIVERSAL_GATEWAY_WEBHOOK_SECRET`) when that secret is set, and rate-limited by caller IP (240 req/60s) before any other processing. All gateway traffic rejoins the same `enqueueIncomingMessage()` path as the OAuth connectors — there is no separate gateway-only classifier.

**Documented integration status** (`docs/qa/PRODUCTION_READINESS_REVIEW.md`, §10 of that report — reproduced here as it directly affects what can be safely relied on):

| Integration | Status |
|---|---|
| Slack | Implemented (OAuth, callback, events, signature checks, automated test suite) |
| Gmail | Implemented (OAuth, callback, sync, webhook, automated test suite) |
| Microsoft Teams | Implemented (OAuth, callback, sync, webhook, automated test suite) |
| Outlook / Exchange | Partially certified — no dedicated test suite yet |
| Jira | Partially certified — no dedicated test suite yet |
| ServiceNow | Partially certified — no dedicated test suite yet |
| Zoom | Partially certified — no dedicated test suite yet |
| Universal Gateway | Implemented with conditions (per-tenant keys and distributed quotas still open) |
| GitHub, GitLab, Azure DevOps, Jenkins, Kubernetes | **Planned/marketing only — no connector routes exist in code** despite appearing in product/marketing copy |

All connector tokens are encrypted at rest with AES-256-GCM (`utils/encryption.ts`, key from `ENCRYPTION_KEY`) before being stored in `Integration.encryptedTokens` / `EvidenceProviderConnection.encryptedCredentials`.

---

## 9. Queue Architecture

BullMQ over Redis, with a custom reliability layer built in application/database code rather than relying solely on BullMQ's built-in retry semantics.

- **Producer**: `services/queue/approvalQueue.ts`'s `enqueueIncomingMessage()` is the single entry point for enqueueing an `IncomingMessageJob`; it attaches `correlationId` and `idempotencyKey` and creates the corresponding `BackgroundJob` row.
- **Connection**: `services/queue/connection.ts`'s `createRedisConnection()` — if `REDIS_URL` isn't configured or unreachable, queue-dependent features degrade (the worker disables itself with a log warning) rather than crashing the app; `checkRedisConnection()` backs the `/health`/readiness checks.
- **Worker**: a single `Worker<StandardJobEnvelope<IncomingMessageJob>>` at concurrency 10, `lockDuration: 30_000`ms (`services/queue/worker.ts`). Started via `npm run worker` as a separate long-running process — it is **not** part of the Next.js request/response cycle, so it must be deployed/run independently of the Vercel web deployment (see §11).
- **Failure classification**: `classifyFailure()` keyword-matches the thrown error's message (not a typed error hierarchy) into `RATE_LIMIT` (30s retry), `TIMEOUT` (20s), `TRANSIENT` (15s), `AUTHENTICATION`/`VALIDATION` (no retry — these are treated as permanent), or `UNKNOWN` (20s retry, default).
- **Dead-lettering**: on exhausted attempts, or immediately for `AUTHENTICATION`/`VALIDATION` failures, `moveToDeadLetter()` (`services/queue/reliability.ts`) writes a `DeadLetterJob` row with a **redacted** payload (not the raw job payload) and a `retryEligible` flag (true only for `TRANSIENT`/`RATE_LIMIT`/`TIMEOUT`).
- **Heartbeats**: `WorkerHeartbeat` rows, updated every 5s per in-flight job, back liveness monitoring.
- **Idempotency**: `IdempotencyRecord` provides a queue-independent dedup ledger; `BackgroundJob` is additionally unique on `[queueName, idempotencyKey]`.
- **Outbox**: `OutboxEvent` exists for at-least-once delivery outside the main BullMQ path — per `docs/universal-evidence-platform.md`, a queue outage leaves accepted evidence events in `RETRY_PENDING` rather than discarding them, resuming via the outbox once Redis recovers.

Per `docs/qa/PRODUCTION_READINESS_REVIEW.md` §11, reliability tests cover idempotency, retries, dead-letter behavior, and reconciliation, but **distributed Redis concurrency across multiple deployed instances has not been exercised** — this matters because Vercel serverless functions are multi-instance by nature (see §10, rate-limiting note).

---

## 10. Security Model

**Tenant isolation** (the load-bearing security boundary of the whole product): enforced entirely in application code via `lib/tenant-isolation.ts`, not by database-level row security.

- `tenantScopedWhere()` injects `organizationId` into every Prisma query filter.
- `assertTenantAccess()` rejects cross-tenant record access by throwing `TenantIsolationError`, which callers map to an **HTTP 404, deliberately not 403** — so a request for another tenant's resource is indistinguishable from a request for something that doesn't exist, preventing cross-tenant existence enumeration.
- `validateTenantJobPayload()` guards background-job payloads crossing the queue boundary.
- `logTenantIsolationEvent()` writes any violation into `AuditLog` as a flagged security event.
- Covered by a dedicated `tests/tenant-isolation.test.ts` suite (`npm run test:tenant-isolation`), which per the readiness review currently passes.

**Cryptography**:
- Connector OAuth tokens and gateway credentials: AES-256-GCM via `utils/encryption.ts`, key from `ENCRYPTION_KEY` (must decode to exactly 32 bytes / 64 hex chars); random 12-byte IV per encryption, auth tag stored alongside ciphertext.
- All HMAC/signature/API-key comparisons use `crypto.timingSafeEqual` with a length check first (`lib/gateway-auth.ts`'s `secureEqual()`, `services/integrations/slack.ts`'s `verifySlackSignature()`/`verifySlackState()`) — never a `===` string compare, which would be vulnerable to timing attacks.
- OAuth `state` parameters are HMAC-signed and time-boxed (10-minute expiry).

**Authorization layers**:
- Clerk middleware gates route access by authentication only (§5).
- Tenant-scoped RBAC (`Role`/`AppRole` hierarchy, `permissionsForRole()`) gates feature access within a tenant.
- Founder console access uses a wholly separate `PlatformRole` model, bootstrapped via env-var email allowlists — no tenant role grants founder access.

**Known gaps** (self-reported in `docs/qa/PRODUCTION_READINESS_ISSUE_REGISTER.md` and `PRODUCTION_READINESS_REVIEW.md`, both dated 2026-07-19 — verify current status before relying on this list):
- **Universal Gateway uses one platform-wide API key** rather than per-tenant hashed/rotatable/scoped credentials (PR-P1-04, still open at review time).
- **Rate limiting was process-local** before being moved to Redis-backed distributed limits (`lib/rate-limit.ts`); multi-instance/Redis-failure behavior still needs deployed-environment evidence (PR-P1-03).
- **No strict Content Security Policy** — baseline headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, restrictive permissions policy) are in place, but CSP itself needs a staged, provider-aware rollout (PR-P2-06).
- **Debug endpoints** (`/api/debug/*`) were previously public; this is recorded as remediated (now auth-required via middleware) but awaits deployed smoke-test evidence (PR-P2-01).
- **Document upload hostile-input handling** (malware scanning, magic-byte validation, zip-bomb/encrypted-file handling) is incomplete (PR-P1-05).
- No external penetration test has been performed as of the review.

---

## 11. Deployment Architecture

- **Hosting**: Vercel (`vercel.json` — `framework: nextjs`, `buildCommand: npm run build`, standard `.next` output).
- **Build**: `npm run build` runs `scripts/production-build.mjs`, which (a) sanity-checks `REDIS_URL`'s scheme (warns, doesn't fail, if it's not `redis://`/`rediss://`, or if it looks like an Upstash host without TLS), (b) conditionally runs `prisma migrate deploy` **only** if `APPLY_MIGRATIONS_ON_BUILD=true` (otherwise migrations must be applied separately via `npm run db:deploy` — the build never assumes it can reach a migratable database), (c) runs `prisma generate`, then (d) runs `next build`. This means **the web build does not require a live database connection** by default.
- **Database**: PostgreSQL. Readiness-check code (`services/readiness.ts`) contains Supabase-specific connection-string guidance — warning if `DATABASE_URL` points at the Supabase *direct* host on port 5432 (unreachable from Vercel) instead of the pooler host, and warning about session-mode-vs-transaction-mode pooling — strongly implying **Supabase** is the intended/tested Postgres provider, corroborated by `docs/operations/BACKUP_AND_RESTORE_RUNBOOK.md`'s reference to "Supabase point-in-time recovery."
- **Redis**: `REDIS_URL`, with the build script's Upstash-specific TLS warning implying **Upstash** as the intended provider for a serverless-friendly Redis instance.
- **Queue worker**: `npm run worker` (`services/queue/worker.ts`) is a long-running Node process, architecturally incompatible with Vercel's serverless function model — it must be run somewhere else (a separate always-on host/container), a detail not made explicit anywhere in the repo's deployment docs and worth confirming with whoever operates production.
- **Auth**: Clerk, configured via `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` plus several `NEXT_PUBLIC_CLERK_*_URL` redirect-target variables (see `.env.example`).
- **Error monitoring**: Sentry, via `NEXT_PUBLIC_SENTRY_DSN` (browser/server/edge capture) and optional `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` for source-map upload; `instrumentation.ts`/`instrumentation-client.ts` and `sentry.{server,edge}.config.ts` wire this in.
- **CI**: `.github/workflows/ci.yml` runs on push to `main` and on PRs — `npm ci` → `prisma validate` → `prisma generate` → `npm run lint` → `npm run check` → a subset of test suites (`test:production-hardening`, `test:founder`, `test:reliability`, `test:tenant-isolation`, `test:certification` — notably **not** the full test list from `package.json`, e.g. `test:ingestion`/`test:slack`/`test:gmail`/`test:teams`/`test:evidence`/`test:manual-approvals`/`test:approval-records` and the Playwright e2e spec are not run in CI as configured) → `npm run build` → `npm run audit:ci`. CI uses a placeholder `DATABASE_URL` and a fixed dummy `ENCRYPTION_KEY` (`0123...`), suitable for schema validation but not for exercising real data paths.
- **Health/readiness**: `GET /api/health` is a trivial liveness check; the real readiness logic lives in `services/readiness.ts`'s `buildReadinessReport()` (checks Postgres, Redis, Anthropic/OpenAI key presence, and every integration's OAuth env vars and last-sync status) and is exposed at `/health` (page) and via `npm run readiness` (CLI).
- **Founder bootstrap**: the first `SUPER_ADMIN` is granted via the `APPROVLINE_SUPER_ADMIN_EMAILS` Vercel env var (or Clerk user metadata), not via a UI — see `docs/founder-control-center.md`.
- **Operational runbooks** exist for disaster recovery, backup/restore, business continuity, and production release (`docs/operations/*.md`), with explicit RPO/RTO targets (PostgreSQL: 15 min RPO / 4 hr RTO; object storage: 24 hr RPO / 8 hr RTO), but **`docs/operations/RESTORE_TEST_EVIDENCE.md` is explicitly marked "NOT EXECUTED"** — the targets are documented intentions, not proven capabilities.

---

## 12. Current Technical Debt

This section is drawn directly from the repository's own self-assessment in `docs/qa/PRODUCTION_READINESS_ISSUE_REGISTER.md` and `docs/qa/PRODUCTION_READINESS_REVIEW.md` (both dated **2026-07-19** — re-check these files for a current-dated version before treating this list as up to date), supplemented by observations made while writing this document. Register IDs are cited so each item can be traced back to its source row.

**P1 (high priority), open at time of review**:

1. **Universal Gateway uses a single platform-wide API key** (PR-P1-04) rather than per-tenant hashed, scoped, rotatable, revocable credentials — a compromised key affects every tenant using the gateway.
2. **Backend entitlement/billing enforcement is incomplete** (PR-P1-02) — a central plan matrix exists and protects some premium routes (Copilot, Playbook upload), but seat limits, integration limits, trial/downgrade behavior, and suspended-account enforcement are not applied to every premium route, and no payment provider/subscription webhook is connected.
3. **Public lead-capture delivery lacks production evidence** (PR-P1-01) — validated/idempotent storage exists, but real CRM/email provider delivery and failure-alerting are unverified in production.
4. **Distributed rate limiting lacks deployed, multi-instance evidence** (PR-P1-03) — Redis-backed limits replaced process-local ones, but concurrent-instance and Redis-failure behavior haven't been proven under load.
5. **Hostile-document handling is incomplete** (PR-P1-05) — PDF/DOCX now use format-aware parsers instead of raw-text decoding, but malware scanning, magic-byte validation, encrypted/zip-bomb handling, and OCR-limit behavior are missing.
6. **Most connectors lack live, credentialed certification** (PR-P1-06) — Outlook, Jira, ServiceNow, and Zoom have working code paths but no dedicated automated test suite and no verified live OAuth/sync/reconnect behavior against a real provider tenant.
7. **Marketing copy claims integrations that don't exist in code** (PR-P1-07) — GitHub, GitLab, Azure DevOps, Jenkins, and Kubernetes appear in product/marketing copy with no corresponding connector routes.
8. **No executed backup/restore drill** (PR-P1-08) — runbooks with RPO/RTO targets exist, but `RESTORE_TEST_EVIDENCE.md` is explicitly "NOT EXECUTED."

**P2 (medium priority)**:
- Browser test coverage is Chromium-only; Firefox/WebKit are unverified.
- No reusable, broad Playwright E2E suite (current tests are mostly service-level `tsx` scripts).
- Accessibility certification is manual-only (no automated axe checks).
- No strict Content Security Policy (baseline security headers only).
- Mobile responsive navigation is remediated in code but lacks cross-browser/assistive-technology certification evidence.

**P3 (low priority)**: inconsistent route metadata/Open Graph tags; inconsistent "ready/certified" language across marketing and product copy (no standardized vocabulary distinguishing Certified/Implemented/Preview/Planned).

**Additional debt observed while compiling this document** (not necessarily tracked in the issue register — verify before acting on these):
- `lib/env.ts` (DATABASE_URL-specific diagnostics) and `config/env.ts` (the full Zod-validated environment schema) are separate files with overlapping conceptual territory (both deal with environment configuration); they serve different specific purposes today but are easy to confuse — see `docs/architecture.md`'s note on this.
- The queue worker (`npm run worker`) has no documented deployment target compatible with Vercel's serverless model — this is an operational gap in the deployment documentation itself, not just the code.
- **Playbook retrieval silently degrades to non-semantic matching without `OPENAI_API_KEY`**: `embedText()` (`services/playbooks.ts`) requires OpenAI specifically for real embeddings (`text-embedding-3-small`) even though the classifier itself prefers Anthropic — a deployment with only `ANTHROPIC_API_KEY` configured (a plausible configuration given the classifier's Anthropic-first design) gets a hash-bucket fallback embedding for every playbook chunk and query, with no error, warning surfaced to the user, or health-check flag for this specific condition. This should either be surfaced in `/health`/`services/readiness.ts`, or the fallback should be replaced with an Anthropic-compatible embedding path.
- CI (`.github/workflows/ci.yml`) does not run the full `package.json` test-script list (e.g. `test:ingestion`, `test:slack`, `test:gmail`, `test:teams`, `test:evidence`, `test:manual-approvals`, `test:approval-records`, and the Playwright e2e spec are absent from CI as configured) — these only run if invoked manually or in the ad hoc reviews referenced in `docs/qa/`.

---

## 13. Recommended Improvements

Ordered roughly by leverage (highest-impact/lowest-effort first), synthesizing the issue register's own priorities with observations from writing this document. This is a starting point for discussion, not a committed plan — validate against current product priorities before acting.

1. **Close CI's coverage gap first** — add the missing `npm run test:*` scripts (ingestion, slack, gmail, teams, evidence, manual-approvals, approval-records) and the Playwright e2e spec to `.github/workflows/ci.yml`. This is pure configuration, costs little, and immediately raises confidence in every other change made against this repo.
2. **Replace the Universal Gateway's single platform-wide key** with per-tenant hashed, scoped, rotatable credentials (PR-P1-04) before any customer beyond a tightly controlled pilot uses gateway ingestion — a single leaked key currently exposes every tenant on that path.
3. **Finish entitlement/billing enforcement end-to-end** (PR-P1-02) — connect a real payment provider and subscription webhook, and apply the plan matrix to every premium route/job/export, not just Copilot and Playbook upload, before any commercial self-serve launch.
4. **Execute one real, isolated backup-restore drill** (PR-P1-08) and fill in `docs/operations/RESTORE_TEST_EVIDENCE.md` with actual timings and row counts — the RPO/RTO targets in the DR/BCP docs are currently unproven assumptions, and this is a single bounded exercise that converts them into verified facts.
5. **Reconcile marketing/product copy with actual connector status** (PR-P1-07) — either build GitHub/GitLab/Azure DevOps/Jenkins/Kubernetes connectors or relabel them as planned; this is a legal/trust-exposure risk that's cheap to fix by removing false "available now" implications even before those connectors are built.
6. **Add hostile-document handling to the upload pipeline** (PR-P1-05) — malware scanning, magic-byte validation, and zip-bomb/encrypted-file rejection, gated in front of the existing PDF/DOCX parsers, before accepting uploads from untrusted external tenants at scale.
7. **Get live, credentialed certification for Outlook, Jira, ServiceNow, and Zoom** (PR-P1-06) — write the same style of dedicated test suite that Slack/Gmail/Teams already have, then run each against a real sandbox tenant.
8. **Prove distributed rate-limiting behavior under real multi-instance load** (PR-P1-03) — this matters specifically because Vercel serverless functions run as multiple concurrent instances; a load test against a preview deployment would close this gap.
9. **Document a deployment target for the queue worker** — this is a documentation/ops gap, not a code gap, but it blocks anyone new from safely deploying the async pipeline; a short addition to `docs/architecture.md` or a new `docs/operations/QUEUE_WORKER_DEPLOYMENT.md` would resolve it.
10. **Stage and enforce a Content Security Policy** (PR-P2-06) — start report-only against the known provider-domain inventory, then flip to enforcing once violation logs are clean.
11. **Broaden browser/accessibility QA** (PR-P2-03, PR-P2-05) — add Firefox/WebKit to the Playwright matrix and automated axe checks; lower priority than the P1 items above but cheap to bolt onto the E2E work in recommendation 1.
12. **Surface the playbook-embedding fallback condition** — add a `services/readiness.ts` check (and `/health` entry) that flags when `OPENAI_API_KEY` is absent so operators know playbook Q&A is running on the non-semantic hash fallback rather than real embeddings; this is a small, self-contained fix relative to the silent quality risk it closes.
13. **Resolve the `lib/env.ts` vs `config/env.ts` naming overlap** — not urgent, but renaming `lib/env.ts` to something like `lib/database-url-diagnostics.ts` would remove a recurring point of confusion for anyone new to the codebase (including future AI sessions using this very document).
