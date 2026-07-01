import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PlaybookClient } from '@/components/playbooks/PlaybookClient';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { getPlaybookComplianceInsights } from '@/services/playbooks';

export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');

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
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        2500,
      ).catch(() => [])
    : [];

  return (
    <DashboardShell>
      <PlaybookClient initialDocuments={documents} initialQueries={recentQueries} initialInsights={insights} />
    </DashboardShell>
  );
}
