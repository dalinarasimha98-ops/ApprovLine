# ApprovLine Database

Source of truth: `prisma/schema.prisma` (PostgreSQL via Prisma). This document summarizes the model groups and how they relate; for exact fields, indexes, and enum values, read the schema file directly — it is the canonical reference and this doc will drift if the schema changes without an update here.

All primary keys are `cuid()` strings. Every tenant-owned model carries its own `organizationId` foreign key to `Organization` with `onDelete: Cascade` — there is no shared-schema or row-level-security mechanism; isolation is enforced in application code (see `lib/tenant-isolation.ts`, covered in `docs/architecture.md`).

## Tenant root

- **`Organization`** — the tenant. Holds onboarding state (`onboardingStep`, `onboardingStatus`, `onboardingCompletedSteps`, `onboardingReadinessScore`), org-level config (`departments`, `approvalCategories`), and links to a Clerk organization via `clerkOrgId`. Nearly every other model relates back to it.
- **`User`** — Clerk-linked (`clerkUserId` unique), scoped to one `organizationId`, with a `Role` (`ADMIN`, `MANAGER`, `EMPLOYEE`, `COMPLIANCE_OFFICER`).
- **`Team`** / **`TeamMember`** — simple team grouping within an organization.

## Integrations & raw ingestion

- **`Integration`** — one row per connected provider account (`IntegrationProvider` enum: `SLACK`, `GMAIL`, `OUTLOOK`, `MICROSOFT_TEAMS`, `JIRA`, `SERVICENOW`, `ZOOM`, `CUSTOM`), with `encryptedTokens`, `scopes`, and `IntegrationStatus` (`CONNECTED`, `DISCONNECTED`, `NEEDS_REAUTH`, `ERROR`, `SYNCING`).
- **`MessageSource`** — a normalized inbound message/event from a provider, deduplicated on `[organizationId, provider, externalId]`, carrying `contentHash`, `correlationId`, and `idempotencyKey` for the reliability pipeline.
- **`Event`** — a generic append-only event log per organization (used heavily by the gateway path), also carrying `correlationId`/`idempotencyKey` and `sourceSystem`/`sourceRecordId` for enterprise-system traceability.

## Approval core

- **`ApprovalRecord`** — the central business object: one detected/logged approval decision. Links optionally to a `MessageSource` and an approver `User`. Carries classification output (`approvalType`, `status`, `confidence`, `riskLevel`, `businessImpact`, `reasoning`), source attribution (`sourcePlatform`, `sourceLink`, `sourceSystem`, `sourceRecordId`), and duplicate-detection fields (`duplicateDisposition`, `duplicateReason`, `contentHash`).
- **`ClassifierResult`** — raw output of a single classifier run (model name, prompt version, input hash, latency), linked to the `MessageSource` it was run against and the `ApprovalRecord` it produced. Unique on `[organizationId, idempotencyKey]` to prevent double-classification.
- **`ManualApprovalDetail`** / **`ManualApprovalVersion`** — support for verbal/manual (non-automatically-captured) approvals: `ManualApprovalKind` (`VERBAL`, `MANUAL`), a `ManualApprovalVerificationStatus` state machine (`PENDING_CONFIRMATION` → `CONFIRMED_BY_APPROVER` / `DISPUTED` / `SUPERSEDED`), optional second-person verification, and a full version history (`ManualApprovalVersion` snapshots with `changeReason` and `previousValues`) — one `ApprovalRecord` has at most one `ManualApprovalDetail` but many versions.
- **`ApprovalConfirmationRequest`** — a token-based (`tokenHash`, unique) request sent to an approver to confirm/correct/reject a captured approval, with an expiry and an `ApprovalConfirmationDecision` (`PENDING`, `CONFIRMED`, `REJECTED`, `CORRECTED`).
- **`ApprovalEvidenceAssociation`** — links an `ApprovalRecord` to a supporting `MessageSource`, with an `ApprovalEvidenceOrigin` (how the link was made — automatic capture, manual entry, verbal, confirmation, AI suggestion, human-verified) and an `EvidenceAssociationStatus` (`SUGGESTED`, `CONFIRMED`, `REJECTED`), including an `immutableSnapshot` for audit purposes.

## Evidence platform (provider-agnostic pipeline)

- **`EvidenceProviderConnection`** — a connected Evidence SDK provider (distinct from the legacy `Integration` model), keyed by `providerKey`, with its own `EvidenceProviderConnectionStatus` lifecycle (`CONNECTED`, `SYNCING`, `DEGRADED`, `ERROR`, `REAUTH_REQUIRED`, `DISCONNECTED`).
- **`CanonicalEvidenceEvent`** — the normalized unit of evidence from any provider: `evidenceHash`-deduplicated per `[organizationId, providerKey, evidenceHash]`, carrying actor/object/thread/participant metadata, an `EvidenceEventStatus` pipeline state (`RECEIVED` → `QUEUED` → `PROCESSING` → `CLASSIFIED` → `CORRELATED` → `COMPLETED`, with `RETRY_PENDING` / `DEAD_LETTER` / `IGNORED_DUPLICATE` as terminal/retry states), and `processingAttempts`/`lastError` for retry bookkeeping.
- **`UnifiedEvidenceRecord`** — a cross-source rollup of multiple `CanonicalEvidenceEvent`s believed to represent the same real-world decision (e.g. a Slack thread and a Jira ticket), with an aggregate `confidence`, `verificationStatus`, `sourceCount`/`evidenceCount`, and an optional link to the `primaryApproval` (`ApprovalRecord`).
- **`UnifiedEvidenceMember`** — the join between a `UnifiedEvidenceRecord` and each `CanonicalEvidenceEvent` it contains, with its own `UnifiedEvidenceMemberStatus` (`AUTO_LINKED`, `SUGGESTED`, `HUMAN_VERIFIED`, `REJECTED`) and `matchConfidence`/`matchingReasons` explaining why it was linked.
- **`EvidenceProviderHealth`** — one row per connection tracking auth status, rate-limit remaining, latency, webhook/sync status, and consecutive-failure count with a `nextRetryAt`.
- **`EvidenceProcessingFailure`** — a log of individual processing failures per stage, with `retryable` and `nextRetryAt`.

## Compliance / playbooks

- **`PlaybookDocument`** — an uploaded policy document (`PlaybookStatus`: `UPLOADED` → `INDEXING` → `READY`, or `ERROR`), deduplicated by `contentHash`.
- **`PlaybookChunk`** — a chunked, embedded (`embedding: Json`) section of a document, used for retrieval (`chunkIndex`, `tokenEstimate`, `sectionTitle`).
- **`PlaybookRule`** — a structured rule extracted from a document: `requiredApprovers`, `requiredDepartments`, `escalationChain`, `spendingLimit`, `riskTriggers`, `evidenceRequired`, with a `severity` and the `sourceExcerpt` it was derived from.
- **`ApprovalComplianceEvaluation`** — the result of scoring one `ApprovalRecord` against a `PlaybookRule`: a `score`, `severity`, and lists of what's missing (`missingApprovers`, `missingDepartments`, `missingEscalationSteps`, `missingEvidence`).
- **`PlaybookQuery`** — a logged natural-language question against the playbook corpus, with the answer, source chunk IDs, and confidence (powers the Copilot/playbook Q&A feature).

## Reliability / queue infrastructure

- **`BackgroundJob`** — one row per BullMQ job, with `BackgroundJobStatus` (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `DEAD_LETTERED`, `CANCELED`), attempt/priority/timeout tracking, and a `QueueFailureCategory` on failure. Unique on `[queueName, idempotencyKey]`.
- **`DeadLetterJob`** — terminal failures moved out of the active queue, with a `redactedPayload` (not the raw payload) and `retryEligible` flag.
- **`OutboxEvent`** — transactional-outbox-style events awaiting delivery, with its own `OutboxEventStatus`.
- **`IdempotencyRecord`** — generic idempotency ledger keyed by `[organizationId, key]`, independent of the job queue, used to dedupe non-queue operations.
- **`WorkerHeartbeat`** — liveness rows per worker process (`workerId` unique), used for health/monitoring.

## Audit, investigations, and memory graph

- **`AuditLog`** — append-only action log per organization, optionally tied to an actor `User` and/or `ApprovalRecord`; also used to record tenant-isolation security events (see `docs/architecture.md`).
- **`InvestigationCase`** — a grouping of related approvals under investigation (`InvestigationStatus`: `OPEN`/`CLOSED`), with `InvestigationApproval` as the join table to `ApprovalRecord` and `InvestigationNote` for freeform notes.
- **`MemoryEntity`** — a node in the cross-source "memory graph": vendors, contracts, approvals, approvers, departments, projects, policies, investigations, risks, and per-provider record types (emails, Teams/Slack messages, Zoom decisions, Jira tickets, ServiceNow records, gateway records), typed by `MemoryEntityType`.
- **`MemoryRelationship`** — a typed, directed, self-referential edge between two `MemoryEntity` rows (`relationshipType`, `confidence`, `evidenceSnippet`).
- **`MemoryGraphEvent`** — an audit trail of changes to the graph itself.
- **`MemoryTimelineEvent`** — a chronological event tied to one `MemoryEntity`, used to render entity timelines.

## Billing, growth, and marketing

- **`Subscription`** — Stripe-backed plan/seat/status tracking per organization (`SubscriptionStatus`: `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`).
- **`FeatureFlag`** — per-organization boolean flags.
- **`PilotInvite`**, **`PilotFeedback`**, **`PilotActivityLog`** — pilot-program invite tracking, in-product feedback capture, and activity logging.
- **`PublicLeadSubmission`** — marketing lead-capture form submissions; notably has **no `organizationId`** since it's pre-tenant (deduplicated instead via `idempotencyKey`/`duplicateKey`).

## Founder/internal ops (separate hierarchy)

These models back the internal `founder` console (see `docs/architecture.md`) and are keyed by `customerAccountId`, not `organizationId`, except where noted:

- **`PlatformAdmin`** — internal staff accounts with a `PlatformRole` (`SUPER_ADMIN`, `FOUNDER_ADMIN`, `SUPPORT_ADMIN`), independent of the tenant `User`/`Role` model.
- **`CustomerAccount`** — 1:1 with `Organization`, the internal "customer" view: `CustomerAccountStatus` (`TRIAL`, `ACTIVE`, `SUSPENDED`, `CHURNED`), `CustomerPlanTier` (`FREE_TRIAL`, `STARTER`, `GROWTH`, `ENTERPRISE`), `dataRetentionDays`, `internalNotes`.
- **`CustomerWorkspace`** — 1:1 with both `CustomerAccount` and `Organization`, provisioning metadata.
- **`CustomerPlan`** — plan-tier catalog (seat limits, feature list, price label), keyed by `planTier` rather than a specific customer.
- **`CustomerSeatAllocation`** — purchased/allocated/used seat counts per account.
- **`CustomerFeatureFlag`** — internal per-account feature flags (distinct from the tenant-facing `FeatureFlag` model).
- **`CustomerIntegrationStatus`** — internal view of each customer's per-provider connection state (`CustomerIntegrationConnectionState`).
- **`CustomerHealth`** — a computed health score/status (`CustomerHealthStatus`: `HEALTHY`, `NEEDS_ATTENTION`, `AT_RISK`, `CRITICAL`) plus usage counters.
- **`FounderManagedUser`** — internal staff acting as/managing users within a customer's organization, with its own invite/status lifecycle (`FounderManagedUserStatus`, `FounderManagedUserRole`).
- **`FounderAuditLog`** — audit trail of founder-console actions, separate from the tenant `AuditLog`.
- **`CustomerNote`** — internal freeform notes on a customer account, with a `pinned` flag.
