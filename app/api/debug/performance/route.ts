import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { slowestMeasurements, withTimeout } from '@/lib/performance';
import { env } from '@/config/env';
import { checkRedisConnection } from '@/services/queue/connection';
import { getApprovalQueue } from '@/services/queue/approvalQueue';

export const dynamic = 'force-dynamic';

async function timed<T>(name: string, fn: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return {
      status: 'ok' as const,
      responseTimeMs: Date.now() - startedAt,
      result,
    };
  } catch (error) {
    return {
      status: 'error' as const,
      responseTimeMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : `${name} unavailable`,
    };
  }
}

async function openAiStatus() {
  if (!env.OPENAI_API_KEY) return { status: 'missing', responseTimeMs: null, message: 'OPENAI_API_KEY missing; Anthropic fallback may be used.' };
  return timed('OpenAI', async () => {
    const response = await withTimeout(
      'OpenAI models check',
      fetch('https://api.openai.com/v1/models', {
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      }),
      2500,
    );
    return { httpStatus: response.status };
  });
}

async function queueStatus() {
  const queue = getApprovalQueue();
  if (!queue) return { status: 'missing', message: 'Approval queue is disabled.' };
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  return { status: 'ok', counts };
}

export async function GET() {
  const [database, redis, openai, queue] = await Promise.all([
    timed('Database', async () => {
      await prisma.$queryRaw`SELECT 1`;
      return 'PostgreSQL reachable';
    }),
    timed('Redis', async () => checkRedisConnection(1500)),
    openAiStatus(),
    timed('Queue', queueStatus),
  ]);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    slowestApiRoutes: slowestMeasurements(),
    services: {
      database,
      redis,
      openai,
      anthropic: env.ANTHROPIC_API_KEY ? { status: 'ok', message: 'Anthropic API key configured' } : { status: 'missing', message: 'ANTHROPIC_API_KEY missing' },
      slack: {
        status: env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_SIGNING_SECRET ? 'ok' : 'missing',
        message: 'Slack config status',
      },
      gmail: {
        status: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? 'ok' : 'missing',
        message: 'Gmail OAuth config status',
      },
      queue,
    },
  });
}
