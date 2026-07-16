import { prisma } from '@/lib/prisma';

export type TenantIsolationContext = {
  authenticatedUserId: string;
  organizationId: string;
  workspaceId: string;
  platformRole: string;
  customerRole: string;
  permissions: string[];
};

export type TenantOwnedRecord = {
  id?: string | null;
  organizationId?: string | null;
};

export class TenantIsolationError extends Error {
  status = 404;

  constructor(message = 'Resource not found.') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export function tenantScopedWhere<T extends Record<string, unknown>>(context: Pick<TenantIsolationContext, 'organizationId'>, where?: T) {
  return {
    ...(where ?? {}),
    organizationId: context.organizationId,
  };
}

export function assertTenantAccess(
  context: Pick<TenantIsolationContext, 'organizationId'>,
  record: TenantOwnedRecord | null | undefined,
  label = 'record',
) {
  if (!record?.organizationId || record.organizationId !== context.organizationId) {
    throw new TenantIsolationError(`${label} not found.`);
  }
  return record;
}

export function assertMemoryRelationshipTenant(input: {
  organizationId: string;
  fromEntity?: TenantOwnedRecord | null;
  toEntity?: TenantOwnedRecord | null;
}) {
  assertTenantAccess({ organizationId: input.organizationId }, input.fromEntity, 'source memory entity');
  assertTenantAccess({ organizationId: input.organizationId }, input.toEntity, 'target memory entity');
  return true;
}

export function tenantCacheKey(context: Pick<TenantIsolationContext, 'organizationId' | 'workspaceId'>, key: string) {
  return `org:${context.organizationId}:workspace:${context.workspaceId}:${key}`;
}

export function validateTenantJobPayload(payload: { organizationId?: string | null; workspaceId?: string | null }) {
  if (!payload.organizationId || !payload.workspaceId) {
    throw new TenantIsolationError('Background job missing tenant context.');
  }
  return payload;
}

export function safeTenantIsolationMessage(error: unknown) {
  if (error instanceof TenantIsolationError) return error.message;
  return 'Tenant isolation rejected an unsafe access attempt.';
}

export async function logTenantIsolationEvent(input: {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!input.organizationId) {
    console.warn('[tenant-isolation] rejected unscoped event', input);
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        metadata: {
          securityEvent: true,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          ...(input.metadata ?? {}),
        },
      },
    });
  } catch (error) {
    console.warn('[tenant-isolation] unable to persist security event', error);
  }
}
