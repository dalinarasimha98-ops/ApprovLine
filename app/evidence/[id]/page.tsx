import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  UnifiedEvidenceExperience,
  type UnifiedEvidenceData,
} from '@/components/evidence/UnifiedEvidenceExperience';
import { PendingLink } from '@/components/system/PendingLink';
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

  let record;
  try {
    record = await getUnifiedEvidenceExperience(tenant.organization.id, id, 40);
  } catch (error) {
    console.error('[evidence-detail] fetch failed', error);
    return (
      <DashboardShell>
        <section className="mx-auto grid w-full max-w-3xl gap-4 rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Evidence record</p>
          <h1 className="text-2xl font-black text-slate-950">We could not load this record this time</h1>
          <p className="text-sm leading-6 text-slate-600">The database did not respond in time. This is usually transient - retry in a moment.</p>
          <PendingLink href={`/evidence/${id}`} pendingText="Retrying..." className="inline-flex w-fit rounded-xl bg-[#2155d9] px-5 py-3 text-sm font-black text-white">
            Retry
          </PendingLink>
        </section>
      </DashboardShell>
    );
  }
  if (!record) notFound();

  return (
    <DashboardShell immersive>
      <UnifiedEvidenceExperience
        initialData={serialize(record) as unknown as UnifiedEvidenceData}
      />
    </DashboardShell>
  );
}
