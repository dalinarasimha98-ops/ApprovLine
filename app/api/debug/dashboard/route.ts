import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

export const dynamic = 'force-dynamic';

type CheckResult = {
  status: 'success' | 'fail';
  ms: number;
  message?: string;
  count?: number;
};

async function checkWithResult<T>(label: string, fn: () => Promise<T>): Promise<CheckResult & { result?: T }> {
  const startedAt = Date.now();
  try {
    const result = await withTimeout(label, fn(), 1500);
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

async function check(label: string, fn: () => Promise<unknown>): Promise<CheckResult> {
  const { result: _result, ...status } = await checkWithResult(label, fn);
  return status;
}

export async function GET() {
  const totalStartedAt = Date.now();
  const session = await auth();

  if (!session.userId) {
    return NextResponse.json({
      auth: { status: 'fail', ms: 0, message: 'No Clerk session found.' },
      organization: { status: 'fail', ms: 0, message: 'Skipped because auth failed.' },
      approvals: { status: 'fail', ms: 0, message: 'Skipped because auth failed.' },
      auditLogs: { status: 'fail', ms: 0, message: 'Skipped because auth failed.' },
      integrations: { status: 'fail', ms: 0, message: 'Skipped because auth failed.' },
      databaseMs: null,
      totalLoadMs: Date.now() - totalStartedAt,
    });
  }

  const authCheck: CheckResult = { status: 'success', ms: Date.now() - totalStartedAt };
  const userCheck = await checkWithResult('dashboard user lookup', () =>
    prisma.user.findUnique({
      where: { clerkUserId: session.userId! },
      select: { organizationId: true },
    }),
  );
  const user = userCheck.result;

  if (!user?.organizationId) {
    return NextResponse.json({
      auth: authCheck,
      organization: { status: 'fail', ms: userCheck.ms, message: 'No ApprovLine organization found for this user.' },
      approvals: { status: 'fail', ms: 0, message: 'Skipped because organization is missing.' },
      auditLogs: { status: 'fail', ms: 0, message: 'Skipped because organization is missing.' },
      integrations: { status: 'fail', ms: 0, message: 'Skipped because organization is missing.' },
      databaseMs: userCheck.ms,
      totalLoadMs: Date.now() - totalStartedAt,
    });
  }

  const organizationId = user.organizationId;
  const databaseStartedAt = Date.now();
  const [organization, approvals, auditLogs, integrations] = await Promise.all([
    check('dashboard organization lookup', () =>
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, onboardedAt: true },
      }),
    ),
    check('dashboard approvals count', () => prisma.approvalRecord.count({ where: { organizationId } })),
    check('dashboard audit logs count', () => prisma.auditLog.count({ where: { organizationId } })),
    check('dashboard integrations count', () => prisma.integration.count({ where: { organizationId } })),
  ]);

  return NextResponse.json({
    auth: authCheck,
    organization,
    approvals,
    auditLogs,
    integrations,
    databaseMs: Date.now() - databaseStartedAt,
    totalLoadMs: Date.now() - totalStartedAt,
  });
}
