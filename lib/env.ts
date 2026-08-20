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
    // connection_limit was previously hardcoded to 1 here unconditionally,
    // overriding whatever value was actually configured on DATABASE_URL in
    // Vercel - every attempt to raise it via `vercel env add` (repeatedly,
    // across many production incidents) was silently discarded by this
    // function at every cold start, which is why "connection limit: 1" kept
    // recurring in production logs no matter what the env var was set to.
    // A single request routinely fires several queries concurrently
    // (app/dashboard/page.tsx alone runs 10 in one Promise.all) - with
    // connection_limit=1, those queries serialize against each other
    // *within one request*, which is what actually produced the timeout
    // cascades, not cross-instance pool exhaustion. The concern the old
    // comment described (total connections = instance_count *
    // connection_limit exceeding Supabase's pool) is real, but the fix
    // belongs in the configured value, not in silently overriding whatever
    // value an operator explicitly set. This now only fills in a default
    // when connection_limit isn't already present - matching the same
    // "never override an operator's explicit choice" rule the non-Vercel
    // branch below already follows - with that default set to 5 to match
    // the deliberately-sized value (15-connection Supabase pool / 3
    // concurrent instances) established for this project.
    if (process.env.VERCEL === '1' && url.hostname.endsWith('.pooler.supabase.com')) {
      url.port = '6543';
      url.searchParams.set('pgbouncer', 'true');
      if (!url.searchParams.has('connection_limit')) {
        url.searchParams.set('connection_limit', '5');
      }
      if (!url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', '30');
      }
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
