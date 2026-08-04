import { PrismaClient } from '@prisma/client';
import { normalizeDatabaseUrlForPrisma } from '@/lib/env';

normalizeDatabaseUrlForPrisma();

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// Cache in production too. Next.js can evaluate shared server modules through
// multiple route bundles inside one warm function isolate.
globalForPrisma.prisma = prisma;

/**
 * Eagerly connects with retry. Intended for long-running processes (the
 * BullMQ worker) where paying a one-time startup cost to confirm the
 * database is reachable is worthwhile. Deliberately NOT called from request
 * handlers: in serverless functions, Prisma's default lazy-connect-on-first-
 * query already works correctly, and forcing an eager connect (with retries)
 * on every cold start would only add latency to every request without
 * improving reliability.
 */
export async function connectPrismaWithRetry(maxAttempts = 5, baseDelayMs = 500) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$connect();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[prisma] connect attempt ${attempt}/${maxAttempts} failed`, error instanceof Error ? error.message : error);
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
