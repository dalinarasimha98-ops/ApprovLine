import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'node:crypto';

type ApprovalFailureContext = {
  action: string;
  approvalId?: string;
  organizationId?: string;
  userId?: string;
  reason?: string;
};

export function reportApprovalFailure(error: unknown, context: ApprovalFailureContext) {
  const correlationId = randomUUID();
  const normalizedError = error instanceof Error ? error : new Error(context.reason ?? 'Approval action failed');

  Sentry.withScope((scope) => {
    scope.setTag('feature', 'approval-timeline');
    scope.setTag('approval.action', context.action);
    scope.setTag('correlation_id', correlationId);
    if (context.organizationId) scope.setTag('tenant_id', context.organizationId);
    if (context.userId) scope.setUser({ id: context.userId });
    scope.setContext('approval', {
      approvalId: context.approvalId,
      reason: context.reason,
    });
    Sentry.captureException(normalizedError);
  });

  console.error('[approval-action]', {
    correlationId,
    action: context.action,
    approvalId: context.approvalId,
    organizationId: context.organizationId,
    userId: context.userId,
    reason: context.reason,
    error: normalizedError.message,
  });

  return correlationId;
}

