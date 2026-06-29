import { getRedisConfigurationStatus } from '@/services/queue/connection';
import { QueueWarningDismissible } from '@/components/system/QueueWarningDismissible';

export function RedisWarningBanner() {
  const redis = getRedisConfigurationStatus();
  if (redis.status === 'ok') return null;

  return <QueueWarningDismissible />;
}
