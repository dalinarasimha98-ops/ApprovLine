export interface DatabaseUrlDiagnostics {
  databaseUrlPresent: boolean;
  databaseUrlStartsWithPostgres: boolean;
  databaseUrlFirstChars: string | null;
  databaseUrlHost: string | null;
  databaseUrlLength: number;
  hasLeadingOrTrailingWhitespace: boolean;
  containsDatabaseUrlPrefix: boolean;
  isWrappedInQuotes: boolean;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
}

export interface DatabaseUrlValidation {
  valid: boolean;
  normalized?: string;
  errorCode?: string;
  safeErrorMessage?: string;
  diagnostics: DatabaseUrlDiagnostics;
}

function rawDatabaseUrl() {
  return process.env.DATABASE_URL;
}

function parseHost(value: string) {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export function getDatabaseUrlDiagnostics(): DatabaseUrlDiagnostics {
  const raw = rawDatabaseUrl();
  const trimmed = raw?.trim() ?? '';
  return {
    databaseUrlPresent: Boolean(raw),
    databaseUrlStartsWithPostgres: trimmed.startsWith('postgresql://') || trimmed.startsWith('postgres://'),
    databaseUrlFirstChars: raw ? raw.slice(0, 12) : null,
    databaseUrlHost: trimmed.startsWith('postgresql://') || trimmed.startsWith('postgres://') ? parseHost(trimmed) : null,
    databaseUrlLength: raw?.length ?? 0,
    hasLeadingOrTrailingWhitespace: Boolean(raw && raw !== trimmed),
    containsDatabaseUrlPrefix: trimmed.startsWith('DATABASE_URL='),
    isWrappedInQuotes:
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  };
}

export function validateDatabaseUrl(): DatabaseUrlValidation {
  const raw = rawDatabaseUrl();
  const diagnostics = getDatabaseUrlDiagnostics();
  if (!raw) {
    return {
      valid: false,
      errorCode: 'DATABASE_URL_MISSING',
      safeErrorMessage: 'DATABASE_URL is missing in the runtime environment.',
      diagnostics,
    };
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith('DATABASE_URL=')) {
    return {
      valid: false,
      errorCode: 'DATABASE_URL_CONTAINS_NAME_PREFIX',
      safeErrorMessage:
        'Invalid DATABASE_URL format. In Vercel, the variable name should be DATABASE_URL and the value should start with postgresql:// or postgres://. Do not include DATABASE_URL= in the value field.',
      diagnostics,
    };
  }

  if (diagnostics.isWrappedInQuotes) {
    return {
      valid: false,
      errorCode: 'DATABASE_URL_WRAPPED_IN_QUOTES',
      safeErrorMessage:
        'Invalid DATABASE_URL format. Remove surrounding quotes from the Vercel value field. The value should start directly with postgresql:// or postgres://.',
      diagnostics,
    };
  }

  if (!trimmed.startsWith('postgresql://') && !trimmed.startsWith('postgres://')) {
    return {
      valid: false,
      errorCode: 'DATABASE_URL_INVALID_PROTOCOL',
      safeErrorMessage:
        'Invalid DATABASE_URL format. In Vercel, the variable name should be DATABASE_URL and the value should start with postgresql:// or postgres://. Do not include DATABASE_URL= in the value field.',
      diagnostics,
    };
  }

  try {
    new URL(trimmed);
  } catch {
    return {
      valid: false,
      errorCode: 'DATABASE_URL_INVALID_URL',
      safeErrorMessage:
        'DATABASE_URL starts with the right protocol but is not a valid URL. Check for unencoded special characters in the password and remove spaces or line breaks.',
      diagnostics,
    };
  }

  return { valid: true, normalized: trimmed, diagnostics };
}

export function normalizeDatabaseUrlForPrisma() {
  const validation = validateDatabaseUrl();
  if (validation.valid && validation.normalized) {
    let normalized = validation.normalized;
    const url = new URL(normalized);

    // Vercel functions must use Supabase's transaction pooler. Session mode
    // has a small shared client cap and can exhaust it during concurrent SSR.
    //
    // connection_limit stays at 1 here deliberately: every concurrent
    // serverless function instance gets its own Prisma Client, each holding
    // up to `connection_limit` connections against PgBouncer's shared,
    // finite connection budget. Raising this per-instance limit multiplies
    // total connections by however many instances are running concurrently
    // and would make pool exhaustion *worse*, not better, under load - it
    // would recreate the exact "timed out fetching a new connection from
    // the connection pool" failure this change is meant to fix. What is
    // safe to raise is pool_timeout, which only controls how long a single
    // instance waits for one of its own (still capped) connections.
    if (process.env.VERCEL === '1' && url.hostname.endsWith('.pooler.supabase.com')) {
      url.port = '6543';
      url.searchParams.set('pgbouncer', 'true');
      url.searchParams.set('connection_limit', '1');
      url.searchParams.set('pool_timeout', '30');
      url.searchParams.set('sslmode', 'require');
      normalized = url.toString();
    } else if (process.env.VERCEL !== '1') {
      // Outside serverless (local dev, and the long-running queue worker
      // process), a single process really does benefit from a real pool -
      // apply sane defaults only when the URL doesn't already specify them,
      // so an operator's explicit choice is never overridden.
      let changed = false;
      if (!url.searchParams.has('connection_limit')) {
        url.searchParams.set('connection_limit', '10');
        changed = true;
      }
      if (!url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', '30');
        changed = true;
      }
      if (changed) normalized = url.toString();
    }

    process.env.DATABASE_URL = normalized;
  }
  return validation;
}
