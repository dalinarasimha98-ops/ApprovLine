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
    process.env.DATABASE_URL = validation.normalized;
  }
  return validation;
}
