# Integration Marketplace E2E Certification

**Feature**: Integration Marketplace Redesign  
**Date**: 2026-08-30  
**Status**: CERTIFIED WITH KNOWN LIMITATIONS

---

## Summary

The Integrations feature has been redesigned from a static list of integration tiles to a full Integration Marketplace with search, category filtering, connected/available/beta/coming-soon sections, customer-requested integrations, a summary sidebar, and generic connector links. All existing OAuth flows are preserved.

---

## Functional Validation

### ✅ Page Layout
- Two-column layout: main content + sticky sidebar at `xl` breakpoint
- Collapses to single column on tablet/mobile
- Header with title, subtitle, "Add Generic Connector" link, "Request an Integration" modal button

### ✅ Data-Driven Provider List
- Fetches `MarketplaceProvider` (AVAILABLE, BETA, COMING_SOON) from DB
- Falls back to static provider list when DB table is empty (migration not applied)
- Generic connector slugs (webhook, api, csv, email_capture) excluded from main content; shown in sidebar

### ✅ Connection Status
- Fetches `Integration` rows for the current tenant
- Maps `Integration.provider` enum to MarketplaceProvider slug via `PROVIDER_TO_SLUG`
- Correctly marks providers `isConnected` when status is CONNECTED, SYNCING, ERROR, or NEEDS_REAUTH
- `lastSyncAt` read from `Integration.metadata.lastSyncAt` or `lastEventAt`

### ✅ Tenant Isolation
- All Prisma queries scoped to `tenant.organization.id`
- `integrationRequest` queries use `tenantScopedWhere()`
- No cross-tenant data leakage in server component

### ✅ RBAC
- Page requires ADMIN or OWNER role via `enforcePageRole('/dashboard/settings', role)`
- Graceful handling when `tenant.user` is null (status-only pages remain accessible)

### ✅ Search
- Client-side search across `displayName`, `category`, `description`
- Filters all sections simultaneously
- Clear button resets query
- Empty state with "Request an Integration" CTA when no results

### ✅ Category Tabs
- Derived from unique categories in provider data
- "All" tab resets filter
- "More" toggle expands overflow categories

### ✅ Connected Integrations
- Cards show: provider icon, name, status badge, category, description, health, last sync
- Sync buttons (form POST) for Gmail, Outlook, Teams, Jira, ServiceNow, Zoom
- Disconnect confirmation (ConfirmSubmitButton) for Slack
- Reconnect link for ERROR/NEEDS_REAUTH integrations

### ✅ Available Integrations
- Native AVAILABLE providers show "Connect" link (OAuth install href)
- Non-native AVAILABLE show "Request early access"
- Status badge: "Available" in blue

### ✅ Beta Integrations
- Separate section with "Beta" badge in violet
- "Request early access" button → RequestIntegrationModal

### ✅ Coming Soon
- Shows first 6, "Load more" expands remainder
- "Request" button → RequestIntegrationModal pre-filled with provider name
- Not shown when actively searching (search finds them via provider data)

### ✅ Requested Integrations
- Shows tenant's active requests (PENDING, UNDER_REVIEW, PLANNED, IN_DEVELOPMENT)
- Status badge + request date per entry

### ✅ Request an Integration Modal
- Form: tool name, website, category, priority, evidence type, reason, user count
- HTTP POST to `/api/integrations/requests`
- Deduplication: shows "Already requested" on 409 with aggregate count
- Success state with total demand count

### ✅ Sidebar — Your Connections
- Connected count: integrations with status CONNECTED or SYNCING
- Available count: native AVAILABLE providers not yet connected
- Beta count: providers with status BETA
- Requested count: tenant's active requests

### ✅ Sidebar — Integration Requests
- Shows up to 5 most recent requests with status badge + date
- Hidden when no requests

### ✅ Sidebar — Generic Connectors
- Links to Gateway page for: Webhook, REST API, Email Ingestion, CSV Import
- "Learn more about integrations" link to Gateway

---

## OAuth Flows (Preserved)

| Provider | Install | Callback | Sync | Disconnect |
|---|---|---|---|---|
| Slack | ✅ | ✅ | — | ✅ |
| Gmail | ✅ | ✅ | ✅ | — |
| Outlook | ✅ | ✅ | ✅ | — |
| Microsoft Teams | ✅ | ✅ | ✅ | — |
| Jira | ✅ | ✅ | ✅ | — |
| ServiceNow | ✅ | ✅ | ✅ | — |
| Zoom | ✅ | ✅ | ✅ | — |

OAuth error messages preserved verbatim from original page. All error reason codes handled.

---

## Disconnect Behavior

- Disconnecting Slack stops future ingestion
- Historical `CanonicalEvidenceEvent`, `UnifiedEvidenceRecord`, `ApprovalRecord` are **not** deleted
- Audit event written on disconnect via existing Slack disconnect route

---

## Generic Connector Flow

```
External Tool → Webhook/API/Email/CSV → /api/v1/* (Universal Gateway)
→ Raw Evidence → Normalize → AI Classify → Correlate → Unified Evidence
```

No separate ingestion pipeline created. All generic connectors route through `universalGateway.ts`.

---

## Security Review

| Check | Status |
|---|---|
| OAuth tokens not exposed to client | ✅ AES-256-GCM encrypted at rest |
| Webhook signature verification | ✅ HMAC-SHA256 in universalGateway.ts |
| SSRF prevention | ✅ No user-controlled URL fetches |
| Tenant isolation — integrations page | ✅ organizationId scoping on all queries |
| Tenant isolation — requests API | ✅ tenantScopedWhere() enforced |
| RBAC — customer page | ✅ ADMIN/OWNER required |
| RBAC — founder page | ✅ requireFounderWrite() on all actions |
| IDOR — integration IDs | ✅ Integration rows not returned to client; only integrationId for form fields scoped to org |
| XSS | ✅ All user content rendered via React (escaped by default) |

---

## Performance

- Single batched `Promise.all` for integrations + providers + requests (4s timeout)
- Client-side filtering avoids server round-trips on search/category change
- Provider count: ~30 records — no pagination needed at current scale
- `withTimeout` wraps all Prisma calls; graceful degradation to static list on timeout

---

## Known Limitations

1. **Generic connector active-connection counts not shown**: The sidebar does not show per-connector active connection counts (e.g. "2 active webhook connections") because generic connector instances are not tracked as individual DB rows. This would require a dedicated `GenericConnectorInstance` model. Connections go through the Universal Gateway; evidence volume can be seen in the Gateway dashboard.

2. **Category filter does not persist in URL**: Search query and category selection are client state only (not URL params). Direct links to a filtered view are not supported. This is acceptable for the current release; URL-based filtering would require `useSearchParams` and Suspense wrapping.

3. **MarketplaceProvider table requires migration**: The `MarketplaceProvider` table requires `npm run db:deploy` plus `npx tsx prisma/seeds/integration-providers.ts` in production. Until applied, the page falls back to a static provider list of 14 providers.

4. **Beta connectors (GitHub, GitLab) are not native**: `isNative: false` — the "Connect" button is not shown for them; they show "Request early access". Full native connector implementation is a separate engineering task.

5. **Disconnect for non-Slack providers not exposed**: Only Slack has a `/api/integrations/slack/disconnect` route. Other providers' disconnect requires admin action. This matches the original page behavior.

6. **No per-integration health check**: Health status is derived from `Integration.status` (set by the sync/webhook pipeline), not live-checked on page load. A stale status is possible if the pipeline is down.

---

## External Dependencies

- **Clerk**: Org/user auth — required for `getDashboardTenant()`
- **Prisma / PostgreSQL**: All data fetching — requires `db:deploy` for marketplace models
- **OAuth providers**: Slack, Google, Microsoft, Atlassian, Zoom, ServiceNow — external, not tested here
- **Universal Gateway**: `/api/v1/*` routes — tested separately in `UNIVERSAL_GATEWAY_E2E_CERTIFICATION.md`
