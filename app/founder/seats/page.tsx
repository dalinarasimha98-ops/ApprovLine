import { revalidatePath } from 'next/cache';
import { MigrationNotice } from '@/components/founder/FounderShell';
import { SeatsPortfolioClient, type SeatsUpdateActionState } from '@/components/founder/SeatsPortfolioClient';
import { getFounderAccess, updateCustomerSeats } from '@/services/founder';
import { buildSeatsPortfolio } from '@/services/founder-seats';
import type { CustomerAccountStatus } from '@prisma/client';
import type { PlanBucket, UtilizationBucket } from '@/lib/founder-seats';

export const dynamic = 'force-dynamic';

async function updateSeats(_prevState: SeatsUpdateActionState, formData: FormData): Promise<SeatsUpdateActionState> {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return { error: 'Founder access denied.' };
  if (access.readOnly) return { error: 'Support admins cannot update seats.' };
  try {
    await updateCustomerSeats(access, formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update seats.' };
  }
  revalidatePath('/founder/seats');
  return { ok: true, message: 'Seats updated.' };
}

export default async function FounderSeatsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; plan?: string; status?: string; utilization?: string; page?: string }>;
}) {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;

  const sp = await searchParams;
  const q = sp?.q ?? '';
  const plan = (sp?.plan ?? '') as PlanBucket | '';
  const status = (sp?.status ?? '') as CustomerAccountStatus | '';
  const utilization = (sp?.utilization ?? '') as UtilizationBucket | '';
  const page = Math.max(1, Number(sp?.page ?? '1') || 1);

  const result = await buildSeatsPortfolio({
    q: q || undefined,
    plan: plan || undefined,
    status: status || undefined,
    utilization: utilization || undefined,
    page,
  });
  const data = result.data;

  return (
    <>
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}
      <SeatsPortfolioClient
        generatedAt={new Date().toISOString()}
        kpis={data.kpis}
        capacityOverview={data.capacityOverview}
        topPressure={data.topPressure}
        recentSeatChanges={data.recentSeatChanges.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
        rows={data.rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
        }))}
        page={data.page}
        totalPages={data.totalPages}
        totalCustomers={data.totalCustomers}
        hasAnyCustomers={data.hasAnyCustomers}
        filters={{ q, plan, status, utilization }}
        canWrite={!readOnly}
        updateSeatsAction={updateSeats}
      />
    </>
  );
}
