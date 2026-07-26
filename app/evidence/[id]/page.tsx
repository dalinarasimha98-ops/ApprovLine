import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  UnifiedEvidenceExperience,
  type UnifiedEvidenceData,
} from '@/components/evidence/UnifiedEvidenceExperience';
import { getDashboardTenant } from '@/lib/auth';
import { getUnifiedEvidenceExperience } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

type EvidenceDetailPageProps = {
  params: Promise<{ id: string }>;
};

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default async function EvidenceDetailPage({ params }: EvidenceDetailPageProps) {
  const { id } = await params;
  const tenant = await getDashboardTenant(6000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    redirect('/onboarding');
  }
  if (!tenant.organization) redirect('/dashboard');

  const record = await getUnifiedEvidenceExperience(tenant.organization.id, id, 40);
  if (!record) notFound();

  return (
    <DashboardShell immersive>
      <UnifiedEvidenceExperience
        initialData={serialize(record) as unknown as UnifiedEvidenceData}
      />
    </DashboardShell>
  );
}
