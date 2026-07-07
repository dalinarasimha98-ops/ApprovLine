# ApprovLine Founder Control Center Lite

The Founder Control Center is an internal ApprovLine operations layer at `/founder`.

It is not customer-facing. Customer workspace roles do not grant access.

## Access roles

- `SUPER_ADMIN`: full founder access, including provisioning and customer status changes.
- `FOUNDER_ADMIN`: operational founder access, including provisioning, feature gates, integration access, and notes.
- `SUPPORT_ADMIN`: read-only access for support visibility.

## Create the first SUPER_ADMIN

Add this Vercel environment variable:

```bash
APPROVLINE_SUPER_ADMIN_EMAILS=founder@approvline.com
```

Multiple emails are comma-separated:

```bash
APPROVLINE_SUPER_ADMIN_EMAILS=founder@approvline.com,cto@approvline.com
```

Optional allowlists:

```bash
APPROVLINE_FOUNDER_ADMIN_EMAILS=ops@approvline.com
APPROVLINE_SUPPORT_ADMIN_EMAILS=support@approvline.com
```

After the founder tables are migrated, super admins can also insert rows into `PlatformAdmin`.

## Deploy database migration

Run once after deploying this code:

```bash
npm run db:deploy
```

This creates:

- `PlatformAdmin`
- `CustomerAccount`
- `CustomerWorkspace`
- `CustomerPlan`
- `CustomerSeatAllocation`
- `CustomerFeatureFlag`
- `CustomerIntegrationStatus`
- `FounderAuditLog`
- `CustomerNote`
- `CustomerHealth`

## Provision the first customer

1. Sign in with a founder allowlisted email.
2. Open `/founder`.
3. Go to `/founder/provision`.
4. Enter company name, domain, primary admin email, plan, seats, and data retention.
5. Select enabled ApprovLine features.
6. Select integration access gates.
7. Submit the form.

The customer record, workspace shell, seat allocation, feature flags, integration access states, customer health, and founder audit event are created.

## Invite customer admin

Open the customer profile at:

```bash
/founder/customers/{customerAccountId}
```

Copy the generated sign-up link and send it to the customer's primary admin.

## Enable integration access

Founder admins can enable access on:

```bash
/founder/integrations
```

This only gates product access. ApprovLine founders do not manage or store customer integration credentials.

Customer IT connects credentials from the customer workspace:

```bash
/dashboard/settings/integrations
```

## Feature flags

Founder admins can toggle customer feature gates on:

```bash
/founder/features
```

Every founder mutation is recorded in `FounderAuditLog`.

## Security notes

- `/founder` is protected by Clerk middleware.
- Customer workspace roles cannot access the founder portal.
- Support admins are read-only.
- Customer-owned OAuth tokens and secrets are never shown in founder pages.
- Founder actions are logged with actor email, role, target, and timestamp.
