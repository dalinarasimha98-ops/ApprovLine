/**
 * Distinguishes "table/migration missing" Prisma failures from every other
 * kind of failure (e.g. a connection-pool timeout). Several pages show a
 * "run npm run db:deploy" message only when this returns true — showing it
 * unconditionally on any error is misleading when the real cause is
 * something else entirely (see app/memory/page.tsx history).
 */
export function isMigrationError(message: string | null | undefined) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes('does not exist') || lower.includes('relation') || lower.includes('table') || lower.includes('p2021') || lower.includes('migration');
}

export function isConnectionPoolError(message: string | null | undefined) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes('connection pool') || lower.includes('timed out fetching a new connection') || lower.includes('p2024');
}
