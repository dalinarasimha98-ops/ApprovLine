import { checkRedisConnection } from '@/services/queue/connection';

export async function RedisWarningBanner() {
  const redis = await checkRedisConnection(800);
  if (redis.status === 'ok') return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>Queue warning:</strong> Approval ingestion is running in degraded mode because Redis is unavailable. Core onboarding,
      authentication, and dashboard pages will continue to work. {redis.message}
    </div>
  );
}
