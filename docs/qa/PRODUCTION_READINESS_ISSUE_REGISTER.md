# Production Readiness Issue Register

Updated: 2026-07-19. Status values distinguish code remediation from external certification.

| ID | Priority | Description | Affected files/modules | Root cause | Required remediation | Test required | Evidence required | Current status | Final status |
|---|---|---|---|---|---|---|---|---|---|
| PR-P1-01 | P1 | Public lead forms simulated success | `components/marketing/MarketingLeadForm.tsx`, `app/api/public/leads`, Prisma | Client-only timeout | Durable validated/idempotent storage and provider integration | `npm run test:production-hardening`; route integration failure cases | Applied production migration and real CRM/email success/failure event | Code verified | Pending provider evidence |
| PR-P1-02 | P1 | Backend entitlements incomplete | `lib/entitlements.ts`, premium APIs, subscription services | Plan copy was not an API policy | Apply central policy to every premium API/job/export and implement billing lifecycle | Direct API tests for each plan, account state, limits and bypass attempts | Billing sandbox and subscription webhook lifecycle | Partially remediated | Open P1 |
| PR-P1-03 | P1 | Public AI cost controls process-local | `lib/rate-limit.ts`, classifier/search/ingest/Gateway/upload routes | Serverless instances did not share counters | Redis limits by IP/user/tenant/key with endpoint fail policies | Multi-instance concurrency, burst and Redis-failure tests | Preview Redis telemetry and `Retry-After` responses | Code verified | Pending runtime evidence |
| PR-P1-04 | P1 | Gateway used one platform-wide key | `lib/gateway-auth.ts`, `/api/v1/*` | Legacy environment-key design | Tenant hashed keys, one-time display, scopes, rotation, expiry and revocation | Valid/invalid/revoked/expired/wrong-tenant/scope/rotation/replay E2E | Tenant credential lifecycle logs | Compatibility hardened | Open P1 |
| PR-P1-05 | P1 | PDF/DOCX extraction was placeholder quality | `services/playbooks.ts`, document intelligence/upload routes | Binary payloads were decoded as text | Add parser safety envelope, scanning, magic bytes, encrypted/zip-bomb handling, queue/DLQ and OCR disclosure | Valid/corrupt/encrypted/large/malicious/duplicate/cross-tenant corpus | Scanner and queue runtime evidence | Format-aware extraction added | Open P1 |
| PR-P1-06 | P1 | Connectors lack live certification | Integration routes/services and certification matrix | Provider credentials/tenants unavailable | Execute provider OAuth, refresh, sync, revoke, pagination, retry and tenant tests | Provider-specific sandbox/live acceptance run | Recorded consent, logs and screenshots in matrix | Implemented, uncertified | Open P1 |
| PR-P1-07 | P1 | Marketing connector/certification claims exceed evidence | Landing/resource copy and connector catalogue | Product copy outpaced certification | Reconcile every public claim to Certified/Implemented/Preview/Planned | Content inventory/link smoke test | Product, legal and security approval | Documented | Open P1 |
| PR-P1-08 | P1 | Backup/restore evidence absent | `docs/operations/*`, Supabase/storage/Redis operations | No repository recovery program | Execute isolated backup restore and record RPO/RTO/tenant checks | Restored app smoke, row counts and isolation suite | Completed `RESTORE_TEST_EVIDENCE.md` with timestamps/log references | Runbooks complete | Open P1 |
| PR-P2-01 | P2 | Safe debug endpoints were public | `middleware.ts`, `/api/debug/*` | Temporary launch diagnostics remained exposed | Require authentication for diagnostics | Anonymous redirect and authenticated route test | Middleware route inspection and deployed smoke | Remediated | Closed |
| PR-P2-02 | P2 | Mobile landing navigation incomplete | `components/landing/LandingPage.tsx`, `LandingPage.module.css` | Desktop-first nav | Add accessible mobile menu | Playwright at 375px and keyboard test | Browser screenshots/artifacts | Remediated in code | Pending browser evidence |
| PR-P2-03 | P2 | Firefox/WebKit unverified | Browser QA/CI | Chromium-only local QA | Add three-browser Playwright matrix | Chromium, Firefox and WebKit critical paths | CI HTML report and traces | Not remediated | Open P2 |
| PR-P2-04 | P2 | Reusable E2E suite absent | `tests`, CI | Feature tests are mostly service-level | Add credential-safe fixtures and critical journeys | Public/auth/onboarding/product/founder/export/tenant paths | CI run artifacts | Not remediated | Open P2 |
| PR-P2-05 | P2 | Accessibility certification incomplete | Public and application UI | Manual sampling only | Axe plus keyboard/screen-reader review | Automated axe and manual focus/modal/table journeys | Reports and screenshots | Not remediated | Open P2 |
| PR-P2-06 | P2 | Strict CSP absent | `next.config.ts`, provider domain inventory | Provider domains need staged inventory | Report-only CSP then enforce | Preview OAuth/auth/upload/export smoke | Violation log and approved allowlist | Not remediated | Open P2 |
| PR-P3-01 | P3 | Route metadata inconsistent | Public route metadata | Metadata was not centralized | Canonical/Open Graph inventory | Link-preview and canonical checks | Screenshot/link checker | Not remediated | Open P3 |
| PR-P3-02 | P3 | “Ready/certified” language inconsistent | Marketing/trust/integration copy | No capability vocabulary | Standardize Certified/Implemented/Preview/Planned | Copy inventory | Content/legal sign-off | Not remediated | Open P3 |

## Ownership

- Engineering owns code, CI, tests and migrations.
- Security owns abuse controls, CSP, upload scanning and penetration evidence.
- Product/legal own connector and compliance claim accuracy.
- Operations owns backups, restore drills, alerts and incident exercises.
- Revenue operations owns billing provider selection and sandbox certification.
