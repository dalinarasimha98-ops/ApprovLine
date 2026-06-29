import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { validateDatabaseUrl } from '@/lib/env';
import { withTimeout } from '@/lib/performance';
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
    const organization = await withTimeout(
      'tenant organization upsert',
      prisma.organization.upsert({
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
      }),
      1500,
    );
    console.info(`[tenant] organization upsert finished in ${Date.now() - startedAt}ms`);

    console.info('[tenant] user upsert start');
    const user = await withTimeout(
      'tenant user upsert',
      prisma.user.upsert({
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
      }),
      1500,
    );
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

export async function requireRole(requiredRole: AppRole) {
  const tenant = await getCurrentTenant();
  if (!canAccessRole(tenant.user.role as AppRole, requiredRole)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return tenant;
}
