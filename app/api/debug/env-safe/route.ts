import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const raw = process.env.DATABASE_URL;
  const trimmed = raw?.trim() ?? '';

  return NextResponse.json({
    databaseUrlFirstChar: raw ? raw.slice(0, 1) : null,
    databaseUrlFirstTwoChars: raw ? raw.slice(0, 2) : null,
    databaseUrlStartsWithPostgres: trimmed.startsWith('postgresql://') || trimmed.startsWith('postgres://'),
    databaseUrlHasQuote: Boolean(raw && (raw.includes('"') || raw.includes("'"))),
    databaseUrlHasEquals: Boolean(raw && raw.includes('=')),
    databaseUrlLength: raw?.length ?? 0,
  });
}
