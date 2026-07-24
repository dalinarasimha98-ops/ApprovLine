import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';

type EvidenceAccess = 'read' | 'write' | 'manage';

const writeRoles = new Set(['ADMIN', 'MANAGER', 'COMPLIANCE_OFFICER']);
const manageRoles = new Set(['ADMIN']);

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
        ? writeRoles.has(role)
        : manageRoles.has(role);
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
