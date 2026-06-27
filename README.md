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
```

Optional future connector variables:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
```

Check deployment readiness:

```bash
npm run readiness
```

Open `/health` in production to verify PostgreSQL, Redis, Anthropic, OpenAI fallback, Slack configuration, encryption, and app URL status.

## Production flows

Incoming webhook events are enqueued through BullMQ, classified by Anthropic or OpenAI fallback, stored as tenant-scoped approval records, and written to audit logs.

Dashboard routes are protected by Clerk middleware.
