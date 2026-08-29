import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { withTimeout } from '@/lib/performance';
import { ensureMemoryStorage } from '@/services/memory-storage';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

export async function GET(request: Request) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...ALLOWED_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const orgId = tenant.organization.id;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const type = searchParams.get('type') ?? '';
  const source = searchParams.get('source') ?? '';
  const risk = searchParams.get('risk') ?? '';
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') ?? '80', 10)));

  try {
    await ensureMemoryStorage();

    function icontains(value: string): Prisma.StringNullableFilter {
      return { contains: value, mode: 'insensitive' };
    }

    const riskFilter: Prisma.IntFilter | undefined =
      risk === 'high' ? { gte: 70 } : risk === 'medium' ? { gte: 40, lt: 70 } : risk === 'low' ? { lt: 40 } : undefined;

    const where: Prisma.MemoryEntityWhereInput = {
      organizationId: orgId,
      ...(type ? { type: type as Prisma.EnumMemoryEntityTypeFilter } : {}),
      ...(source ? { sourceSystem: icontains(source) } : {}),
      ...(riskFilter ? { riskScore: riskFilter } : {}),
      ...(q ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { subtitle: icontains(q) },
          { summary: icontains(q) },
        ],
      } : {}),
    };

    const [entities, total] = await withTimeout(
      'memory graph fetch',
      Promise.all([
        prisma.memoryEntity.findMany({
          where,
          select: {
            id: true,
            type: true,
            title: true,
            subtitle: true,
            riskScore: true,
            sourceSystem: true,
            externalId: true,
            metadata: true,
            firstSeenAt: true,
            lastSeenAt: true,
            updatedAt: true,
            _count: { select: { outgoingRelationships: true, incomingRelationships: true } },
          },
          orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
          take: limit,
        }),
        prisma.memoryEntity.count({ where }),
      ]),
      5000,
    );

    const entityIds = entities.map((e) => e.id);
    const relationships =
      entityIds.length > 0
        ? await withTimeout(
            'memory relationships fetch',
            prisma.memoryRelationship.findMany({
              where: {
                organizationId: orgId,
                fromEntityId: { in: entityIds },
                toEntityId: { in: entityIds },
              },
              select: {
                id: true,
                fromEntityId: true,
                toEntityId: true,
                relationshipType: true,
                confidence: true,
                evidenceSnippet: true,
              },
              take: 500,
            }),
            3000,
          )
        : [];

    const normalizedEntities = entities.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      subtitle: e.subtitle,
      riskScore: e.riskScore,
      sourceSystem: e.sourceSystem,
      externalId: e.externalId,
      metadata: e.metadata,
      firstSeenAt: e.firstSeenAt.toISOString(),
      lastSeenAt: e.lastSeenAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      connectionCount: (e._count?.outgoingRelationships ?? 0) + (e._count?.incomingRelationships ?? 0),
    }));

    return NextResponse.json({ entities: normalizedEntities, relationships, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Graph data could not be loaded.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
