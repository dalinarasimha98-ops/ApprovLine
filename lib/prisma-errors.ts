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

/**
 * Turns a raw Prisma/DB error message into a short, fixed, non-leaking
 * category label safe to render to a customer. Prisma connection errors
 * (P1001 "Can't reach database server at `host`:`port`", P1000 auth
 * failures naming the DB user, etc.) name internal infrastructure - they
 * must never be echoed to the browser verbatim, even truncated.
 */
export function safeDiagnosticSummary(message: string | null | undefined): string {
  if (!message) return 'unknown-error';
  if (isMigrationError(message)) return 'schema-migration-pending';
  if (isConnectionPoolError(message)) return 'connection-pool-timeout';
  const lower = message.toLowerCase();
  if (lower.includes("can't reach database") || lower.includes('p1001')) return 'database-unreachable';
  if (lower.includes('authentication failed') || lower.includes('p1000')) return 'database-authentication-failed';
  if (lower.includes('timed out') || lower.includes('timeout')) return 'request-timeout';
  return 'unexpected-error';
}
