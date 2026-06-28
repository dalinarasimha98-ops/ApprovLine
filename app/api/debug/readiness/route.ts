import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { buildReadinessReport } from '@/services/readiness';

export const dynamic = 'force-dynamic';

function configured(value: string | undefined) {
  return Boolean(value);
}

export async function GET() {
  const report = await buildReadinessReport();

  return NextResponse.json({
    ready: report.ready,
    checkedAt: report.checkedAt,
    checks: report.checks,
    environment: {
      DATABASE_URL: configured(env.DATABASE_URL),
      REDIS_URL: configured(env.REDIS_URL),
      CLERK_SECRET_KEY: configured(env.CLERK_SECRET_KEY),
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: configured(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      OPENAI_API_KEY: configured(env.OPENAI_API_KEY),
      ANTHROPIC_API_KEY: configured(env.ANTHROPIC_API_KEY),
      ENCRYPTION_KEY: configured(env.ENCRYPTION_KEY),
      APP_URL: configured(env.APP_URL),
      SLACK_CLIENT_ID: configured(env.SLACK_CLIENT_ID),
      SLACK_CLIENT_SECRET: configured(env.SLACK_CLIENT_SECRET),
      SLACK_SIGNING_SECRET: configured(env.SLACK_SIGNING_SECRET),
      GOOGLE_CLIENT_ID: configured(env.GOOGLE_CLIENT_ID),
      GOOGLE_CLIENT_SECRET: configured(env.GOOGLE_CLIENT_SECRET),
    },
  });
}
