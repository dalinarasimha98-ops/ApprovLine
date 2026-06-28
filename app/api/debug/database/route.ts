import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateDatabaseUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

function safeMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unknown database error';
}

function errorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export async function GET() {
  const databaseUrl = validateDatabaseUrl();
  if (!databaseUrl.valid) {
    return NextResponse.json({
      envValid: false,
      canConnect: false,
      migrationTablesExist: false,
      errorCode: databaseUrl.errorCode,
      safeErrorMessage: databaseUrl.safeErrorMessage,
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    return NextResponse.json({
      envValid: true,
      canConnect: false,
      migrationTablesExist: false,
      errorCode: errorCode(error),
      safeErrorMessage: safeMessage(error),
    });
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '_prisma_migrations'
      ) AS "exists"
    `;
    return NextResponse.json({
      envValid: true,
      canConnect: true,
      migrationTablesExist: Boolean(rows[0]?.exists),
      errorCode: null,
      safeErrorMessage: rows[0]?.exists ? null : 'Database connected, but Prisma migration table is missing. Run npm run db:deploy.',
    });
  } catch (error) {
    return NextResponse.json({
      envValid: true,
      canConnect: true,
      migrationTablesExist: false,
      errorCode: errorCode(error),
      safeErrorMessage: safeMessage(error),
    });
  }
}
