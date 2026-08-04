# ApprovLine Integrations

ApprovLine has three distinct integration surfaces. They coexist in the current codebase — check which one a given provider or task actually uses before extending it.

## 1. Legacy per-provider connectors

Location: `services/integrations/{slack,gmail,outlook,teams,jira,servicenow,zoom}.ts`, `services/integrations/resolveTenant.ts`, `services/integrations/simulation.ts`. Routes: `app/api/integrations/<provider>/{install,callback,webhook,sync}` (see `app/api/integrations/{gmail,jira,oauth,outlook,servicenow,slack,teams,zoom}` and `app/api/integrations/health`).

Each connector module implements, in its own file, the same shape of logic (illustrated by `services/integrations/slack.ts`):

- **Scopes** — a hardcoded, explicitly read-only scope list (e.g. `SLACK_READ_ONLY_SCOPES` covers only `*:history`/`*:read`/`users:read*`, no write scopes).
- **OAuth state signing** — `sign<Provider>State()` / `verify<Provider>State()` HMAC-sign a JSON payload (`organizationId`, `userId`, `createdAt`) with a secret derived from `ENCRYPTION_KEY` (falling back to `CLERK_SECRET_KEY`, then a hardcoded dev value), base64url-encoded as `body.signature`. Verification uses `crypto.timingSafeEqual` on the signature and rejects state older than 10 minutes.
- **Install URL** — `build<Provider>InstallUrl()` constructs the provider's OAuth authorize URL with client id, scopes, redirect URI, and the signed state.
- **Redirect URI** — derived from `env.APP_URL` if set, otherwise the request's own origin, always pointing at `/api/integrations/<provider>/callback`.
- **Token exchange** — `exchange<Provider>OAuthCode()` POSTs the authorization code to the provider's token endpoint and returns the raw token response.
- **Inbound signature verification** — for providers that push events (e.g. Slack Events API), `verify<Provider>Signature()` checks a timestamp window (typically 5 minutes) and an HMAC signature via `crypto.timingSafeEqual`, again to defend against timing attacks.
- **`resolveTenant.ts`** — maps an inbound webhook/account identifier back to the owning `Organization`/`Integration` row, since inbound provider events don't carry a Clerk session.

Every one of README's documented integrations (Slack, Gmail, Teams, Jira, Zoom — and ServiceNow/Outlook in code) requests **read-only scopes only** and documents its exact OAuth redirect URL requirement per provider console (see root `README.md`).

## 2. Evidence Provider SDK

Location: `services/evidence/{provider-sdk,provider-catalog,provider-orchestrator,normalizer,pipeline,api-access,records}.ts`, documented further in `docs/universal-evidence-platform.md`.

This is a provider-agnostic plugin interface, meant to standardize what the legacy connectors above do ad hoc. `services/evidence/provider-sdk.ts` defines:

```ts
abstract class BaseEvidenceProvider<TAuthentication, TProviderEvent> {
  abstract manifest: EvidenceProviderManifest;
  abstract Authenticate(context, input): Promise<Record<string, unknown>>;
  abstract Subscribe(context): Promise<Record<string, unknown>>;
  abstract Fetch(context, cursor?): Promise<{ events: TProviderEvent[]; cursor?: string }>;
  abstract Normalize(event, context): Promise<CanonicalEvidenceInput>;
  abstract HealthCheck(context): Promise<EvidenceProviderHealthResult>;
  abstract Disconnect(context): Promise<void>;
}
```

Providers register themselves into a module-level registry via `registerEvidenceProvider()` and are looked up by a normalized key (`normalizeProviderKey`: lowercase, `[a-z0-9._-]` only, max 80 chars). `Fetch`/`Normalize` output feeds into the `CanonicalEvidenceEvent` pipeline described in `docs/architecture.md` and `docs/database.md`. `services/evidence/provider-orchestrator.ts` coordinates calling providers; `provider-catalog.ts` is the list of known providers surfaced in the product UI (`/dashboard` evidence provider list, `app/api/evidence/providers`).

## 3. Universal Approval Gateway

Location: `services/gateway/universalGateway.ts`. Routes: `app/api/v1/{approvals,webhooks/approvals,imports/csv,documents/intelligence,transcripts/intelligence}`.

This path exists for enterprise systems that ApprovLine doesn't have a dedicated OAuth connector for (SAP, Oracle, Coupa, Workday, Salesforce, HubSpot, or anything custom), and for bulk/document/email ingestion. It differs from the two connector patterns above in every important way:

- **Auth** — a static API key, not OAuth. `lib/gateway-auth.ts`'s `authorizeGatewayRequest()` reads `Authorization: Bearer <key>` or `x-api-key`, compares it to `UNIVERSAL_GATEWAY_API_KEY` with `crypto.timingSafeEqual`, and — notably — allows unauthenticated access when the key isn't configured **unless** `NODE_ENV === 'production'`, where it's a hard 503.
- **Webhook signing** — `app/api/v1/webhooks/approvals/route.ts` additionally verifies an `x-approvline-signature` header against `UNIVERSAL_GATEWAY_WEBHOOK_SECRET` via `verifyWebhookSignature()` (`services/queue/reliability.ts`) when that secret is configured.
- **Validation** — inbound payloads are parsed with Zod (`universalWebhookSchema` / `universalApprovalSchema` in `services/gateway/universalGateway.ts`), returning a structured 400 with `parsed.error.flatten()` on failure rather than a generic error.
- **Rate limiting** — the webhook route applies `distributedRateLimit()` (`lib/rate-limit.ts`) keyed by the caller's IP (240 requests / 60s) before doing any other work.
- **Normalization** — `normalizeWebhookApproval()` maps an arbitrary `{system, event_type, payload}` webhook body onto the canonical `UniversalApprovalInput` shape, falling back through several plausible field names (`decision`/`approval`/`status`/`state`/`comment`/`body`, etc.) when the strict shape isn't present.
- **Enqueue** — `ingestUniversalApproval()` builds an `IncomingMessageJob` (the same job shape the legacy connectors produce) and calls `enqueueIncomingMessage()`, so gateway traffic rejoins the same classification pipeline described in `docs/architecture.md` — there is no separate gateway-only classifier path.
- **Non-webhook ingestion** — `ingestGatewayArtifact()` handles CSV/document/transcript/email content by splitting it into lines and heuristically matching approval-like language (`/approv|sign.?off|go ahead|proceed|reject|denied|move forward|ok(ay)?/i`) before calling `ingestUniversalApproval()` per matching line.
- **Tenant resolution** — gateway callers either pass an explicit `organizationId`, or a `tenant_slug` that resolves/creates an `Organization` via `getGatewayOrganization()` (defaulting to a `public-demo` org when neither is given — this is the org used by the public-facing gateway demo).

Per `README.md`, the gateway also accepts approvals forwarded by tenant-specific email address (`approvals+tenant@approvline.ai`) and is fronted by a dashboard at `/dashboard/gateway`.

## Choosing where to add a new integration

- A provider that needs bidirectional OAuth and a dedicated webhook/event subscription, and is expected to be a first-class, richly-typed integration → extend the Evidence Provider SDK (`services/evidence/provider-sdk.ts`) rather than adding another ad hoc file under `services/integrations/`, since that's the pattern documented as the intended standard in `docs/universal-evidence-platform.md`.
- A system that only needs to push approval events in (webhook, CSV, forwarded email, or a one-off API call) without a rich OAuth/event-subscription model → use the Universal Approval Gateway (`services/gateway/universalGateway.ts`), matching how SAP/Oracle/Coupa/Workday/Salesforce/HubSpot are already handled.
