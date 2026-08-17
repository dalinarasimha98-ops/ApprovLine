import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getFounderAccess } from '@/services/founder';
import { env } from '@/config/env';
import { approvalRecordsCacheTag } from '@/lib/approvalRecords';
import { unifiedEvidenceCacheTag } from '@/services/evidence/records';
import { DASHBOARD_TENANT_CACHE_TAG } from '@/lib/auth';
import { alertsCacheTag } from '@/services/alerts';
import { auditLogCacheTag } from '@/services/audit';
import { gatewayMetricsCacheTag } from '@/services/gateway/universalGateway';

export const dynamic = 'force-dynamic';

/** Matches the timing-safe comparison pattern lib/gateway-auth.ts already
 *  uses for the Universal Gateway's static API key - constant-time so a
 *  mistyped/guessed secret can't be distinguished from a correct one by
 *  response latency. */
function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * One-time cache-busting endpoint for clearing stale unstable_cache entries
 * after an out-of-band data change (e.g. scripts/clear-demo-data.ts, which
 * writes directly via Prisma and can't call revalidateTag() itself outside
 * a Next.js request scope). Not part of the tenant-facing API surface.
 * Uses the real, existing tag-generator functions rather than hardcoded
 * strings so this never drifts out of sync with the tags each cache is
 * actually registered under.
 *
 * Two ways in, deliberately not the same auth check weakened: a signed-in
 * founder session (the normal path, unchanged), OR a CACHE_BUST_SECRET
 * value in the `x-cache-bust-secret` header (for curl/CI use without a
 * browser session). The secret is read from a header, never a query
 * param - query strings end up in vercel logs' requestPath, browser
 * history, and Referer headers, none of which should ever see a secret.
 * If CACHE_BUST_SECRET isn't configured, only the founder-session path
 * works.
 */
export async function POST(request: Request) {
  const suppliedSecret = request.headers.get('x-cache-bust-secret');
  const configuredSecret = env.CACHE_BUST_SECRET;
  const secretAuthorized = Boolean(configuredSecret && suppliedSecret && secureEqual(suppliedSecret, configuredSecret));

  if (!secretAuthorized) {
    const access = await getFounderAccess();
    if (!access.ok) {
      return NextResponse.json({ error: 'founder_access_required' }, { status: access.reason === 'unauthenticated' ? 401 : 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('org');
  if (!organizationId) {
    return NextResponse.json({ error: 'org query param is required' }, { status: 400 });
  }

  const tags = [
    approvalRecordsCacheTag(organizationId),
    unifiedEvidenceCacheTag(organizationId),
    DASHBOARD_TENANT_CACHE_TAG,
    alertsCacheTag(organizationId),
    auditLogCacheTag(organizationId),
    gatewayMetricsCacheTag(organizationId),
  ];

  for (const tag of tags) {
    revalidateTag(tag);
  }

  return NextResponse.json({ success: true, revalidated: tags });
}
