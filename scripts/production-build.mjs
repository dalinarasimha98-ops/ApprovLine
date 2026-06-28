import { spawnSync } from 'node:child_process';

function bin(command) {
  return process.platform === 'win32' ? `node_modules/.bin/${command}.cmd` : `node_modules/.bin/${command}`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.REDIS_URL) {
  try {
    const redisUrl = new URL(process.env.REDIS_URL);
    if (redisUrl.protocol !== 'redis:' && redisUrl.protocol !== 'rediss:') {
      console.warn('REDIS_URL should use redis:// or rediss://. Queue features will be disabled at runtime if ioredis cannot connect.');
    } else if (redisUrl.hostname.includes('upstash.io') && redisUrl.protocol !== 'rediss:') {
      console.warn('Upstash Redis should use its TLS TCP URL, which starts with rediss://.');
    }
  } catch {
    console.warn('REDIS_URL is not a valid URL. Queue features will be disabled at runtime until it is fixed.');
  }
}

console.log('Skipping database migrations during build. Run npm run db:deploy separately when deploying schema changes.');
run(bin('prisma'), ['generate']);
run(bin('next'), ['build']);
