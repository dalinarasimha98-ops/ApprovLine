import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getFounderAccess } from '@/services/founder';
import { approvalRecordsCacheTag } from '@/lib/approvalRecords';
import { unifiedEvidenceCacheTag } from '@/services/evidence/records';
import { DASHBOARD_TENANT_CACHE_TAG } from '@/lib/auth';
import { alertsCacheTag } from '@/services/alerts';
import { auditLogCacheTag } from '@/services/audit';
import { gatewayMetricsCacheTag } from '@/services/gateway/universalGateway';

export const dynamic = 'force-dynamic';

/**
 * One-time cache-busting endpoint for clearing stale unstable_cache entries
 * after an out-of-band data change (e.g. scripts/clear-demo-data.ts, which
 * writes directly via Prisma and can't call revalidateTag() itself outside
 * a Next.js request scope). Founder-only - not part of the tenant-facing
 * API surface. Uses the real, existing tag-generator functions rather than
 * hardcoded strings so this never drifts out of sync with the tags each
 * cache is actually registered under.
 */
export async function POST(request: Request) {
  const access = await getFounderAccess();
  if (!access.ok) {
    return NextResponse.json({ error: 'founder_access_required' }, { status: access.reason === 'unauthenticated' ? 401 : 403 });
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
