# ApprovLine — Project Memory

This is the persistent engineering memory for ApprovLine. Part 1 holds durable facts a future session should know without rereading the repository. Part 2 is a dated log of significant analysis/implementation work, appended after every major task. Every fact below is sourced from the repository or its documentation (`README.md`, `docs/`, `prisma/schema.prisma`, and direct source reads) — nothing here is invented. Where a fact is a point-in-time snapshot from a dated internal report, the date is called out so it can be re-verified before being relied on.

---

# Part 1 — Project Memory

## Product Vision

ApprovLine is an "AI-powered Universal Approval Intelligence Platform" (per `README.md`): a multi-tenant SaaS that ingests approval-related signals from chat/email/enterprise-system sources, classifies them with an LLM, scores them against uploaded compliance playbooks, and produces an auditable, tenant-isolated evidence trail per customer organization.

## Architecture Decisions

**Stack:** Next.js 15 (App Router), TypeScript (strict mode), TailwindCSS, Prisma + PostgreSQL, Clerk (auth), Redis + BullMQ (async queue), Sentry (error monitoring). Classifier LLM: Anthropic Claude primary, OpenAI fallback. Node 20 engine; package is `"type": "module"`.

**System shape — four subsystems:** (1) an ingestion & classification pipeline turning raw provider events into `ApprovalRecord`s; (2) an integrations layer with three coexisting generations (legacy OAuth connectors, a newer Evidence Provider SDK, and a static-key Universal Approval Gateway); (3) a compliance & investigation layer (playbook rule evaluation, audit logging, investigation cases, a cross-source "memory graph"); (4) a separate, non-tenant internal ops console (`/founder`) for provisioning and monitoring customer accounts.

**Repository shape:** `app/` (Next.js App Router — tenant pages, marketing pages, auth pages, `founder/*` console, `app/api/*` route handlers); `components/` (mirrors `app/`'s feature domains); `services/` (the domain/business-logic layer — route handlers are thin wrappers around it; key subdirs `ingestion/`, `classifier/`, `queue/`, `evidence/`, `integrations/`, `gateway/`); `lib/` (cross-cutting utilities: `tenant-isolation.ts`, `auth.ts`, `gateway-auth.ts`, `prisma.ts`, `rate-limit.ts`, `entitlements.ts`); `config/env.ts` (single Zod-validated env schema); `types/` (shared TS types); `utils/encryption.ts`; `prisma/` (`schema.prisma` + dated migrations); `scripts/` (operational CLI); `tests/` (standalone `tsx` scripts per concern, no Jest/Vitest, plus `tests/e2e/` Playwright); `docs/` (architecture, database, integrations, coding-standards, roadmap, plus `docs/qa/` and `docs/operations/` reports/runbooks).

**Authentication:** Clerk-based. Sign-up (email/password, email OTP, Google, or Microsoft 365 — phone sign-in explicitly disabled) redirects to `/onboarding`. Sign-in redirects to `/get-started`, which resolves the Clerk session into an ApprovLine `Organization`/`User` pair via `getCurrentTenant()` (`lib/auth.ts`), upserting both on first sign-in, then redirects to `/dashboard` or `/onboarding` depending on `organization.onboardedAt`. `middleware.ts` gates route prefixes by authentication only — it does not enforce tenant scoping. Tenant roles: `Role` enum (`ADMIN`, `MANAGER`, `EMPLOYEE`, `COMPLIANCE_OFFICER`) with a numeric hierarchy in `types/rbac.ts` (`EMPLOYEE`=1 < `MANAGER`=2 < `COMPLIANCE_OFFICER`=3 < `ADMIN`=4); `canAccessRole()` does a `>=` comparison. The internal founder console uses a wholly separate `PlatformRole` model (`SUPER_ADMIN`, `FOUNDER_ADMIN`, `SUPPORT_ADMIN`), bootstrapped via env-var email allowlists or Clerk user metadata — no tenant role grants founder access.

**Multi-tenancy:** column-based (`organizationId` FK with `onDelete: Cascade` on nearly every model), enforced entirely in application code via `lib/tenant-isolation.ts` — not by database row-level security. Key primitives: `tenantScopedWhere()`, `assertTenantAccess()` (throws `TenantIsolationError`, mapped to HTTP 404), `validateTenantJobPayload()`, `logTenantIsolationEvent()`. Covered by `tests/tenant-isolation.test.ts`.

**Approval pipeline:** (1) ingestion builds an `IncomingMessageJob`, enqueued with `correlationId`/`idempotencyKey`; (2) BullMQ queue over Redis; (3) worker (concurrency 10) processes jobs, classifies failures (`RATE_LIMIT`/`TIMEOUT`/`TRANSIENT`/`AUTHENTICATION`/`VALIDATION`/`UNKNOWN`), dead-letters exhausted/non-retryable jobs; (4) idempotent, hashed `CanonicalEvidenceEvent` capture; (5) LLM classification; (6) `ClassifierResult` + `ApprovalRecord` persistence; (7) compliance evaluation against `PlaybookRule`s → `ApprovalComplianceEvaluation`; (8) `AuditLog` write; (9) cross-source correlation into `UnifiedEvidenceRecord` (scores ≥80 auto-linked, 55–79 human-review suggestions, below 55 a separate record) and the `MemoryEntity`/`MemoryRelationship` graph.

**AI provider decision:** ApprovLine is migrating to Anthropic as its sole LLM vendor, with Voyage AI (Anthropic's own recommended partner, since Anthropic has no native embeddings endpoint) as the dedicated embedding provider. All AI calls now route through a provider abstraction in `services/ai/` rather than application code instantiating vendor SDKs directly:
- **Generation** (`services/ai/gateway.ts`'s `generateText()`) — tries `AnthropicGenerationProvider` first (model-fallback list + transient retry with backoff), then `OpenAIGenerationProvider` only as a logged, telemetry-recorded transitional fallback (scheduled for removal once Anthropic-only generation is fully validated). Used by the approval classifier (`services/classifier/openai.ts`, exported surface unchanged) and playbook Q&A answer synthesis (`services/playbooks.ts`'s `generatePlaybookAnswer`). Raw LLM output is Zod-validated then substantially post-processed by deterministic TypeScript heuristics (approver identity, category/risk-level inference, confidence-score adjustment).
- **Embeddings** (`services/ai/embeddingGateway.ts`'s `generateEmbedding()`) — `VoyageEmbeddingProvider` (`voyage-4`, 1024 dimensions, raw HTTP, no new SDK dependency) is the **only** active provider; there is intentionally **no automatic fallback** here (unlike generation) — if unconfigured or failing, it throws rather than silently degrading to a non-semantic vector. `OpenAIEmbeddingProvider` still exists but only for labeling legacy data and as a concrete rollback target.
- `PlaybookChunk` carries `embeddingProvider`/`embeddingModel`/`embeddingVersion`/`embeddingDimensions`/`embeddingUpdatedAt` metadata; `searchPlaybookChunks()` only compares vectors from the same provider+model as the query embedding, so legacy and new embeddings never get compared against each other. Pre-existing rows are labeled `embeddingProvider = 'legacy-unknown'` (not `'openai'` — which path actually produced any given historical row was never recorded) and are excluded from search until backfilled via `npm run reembed:playbooks` (`reembedPlaybookChunks()`).
- `services/readiness.ts` reports `aiGateway` (generation) and `embeddingGateway`/`voyage` (embeddings) status; the latter currently reports `missing` since no `VOYAGE_API_KEY` has been configured yet — playbook indexing/search will fail explicitly (by design) until it is.

**Integrations:** three coexisting generations — (1) legacy per-provider OAuth connectors (read-only scopes, HMAC-signed/time-boxed OAuth state, timing-safe signature verification); (2) Evidence Provider SDK (`EvidenceProviderPlugin` interface, the intended standard going forward); (3) Universal Approval Gateway (static API-key auth for enterprise systems plus CSV/document/transcript/email-forward ingestion, rejoining the same classification pipeline).

**Queue/background jobs:** BullMQ over Redis, single `Worker` at concurrency 10, started via `npm run worker` as a separate long-running Node process. Reliability primitives: `BackgroundJob`/`DeadLetterJob`/`OutboxEvent`/`IdempotencyRecord`/`WorkerHeartbeat`. If Redis is unconfigured/unreachable, the worker disables itself with a log warning rather than crashing.

**Deployment/infra:** Vercel hosting. Build (`scripts/production-build.mjs`) applies migrations only if `APPLY_MIGRATIONS_ON_BUILD=true`; otherwise migrations require a separate `npm run db:deploy`. CI (`.github/workflows/ci.yml`) runs lint/typecheck/a subset of test suites/build/audit on push to `main` and PRs.

TODO: the actual PostgreSQL and Redis hosting providers are not stated outright anywhere in the repository. Code strongly implies Supabase for PostgreSQL (Supabase-pooler-specific connection-string guidance in `services/readiness.ts`; Supabase PITR referenced in `docs/operations/BACKUP_AND_RESTORE_RUNBOOK.md`) and Upstash for Redis (`scripts/production-build.mjs` has an Upstash-specific TLS-URL warning) — but this is an inference from code behavior, not a confirmed fact. Verify directly with whoever operates production before treating either as certain.

## Coding Principles

- ESLint: flat config extending `next/core-web-vitals` + `next/typescript` (`eslint.config.mjs`).
- TypeScript: `strict: true`, target `ES2022`, `moduleResolution: bundler`, path alias `@/*` → repo root — always import via `@/lib/...`, `@/services/...`, never deep relative paths.
- Zod is the standard for validating anything crossing a trust boundary: LLM classifier output, gateway webhook/API payloads, environment variables (`config/env.ts`, parsed eagerly at import so misconfiguration fails at boot).
- Domain error classes carry their own HTTP status (e.g. `TenantIsolationError` → 404, `TenantDatabaseError`).
- Standard API route shape (seen in `app/api/v1/webhooks/approvals/route.ts`): `measure()` wrapper for latency instrumentation → IP-based `distributedRateLimit()` → signature verification → Zod `.safeParse()` with a structured 400 on failure → delegate to `services/` → `NextResponse.json()` with an explicit status code.
- File naming: `lib/` favors kebab-case (`tenant-isolation.ts`, `rate-limit.ts`); `services/` favors camelCase (`approvalQueue.ts`, `processIncomingMessage.ts`), grouped into domain subdirectories.
- Business logic belongs in `services/`; `app/api/*` route handlers and page components stay thin and delegate to it.

## Important Constraints

- **Anthropic has no native text-embeddings endpoint** (confirmed) — any embedding-dependent feature (playbook semantic search today) requires OpenAI or a third-party provider (e.g. Voyage AI, Anthropic's own recommended partner); it cannot be made pure-Anthropic.
- Database migrations are deliberately decoupled from `npm run build` — schema changes require a separate `npm run db:deploy`.
- The BullMQ worker process must run continuously and separately from the Vercel web deployment; it is not itself a serverless function, and no deployment target for it is documented anywhere in the repo.

## Known Technical Debt

As of the repository's own `docs/qa/PRODUCTION_READINESS_REVIEW.md` (dated **2026-07-19** — re-check for a newer version before treating as current): internal readiness score **80/100**, explicit conclusion **"Not ready for unrestricted enterprise production"** — a controlled-pilot candidate only. Specific open items from that review and `docs/qa/PRODUCTION_READINESS_ISSUE_REGISTER.md`:

- Universal Gateway's single platform-wide API key (vs. per-tenant rotatable credentials) — open P1 at review time.
- Backend entitlement/billing enforcement incomplete; no payment provider connected.
- Public lead-capture delivery lacks production/provider-delivery evidence.
- Distributed rate limiting lacks deployed, multi-instance-load evidence.
- Hostile-document upload handling (malware scanning, zip-bomb/encrypted-file handling) incomplete.
- Outlook/Jira/ServiceNow/Zoom connectors lack dedicated test suites and live certification.
- Marketing copy names GitHub/GitLab/Azure DevOps/Jenkins/Kubernetes connectors that don't exist in code.
- No executed backup/restore drill (`docs/operations/RESTORE_TEST_EVIDENCE.md` explicitly marked "NOT EXECUTED").
- No strict CSP; browser/accessibility test coverage is Chromium-only.

Additional debt found during this project's own analysis (not in the issue register — verify before acting):
- `lib/env.ts` (narrow `DATABASE_URL` diagnostics) vs. `config/env.ts` (full env schema) naming overlap is a recurring point of confusion.
- CI does not run the full `package.json` test-script list (missing `test:ingestion`, `test:slack`, `test:gmail`, `test:teams`, `test:evidence`, `test:manual-approvals`, `test:approval-records`, and the Playwright e2e spec).
- The queue worker (`npm run worker`) has no documented deployment target compatible with Vercel.
- **AI migration in progress, not complete** (see Architecture Decisions → AI provider decision): `VOYAGE_API_KEY` is not yet configured anywhere, so playbook indexing/search currently fail explicitly rather than silently degrade (the old silent-hash-fallback issue is fixed, but the feature is presently non-functional until the key is added). Existing `PlaybookChunk` rows are labeled `legacy-unknown` and excluded from search until `npm run reembed:playbooks` is explicitly run post-Voyage-validation. `OpenAIGenerationProvider`/`OpenAIEmbeddingProvider` and the `openai` npm dependency are still present as transitional/rollback code, scheduled for removal in a later cleanup phase once Anthropic+Voyage are validated in production — not yet done.
- AI Gateway telemetry (`services/ai/telemetry.ts`) is in-memory and per-process — on Vercel's serverless model this resets every cold start, so it's a point-in-time signal only, not a durable cross-instance metrics store.

## Features Completed

Per `README.md`, `docs/architecture.md`, and the Integration Status Matrix in `docs/qa/PRODUCTION_READINESS_REVIEW.md`, these have working, implemented code paths (note: "completed" here means implemented in code — see Features In Progress for what's implemented-but-not-yet-certified):

- Core classification pipeline: ingestion → queue → evidence capture → LLM classification → persistence → compliance evaluation → audit → correlation.
- Tenant isolation enforcement layer and its dedicated test suite.
- Slack, Gmail, and Microsoft Teams integrations — each has OAuth/callback/sync/webhook routes and a dedicated automated test suite (marked "Implemented" in the review).
- Universal Approval Gateway: API/webhook/CSV-import/document-intelligence/transcript-intelligence routes, rejoining the standard classification pipeline.
- Evidence Provider SDK plumbing (`EvidenceProviderPlugin` interface, canonical event capture, cross-source correlation into `UnifiedEvidenceRecord`).
- Playbook upload/indexing, rule extraction, and compliance scoring against `ApprovalRecord`s.
- Manual/verbal approval capture with versioned history (`ManualApprovalDetail`/`ManualApprovalVersion`).
- Investigation cases, audit logging, and the Memory Graph (`MemoryEntity`/`MemoryRelationship`/timeline).
- Internal founder console: provisioning, customer health, feature-flag gating, founder audit log.
- Queue reliability primitives: idempotency, dead-lettering, retry classification, outbox pattern, worker heartbeats.

## Features In Progress

Implemented in code but explicitly documented as incomplete or uncertified (per `docs/qa/PRODUCTION_READINESS_REVIEW.md`, 2026-07-19):

- Outlook/Exchange, Jira, ServiceNow, and Zoom connectors — OAuth/callback/sync code exists, but no dedicated test suite or live-provider certification yet ("Partially certified").
- Backend entitlement/plan enforcement — a central plan matrix protects some premium routes (Copilot, Playbook upload) but is not yet applied to every premium route/job/export, and no billing provider is connected.
- Public lead-capture delivery — validated/idempotent storage and an optional CRM/webhook notification point exist, but real provider-delivery/failure evidence is still required.
- Distributed (Redis-backed) rate limiting — implemented, but multi-instance/production-load evidence is still required.
- Hostile-document handling for uploads — format-aware PDF/DOCX parsers now in place, but malware scanning, magic-byte validation, and zip-bomb/encrypted-file handling are not yet complete.
- Content Security Policy — baseline security headers are in place; a staged, provider-aware CSP is not yet enforced.
- Browser/accessibility test coverage — Chromium-only today; Firefox/WebKit and automated accessibility checks are not yet added.
- Disaster-recovery/backup restore — runbooks with RPO/RTO targets exist, but no isolated restore drill has been executed.

## Planned Features

TODO: no committed product roadmap exists in this repository. `docs/roadmap.md` contains only section headers (Vision, Current Focus, Next Quarter, Future Roadmap, Enterprise Features, AI & Intelligence, Integrations, Platform & Infrastructure, Security & Compliance, Developer Platform, Long-Term Vision) with every section body still a placeholder — populate this section once the product/business team supplies actual roadmap content; do not infer priorities from the section names alone.

The only externally-evidenced forward-looking items found: marketing/product copy names GitHub, GitLab, Azure DevOps, Jenkins, and Kubernetes as connectors, but **no connector code exists for any of them** (per the Integration Status Matrix in `docs/qa/PRODUCTION_READINESS_REVIEW.md`, listed as "Planned/marketing only"). Whether these are an actual committed plan or aspirational copy that needs correcting is itself unconfirmed — see the corresponding item in Known Technical Debt.

## Decisions to Never Break

- `TenantIsolationError` must map to HTTP **404**, not 403 — this is deliberate (per `lib/tenant-isolation.ts` and the architecture docs) so a cross-tenant access attempt is indistinguishable from a request for a nonexistent resource. Changing it to 403 reintroduces a cross-tenant existence leak.
- All integration OAuth scopes are read-only across every provider — this is a stated product/security decision (README, `docs/integrations.md`), not an oversight; do not widen a scope list without that being an explicit, deliberate decision.
- Every secret/signature/API-key comparison must use `crypto.timingSafeEqual`, never a plain `===` string compare.
- Connector OAuth tokens and gateway credentials must never be stored unencrypted — always through `utils/encryption.ts` (AES-256-GCM).

## Security Requirements

- Tenant isolation via `lib/tenant-isolation.ts` is the load-bearing security boundary (see Architecture Decisions → Multi-tenancy).
- Connector tokens and gateway credentials encrypted at rest with AES-256-GCM (`utils/encryption.ts`, key from `ENCRYPTION_KEY`, must decode to exactly 32 bytes).
- All OAuth integration scopes are read-only by design across every provider.
- Every HMAC/signature/API-key comparison uses `crypto.timingSafeEqual` (length-checked first).
- OAuth `state` parameters are HMAC-signed and time-boxed (10-minute expiry).
- Known open security items as of the 2026-07-19 internal review (re-verify current status before relying on this list): Universal Gateway used a single platform-wide API key rather than per-tenant rotatable credentials (open P1 at review time); no strict Content Security Policy (baseline security headers only); Redis-backed distributed rate limiting lacked deployed multi-instance evidence; hostile-document upload handling incomplete; debug endpoints were previously public, recorded as remediated (now auth-gated) but awaiting deployed smoke-test evidence.

## Performance Targets

Dashboard and feature-page queries use bounded timeout/fallback patterns so Redis or external AI-provider unavailability doesn't block core shell rendering (per `docs/qa/PRODUCTION_READINESS_REVIEW.md`). That same review documents recommended-but-unverified launch SLOs — these are stated targets in an internal report, **not measured/certified production numbers**:

- Public page LCP under 2.5s.
- Interactive feedback under 100ms.
- Dashboard first meaningful content under 1.5s at p75.
- Non-AI API p95 under 750ms.
- Queue acceptance p95 under 500ms.

---

# Part 2 — Engineering Journal

## 2026-08-04

**Task:** Initial repository onboarding: located the ApprovLine project (moved from the originally-requested `~/Projects/ApprovLine` to `~/Documents/ApprovLine/2026-06-11/did-you-connected-to-my-github/work/ApprovLine`), created `CLAUDE.md`, authored five `docs/` files (`architecture.md`, `database.md`, `integrations.md`, `coding-standards.md`, `roadmap.md` placeholder), created `PROJECT_OVERVIEW.md` at repo root, and performed a read-only analysis of `services/playbooks.ts`'s OpenAI/Anthropic API-key usage.

**Summary:** Read `package.json`, `README.md`, the full `prisma/schema.prisma`, `middleware.ts`, `lib/tenant-isolation.ts`, `lib/auth.ts`, `lib/gateway-auth.ts`, `services/queue/worker.ts`, `services/classifier/openai.ts`, `services/integrations/slack.ts`, `services/evidence/provider-sdk.ts`, `services/gateway/universalGateway.ts`, `config/env.ts`, `eslint.config.mjs`, `tsconfig.json`, a live API route handler (`app/api/v1/webhooks/approvals/route.ts`), `types/rbac.ts`, `utils/encryption.ts`, `.env.example`, `vercel.json`, `.github/workflows/ci.yml`, `scripts/production-build.mjs`, `services/readiness.ts`, `app/sign-in/page.tsx`, `app/get-started/page.tsx`, and every file under `docs/` (including the two production-readiness reports, which contained the project's own self-graded technical-debt register). Wrote `CLAUDE.md` (command reference + architecture summary for AI coding sessions) and five topic docs under `docs/`. Then compiled `PROJECT_OVERVIEW.md`, a 13-section onboarding document covering executive summary through recommended improvements, sourced entirely from the above reads plus the qa/ops docs. While verifying a flagged uncertainty, read `services/playbooks.ts` in full and traced its `embedText()`/`answerWithOpenAI()` OpenAI dependency; used the `claude-api` skill to confirm Anthropic has no native embeddings endpoint. Performed a structured 5-point analysis (why the key is required, whether the OpenAI dependency is genuine vs. incidental, whether Anthropic can substitute, what changes would be needed, and a recommended long-term architecture) without modifying any source code, per explicit instruction.

**Files Reviewed:** See Summary above — full file paths are also cited throughout Part 1 of this document and in `PROJECT_OVERVIEW.md`.

**Decisions Made:**
- `CLAUDE.md` and `PROJECT_OVERVIEW.md` placed at repo root; the five topic docs placed under `docs/`, consistent with the existing `docs/` convention.
- `docs/roadmap.md` was written as a pure section-header placeholder (no invented roadmap items), per explicit instruction.
- No source code was modified during any part of this session — every task so far has been documentation authoring or read-only analysis.
- For the playbooks.ts question, concluded: the OpenAI dependency splits into two independent capabilities (embeddings — cannot be substituted by Anthropic, no native endpoint exists; and JSON answer synthesis — can be substituted by Anthropic, following the same precedence pattern already used in `services/classifier/openai.ts`). No implementation of this was done yet — analysis only was requested.

**Open Questions:**
- Which embedding-provider path the user wants going forward: add `OPENAI_API_KEY` alongside Anthropic on Vercel (zero code change), integrate Voyage AI as a new provider, or invest in improving the local non-semantic hash fallback.
- Whether the user wants the recommended Anthropic-first `answerWithOpenAI` equivalent implemented, and whether to extract a shared provider-selection helper (to avoid the Anthropic-preferred/OpenAI-fallback logic being duplicated between `services/classifier/openai.ts` and `services/playbooks.ts`).
- Where/when `docs/roadmap.md`'s placeholder sections will be filled in with real content (deferred — no roadmap information has been provided yet).
- No deployment target has been identified for the BullMQ worker process; whether this should be documented or resolved is still open.

**Risks:**
- Playbook Q&A currently runs on non-semantic, degraded search in any deployment configured with only `ANTHROPIC_API_KEY` (a plausible configuration given the classifier's Anthropic-first design), with no error or health-check signal surfacing the degradation to an operator.
- The technical-debt items catalogued in `docs/qa/` (dated 2026-07-19) may have changed since that report was written; `PROJECT_OVERVIEW.md` and this file both flag them as snapshots requiring re-verification, but a future session could mistake them for current status if the qa docs aren't re-read.
- No code changes have been made toward any of the analyzed embeddings/answer-generation options — the current OpenAI-dependent behavior in `services/playbooks.ts` is unchanged.

**Next Recommended Action:** Get a decision from the user on the embedding-provider question (§ Open Questions) and, separately, on whether to implement the Anthropic-first answer-generation path for `services/playbooks.ts`. If both are approved, implement additively (new functions alongside the existing OpenAI paths, preserving every existing fallback), add the missing embedding-provider-mode signal to `services/readiness.ts`/`/health`, and update this journal with a new dated entry once implemented.

## 2026-08-04 — AI Gateway Migration (Phase 1 & 2)

**Task:** User approved a full architecture proposal (dependency analysis → provider comparison → migration plan, all produced in earlier turns this session) to make Anthropic the sole LLM vendor with Voyage AI as the dedicated embedding provider, behind a clean provider-abstraction "AI Gateway." Implemented Phase 1 (generation) and Phase 2 (embeddings) of that plan; Phases 3 (readiness/observability expansion) and 4 (OpenAI cleanup) remain, pending approval per the user's phased-implementation instruction.

**Summary:** Built `services/ai/` as the new home for all AI provider abstraction, mirroring the existing `services/evidence/provider-sdk.ts` registry pattern. Phase 1: `GenerationProvider` interface, `AnthropicGenerationProvider` (model-fallback list + transient retry, ported from the prior `classifyWithAnthropic`), `OpenAIGenerationProvider` (transitional bridge), `services/ai/gateway.ts`'s `generateText()` as the single call site (Anthropic-first, logged fallback), in-memory telemetry. Rewired `services/classifier/openai.ts` (exported surface unchanged, zero changes needed in its three consumers) and `services/playbooks.ts`'s `answerWithOpenAI` → `generatePlaybookAnswer` to call `generateText()`. Added an informational `aiGateway` readiness check. Phase 2: `EmbeddingProvider` interface, `VoyageEmbeddingProvider` (raw HTTP against `api.voyageai.com`, `voyage-4`, 1024d, no new SDK dependency), `OpenAIEmbeddingProvider` (legacy/rollback-only), `services/ai/embeddingGateway.ts`'s `generateEmbedding()` — deliberately single-provider with no fallback chain, throwing explicitly per the user's "no silent degradation" requirement. Split `services/ai/telemetry.ts` into separate generation/embedding maps after realizing a shared `"openai"` key would otherwise conflate the two capabilities. Added `PlaybookChunk.embeddingProvider/embeddingModel/embeddingVersion/embeddingDimensions/embeddingUpdatedAt` via a hand-authored migration (`prisma/migrations/20260804120000_playbook_chunk_embedding_metadata`, since no `DATABASE_URL` was reachable to run `prisma migrate dev`) with a backfill labeling every pre-existing row `embeddingProvider = 'legacy-unknown'` (not `'openai'` — which path produced any given historical row was never recorded, so asserting a specific provider would have been a guess). Deleted `localEmbedding()` (the non-semantic hash fallback) entirely rather than leaving it as unused dead code, since it directly contradicted the stated no-silent-degradation principle. Updated `searchPlaybookChunks()` to filter by provider/model match before computing cosine similarity, and added `reembedPlaybookChunks()` plus a `scripts/reembed-playbook-chunks.ts` CLI (`npm run reembed:playbooks`) as the explicit, operator-triggered backfill — never run automatically. Added `voyage`/`embeddingGateway` readiness checks. Also updated `config/env.ts`/`.env.example` (`VOYAGE_API_KEY`, `VOYAGE_EMBEDDING_MODEL`) and `package.json`.

**Files Reviewed:** All files listed in the 2026-08-04 onboarding entry above, plus direct reads of `services/classifier/persistence.ts` (to confirm `CLASSIFIER_MODEL`'s only consumer and avoid breaking it) and `services/copilot/copilot.ts` (to verify, before assuming otherwise, that Copilot has **no direct LLM call today** — it is fully deterministic/template-based and only consumes `searchPlaybookChunks()` for retrieval; this corrected an assumption in the user's own migration-plan wording that Copilot needed a generation migration).

**Decisions Made:**
- Generation keeps a fallback tier (Anthropic → OpenAI) because the user's own migration plan explicitly tolerates this as a transitional state ("remove OpenAI only after Anthropic generation has been fully validated"); embeddings get zero fallback tolerance because the user's instruction there was unconditional ("Do NOT silently fall back to heuristic hashing... fail explicitly").
- Chose `voyage-4` at Voyage's default 1024 dimensions (no truncation) over the `voyage-context-3/4` contextualized-chunk models, to avoid a bigger redesign of the existing per-chunk embedding loop for a first cut — noted as a detail that can be revisited later without changing the provider abstraction itself.
- Did not promote the Phase 1 `aiGateway` readiness check to a hard `required`-array failure, since doing so would contradict the plan's own tolerance for transitional OpenAI-generation fallback.
- Rollback for embeddings does not require a second vector column: since `PlaybookChunk.content` (source text) is never modified, "rollback" is re-running the same backfill script after pointing the gateway back at `OpenAIEmbeddingProvider`, regenerating equivalent vectors from unchanged source text.
- Per a new standing instruction from the user this session (see the `minimize-clarifying-questions-inspect-code-first` memory), inferred the above decisions directly from the codebase and the user's own previously-stated principles instead of asking — reserving questions for the one thing that's a genuine external blocker (a `VOYAGE_API_KEY`), not a design choice.

**Open Questions:**
- Whether/when to run `npm run reembed:playbooks` in production once `VOYAGE_API_KEY` is added and Voyage's quality has been validated on newly-indexed documents.
- Whether `voyage-4` or a `voyage-context-*` contextualized model is the better long-term choice — deferred, not blocking, since the provider abstraction doesn't need to change either way.
- Phase 3 (full readiness/observability expansion — OAuth provider table, LLM/embedding latency and cost on Trust Center/Founder dashboard) and Phase 4 (deleting `OpenAIGenerationProvider`/`OpenAIEmbeddingProvider` and the `openai` npm dependency) are both still pending explicit approval.

**Risks:**
- Playbook indexing/search are presently non-functional (by design, not a bug) until `VOYAGE_API_KEY` is configured — this is a real, visible behavior change from before this migration (which at least returned degraded-but-present results).
- The hand-authored migration SQL has not been applied to any real database (none was reachable in this environment) — `npm run db:deploy` must be run against the actual production/staging database before any of this takes effect there, and the migration should be reviewed as carefully as any hand-written SQL would be.
- In-memory telemetry means the new readiness signals reset on every serverless cold start — a true multi-instance view still doesn't exist (flagged, not solved, in this phase).

**Next Recommended Action:** Get `VOYAGE_API_KEY` provisioned and set (staging first), validate playbook indexing/search end-to-end against real documents, then request Phase 3 (readiness/observability expansion) and/or Phase 4 (OpenAI removal) explicitly — both remain gated behind approval per the user's phased-implementation instruction.
