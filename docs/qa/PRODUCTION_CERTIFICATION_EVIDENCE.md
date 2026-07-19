# ApprovLine Production Certification Evidence

Review date: 2026-07-19  
Evidence scope: repository and local runtime only unless explicitly marked otherwise.

## Evidence Levels

- **Code verified**: implementation and static configuration inspected.
- **Local verified**: an automated command completed successfully on the review workstation.
- **Preview verified**: exercised against a deployed non-production environment.
- **Sandbox verified**: exercised against an external provider sandbox/test account.
- **Production verified**: exercised against production with secret-safe evidence.
- **Pending**: required evidence was unavailable and the claim is not certified.

## Automated Evidence

| Claim | Evidence | Command | Result | Level |
|---|---|---|---|---|
| Production compilation | `package.json`, `scripts/production-build.mjs` | `npm run build` | Passed; 47/47 static pages, exit 0 | Local verified |
| Type safety | TypeScript project | `npm run check` | Passed | Local verified |
| Lint quality | `eslint.config.mjs` | `npm run lint` | Passed | Local verified |
| Classifier corpus | `scripts/validate-classifier-corpus.mjs` | `npm run test:classifier-corpus` | Passed; 100 examples | Local verified |
| Ingestion mapping | `tests/ingestion-pipeline.test.ts` | `npm run test:ingestion` | Passed | Local verified |
| Slack integration logic | `tests/slack-integration.test.ts` | `npm run test:slack` | Passed | Local verified; provider pending |
| Gmail integration logic | `tests/gmail-integration.test.ts` | `npm run test:gmail` | Passed | Local verified; provider pending |
| Teams integration logic | `tests/teams-integration.test.ts` | `npm run test:teams` | Passed | Local verified; provider pending |
| Founder hardening | `tests/founder-hardening.test.ts` | `npm run test:founder` | Passed | Local verified |
| Reliability controls | `tests/reliability-hardening.test.ts` | `npm run test:reliability` | Passed | Local verified |
| Tenant isolation | `tests/tenant-isolation.test.ts` | `npm run test:tenant-isolation` | Passed | Local verified |
| Certification assertions | `tests/production-certification.test.ts` | `npm run test:certification` | Passed | Local verified |
| Lead/limiter/plan hardening | `tests/production-hardening.test.ts` | `npm run test:production-hardening` | Passed | Local verified |
| Dependency health | `package-lock.json`, `package.json` override | `npm audit --audit-level=moderate` | Passed; 0 vulnerabilities | Local verified |
| Prisma model validity | `prisma/schema.prisma` | `npx prisma validate`, `npx prisma generate` | Passed | Local verified |

## Remediation Evidence

### Public lead capture

- Handler: `app/api/public/leads/route.ts`
- Validation/sanitization: `lib/public-leads.ts`
- UI: `components/marketing/MarketingLeadForm.tsx`
- Storage: `prisma/migrations/20260719120000_public_lead_submissions/migration.sql`
- Configuration: `config/env.ts`
- Test: `tests/production-hardening.test.ts`
- Verified: validation, consent, honeypot, idempotency model, sanitization, local throttling behavior.
- Pending: production migration proof, CRM/email webhook delivery and alert evidence, database/provider failure route integration tests.

### Distributed limits

- Implementation: `lib/rate-limit.ts`
- Applied routes: classifier, approval search, test ingestion, Gateway approvals/webhooks/imports/documents/transcripts, Playbook upload.
- Verified: Redis-backed algorithm, bounded timeout, local degradation, `Retry-After` on reviewed routes.
- Pending: preview multi-instance concurrency, burst telemetry and Redis outage proof.

### Entitlements

- Policy: `lib/entitlements.ts`
- Enforced examples: `app/api/copilot/query/route.ts`, `app/api/playbooks/upload/route.ts`
- Test: plan matrix in `tests/production-hardening.test.ts`.
- Pending: complete premium-route coverage, billing provider, webhook lifecycle, seats/limits/trial/past-due/suspended/downgrade certification.

### Document parsing

- PDF/DOCX extraction: `services/playbooks.ts`
- Intelligence route: `app/api/v1/documents/intelligence/route.ts`
- Dependencies: `pdf-parse`, `mammoth` in `package.json`.
- Verified: format-aware extraction and safe unsupported/empty-content responses.
- Pending: magic bytes, malware scanning, encrypted/zip-bomb corpus, queue isolation, OCR disclosure and cross-tenant hostile-file tests.

### Gateway security

- Authentication: `lib/gateway-auth.ts`
- Routes: `app/api/v1/*`
- Verified: fail-closed production behavior, constant-time compatibility-key comparison, upload bounds, CSV formula neutralization.
- Pending: tenant-specific hashed credentials, scopes, rotation, revocation, expiry, per-key limits and complete E2E credential suite.

### Debug route restriction

- Configuration: `middleware.ts` protects `/api/debug(.*)`.
- Pending: deployed anonymous/authenticated smoke evidence.

### CI release gate

- Workflow: `.github/workflows/ci.yml`
- Gates: install, Prisma validate/generate, lint, TypeScript, production hardening, founder, reliability, isolation, certification, build and high-severity audit.
- Pending: Playwright matrix, parser/Gateway credential suites, secret scanning and branch-protection screenshot proving required-check enforcement.

## Connector Evidence

The authoritative status and provider-specific test instructions are in `docs/integrations/CONNECTOR_CERTIFICATION_MATRIX.md`.

- Local automated evidence: Slack, Gmail and Teams suites pass.
- Implemented but awaiting live certification: Outlook/Exchange, Jira, ServiceNow and Zoom.
- Planned or marketing-only: GitHub, GitLab, Azure DevOps, Jenkins and Kubernetes.
- No connector is upgraded to production-certified by this local review.

## Recovery Evidence

- Backup runbook: `docs/operations/BACKUP_AND_RESTORE_RUNBOOK.md`
- Disaster recovery: `docs/operations/DISASTER_RECOVERY_PLAN.md`
- Business continuity: `docs/operations/BUSINESS_CONTINUITY_PLAN.md`
- Restore record: `docs/operations/RESTORE_TEST_EVIDENCE.md`
- Current result: documentation complete; restore drill **not executed**. RPO/RTO are targets, not certified outcomes.

## Browser, Accessibility And Performance Evidence

- Chromium manual smoke was completed at 1440x900 and 390x844 during the first pass.
- No committed Playwright three-browser matrix exists.
- No automated axe report or complete keyboard/screen-reader certification exists.
- No safe deployed load test or p50/p95/p99 dataset exists.
- These claims remain pending and are not inferred from a successful build.

## Runtime And Provider Evidence Still Required

1. Preview and production deployment smoke records.
2. Real PostgreSQL migration/read/write evidence for the lead table.
3. Multi-instance Redis limiter and queue processing evidence.
4. Synthetic Sentry event with source map, redaction and alert delivery.
5. Real lead notification/CRM success and failure handling.
6. Billing sandbox checkout, webhooks, lifecycle and entitlement denial.
7. Provider OAuth/refresh/sync/revoke evidence for every generally available connector.
8. Tenant Gateway key lifecycle and request evidence.
9. PDF/DOCX hostile-file corpus and scanner evidence.
10. Isolated database restore and application/tenant smoke evidence.
11. Three-browser E2E, accessibility and non-production load reports.
12. Incident detection-to-resolution exercise.

## Certification Decision

The available evidence supports **80/100** and controlled-pilot operation. It does not support unrestricted enterprise production or a 100/100 claim. The exact blockers are tracked in `docs/qa/PRODUCTION_READINESS_ISSUE_REGISTER.md`.
