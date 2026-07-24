# Universal Evidence Capture Platform

ApprovLine treats every connected system as an evidence provider. Provider-specific
events are normalized into one tenant-scoped model before classification,
correlation, graph projection, timeline generation, or audit export.

## Processing flow

```text
Provider
  -> Connection and authentication
  -> Subscription, webhook, fetch, or import
  -> Provider extractor
  -> Canonical evidence normalizer
  -> Idempotent evidence storage
  -> Approval classifier
  -> Cross-source correlation
  -> Unified Evidence Record
  -> Memory Graph and timeline
```

Queue outages do not discard accepted events. The evidence event remains in
`RETRY_PENDING`, a processing failure is recorded, and the existing queue outbox
can resume processing after Redis recovers.

## Provider SDK

Every provider implements the same contract:

```ts
interface EvidenceProviderPlugin {
  Authenticate(context, input): Promise<Record<string, unknown>>;
  Subscribe(context): Promise<Record<string, unknown>>;
  Fetch(context, cursor?): Promise<{ events: unknown[]; cursor?: string }>;
  Normalize(event, context): Promise<CanonicalEvidenceInput>;
  HealthCheck(context): Promise<EvidenceProviderHealthResult>;
  Disconnect(context): Promise<void>;
}
```

Provider plugins declare their key, category, authentication type, capabilities,
version, and read-only status. New providers register through
`registerEvidenceProvider` without changing the canonical processing pipeline.

## Canonical event model

Canonical events preserve provider identity, event type and time, actor,
organization, source object, thread and parent references, related IDs,
participants, attachments, links, content, metadata, confidence, evidence hash,
and correlation ID.

Raw provider payloads are encrypted with `ENCRYPTION_KEY` before persistence.
They are never returned by search or detail APIs. A stable SHA-256 evidence hash
supports tenant-scoped idempotency and duplicate prevention.

## Correlation and review

Correlation scores use source-object identity, thread identity, approver,
business references, and decision-subject overlap.

- Scores at or above 80 are linked automatically.
- Scores from 55 through 79 are suggestions requiring human verification.
- Lower scores create a separate unified evidence record.
- Rejected suggestions remain stored for audit history.

Human verification and rejection are tenant-scoped and record the reviewer and
review timestamp.

## Security

- All reads and mutations resolve the authenticated ApprovLine organization.
- Search, detail, review, provider operations, retries, and ingestion are
  organization scoped.
- Provider credentials remain encrypted in provider connection records.
- Source payloads remain encrypted at rest.
- Existing source evidence is immutable; correlation creates associations.
- Provider manifests are read-only by default.
- Administrative provider operations require an admin or compliance role.

## API surface

- `POST /api/evidence/ingest`
- `GET /api/evidence/records`
- `GET /api/evidence/records/:id`
- `GET /api/evidence/providers`
- `POST /api/evidence/providers/:providerKey`
- `DELETE /api/evidence/providers/:providerKey`
- `PATCH /api/evidence/suggestions/:memberId`
- `POST /api/evidence/failures/:id/retry`
- `GET /api/evidence/health`

## Product workspace

- `/evidence` provides tenant-scoped search, provider and risk filters, confidence,
  verification state, source counts, and migration-safe empty/error states.
- `/evidence/[id]` presents the unified decision record, original source chronology,
  correlation reasons, human-review state, and safe immutable-source links.

`POST /api/evidence/providers/:providerKey` accepts `SYNC` or `HEALTH`.
Suggestion review accepts `VERIFY` or `REJECT`.

## Reliability and observability

Provider health records track authentication, expiry, rate limits, latency,
webhook state, sync state, last successful sync, consecutive failures, and retry
time. Processing failures track stage, attempts, retry schedule, resolution, and
safe error details. Health APIs expose status aggregates without credentials or
raw payloads.

## Deployment

Apply the schema independently from the Next.js build:

```bash
npm run db:deploy
```

The migration is:

```text
prisma/migrations/20260724120000_universal_evidence_platform
```

Required production configuration includes a valid PostgreSQL `DATABASE_URL`
and a 64-character hexadecimal `ENCRYPTION_KEY`.

## Validation

```bash
npm run check
npm run test:evidence
npm run test:manual-approvals
npm run build
```
