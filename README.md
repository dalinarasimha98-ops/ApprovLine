# ApprovLine

AI-powered Universal Approval Intelligence Platform.

## Stack

- Next.js 15 App Router
- TypeScript
- TailwindCSS
- Prisma + PostgreSQL
- Clerk auth with organization/team support
- OpenAI classifier
- Redis + BullMQ async processing

## Core commands

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

## Required environment

Copy `.env.example` to `.env.local` and set:

- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` - optional, defaults to `claude-sonnet-4-5`
- `OPENAI_API_KEY` - optional fallback if Anthropic is not configured
- `REDIS_URL`
- `NEXT_PUBLIC_SENTRY_DSN` (recommended; enables browser, server, and edge error capture)
- `SENTRY_DSN` (optional server-only override)
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (optional source-map uploads)
- `ENCRYPTION_KEY` - 64 lowercase hex characters / 32 random bytes, for AES-256-GCM token encryption
- `APP_URL` - production Vercel URL, used for OAuth redirects and health checks
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_SYNC_INTERVAL_MINUTES` - optional, allowed values: `5`, `15`, or `60`; defaults to 15 minutes
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID` - Directory tenant ID from Microsoft Entra ID Overview; recommended for single-tenant Teams OAuth
- `JIRA_CLIENT_ID`
- `JIRA_CLIENT_SECRET`

For Vercel deployments, add these under Project Settings -> Environment Variables.

For Sentry, create a Next.js project in Sentry and copy its DSN into `NEXT_PUBLIC_SENTRY_DSN` for Production and Preview. A Sentry DSN is a public routing identifier, not an account password. Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` only when source-map uploads are required; keep the auth token server-only and sensitive. Redeploy after changing Vercel environment variables.
GitHub Actions repository secrets are only available to GitHub Actions workflows and are not visible to the Vercel runtime.

## Vercel beta checklist

Required runtime variables for first Slack beta:

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5
OPENAI_API_KEY=sk-... # optional fallback
ENCRYPTION_KEY=64-character-lowercase-hex-string
APP_URL=https://your-vercel-domain.vercel.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/get-started
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/get-started
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GMAIL_SYNC_INTERVAL_MINUTES=15
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=...
JIRA_CLIENT_ID=...
JIRA_CLIENT_SECRET=...
```

Gmail OAuth must use this exact redirect URL in Google Cloud:

```text
https://your-vercel-domain.vercel.app/api/integrations/gmail/callback
```

Requested Gmail scopes are read-only only:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

Microsoft Teams OAuth must use this exact redirect URL in Microsoft Entra ID:

```text
https://your-vercel-domain.vercel.app/api/integrations/teams/callback
```

For single-tenant app registrations, add the Directory tenant ID from Microsoft Entra ID Overview to Vercel as `MICROSOFT_TENANT_ID`. This keeps Teams OAuth on the organizational login endpoint and avoids Microsoft consumer-account errors.

Requested Microsoft Graph scopes are read-only only:

```text
offline_access
User.Read
Team.ReadBasic.All
Channel.ReadBasic.All
ChannelMessage.Read.All
```

Jira OAuth must use this exact callback URL in the Atlassian Developer Console:

```text
https://your-vercel-domain.vercel.app/api/integrations/jira/callback
```

Requested Jira scopes are read-only only:

```text
read:jira-work
read:jira-user
offline_access
```

Zoom OAuth must use this exact callback URL in the Zoom Marketplace app:

```text
https://your-vercel-domain.vercel.app/api/integrations/zoom/callback
```

Requested Zoom scopes are read-only only:

```text
user:read
meeting:read
recording:read
report:read
```

Zoom connector variables:

```bash
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
```

## Universal Approval Gateway

The Universal Approval Gateway lets enterprise systems send approval evidence into ApprovLine without a custom connector.

Dashboard:

```text
/dashboard/gateway
```

Direct approval API:

```text
POST /api/v1/approvals
```

Example payload:

```json
{
  "approver": "Sarah Chen",
  "approver_email": "sarah.chen@company.com",
  "decision": "Approved. Release PO 4500098842.",
  "source_system": "sap",
  "department": "Procurement",
  "timestamp": "2026-07-03T10:00:00.000Z",
  "amount": 185000,
  "metadata": {
    "url": "https://sap.example/po/4500098842"
  }
}
```

Webhook endpoint for SAP, Oracle, Coupa, Workday, Salesforce, HubSpot, and custom systems:

```text
POST /api/v1/webhooks/approvals
```

Bulk and intelligence endpoints:

```text
POST /api/v1/imports/csv
POST /api/v1/documents/intelligence
POST /api/v1/transcripts/intelligence
```

Tenant email forwarding format:

```text
approvals+tenant@approvline.ai
```

All gateway traffic flows through the existing classifier, risk engine, audit log, investigation center, and executive analytics.

Check deployment readiness:

```bash
npm run readiness
```

Production builds require `DATABASE_URL` on Vercel. The build generates Prisma Client and builds Next.js. Run `npm run db:deploy` separately when deploying schema changes so production tables stay current.

If `/onboarding` shows a Prisma initialization error in Vercel logs, confirm `DATABASE_URL` is set for the same Vercel environment and redeploy.

Open `/health` in production to verify PostgreSQL, Redis, Anthropic, OpenAI fallback, Slack configuration, Gmail configuration, Teams configuration, encryption, and app URL status.

## Clerk email-only authentication

ApprovLine uses Clerk's official `SignIn` and `SignUp` components inside branded ApprovLine auth pages. The product flow is email-only: users should never be asked for a phone number.

In Clerk Dashboard -> User & Authentication -> Email, Phone, Username:

- Enable email address sign-up.
- Enable email address sign-in.
- Enable password, email code, or both.
- Disable phone number sign-up/sign-in.
- Do not mark phone number as a required user attribute.
- Keep email address as the primary identifier.

In Clerk Dashboard -> User & Authentication -> Social connections:

- Enable Google OAuth.
- Enable Microsoft OAuth for Microsoft 365 / Azure AD users.
- Use Clerk-managed OAuth callback URLs exactly as shown in the Clerk dashboard.
- Do not enable phone-code or SMS strategies.

Redirects:

- Sign-up completes at `/onboarding`.
- Sign-in completes at `/get-started`, which sends onboarded users to `/dashboard` and new users to `/onboarding`.
- Landing-page Get Started buttons route through `/get-started`, which opens `/sign-up` for logged-out users.

Provider account details and OAuth tokens are stored by Clerk. ApprovLine stores the tenant user record and organization mapping only; connector tokens such as Slack and Gmail use ApprovLine's AES-256-GCM `ENCRYPTION_KEY`.

## Production flows

Incoming webhook events are enqueued through BullMQ, classified by Anthropic or OpenAI fallback, stored as tenant-scoped approval records, and written to audit logs.

Dashboard routes are protected by Clerk middleware.
