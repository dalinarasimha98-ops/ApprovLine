import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { isMigrationError } from '@/lib/prisma-errors';
import { getInvestigationMetrics } from '@/services/investigations';
import { enforcePageRole } from '@/lib/rbac';
import { InvestigationCenter } from '@/components/investigations/InvestigationCenter';

export const dynamic = 'force-dynamic';

type InvestigationsPageProps = {
  searchParams: Promise<{
    q?: string;
    department?: string;
    source?: string;
    risk?: string;
    approvalId?: string;
    setup?: string;
  }>;
};

function contains(value?: string): Prisma.StringFilter | undefined {
  return value ? { contains: value, mode: 'insensitive' as const } : undefined;
}

export default async function InvestigationsPage({ searchParams }: InvestigationsPageProps) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/dashboard');
  enforcePageRole('/investigations', tenant.user.role);

  const filters = await searchParams;
  const orgId = tenant.organization.id;

  const caseWhere: Prisma.InvestigationCaseWhereInput = {
    organizationId: orgId,
    ...(filters.department ? { department: contains(filters.department) } : {}),
    ...(filters.risk ? { riskLevel: filters.risk.toLowerCase() } : {}),
    ...(filters.q
      ? {
          OR: [
            { title: contains(filters.q) },
            { summary: contains(filters.q) },
            { department: contains(filters.q) },
            { approvals: { some: { approvalRecord: { subject: contains(filters.q) } } } },
            { approvals: { some: { approvalRecord: { approverName: contains(filters.q) } } } },
            { approvals: { some: { approvalRecord: { sourcePlatform: contains(filters.q) } } } },
          ],
        }
      : {}),
  };

  const approvalWhere: Prisma.ApprovalRecordWhereInput = {
    organizationId: orgId,
    OR: [
      ...(filters.approvalId ? [{ id: filters.approvalId }] : []),
      { riskLevel: 'high' },
      { riskLevel: 'critical' },
      { approvalType: 'CONDITIONAL' },
      { status: 'PENDING_REVIEW' },
      { evidenceSnippet: null },
      { sourceLink: null },
    ],
    ...(filters.department ? { department: contains(filters.department) } : {}),
    ...(filters.source ? { sourcePlatform: contains(filters.source) } : {}),
    ...(filters.risk ? { riskLevel: filters.risk.toLowerCase() } : {}),
  };

  const [metrics, investigationsResult, riskyApprovals, users] = await Promise.all([
    withTimeout('investigation metrics', getInvestigationMetrics(orgId), 1200).catch(() => ({
      openInvestigations: 0,
      closedInvestigations: 0,
      highRiskApprovals: 0,
      missingApprovals: 0,
      conditionalApprovals: 0,
      approvalsWithoutEvidence: 0,
    })),
    withTimeout(
      'investigation cases',
      prisma.investigationCase.findMany({
        where: caseWhere,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          approvals: {
            include: {
              approvalRecord: {
                select: {
                  id: true,
                  subject: true,
                  approverName: true,
                  department: true,
                  riskLevel: true,
                  status: true,
                  confidence: true,
                  occurredAt: true,
                  sourcePlatform: true,
                },
              },
            },
            take: 4,
          },
          notes: { take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
      3000,
    )
      .then((cases) => ({ cases, error: null as string | null, total: cases.length }))
      .catch((error) => ({
        cases: [],
        total: 0,
        error: error instanceof Error ? error.message : 'Investigation database tables are not ready.',
      })),
    withTimeout(
      'investigation risky approvals',
      prisma.approvalRecord.findMany({
        where: approvalWhere,
        select: {
          id: true,
          subject: true,
          department: true,
          approverName: true,
          sourcePlatform: true,
          riskLevel: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: 12,
      }),
      1400,
    ).catch(() => []),
    withTimeout(
      'investigation users',
      prisma.user.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, email: true },
        take: 50,
      }),
      800,
    ).catch(() => []),
  ]);

  const setupWarning = filters.setup === 'required' || isMigrationError(investigationsResult.error);
  const migrationReady = !setupWarning;

  // Normalize dates to strings for client components
  const initialCases = investigationsResult.cases.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    approvals: c.approvals.map((a) => ({
      ...a,
      approvalRecord: {
        ...a.approvalRecord,
        occurredAt: a.approvalRecord.occurredAt?.toISOString() ?? null,
      },
    })),
    notes: c.notes.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
  }));

  const normalizedRiskyApprovals = riskyApprovals.map((a) => ({
    ...a,
    occurredAt: a.occurredAt?.toISOString() ?? null,
  }));

  const normalizedMetrics = {
    totalInvestigations: (metrics.openInvestigations ?? 0) + (metrics.closedInvestigations ?? 0),
    highRiskInvestigations: metrics.highRiskApprovals ?? 0,
    inProgressInvestigations: 0,
    resolvedInvestigations: metrics.closedInvestigations ?? 0,
    openInvestigations: metrics.openInvestigations ?? 0,
    closedInvestigations: metrics.closedInvestigations ?? 0,
    escalatedInvestigations: 0,
    avgResolutionDays: 0,
  };

  return (
    <DashboardShell>
      <InvestigationCenter
        initialCases={initialCases}
        initialTotal={investigationsResult.total}
        metrics={normalizedMetrics}
        users={users}
        currentUserId={tenant.user.id}
        canSeedDemo={migrationReady}
        migrationReady={migrationReady}
        riskyApprovals={normalizedRiskyApprovals}
      />
    </DashboardShell>
  );
}
