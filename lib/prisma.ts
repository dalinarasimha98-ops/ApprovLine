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
