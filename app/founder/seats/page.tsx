import { revalidatePath } from 'next/cache';
import { FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { SeatsPortfolioClient } from '@/components/founder/SeatsPortfolioClient';
import { getFounderAccess, updateCustomerSeats } from '@/services/founder';
import { buildSeatsPortfolio } from '@/services/founder-seats';
import { fmtUtilization } from '@/lib/founder-seats';
import type { CustomerAccountStatus } from '@prisma/client';
import type { PlanBucket, UtilizationBucket } from '@/lib/founder-seats';

export const dynamic = 'force-dynamic';

async function updateSeats(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerSeats(access, formData).catch((error) => {
    console.error('[founder-seats] seat update failed', error);
  });
  revalidatePath('/founder/seats');
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
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Commercial</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Seats & Usage</h2>
        <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
          Monitor customer seat capacity, allocation, utilization, and usage across the ApprovLine customer portfolio.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FounderMetricCard label="Purchased Seats" value={data.kpis.purchasedSeatsTotal} detail="Across customer accounts" />
        <FounderMetricCard label="Allocated Seats" value={data.kpis.allocatedSeatsTotal} detail="Assigned to customer accounts" />
        <FounderMetricCard label="Used Seats" value={data.kpis.usedSeatsTotal} detail="Seats currently in use" />
        <FounderMetricCard label="Utilization" value={fmtUtilization(data.kpis.overallUtilizationPercent)} detail="Used ÷ purchased, portfolio-wide" />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FounderMetricCard label="Near Capacity" value={data.kpis.nearCapacityCount} detail="≥ 80% utilization" />
        <FounderMetricCard label="Over Capacity" value={data.kpis.overCapacityCount} detail="Using more seats than purchased" />
        <FounderMetricCard label="No Usage" value={data.kpis.noUsageCount} detail="0 active users on purchased seats" />
      </section>

      <SeatsPortfolioClient
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
    </div>
  );
}
