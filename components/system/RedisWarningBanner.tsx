import { checkRedisConnection } from '@/services/queue/connection';
import { QueueWarningDismissible } from '@/components/system/QueueWarningDismissible';

export async function RedisWarningBanner() {
  const redis = await checkRedisConnection(800);
  if (redis.status === 'ok') return null;

  return <QueueWarningDismissible message={redis.message} />;
}
