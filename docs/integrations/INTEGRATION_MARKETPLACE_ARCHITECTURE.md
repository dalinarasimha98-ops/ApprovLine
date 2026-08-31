# Integration Marketplace Architecture

ApprovLine's integration layer is designed to connect to any tool—known or unknown—through a tiered model of native connectors, beta connectors, community-requested connectors, and generic connectors. All paths ultimately feed the Universal Approval Gateway.

---

## Architecture Overview

```
Customer Tools
├── Native Connectors (Slack, Gmail, Outlook, Teams, Jira, ServiceNow, Zoom)
├── Beta Connectors (GitHub, GitLab)
├── Requested Connectors (Coupa, SAP, Workday, Salesforce, …)
└── Generic Connectors (Webhook, REST API, Email Forwarding, CSV Import)
                    ↓
        Universal Approval Gateway
         /api/v1/* or /api/ingest
                    ↓
          Raw Evidence (CanonicalEvidenceEvent)
                    ↓
        Normalization + AI Classification
          (Anthropic primary, OpenAI fallback)
                    ↓
        Correlation → UnifiedEvidenceRecord
                    ↓
         Approval / Risk / Compliance / Investigation / Analytics
```

---

## Registry: MarketplaceProvider

The single source of truth for every integration is `MarketplaceProvider` in `prisma/schema.prisma`. Fields:

| Field | Purpose |
|---|---|
| `slug` | Unique identifier (`slack`, `github`, `coupa`, …) |
| `displayName` | Human-readable name |
| `category` | Category for filtering (Communication, ERP, HR, …) |
| `description` | One-line description |
| `status` | Lifecycle status (see below) |
| `isNative` | `true` = working OAuth/webhook connector exists |
| `capabilities` | JSON: `{ oauth, webhook, api, evidenceTypes[] }` |
| `requestCount` | Aggregate demand from tenant requests |
| `sortOrder` | Display ordering |

Seed: `prisma/seeds/integration-providers.ts`. Run `npx tsx prisma/seeds/integration-providers.ts` to populate.

---

## Provider Lifecycle

```
COMING_SOON   → customer can request, no connector yet
BETA          → early access, connector exists but not production-grade
AVAILABLE     → production-ready, fully supported
DRAFT         → founder-internal only, not visible to customers
DEPRECATED    → still works but no longer recommended
```

**Critical rule**: Only mark a provider `AVAILABLE` or `BETA` when the technical connector (`services/integrations/<provider>.ts` or equivalent) actually exists. `isNative: true` must reflect reality—it gates the "Connect" button in the customer UI.

---

## Native Connectors

Fully implemented OAuth connectors in `services/integrations/`:

| Provider | Slug | OAuth install route | Sync route |
|---|---|---|---|
| Slack | `slack` | `/api/integrations/slack/install` | — (webhook) |
| Gmail | `gmail` | `/api/integrations/gmail/install` | `/api/integrations/gmail/sync` |
| Outlook | `outlook` | `/api/integrations/outlook/install` | `/api/integrations/outlook/sync` |
| Microsoft Teams | `microsoft_teams` | `/api/integrations/teams/install` | `/api/integrations/teams/sync` |
| Zoom | `zoom` | `/api/integrations/zoom/install` | `/api/integrations/zoom/sync` |
| Jira | `jira` | `/api/integrations/jira/install` | `/api/integrations/jira/sync` |
| ServiceNow | `servicenow` | `/api/integrations/servicenow/install` | `/api/integrations/servicenow/sync` |

Connection state is tracked in the `Integration` table (`organizationId`, `provider` enum, `status`, `metadata`).

---

## Beta Connectors

GitHub and GitLab are seeded as `BETA`. They use webhook-based ingestion via the Universal Gateway. Customers can request early access via the integration request modal.

---

## Generic Connectors

For tools without a native connector, ApprovLine supports four generic ingestion paths:

| Connector | Endpoint | Auth |
|---|---|---|
| Universal Webhook | `POST /api/v1/webhooks/approvals` | HMAC-SHA256 (`X-ApprovLine-Signature`) |
| REST API | `POST /api/v1/approvals` | API key (`X-ApprovLine-Key`) |
| Email Forwarding | `approvals+{slug}@approvline.ai` | Tenant slug routing |
| CSV Import | `POST /api/v1/imports/csv` | API key |

All paths route through the Universal Approval Gateway (`services/gateway/universalGateway.ts`). No separate evidence pipeline exists.

See `components/integrations/GenericConnectorInfo.tsx` for the customer-facing documentation component.

---

## Customer-Requested Integrations

When a customer searches for a tool not in the registry, they submit an `IntegrationRequest`:

```
POST /api/integrations/requests
{
  providerName, providerWebsite, category, reason,
  evidenceType, userCount, priority
}
```

**Deduplication**: one active request per (org, providerName). A second request from the same org returns HTTP 409 with `error: "already_requested"`. The response includes `totalRequests` — the aggregate count across all orgs — so the founder can see demand.

If a `providerSlug` is supplied (i.e. the provider exists in the registry as `COMING_SOON`), the request also increments `MarketplaceProvider.requestCount`.

Request statuses: `PENDING → UNDER_REVIEW → PLANNED → IN_DEVELOPMENT → AVAILABLE | REJECTED`.

---

## Tenant Access Control

`TenantProviderAccess` links a provider to a specific org. Currently informational (visible in founder UI). Future: make AVAILABLE providers require an explicit access row for gating.

Founder can grant/revoke per-tenant access via `app/founder/integrations/actions.ts`:
- `enableProviderForTenant(organizationId, providerSlug)`
- `disableProviderForTenant(organizationId, providerSlug)`

---

## Customer UI

Page: `app/dashboard/settings/integrations/page.tsx`

Layout:
- **Main column**: search bar → category tabs → Connected → Available → Beta → Coming Soon → Requested
- **Right sidebar**: Your Connections stats → Integration Requests → Generic Connectors → CTA

Client component: `components/integrations/IntegrationsClientShell.tsx`
- Receives all provider/request data as serializable props
- Handles search + category filtering in client state
- Manages RequestIntegrationModal

Data flow (server):
1. Fetch `Integration` rows for the tenant (connection status)
2. Fetch `MarketplaceProvider` (AVAILABLE, BETA, COMING_SOON) from DB; fall back to static list if table is empty
3. Fetch `IntegrationRequest` for the tenant (request history)
4. Merge: each provider gets `isConnected`, `integrationId`, `integrationStatus`, `lastSyncAt` from Integration rows
5. Pass merged list + requests to client shell

---

## Founder Control Center

Page: `app/founder/integrations/page.tsx`

Features:
- KPI strip: total providers / available / beta / coming-soon / pending requests
- Provider registry table with inline status changer (`updateProviderStatus`)
- Integration request queue with status management (`updateRequestStatus`)
- Per-tenant access grants/revocations

Server actions: `app/founder/integrations/actions.ts` — all guarded by `requireFounderWrite()`.

Demand intelligence: `MarketplaceProvider.requestCount` shows aggregate demand; `IntegrationRequest` table shows which tenants need what.

---

## Security

- **OAuth tokens**: AES-256-GCM encrypted at rest via `utils/encryption.ts`. Never returned to clients.
- **Webhook secrets**: HMAC-SHA256 signature verification in `universalGateway.ts`. Replay prevention via idempotency keys.
- **Tenant isolation**: every `Integration` and `IntegrationRequest` row is scoped by `organizationId`. `tenantScopedWhere()` is used on all queries.
- **RBAC**: integrations page requires `ADMIN` or `OWNER` role (`/dashboard/settings` gate). Founder pages require `SUPER_ADMIN`, `FOUNDER_ADMIN`, or `SUPPORT_ADMIN`.
- **SSRF**: OAuth redirect URLs validated against registered origins. No user-controlled URL fetches.

---

## Disconnect Behavior

Disconnecting an integration:
1. Stops future event ingestion (integration row removed or status changed)
2. **Preserves** all historical `CanonicalEvidenceEvent`, `UnifiedEvidenceRecord`, `ApprovalRecord`
3. Writes an `AuditLog` event (`INTEGRATION_DISCONNECTED`)

Historical evidence is always retained for compliance and audit purposes.

---

## Data Retention

- Evidence collected before disconnect is never deleted on disconnect
- Tenant deletion cascades from `Organization` → `Integration` → `IntegrationRequest` → `TenantProviderAccess` via Prisma `onDelete: Cascade`
- `CanonicalEvidenceEvent` is linked to `organizationId`, cascades on org deletion

---

## Adding a New Native Connector

1. Create `services/integrations/<provider>.ts` with OAuth flow
2. Add routes: `app/api/integrations/<provider>/{install,callback,sync}/route.ts`
3. Update `prisma/schema.prisma` `IntegrationProvider` enum
4. Add migration: `npm run db:migrate`
5. Seed the provider in `prisma/seeds/integration-providers.ts` with `status: 'AVAILABLE', isNative: true`
6. Add slug mappings to `PROVIDER_TO_SLUG`, `SLUG_TO_CONNECT_HREF`, `SLUG_TO_SYNC_HREF` in `app/dashboard/settings/integrations/page.tsx`
7. Update `CONNECTOR_CERTIFICATION_MATRIX.md`
