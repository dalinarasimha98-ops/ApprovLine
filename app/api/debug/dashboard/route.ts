import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

type CheckStatus = {
  status: 'success' | 'fail' | 'skipped';
  ms: number;
  message?: string;
  count?: number;
};

async function timed<T>(label: string, fn: () => Promise<T>, timeoutMs = 1500): Promise<CheckStatus & { result?: T }> {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(label, fn(), timeoutMs);
    return {
      status: 'success',
      ms: Date.now() - startedAt,
      count: typeof result === 'number' ? result : undefined,
      result,
    };
  } catch (error) {
    return {
      status: 'fail',
      ms: Date.now() - startedAt,
      message: error instanceof Error ? error.message : `${label} failed`,
    };
  }
}

function publicStatus<T extends CheckStatus & { result?: unknown }>(status: T): CheckStatus {
  return {
    status: status.status,
    ms: status.ms,
    message: status.message,
    count: status.count,
  };
}

function slowestOperation(checks: Record<string, CheckStatus>) {
  return Object.entries(checks)
    .sort(([, a], [, b]) => b.ms - a.ms)
    .map(([name, status]) => ({ name, ms: status.ms, status: status.status }))[0] ?? null;
}

export async function GET() {
  const startedAt = Date.now();
  const session = await auth();
  const authStatus: CheckStatus = {
    status: session.userId ? 'success' : 'fail',
    ms: Date.now() - startedAt,
    message: session.userId ? undefined : 'No Clerk session found.',
  };

  if (!session.userId) {
    const skipped: CheckStatus = { status: 'skipped', ms: 0, message: 'Skipped because auth failed.' };
    const checks = {
      database: skipped,
      organization: skipped,
      approvals: skipped,
      auditLogs: skipped,
      integrations: skipped,
    };
    return NextResponse.json({
      auth: { status: authStatus.status, userIdPresent: false, ms: authStatus.ms, message: authStatus.message },
      organizationFound: false,
      onboardingCompleted: false,
      checks,
      totalDashboardLoadMs: Date.now() - startedAt,
      slowestOperation: slowestOperation(checks),
    });
  }

  const database = await timed('database connection', () => prisma.$queryRaw`SELECT 1`, 1500);
  const user = await timed('user organization lookup', () =>
    prisma.user.findUnique({
      where: { clerkUserId: session.userId! },
      select: {
        organizationId: true,
        organization: {
          select: {
            id: true,
            onboardedAt: true,
          },
        },
      },
    }),
  );
  const organizationId = user.result?.organizationId;
  const organizationFound = Boolean(user.result?.organization);
  const onboardingCompleted = Boolean(user.result?.organization?.onboardedAt);

  const skippedMissingOrg: CheckStatus = {
    status: 'skipped',
    ms: 0,
    message: 'Skipped because organization is missing.',
  };

  const [approvals, auditLogs, integrations] = organizationId
    ? await Promise.all([
        timed('approvals query', () => prisma.approvalRecord.count({ where: { organizationId } })),
        timed('audit logs query', () => prisma.auditLog.count({ where: { organizationId } })),
        timed('integrations query', () => prisma.integration.count({ where: { organizationId } })),
      ])
    : [skippedMissingOrg, skippedMissingOrg, skippedMissingOrg];

  const checks = {
    database: publicStatus(database),
    organization: publicStatus(user),
    approvals: publicStatus(approvals),
    auditLogs: publicStatus(auditLogs),
    integrations: publicStatus(integrations),
  };

  return NextResponse.json({
    auth: { status: authStatus.status, userIdPresent: true, ms: authStatus.ms },
    organizationFound,
    onboardingCompleted,
    checks,
    totalDashboardLoadMs: Date.now() - startedAt,
    slowestOperation: slowestOperation(checks),
  });
}
