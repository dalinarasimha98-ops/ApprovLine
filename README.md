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
- `OPENAI_API_KEY`
- `REDIS_URL`
- `ENCRYPTION_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

## Production flows

Incoming webhook events are enqueued through BullMQ, classified by OpenAI, stored as tenant-scoped approval records, and written to audit logs.

Dashboard routes are protected by Clerk middleware.
