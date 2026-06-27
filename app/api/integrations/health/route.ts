import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { createRedisConnection } from '@/services/queue/connection';

type HealthStatus = 'connected' | 'not_connected' | 'error' | 'needs_reauthentication' | 'syncing';

async function checkPostgres() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'connected' as HealthStatus };
  } catch (error) {
    return { status: 'error' as HealthStatus, message: error instanceof Error ? error.message : 'PostgreSQL unavailable' };
  }
}

async function checkRedis() {
  if (!env.REDIS_URL) return { status: 'not_connected' as HealthStatus, message: 'REDIS_URL is not configured' };
  const connection = createRedisConnection() as { ping: () => Promise<string>; quit: () => Promise<void> };
  try {
    await connection.ping();
    await connection.quit();
    return { status: 'connected' as HealthStatus };
  } catch (error) {
    return { status: 'error' as HealthStatus, message: error instanceof Error ? error.message : 'Redis unavailable' };
  }
}

function connectorStatus(configured: boolean): { status: HealthStatus } {
  return { status: configured ? 'connected' : 'not_connected' };
}

export async function GET() {
  const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    services: {
      postgresql: postgres,
      redis,
      ai: connectorStatus(Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY)),
    },
    connectors: {
      slack: connectorStatus(Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET)),
      gmail: connectorStatus(Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)),
      teams: connectorStatus(Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET)),
      zoom: connectorStatus(Boolean(env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET)),
    },
    states: ['connected', 'not_connected', 'error', 'needs_reauthentication', 'syncing'],
  });
}
