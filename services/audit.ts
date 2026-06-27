import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function writeAuditLog(input: {
  organizationId: string;
  actorUserId?: string;
  approvalRecordId?: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      approvalRecordId: input.approvalRecordId,
      action: input.action,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
