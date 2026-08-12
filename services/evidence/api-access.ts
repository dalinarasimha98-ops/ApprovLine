import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';

type EvidenceAccess = 'read' | 'write' | 'manage';

// AUDITOR is deliberately excluded from write access: compliance/audit
// reviewers get full read visibility into evidence but must stay read-only
// to preserve separation of duties for compliance reviews.
const writeRoles = ['OWNER', 'ADMIN', 'MANAGER'] as const;
const manageRoles = ['OWNER', 'ADMIN'] as const;

export async function requireEvidenceAccess(access: EvidenceAccess) {
  const tenant = await getDashboardTenant(5000);
  if (tenant.status === 'unauthenticated') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }),
    };
  }
  if (!tenant.organization || !tenant.user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: tenant.error ?? 'Workspace unavailable.' },
        { status: 503 },
      ),
    };
  }

  const role = tenant.user.role;
  const allowed =
    access === 'read'
      ? true
      : access === 'write'
        ? hasAnyRole(role, [...writeRoles])
        : hasAnyRole(role, [...manageRoles]);
  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: `Your workspace role cannot ${access} evidence records.` },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    organization: tenant.organization,
    user: tenant.user,
  };
}
