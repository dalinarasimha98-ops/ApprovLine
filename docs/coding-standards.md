# ApprovLine Coding Standards

These are the conventions actually in force in this codebase, derived from `eslint.config.mjs`, `tsconfig.json`, and patterns repeated consistently across `services/`, `lib/`, and `app/api/`. Enforce these when writing or reviewing new code rather than introducing a different style.

## Tooling configuration

- **ESLint** (`eslint.config.mjs`): flat config extending `next/core-web-vitals` and `next/typescript` via `FlatCompat`. `.next/`, `node_modules/`, `coverage/`, `dist/`, and `next-env.d.ts` are ignored. Run with `npm run lint`.
- **TypeScript** (`tsconfig.json`): `strict: true`, target `ES2022`, module resolution `bundler`, `isolatedModules: true`, `noEmit: true` (Next.js handles emission). Path alias `@/*` maps to the repo root — always import via `@/lib/...`, `@/services/...`, `@/config/...`, `@/types/...` rather than relative `../../` paths. Run `npm run check` for a standalone type check.
- Package is `"type": "module"`.

## Validation and typing

- **Zod is the standard for parsing anything crossing a trust boundary**: LLM classifier output (`services/classifier/openai.ts`'s `classifierSchema`), gateway webhook/API payloads (`services/gateway/universalGateway.ts`'s `universalWebhookSchema`/`universalApprovalSchema`), and environment variables (`config/env.ts`'s `envSchema`) are all Zod schemas. New external input should be validated the same way — prefer `schema.safeParse()` with an explicit 400 response over letting a malformed payload propagate.
- `config/env.ts` is parsed eagerly (`envSchema.parse(process.env)`) at import time, so a misconfigured deployment fails at boot instead of at first use of the missing variable. All variables are optional strings at the schema level (each service is responsible for checking its own required variables are present before using them, since not every deployment needs every integration configured) — see the `if (!env.SLACK_CLIENT_ID) throw ...` style checks in `services/integrations/slack.ts`.
- Shared types for cross-cutting domain concepts live in `types/` (`classifier.ts`, `evidence.ts`, `rbac.ts`) and are imported by both `services/` and `app/`, rather than being redeclared per call site.

## Error handling

- Domain-specific error classes carry their own HTTP status, e.g. `TenantIsolationError` (`lib/tenant-isolation.ts`, `status = 404`) and `TenantDatabaseError` (`lib/auth.ts`). Route handlers and page loaders check `instanceof` against these to decide the response, rather than string-matching messages.
- `TenantIsolationError` intentionally maps to **404, not 403**, so that a request for another tenant's resource looks identical to a request for a nonexistent one — don't change this to 403 without considering that it leaks cross-tenant existence.
- Queue/worker failures are classified into a fixed set of categories (`RATE_LIMIT`, `TIMEOUT`, `TRANSIENT`, `AUTHENTICATION`, `VALIDATION`, `UNKNOWN` — see `services/queue/worker.ts`'s `classifyFailure()`) via keyword matching on the error message; this classification drives retry-vs-dead-letter behavior, so error messages thrown from ingestion/classification code should contain a recognizable keyword (`rate limit`, `timeout`, `credential`/`oauth`/`unauthor`, `validation`/`invalid`/`missing`, etc.) if they're meant to be retried or not retried a particular way.

## API route conventions

Illustrated by `app/api/v1/webhooks/approvals/route.ts`, the standard shape for an inbound route handler is:

1. `export const dynamic = 'force-dynamic'` when the route must not be statically cached.
2. Wrap the handler body in `measure('METHOD /path', async () => { ... })` (`lib/performance.ts`) for latency instrumentation.
3. Rate-limit by caller IP via `distributedRateLimit()` (`lib/rate-limit.ts`) before doing any other work, when the route is unauthenticated/externally reachable.
4. Verify any provider/gateway signature before parsing the body as JSON.
5. Parse with a Zod schema's `.safeParse()`, returning `{ error, details: parsed.error.flatten() }` with status 400 on failure.
6. Call into a `services/` function to do the actual work — route handlers themselves stay thin.
7. Return `NextResponse.json(...)` with an explicit status code (`202` for accepted-for-async-processing, matching the queue-based processing model).

## Tenant isolation (non-negotiable)

Any code path that reads or writes a tenant-owned Prisma model must go through `lib/tenant-isolation.ts`'s helpers (`tenantScopedWhere()`, `assertTenantAccess()`) rather than hand-rolling an `organizationId` filter or (worse) omitting it. This is covered in depth in `docs/architecture.md`; the tests in `tests/tenant-isolation.test.ts` exist specifically to catch regressions here, and `npm run test:tenant-isolation` should stay green.

## Reliability conventions

- New producers into the BullMQ queue should go through `services/queue/approvalQueue.ts`'s `enqueueIncomingMessage()` rather than calling BullMQ directly, so idempotency keys and correlation IDs are attached consistently.
- Every external event that gets ingested should carry a `correlationId` (threaded through queue job → `Event`/`MessageSource` → `ClassifierResult` → `ApprovalRecord`) and an `idempotencyKey` (used to detect duplicate submissions) — see how `services/gateway/universalGateway.ts`'s `ingestUniversalApproval()` builds both before enqueueing.

## Security conventions

- Any HMAC/token comparison must use `crypto.timingSafeEqual` (buffer-length-checked first), never `===` or a non-constant-time string compare — see `services/integrations/slack.ts`'s `verifySlackSignature()`/`verifySlackState()` and `lib/gateway-auth.ts`'s `secureEqual()` for the established pattern.
- OAuth `state` parameters are signed (HMAC) and time-boxed (10-minute expiry in the Slack connector) — follow the same signed-state pattern for any new OAuth connector rather than passing an unsigned or unbounded state value.
- Connector tokens and gateway credentials are encrypted at rest with AES-256-GCM (`utils/encryption.ts`) before being stored in `Integration.encryptedTokens` / `EvidenceProviderConnection.encryptedCredentials` — never store a raw OAuth token or API credential in a plain `Json`/`String` column.
- Integration OAuth scopes are read-only by design across every provider (see `docs/integrations.md`) — don't widen a scope list without that being an explicit, deliberate product decision.

## File naming and module organization

- `lib/` favors kebab-case multi-word filenames (`tenant-isolation.ts`, `rate-limit.ts`, `gateway-auth.ts`, `evidence-links.ts`).
- `services/` favors camelCase multi-word filenames (`approvalQueue.ts`, `processIncomingMessage.ts`, `resolveTenant.ts`), grouped into subdirectories by domain (`services/queue/`, `services/classifier/`, `services/evidence/`, `services/integrations/`, `services/gateway/`, `services/ingestion/`).
- Route handlers live under `app/api/<resource>/route.ts` following standard Next.js App Router conventions, with dynamic segments as `[id]`/`[token]` folders.
- Keep new business logic in `services/`, not inline in `app/api/*/route.ts` handlers or in `app/` page components — route handlers and pages should call into `services/`, matching every existing route in the codebase.
