import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';

export type { Role };

/**
 * Higher number = more privileged. OWNER sits above ADMIN so every
 * ADMIN-gated check (hasMinimumRole(role, 'ADMIN')) also passes for OWNER
 * without needing to special-case it at every call site.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER: 0,
  AUDITOR: 1,
  MEMBER: 2,
  MANAGER: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function hasMinimumRole(userRole: Role, minimumRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

export function hasAnyRole(userRole: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Route prefix -> roles allowed to view it. Not expressible as a single
 * minimum role: AUDITOR sits below MANAGER in ROLE_HIERARCHY but must reach
 * /trust/compliance, while MANAGER must not. Checked with hasAnyRole(), not
 * hasMinimumRole(). '/settings' intentionally omits '/settings/identity'
 * read-only viewing for non-admins, which is enforced separately inside
 * services/identity.ts (view is allowed, editing is not).
 *
 * Enforced at the page level (server components, immediately after tenant
 * resolution) and the API level - deliberately NOT in middleware.ts.
 * middleware.ts only ever does Clerk-session auth plus the founder identity
 * check (a Clerk API lookup, no DB); this codebase's documented architecture
 * keeps DB-dependent authorization out of middleware entirely (see
 * lib/tenant-isolation.ts's role in the tenant-scoping equivalent). A
 * Prisma-backed role lookup was tried here directly in middleware.ts and
 * empirically breaks middleware registration on this Next.js version
 * (15.5.23) - `runtime: 'nodejs'` silently produces an empty
 * middleware-manifest.json instead of switching runtimes, which would have
 * disabled auth protection entirely. Revisit only after confirming Node.js
 * middleware actually works end-to-end on whatever Next.js version is
 * installed at the time.
 */
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/analytics': ['ADMIN', 'OWNER'],
  '/trust/compliance': ['ADMIN', 'AUDITOR', 'OWNER'],
  '/investigations': ['MANAGER', 'ADMIN', 'OWNER'],
  '/memory': ['ADMIN', 'OWNER'],
  '/dashboard/alerts': ['MANAGER', 'ADMIN', 'OWNER'],
  // Settings lives under two URL namespaces in this app - /settings/* (identity,
  // onboarding status) and /dashboard/settings/* (settings hub, integrations) -
  // both gated the same way.
  '/settings': ['ADMIN', 'OWNER'],
  '/settings/users': ['VIEWER', 'AUDITOR', 'MEMBER', 'MANAGER', 'ADMIN', 'OWNER'],
  '/dashboard/settings': ['ADMIN', 'OWNER'],
  // Matches the read tier already enforced on app/api/playbooks/* (see
  // permissionsForRole()'s playbooks:read in lib/auth.ts) - keeps the page
  // and its underlying API routes consistent instead of showing a page that
  // immediately 403s for MEMBER/MANAGER/VIEWER callers.
  '/playbooks': ['ADMIN', 'AUDITOR', 'OWNER'],
  '/dashboard/gateway': ['ADMIN', 'OWNER'],
};

/**
 * Longest-prefix match so a more specific entry (if one is ever added, e.g.
 * '/settings/identity') wins over a broader one (e.g. '/settings').
 */
export function findRoutePermission(pathname: string): Role[] | null {
  let best: { route: string; roles: Role[] } | null = null;
  for (const [route, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    const matches = pathname === route || pathname.startsWith(`${route}/`);
    if (matches && (!best || route.length > best.route.length)) {
      best = { route, roles };
    }
  }
  return best?.roles ?? null;
}

/**
 * Page-level enforcement (the primary layer - see the note above on why
 * this isn't in middleware.ts). Called after tenant/org status checks pass
 * but before any sensitive data is fetched or rendered. Redirects to
 * /dashboard - never a 403 page or notFound() - so the failure mode matches
 * every other role/tenant rejection already used across this app (e.g. the
 * /founder identity gate), rather than introducing a new one.
 */
export function enforcePageRole(pathname: string, role: Role): void {
  const allowed = findRoutePermission(pathname);
  if (allowed && !hasAnyRole(role, allowed)) {
    redirect('/dashboard');
  }
}
