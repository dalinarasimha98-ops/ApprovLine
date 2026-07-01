import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evaluateRecentApprovals, getPlaybookComplianceInsights, seedDemoPlaybooks } from '@/services/playbooks';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });

  const documents = await prisma.playbookDocument.findMany({
    where: { organizationId: tenant.organization.id },
    include: { _count: { select: { chunks: true, rules: true } } },
    orderBy: { uploadedAt: 'desc' },
  });
  const recentQueries = await prisma.playbookQuery.findMany({
    where: { organizationId: tenant.organization.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const insights = await getPlaybookComplianceInsights(tenant.organization.id);

  return NextResponse.json({ documents, recentQueries, insights });
}

export async function POST() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });

  const result = await seedDemoPlaybooks(tenant.organization.id, tenant.user?.id);
  await evaluateRecentApprovals(tenant.organization.id, 50);
  return NextResponse.json(result);
}
