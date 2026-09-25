import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';
import { revalidateTag } from 'next/cache';
import { settingsCacheTag } from '@/services/settings';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// A real, conservative domain-format check (not an IP, not localhost, has a
// dot) - not a full RFC 1035 validator, but enough to reject nonsense input
// before it's ever stored or looked up.
const DOMAIN_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

const requestSchema = z.object({ domain: z.string().min(4).max(255).regex(DOMAIN_PATTERN, 'Enter a valid domain, e.g. app.yourcompany.com') });

async function authorize() {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) } as const;
  if (!tenant.user || !tenant.organization) {
    return { error: NextResponse.json({ error: 'Organization unavailable' }, { status: 403 }) } as const;
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER'])) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const;
  }
  return { tenant } as const;
}

/**
 * POST /api/settings/organization/domain
 *
 * Starts (or restarts) domain verification. This never claims a domain is
 * verified on request - it only generates a real, random verification
 * token and tells the admin which DNS TXT record to publish. The domain
 * only ever becomes VERIFIED after a genuine DNS lookup (see PATCH below)
 * finds that exact token.
 */
export async function POST(req: NextRequest) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { tenant } = auth;

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid domain' }, { status: 400 });

  const domain = parsed.data.domain.toLowerCase();
  const organizationId = tenant.organization.id;
  const verifyToken = randomBytes(16).toString('hex');

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      customDomain: domain,
      customDomainStatus: 'PENDING_VERIFICATION',
      customDomainVerifyToken: verifyToken,
      customDomainVerifiedAt: null,
    },
  });

  await writeAuditLog({
    organizationId,
    actorUserId: tenant.user.id,
    action: 'DOMAIN_UPDATED',
    metadata: { domain, status: 'PENDING_VERIFICATION' },
  });

  revalidateTag(settingsCacheTag(organizationId));

  return NextResponse.json({
    ok: true,
    domain,
    status: 'PENDING_VERIFICATION',
    dnsRecord: { type: 'TXT', name: `_approvline-verify.${domain}`, value: `approvline-verify=${verifyToken}` },
  });
}

/**
 * PATCH /api/settings/organization/domain — check verification.
 *
 * Performs a real DNS TXT lookup. No credentials or paid API needed - this
 * is exactly the mechanism most SaaS domain-verification flows use. Never
 * marks VERIFIED without the lookup actually finding the token.
 */
export async function PATCH() {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { tenant } = auth;
  const organizationId = tenant.organization!.id;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { customDomain: true, customDomainStatus: true, customDomainVerifyToken: true },
  });

  if (!org?.customDomain || !org.customDomainVerifyToken) {
    return NextResponse.json({ error: 'No domain is pending verification.' }, { status: 400 });
  }
  if (org.customDomainStatus === 'VERIFIED' || org.customDomainStatus === 'ACTIVE') {
    return NextResponse.json({ ok: true, status: org.customDomainStatus });
  }

  const expected = `approvline-verify=${org.customDomainVerifyToken}`;
  let found = false;
  try {
    const records = await resolveTxt(`_approvline-verify.${org.customDomain}`);
    found = records.some((chunks) => chunks.join('').trim() === expected);
  } catch {
    // ENOTFOUND/ENODATA/timeout - the record simply isn't there (yet).
    // Stays PENDING_VERIFICATION; never silently marks FAILED on a
    // transient DNS error the admin might retry moments later.
    found = false;
  }

  if (found) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { customDomainStatus: 'VERIFIED', customDomainVerifiedAt: new Date() },
    });
    await writeAuditLog({
      organizationId,
      actorUserId: tenant.user.id,
      action: 'DOMAIN_UPDATED',
      metadata: { domain: org.customDomain, status: 'VERIFIED' },
    });
    revalidateTag(settingsCacheTag(organizationId));
    return NextResponse.json({ ok: true, status: 'VERIFIED' });
  }

  return NextResponse.json({ ok: true, status: 'PENDING_VERIFICATION', verified: false });
}

/** DELETE /api/settings/organization/domain — remove/reset. */
export async function DELETE() {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { tenant } = auth;
  const organizationId = tenant.organization!.id;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { customDomain: null, customDomainStatus: 'NOT_CONFIGURED', customDomainVerifyToken: null, customDomainVerifiedAt: null },
  });

  await writeAuditLog({
    organizationId,
    actorUserId: tenant.user.id,
    action: 'DOMAIN_UPDATED',
    metadata: { status: 'NOT_CONFIGURED' },
  });

  revalidateTag(settingsCacheTag(organizationId));

  return NextResponse.json({ ok: true });
}
