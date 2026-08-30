# Integration Marketplace Architecture

**Branch:** `claude/information-dashboard-navigation-u6r3rb`
**Date:** 2026-08-30
**Status:** Implemented (migration pending production deploy)

---

## Overview

The Integration Marketplace is a scalable framework that decouples the ApprovLine **provider registry** from the **native connector implementations**. It gives customers a browsable catalog of integrations, lets them request new ones, and gives founders a control plane to manage provider lifecycle and tenant access.

The marketplace does **not** replace existing OAuth connectors (Slack, Gmail, Teams, Outlook, Jira, ServiceNow, Zoom). Those remain fully operational. The marketplace adds a meta-layer on top.

---

## Schema Design

Three new Prisma models were added in migration `20260830000000_integration_marketplace`:

### `MarketplaceProvider`

The global registry of known integration providers. One row per provider, independent of tenant.

| Field | Type | Notes |
|---|---|---|
| `slug` | String (unique) | Machine identifier (e.g. `slack`, `sap`) |
| `displayName` | String | Human-readable name |
| `category` | String | Communication, Email, ERP, CRM, etc. |
| `description` | String | Short description for marketplace card |
| `status` | `MarketplaceProviderStatus` | See lifecycle section |
| `isNative` | Boolean | `true` = working OAuth/webhook connector exists |
| `capabilities` | Json | `{oauth, webhook, api, evidenceTypes}` |
| `requestCount` | Int | Aggregate demand signal across all tenants |
| `sortOrder` | Int | Display order in the marketplace UI |

### `TenantProviderAccess`

Grants explicit access to a specific provider for a specific tenant. Used for founder-controlled gating of BETA or restricted providers.

| Field | Type | Notes |
|---|---|---|
| `organizationId` | String (FK) | The tenant org |
| `providerSlug` | String (FK) | References `MarketplaceProvider.slug` |
| `enabledBy` | String? | Founder email for audit trail |
| `enabledAt` | DateTime | When access was granted |

Unique constraint: `(organizationId, providerSlug)` — one row per org per provider.

### `IntegrationRequest`

Customer-submitted requests for new integrations.

| Field | Type | Notes |
|---|---|---|
| `organizationId` | String (FK) | Requesting tenant |
| `requestedByUserId` | String? | FK to User |
| `providerSlug` | String? (FK, nullable) | Links to known provider if slug matched |
| `providerName` | String | Free-text name (customer-supplied) |
| `providerWebsite` | String? | URL of the tool |
| `category` | String? | Estimated category |
| `reason` | String | Why they need it |
| `evidenceType` | String? | What approval evidence they want captured |
| `userCount` | Int? | Scale signal |
| `priority` | `IntegrationRequestPriority` | LOW / MEDIUM / HIGH |
| `status` | `IntegrationRequestStatus` | See lifecycle section |
| `founderNotes` | String? | Internal notes from founder review |

---

## Provider Lifecycle

```
DRAFT → BETA → AVAILABLE
  └──────────────────────→ DEPRECATED
COMING_SOON → IN_DEVELOPMENT → BETA → AVAILABLE
```

- **DRAFT**: Not visible to customers. Internal prep work.
- **COMING_SOON**: Visible in marketplace "Coming Soon" section. Customers can request access.
- **BETA**: Live but limited. Shown with BETA badge. TenantProviderAccess may gate access.
- **AVAILABLE**: Fully live. No access gate required.
- **DEPRECATED**: Hidden from new connections. Existing connections unaffected.

Founders change provider status via the `/founder/integrations` control panel.

---

## Native vs. Generic Connectors

### Native (`isNative: true`)

Has a working implementation: OAuth flow, webhook handling, data normalization. Currently:

- Slack (`/api/integrations/slack/*`)
- Gmail (`/api/integrations/gmail/*`)
- Outlook (`/api/integrations/outlook/*`)
- Microsoft Teams (`/api/integrations/teams/*`)
- Zoom (`/api/integrations/zoom/*`)
- Jira (`/api/integrations/jira/*`)
- ServiceNow (`/api/integrations/servicenow/*`)
- Generic Webhook (`/api/v1/webhooks/approvals`)
- REST API (`/api/v1/approvals`)
- CSV Import (`/api/v1/imports/csv`)
- Email Forwarding (email capture gateway)

### Generic (`isNative: false`)

Marketplace entry only. Customers can:
1. Request it via the integration request flow
2. Use the Universal Gateway as a stopgap

Adding a native connector for a non-native provider requires:
- OAuth app registration with the provider
- Token exchange and storage in `Integration.encryptedTokens` (AES-256-GCM)
- Webhook verification logic
- A normalizer mapping provider events to `CanonicalEvidenceEvent`
- Install/callback/webhook/sync API routes under `app/api/integrations/<provider>/`
- The integration listed in the `IntegrationProvider` Prisma enum

---

## Tenant Access Model

The marketplace uses **two layers** of access control:

### Layer 1: Provider status visibility

- `AVAILABLE` and `BETA`: visible to all tenants in the marketplace
- `COMING_SOON`: visible, requestable, not connectable
- `DRAFT` and `DEPRECATED`: hidden from customer marketplace

### Layer 2: TenantProviderAccess (optional gate)

For BETA providers requiring controlled rollout, founders create a `TenantProviderAccess` row via `/founder/integrations`. The providers API annotates each provider with `tenantAccessEnabled: boolean` so the UI can show gated vs. open.

Currently, `AVAILABLE` providers do not require a `TenantProviderAccess` row — they are visible and connectable by all tenants.

---

## Integration Request Flow

1. Customer clicks "Request access" on a COMING_SOON card, or "Request an Integration" for a custom tool.
2. `RequestIntegrationModal` (client component) opens a native HTML `<dialog>`.
3. On submit, `POST /api/integrations/requests` validates the payload (Zod), checks for existing requests from this org (deduplication), creates an `IntegrationRequest` row, and increments `MarketplaceProvider.requestCount` if a slug matched.
4. Response: `201` with `requestId` and `totalRequests` (aggregate count), or `409` if already requested.
5. The modal shows a success/already-requested state.
6. Founders review the queue at `/founder/integrations` and update `IntegrationRequest.status`.
7. Customers are not notified automatically (email notification is a future enhancement).

---

## Founder Control Flow

`/founder/integrations` provides:

- **Provider Registry table**: all providers with live status, isNative flag, and aggregate request count.
- **Status changer**: form per provider to change `MarketplaceProviderStatus`.
- **Request queue**: all `IntegrationRequest` rows across all tenants, with priority and status controls.
- **Legacy access gates**: the pre-existing `CustomerIntegrationStatus` gating for Slack/Gmail/Teams/etc. via `founderIntegrationCatalog`.

Server actions in `app/founder/integrations/actions.ts`:

- `updateProviderStatus(slug, status)` — change provider lifecycle status
- `updateRequestStatus(requestId, status, notes?)` — move request through review queue
- `enableProviderForTenant(slug, orgId, email)` — grant TenantProviderAccess
- `disableProviderForTenant(slug, orgId)` — revoke TenantProviderAccess
- `updateProviderStatusFromForm(formData)` — FormData adapter for server actions
- `updateRequestStatusFromForm(formData)` — FormData adapter for server actions

---

## Universal Gateway Connection

The "Have a system with a webhook or API?" CTA in the marketplace links to `/dashboard/gateway` (the Universal Approval Gateway page). The gateway accepts:

- `POST /api/v1/webhooks/approvals` — signed HMAC-SHA256 webhook
- `POST /api/v1/approvals` — REST API with API key auth
- `POST /api/v1/imports/csv` — CSV bulk import
- `POST /api/v1/documents/intelligence` — document/transcript analysis

Email forwarding: `approvals+{org-slug}@approvline.ai`

The `GenericConnectorInfo` component at `components/integrations/GenericConnectorInfo.tsx` surfaces these instructions in the integrations settings page.

---

## Security Model

- **Customer-facing routes**: `getDashboardTenant()` + `enforcePageRole()`. All Prisma queries use `tenantScopedWhere()` for isolation.
- **Founder routes**: `getFounderAccess()` with read-only check on every mutating action. Founder layout independently gates with `redirect('/dashboard')` on unauthorized access.
- **IntegrationRequest.organizationId**: always set from authenticated tenant, never from request body.
- **MarketplaceProvider**: global table, no `organizationId`. Readable by all authenticated tenants; writeable only by founders.
- **TenantProviderAccess**: scoped by `organizationId`; write operations require founder auth.
- **Request submission deduplication**: prevents multiple PENDING requests per (org, providerName).

---

## Known Limitations

1. **New native connectors not included**: Adding a working connector for SAP, Oracle, Salesforce, etc. requires custom OAuth/webhook implementation per provider — this is a separate engineering task per provider.
2. **No customer notification on request status change**: Founders can update request status, but customers are not emailed. Future enhancement.
3. **TenantProviderAccess not enforced at OAuth time**: The existing OAuth flows (Slack, Gmail, etc.) do not yet check `TenantProviderAccess`. This is informational gating only; enforcement at the OAuth flow level is a follow-up.
4. **Search/filter is client-side via `MarketplaceSection`**: The server-rendered integrations page does not filter by URL params. Adding URL-param-based server-side filtering is a future enhancement.
5. **No provider logo upload**: `logoUrl` field exists in schema but no upload flow is implemented. The UI uses colored-initial avatars instead.
6. **Production migration**: The `20260830000000_integration_marketplace` migration SQL file exists but must be applied via `npm run db:deploy` before marketplace data loads.
