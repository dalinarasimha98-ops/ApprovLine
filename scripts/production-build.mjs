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

if (process.env.DATABASE_URL) {
  console.log('Running production Prisma migrations...');
  run(bin('prisma'), ['migrate', 'deploy']);
} else {
  console.log('DATABASE_URL is not set. Skipping Prisma migrate deploy.');
}

run(bin('prisma'), ['generate']);
run(bin('next'), ['build']);
