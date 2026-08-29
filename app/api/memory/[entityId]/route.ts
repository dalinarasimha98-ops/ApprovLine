import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { hasAnyRole } from '@/lib/rbac';
import { getMemoryEntityProfile } from '@/services/memory';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (!hasAnyRole(tenant.user.role, [...ALLOWED_ROLES])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { entityId } = await params;
  const orgId = tenant.organization.id;

  const entity = await getMemoryEntityProfile(orgId, entityId);
  if (!entity) return NextResponse.json({ error: 'Entity not found' }, { status: 404 });

  const normalized = {
    ...entity,
    firstSeenAt: entity.firstSeenAt.toISOString(),
    lastSeenAt: entity.lastSeenAt.toISOString(),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    outgoingRelationships: entity.outgoingRelationships.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      toEntity: {
        ...r.toEntity,
        firstSeenAt: r.toEntity.firstSeenAt.toISOString(),
        lastSeenAt: r.toEntity.lastSeenAt.toISOString(),
        createdAt: r.toEntity.createdAt.toISOString(),
        updatedAt: r.toEntity.updatedAt.toISOString(),
      },
    })),
    incomingRelationships: entity.incomingRelationships.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      fromEntity: {
        ...r.fromEntity,
        firstSeenAt: r.fromEntity.firstSeenAt.toISOString(),
        lastSeenAt: r.fromEntity.lastSeenAt.toISOString(),
        createdAt: r.fromEntity.createdAt.toISOString(),
        updatedAt: r.fromEntity.updatedAt.toISOString(),
      },
    })),
    timelineEvents: entity.timelineEvents.map((t) => ({
      ...t,
      occurredAt: t.occurredAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    })),
  };

  return NextResponse.json({ entity: normalized });
}
