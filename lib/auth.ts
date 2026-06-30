import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { validateDatabaseUrl } from '@/lib/env';
import type { AppRole } from '@/types/rbac';
import { canAccessRole } from '@/types/rbac';

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

export async function getDashboardTenant(timeoutMs = 3000) {
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
    const userPromise = prisma.user.findUnique({
      where: { clerkUserId: session.userId },
      include: { organization: true },
    });
    const user = await Promise.race([
      userPromise,
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error(`Dashboard tenant lookup timed out after ${timeoutMs}ms`)), timeoutMs);
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
    console.error('[tenant] dashboard tenant lookup failed', error);
    return {
      session,
      user: null,
      organization: null,
      status: 'error' as const,
      error: error instanceof Error ? error.message : 'Unable to load workspace.',
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
