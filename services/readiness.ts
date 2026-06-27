import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { createRedisConnection } from '@/services/queue/connection';

export type ReadinessStatus = 'ok' | 'missing' | 'error';

export interface ReadinessCheck {
  status: ReadinessStatus;
  message: string;
}

function envCheck(name: keyof typeof env, description: string): ReadinessCheck {
  return env[name]
    ? { status: 'ok', message: `${description} configured` }
    : { status: 'missing', message: `${description} missing` };
}

export async function buildReadinessReport() {
  const postgresql = await checkPostgres();
  const redis = await checkRedis();
  const checks = {
    postgresql,
    redis,
    openai: envCheck('OPENAI_API_KEY', 'OpenAI API key'),
    anthropic: envCheck('ANTHROPIC_API_KEY', 'Anthropic API key'),
    slackClientId: envCheck('SLACK_CLIENT_ID', 'Slack client ID'),
    slackClientSecret: envCheck('SLACK_CLIENT_SECRET', 'Slack client secret'),
    slackSigningSecret: envCheck('SLACK_SIGNING_SECRET', 'Slack signing secret'),
    appUrl: envCheck('APP_URL', 'App URL'),
    encryptionKey: envCheck('ENCRYPTION_KEY', 'Encryption key'),
    clerkPublishableKey: envCheck('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'Clerk publishable key'),
    clerkSecretKey: envCheck('CLERK_SECRET_KEY', 'Clerk secret key'),
  };
  const required = [
    checks.postgresql,
    checks.redis,
    checks.anthropic.status === 'ok' ? checks.anthropic : checks.openai,
    checks.slackClientId,
    checks.slackClientSecret,
    checks.slackSigningSecret,
    checks.appUrl,
    checks.encryptionKey,
    checks.clerkPublishableKey,
    checks.clerkSecretKey,
  ];
  const ready = required.every((check) => check.status === 'ok');
  return {
    ready,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function checkPostgres(): Promise<ReadinessCheck> {
  if (!env.DATABASE_URL) return { status: 'missing', message: 'DATABASE_URL missing' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', message: 'PostgreSQL reachable' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'PostgreSQL unavailable' };
  }
}

async function checkRedis(): Promise<ReadinessCheck> {
  if (!env.REDIS_URL) return { status: 'missing', message: 'REDIS_URL missing; inline demo ingestion still works' };
  const connection = createRedisConnection() as { ping: () => Promise<string>; quit: () => Promise<void> };
  try {
    await connection.ping();
    await connection.quit();
    return { status: 'ok', message: 'Redis reachable' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Redis unavailable' };
  }
}
