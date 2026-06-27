import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from '@/config/env';

export function createRedisConnection() {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;
}
