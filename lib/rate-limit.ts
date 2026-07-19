import IORedis from 'ioredis';
import { env } from '@/config/env';

const buckets = new Map<string, { count: number; resetAt: number }>();

let sharedRedis: IORedis | null | undefined;

function redisClient() {
  if (sharedRedis !== undefined) return sharedRedis;
  if (!env.REDIS_URL) return (sharedRedis = null);

  try {
    const url = new URL(env.REDIS_URL);
    if (!['redis:', 'rediss:'].includes(url.protocol)) return (sharedRedis = null);
    sharedRedis = new IORedis(env.REDIS_URL, {
      lazyConnect: true,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500,
      commandTimeout: 1_500,
      retryStrategy: () => null,
    });
    sharedRedis.on('error', (error) => {
      if (process.env.NODE_ENV === 'development') console.warn(`[rate-limit] ${error.message}`);
    });
    return sharedRedis;
  } catch {
    return (sharedRedis = null);
  }
}

export function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}

export type DistributedRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  source: 'redis' | 'memory';
};

export async function distributedRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): Promise<DistributedRateLimitResult> {
  const redis = redisClient();
  if (redis) {
    try {
      if (redis.status === 'wait') await redis.connect();
      const redisKey = `approvline:rate-limit:${key}`;
      const result = (await redis.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('PTTL', KEYS[1]); return {count, ttl}",
        1,
        redisKey,
        windowMs,
      )) as [number, number];
      const count = Number(result[0]);
      const ttl = Math.max(Number(result[1]), 0);
      return {
        allowed: count <= limit,
        remaining: Math.max(limit - count, 0),
        retryAfterSeconds: Math.max(Math.ceil(ttl / 1000), 1),
        source: 'redis',
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[rate-limit] Redis unavailable, using bounded local fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  }

  const local = rateLimit(key, limit, windowMs);
  return {
    ...local,
    retryAfterSeconds: Math.max(Math.ceil(windowMs / 1000), 1),
    source: 'memory',
  };
}
