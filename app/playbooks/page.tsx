import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PlaybookClient } from '@/components/playbooks/PlaybookClient';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { getPlaybookComplianceInsights } from '@/services/playbooks';
import { enforcePageRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (tenant.user) enforcePageRole('/playbooks', tenant.user.role);

  const documents = tenant.organization
    ? await withTimeout(
        'playbooks documents',
        prisma.playbookDocument.findMany({
          where: { organizationId: tenant.organization.id },
          include: { _count: { select: { chunks: true, rules: true } } },
          orderBy: { uploadedAt: 'desc' },
        }),
        2500,
      ).catch(() => [])
    : [];

  const insights = tenant.organization
    ? await withTimeout(
        'playbooks compliance insights',
        getPlaybookComplianceInsights(tenant.organization.id),
        2500,
      ).catch(() => null)
    : null;

  const recentQueries = tenant.organization
    ? await withTimeout(
        'playbooks recent queries',
        prisma.playbookQuery.findMany({
          where: { organizationId: tenant.organization.id },
          select: {
            id: true,
            question: true,
            answer: true,
            confidence: true,
            createdAt: true,
            actorUserId: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        2500,
      ).catch(() => [])
    : [];

  const canManage = tenant.user?.role === 'OWNER' || tenant.user?.role === 'ADMIN';

  return (
    <DashboardShell>
      <PlaybookClient
        initialDocuments={documents}
        initialQueries={recentQueries}
        initialInsights={insights}
        currentUserId={tenant.user?.id ?? null}
        canManage={canManage}
      />
    </DashboardShell>
  );
}
