import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tenantScopedWhere } from '@/lib/tenant-isolation';

export const dynamic = 'force-dynamic';

const integrationRequestSchema = z.object({
  providerSlug: z.string().max(120).optional(),
  providerName: z.string().min(1).max(200),
  providerWebsite: z.string().url().max(500).optional().or(z.literal('')),
  category: z.string().max(80).optional(),
  reason: z.string().min(10).max(2000),
  evidenceType: z.string().max(120).optional(),
  userCount: z.coerce.number().int().min(1).max(1_000_000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});

/**
 * POST /api/integrations/requests
 *
 * Creates an IntegrationRequest for the current tenant.
 * If a matching providerSlug is provided, also increments that provider's
 * requestCount so founders can see aggregate demand.
 *
 * Deduplication: only one PENDING request per (org, providerName) is allowed.
 * Subsequent requests return a 409 with aggregated count.
 */
export async function POST(request: NextRequest) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tenant.organization || !tenant.user) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = integrationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;
  const organizationId = tenant.organization.id;
  const userId = tenant.user.id;

  try {
    // Check for existing PENDING / UNDER_REVIEW request for same provider by this org
    const existing = await prisma.integrationRequest.findFirst({
      where: tenantScopedWhere(
        { organizationId },
        {
          providerName: { equals: data.providerName, mode: 'insensitive' },
          status: { in: ['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT'] },
        },
      ),
    });

    if (existing) {
      // Count how many other orgs have requested the same provider
      const totalCount = await prisma.integrationRequest.count({
        where: {
          providerName: { equals: data.providerName, mode: 'insensitive' },
          status: { in: ['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT'] },
        },
      });
      return NextResponse.json(
        {
          error: 'already_requested',
          message: 'You have already requested this integration.',
          requestId: existing.id,
          totalRequests: totalCount,
        },
        { status: 409 },
      );
    }

    // Create the request
    const integrationRequest = await prisma.integrationRequest.create({
      data: {
        organizationId,
        requestedByUserId: userId,
        providerSlug: data.providerSlug ?? null,
        providerName: data.providerName,
        providerWebsite: data.providerWebsite || null,
        category: data.category || null,
        reason: data.reason,
        evidenceType: data.evidenceType || null,
        userCount: data.userCount ?? null,
        priority: data.priority,
        status: 'PENDING',
      },
    });

    // Increment aggregate requestCount on the marketplace provider if slug given
    if (data.providerSlug) {
      await prisma.marketplaceProvider.updateMany({
        where: { slug: data.providerSlug },
        data: { requestCount: { increment: 1 } },
      }).catch(() => {
        // Non-fatal — slug may not match any known provider
      });
    }

    // Count total across all orgs for this provider name
    const totalRequests = await prisma.integrationRequest.count({
      where: { providerName: { equals: data.providerName, mode: 'insensitive' } },
    });

    return NextResponse.json(
      { success: true, requestId: integrationRequest.id, totalRequests },
      { status: 201 },
    );
  } catch (error) {
    console.error('[integration-requests] create failed', error);
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
  }
}

/**
 * GET /api/integrations/requests
 *
 * Returns integration requests submitted by the current tenant.
 */
export async function GET() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tenant.organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  try {
    const requests = await prisma.integrationRequest.findMany({
      where: tenantScopedWhere({ organizationId: tenant.organization.id }),
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        providerName: true,
        providerSlug: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('[integration-requests] list failed', error);
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 });
  }
}
