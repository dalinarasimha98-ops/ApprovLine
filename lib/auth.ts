import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import type { AppRole } from '@/types/rbac';
import { canAccessRole } from '@/types/rbac';

export async function requireSession() {
  const session = await auth();
  if (!session.userId) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}

export async function getCurrentTenant() {
  const session = await requireSession();
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? `${session.userId}@unknown.local`;
  const orgId = session.orgId;

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

  return { session, organization, user };
}

export async function requireRole(requiredRole: AppRole) {
  const tenant = await getCurrentTenant();
  if (!canAccessRole(tenant.user.role as AppRole, requiredRole)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return tenant;
}
