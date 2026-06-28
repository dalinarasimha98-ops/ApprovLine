import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from '@/config/env';

export interface RedisConfigurationStatus {
  configured: boolean;
  status: 'ok' | 'missing' | 'error';
  message: string;
}

function redisLogContext(context: string) {
  return `[redis:${context}]`;
}

export function getRedisConfigurationStatus(): RedisConfigurationStatus {
  if (!env.REDIS_URL) {
    return {
      configured: false,
      status: 'missing',
      message: 'REDIS_URL missing; queue features are disabled until Redis is configured.',
    };
  }

  try {
    const url = new URL(env.REDIS_URL);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
      return {
        configured: false,
        status: 'error',
        message: 'REDIS_URL must use redis:// or rediss://. Upstash REST URLs (https://) cannot be used by BullMQ/ioredis.',
      };
    }
    if (url.hostname.includes('upstash.io') && url.protocol !== 'rediss:') {
      return {
        configured: true,
        status: 'error',
        message: 'Upstash Redis should use the TLS TCP URL that starts with rediss://.',
      };
    }
    return { configured: true, status: 'ok', message: 'Redis URL format is valid.' };
  } catch {
    return { configured: false, status: 'error', message: 'REDIS_URL is not a valid URL.' };
  }
}

export function createRedisConnection(context = 'default') {
  const status = getRedisConfigurationStatus();
  if (!status.configured || status.status !== 'ok') {
    console.warn(`${redisLogContext(context)} ${status.message}`);
    return null;
  }

  const connection = new IORedis(env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (error) => {
    console.error(`${redisLogContext(context)} Redis connection error: ${error.message}`);
  });

  connection.on('close', () => {
    console.warn(`${redisLogContext(context)} Redis connection closed.`);
  });

  return connection as unknown as ConnectionOptions;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

export async function checkRedisConnection(timeoutMs = 2_500): Promise<RedisConfigurationStatus> {
  const status = getRedisConfigurationStatus();
  if (!status.configured) return status;

  const connection = createRedisConnection('readiness') as unknown as
    | (IORedis & { disconnect: () => void })
    | null;
  if (!connection) return status;

  try {
    await withTimeout(connection.connect(), timeoutMs, 'Redis connect');
    await withTimeout(connection.ping(), timeoutMs, 'Redis ping');
    return { configured: true, status: 'ok', message: 'Redis reachable.' };
  } catch (error) {
    return {
      configured: true,
      status: 'error',
      message: error instanceof Error ? error.message : 'Redis unavailable.',
    };
  } finally {
    connection.disconnect();
  }
}
