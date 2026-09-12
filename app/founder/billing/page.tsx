import { revalidatePath } from 'next/cache';
import { FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { BillingPortfolioClient } from '@/components/founder/BillingPortfolioClient';
import { getFounderAccess, updateCustomerSeats } from '@/services/founder';
import { buildBillingPortfolio } from '@/services/founder-billing';
import { fmtEstimatedArr } from '@/lib/founder-billing';
import type { CustomerAccountStatus } from '@prisma/client';
import type { PlanBucket } from '@/lib/founder-billing';

export const dynamic = 'force-dynamic';

async function updateSeats(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerSeats(access, formData).catch((error) => {
    console.error('[founder-billing] seat update failed', error);
  });
  revalidatePath('/founder/billing');
}

export default async function FounderBillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; plan?: string; status?: string; page?: string }>;
}) {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;

  const sp = await searchParams;
  const q = sp?.q ?? '';
  const plan = (sp?.plan ?? '') as PlanBucket | '';
  const status = (sp?.status ?? '') as CustomerAccountStatus | '';
  const page = Math.max(1, Number(sp?.page ?? '1') || 1);

  const result = await buildBillingPortfolio({
    q: q || undefined,
    plan: plan || undefined,
    status: status || undefined,
    page,
  });
  const data = result.data;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Commercial</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Plans & Billing</h2>
        <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
          Manage customer plans, commercial status, seat allocations, and Founder-entered ARR estimates.
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-400">
          ApprovLine does not process payments, generate invoices, or collect revenue in this console. Estimated ARR is a Founder-entered planning figure, not actual or recognized revenue.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <FounderMetricCard label="Total Customers" value={data.kpis.totalCustomers} detail="All provisioned customer accounts" />
        <FounderMetricCard label="Business" value={data.kpis.businessCount} detail="Business (STARTER) plan customers" />
        <FounderMetricCard label="Enterprise" value={data.kpis.enterpriseCount} detail="Enterprise plan customers" />
        <FounderMetricCard label="Active Accounts" value={data.kpis.activeCount} detail="Account status: Active" />
        <FounderMetricCard label="Purchased Seats" value={data.kpis.purchasedSeatsTotal} detail="Aggregate across all customers" />
        {/* `|| null` reads a 0 total as "nothing set" rather than "$0": safe
            because provisioning rejects estimatedArrUsd <= 0 (services/founder.ts),
            so the only way this sum is exactly 0 is that no customer has a
            value at all. */}
        <FounderMetricCard label="Estimated ARR" value={fmtEstimatedArr(data.kpis.estimatedArrTotal || null)} detail="Sum of Founder-entered estimates only" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Plan Distribution</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {data.planDistribution.map((bucket) => {
            const isLegacy = bucket.bucket === 'TRIAL_LEGACY';
            return (
              <div
                key={bucket.bucket}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${
                  isLegacy ? 'border-dashed border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <span className={`text-sm font-black ${isLegacy ? 'text-slate-500' : 'text-slate-950'}`}>{bucket.label}</span>
                <span className="text-sm font-bold tabular-nums text-slate-500">{bucket.count}</span>
                {isLegacy ? <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Internal</span> : null}
              </div>
            );
          })}
        </div>
      </section>

      <BillingPortfolioClient
        rows={data.rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }))}
        page={data.page}
        totalPages={data.totalPages}
        totalCustomers={data.totalCustomers}
        hasAnyCustomers={data.hasAnyCustomers}
        filters={{ q, plan, status }}
        canWrite={!readOnly}
        updateSeatsAction={updateSeats}
      />
    </div>
  );
}
