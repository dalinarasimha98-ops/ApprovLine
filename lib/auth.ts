import { auth, currentUser } from '@clerk/nextjs/server';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { validateDatabaseUrl } from '@/lib/env';
import { isConnectionPoolError } from '@/lib/prisma-errors';
import type { TenantIsolationContext } from '@/lib/tenant-isolation';
import type { AppRole } from '@/types/rbac';
import { canAccessRole } from '@/types/rbac';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cross-request cache tag for the tenant lookup — see saveOnboardingPatch(), which calls
 *  revalidateTag(DASHBOARD_TENANT_CACHE_TAG) the moment onboarding completes so a
 *  just-onboarded user is never served a stale "incomplete" result. */
export const DASHBOARD_TENANT_CACHE_TAG = 'dashboard-tenant';
const DASHBOARD_TENANT_REVALIDATE_SECONDS = 300;
/**
 * Fixed DB-side timeout for the query behind the cache. This is intentionally
 * NOT the same thing as the `timeoutMs` argument callers pass to
 * getDashboardTenant() — that argument only bounds how long a given request
 * waits on this shared, cached lookup; it must never change how long the
 * lookup itself is allowed to run, or every caller's timeout would fragment
 * retry/backoff behavior for what is supposed to be one shared code path.
 */
const DASHBOARD_TENANT_QUERY_TIMEOUT_MS = 8000;
/** Floor for the outer race in getDashboardTenant() — see its usage below. */
const MINIMUM_TENANT_LOOKUP_TIMEOUT_MS = 4000;

// --- Circuit breaker -------------------------------------------------------
// getDashboardTenant() is the single most-called query in the app (every
// protected page hits it). If the database is genuinely struggling, retrying
// with backoff on every concurrent page load only makes things worse under a
// connection-limit=1 pool. After a few consecutive failures we stop issuing
// new queries for a cooldown window and fail fast instead. State is
// module-scope, so this is a best-effort, per-warm-instance breaker (Vercel
// may spin up multiple instances under load, each with its own counter) —
// still meaningfully reduces load compared to no breaker at all.
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
let consecutiveTenantLookupFailures = 0;
let tenantLookupBreakerOpenUntil = 0;

function isTenantLookupBreakerOpen() {
  return Date.now() < tenantLookupBreakerOpenUntil;
}

function recordTenantLookupSuccess() {
  consecutiveTenantLookupFailures = 0;
  tenantLookupBreakerOpenUntil = 0;
}

function recordTenantLookupFailure() {
  consecutiveTenantLookupFailures += 1;
  if (consecutiveTenantLookupFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    tenantLookupBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

export class TenantLookupCircuitOpenError extends Error {
  constructor() {
    super('Workspace lookup is temporarily paused after repeated database failures. Retrying shortly.');
    this.name = 'TenantLookupCircuitOpenError';
  }
}

/**
 * Retries the tenant lookup on transient failures (pool exhaustion, timeout)
 * with exponential backoff. Does not retry on errors that won't resolve by
 * retrying (e.g. a genuinely missing table) — isConnectionPoolError() is the
 * signal for "worth retrying"; the timeout race below still applies inside
 * each attempt.
 */
async function findUserWithRetry(clerkUserId: string, timeoutMs: number, maxAttempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const userPromise = prisma.user.findUnique({
        where: { clerkUserId },
        include: { organization: true },
      });
      return await Promise.race([
        userPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Dashboard tenant lookup timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = isConnectionPoolError(message) || message.includes('timed out');
      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(250 * 2 ** (attempt - 1)); // 250ms, 500ms, 1000ms
    }
  }
  throw lastError;
}

async function fetchTenantRecordFresh(clerkUserId: string) {
  if (isTenantLookupBreakerOpen()) {
    throw new TenantLookupCircuitOpenError();
  }
  try {
    const user = await findUserWithRetry(clerkUserId, DASHBOARD_TENANT_QUERY_TIMEOUT_MS);
    recordTenantLookupSuccess();
    return user;
  } catch (error) {
    recordTenantLookupFailure();
    throw error;
  }
}

/**
 * A user's tenant row almost never changes between page loads — there is no
 * reason to hit the database on every render. This is the primary fix for
 * "Dashboard tenant lookup timed out": once warm, 95%+ of page loads serve
 * this from the Next.js Data Cache instead of touching Postgres at all.
 * Keyed on clerkUserId (an argument to the wrapped function, which Next.js
 * folds into the cache key), so each user's cache entry is independent.
 */
const getCachedTenantRecord = unstable_cache(
  (clerkUserId: string) => fetchTenantRecordFresh(clerkUserId),
  ['dashboard-tenant-record'],
  { revalidate: DASHBOARD_TENANT_REVALIDATE_SECONDS, tags: [DASHBOARD_TENANT_CACHE_TAG] },
);

// Per-request dedup on top of the cross-request cache above: several Server
// Components on the same page (e.g. Compliance Hub's identity card and
// readiness card) each call getDashboardTenant() independently — this
// ensures they still only resolve one lookup (cached or not) per request.
const getTenantRecordForRequest = cache((clerkUserId: string) => getCachedTenantRecord(clerkUserId));

export class TenantDatabaseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'TenantDatabaseError';
  }
}

export function isTenantDatabaseError(error: unknown): error is TenantDatabaseError {
  return error instanceof TenantDatabaseError;
}

export async function requireSession() {
  const session = await auth();
  if (!session.userId) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}

export async function getCurrentTenant() {
  const startedAt = Date.now();
  console.info('[tenant] start load');
  const session = await requireSession();
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? `${session.userId}@unknown.local`;
  const orgId = session.orgId;
  const databaseUrl = validateDatabaseUrl();

  if (!databaseUrl.valid) {
    throw new TenantDatabaseError(databaseUrl.safeErrorMessage ?? 'ApprovLine database configuration is invalid.');
  }

  try {
    console.info('[tenant] organization upsert start');
    const organization = await prisma.organization.upsert({
      where: {
        slug: orgId ?? `personal-${session.userId}`,
      },
      update: {},
      create: {
        clerkOrgId: orgId,
        name: session.orgSlug ?? 'Personal Workspace',
        slug: orgId ?? `personal-${session.userId}`,
        departments: [],
        approvalCategories: [],
      },
    });
    console.info(`[tenant] organization upsert finished in ${Date.now() - startedAt}ms`);

    console.info('[tenant] user upsert start');
    const user = await prisma.user.upsert({
      where: { clerkUserId: session.userId },
      update: {
        email,
        name: clerkUser?.fullName,
        organizationId: organization.id,
      },
      create: {
        clerkUserId: session.userId,
        email,
        name: clerkUser?.fullName,
        organizationId: organization.id,
        role: 'ADMIN',
      },
    });
    console.info(`[tenant] finish load in ${Date.now() - startedAt}ms`);

    return { session, organization, user };
  } catch (error) {
    console.error('Unable to load ApprovLine tenant database state', error);
    throw new TenantDatabaseError(
      error instanceof Error && error.message.includes('does not exist')
        ? 'Database connected, but required Prisma tables are missing. Run npm run db:deploy with the production DATABASE_URL.'
        : 'ApprovLine database is not ready. Confirm DATABASE_URL is set in Vercel and Prisma migrations have run.',
      error,
    );
  }
}

export async function getDashboardTenant(timeoutMs = DASHBOARD_TENANT_QUERY_TIMEOUT_MS) {
  const startedAt = Date.now();
  const session = await auth();
  if (!session.userId) {
    return {
      session,
      user: null,
      organization: null,
      status: 'unauthenticated' as const,
      error: 'No Clerk session found.',
      loadMs: Date.now() - startedAt,
    };
  }
  const databaseUrl = validateDatabaseUrl();

  if (!databaseUrl.valid) {
    return {
      session,
      user: null,
      organization: null,
      status: 'database_invalid' as const,
      error: databaseUrl.safeErrorMessage ?? 'ApprovLine database configuration is invalid.',
      loadMs: Date.now() - startedAt,
    };
  }

  try {
    // Several call sites still pass a short custom timeoutMs from before
    // caching existed (some as low as 1500ms). That's fine on a warm cache
    // (resolves in microseconds either way), but on a cold cache it would
    // undermine the whole fix by racing past a legitimately-in-flight first
    // lookup before it ever gets a chance to populate the cache. Enforce a
    // floor so no caller can accidentally override the cached version's
    // real budget.
    const effectiveTimeoutMs = Math.max(timeoutMs, MINIMUM_TENANT_LOOKUP_TIMEOUT_MS);
    // Races the (usually cached, near-instant) tenant lookup against the
    // caller's own timeout budget. On a warm cache this resolves in
    // microseconds regardless of timeoutMs; only a cold cache entry or a
    // genuinely struggling database ever gets close to this bound.
    const user = await Promise.race([
      getTenantRecordForRequest(session.userId),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Dashboard tenant lookup timed out after ${effectiveTimeoutMs}ms`)), effectiveTimeoutMs);
      }),
    ]);

    if (!user?.organization) {
      return {
        session,
        user,
        organization: null,
        status: 'organization_missing' as const,
        error: null,
        loadMs: Date.now() - startedAt,
      };
    }

    if (!user.organization.onboardedAt) {
      return {
        session,
        user,
        organization: user.organization,
        status: 'onboarding_incomplete' as const,
        error: null,
        loadMs: Date.now() - startedAt,
      };
    }

    return {
      session,
      user,
      organization: user.organization,
      status: 'ready' as const,
      error: null,
      loadMs: Date.now() - startedAt,
    };
  } catch (error) {
    // Full internal detail (timeout message, circuit-breaker state, Prisma
    // error) is logged for diagnostics only — never surfaced to the UI.
    // Pages that render tenant.error must show this generic message so a
    // raw "timed out after Nms" string can never appear on screen again.
    console.error('[tenant] dashboard tenant lookup failed', error);
    return {
      session,
      user: null,
      organization: null,
      status: 'error' as const,
      error: 'Workspace lookup is temporarily unavailable. Please retry in a moment.',
      loadMs: Date.now() - startedAt,
    };
  }
}

export async function requireRole(requiredRole: AppRole) {
  const tenant = await getCurrentTenant();
  if (!canAccessRole(tenant.user.role as AppRole, requiredRole)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return tenant;
}

function permissionsForRole(role: AppRole) {
  const permissions: Record<AppRole, string[]> = {
    ADMIN: [
      'workspace:admin',
      'approvals:read',
      'approvals:write',
      'audit:read',
      'copilot:use',
      'exports:create',
      'integrations:manage',
      'playbooks:manage',
      'investigations:manage',
      'memory:read',
    ],
    COMPLIANCE_OFFICER: [
      'approvals:read',
      'audit:read',
      'copilot:use',
      'exports:create',
      'playbooks:read',
      'investigations:manage',
      'memory:read',
    ],
    MANAGER: [
      'approvals:read',
      'approvals:write',
      'copilot:use',
      'investigations:read',
      'memory:read',
    ],
    EMPLOYEE: [
      'approvals:read',
      'copilot:use',
      'memory:read',
    ],
  };

  return permissions[role] ?? permissions.EMPLOYEE;
}

export async function resolveTenantContext(): Promise<TenantIsolationContext> {
  const tenant = await getCurrentTenant();
  const role = tenant.user.role as AppRole;

  return {
    authenticatedUserId: tenant.user.id,
    organizationId: tenant.organization.id,
    workspaceId: tenant.organization.id,
    platformRole: role,
    customerRole: role,
    permissions: permissionsForRole(role),
  };
}
