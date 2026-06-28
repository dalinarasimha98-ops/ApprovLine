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

For Vercel deployments, add these under Project Settings -> Environment Variables.
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

Optional future connector variables:

```bash
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
```

Check deployment readiness:

```bash
npm run readiness
```

Production builds run `prisma migrate deploy` automatically when `DATABASE_URL` is present, then generate Prisma Client and build Next.js. This keeps Vercel deployments compatible with onboarding/database schema changes.

Open `/health` in production to verify PostgreSQL, Redis, Anthropic, OpenAI fallback, Slack configuration, Gmail configuration, encryption, and app URL status.

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
