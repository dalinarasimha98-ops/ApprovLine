import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { RevenuePortfolioClient } from '@/components/founder/RevenuePortfolioClient';
import { getFounderAccess, updateCustomerSeats } from '@/services/founder';
import { buildRevenuePortfolio } from '@/services/founder-revenue';
import { fmtEstimatedArr, fmtCoveragePercent } from '@/lib/founder-revenue';
import type { CustomerAccountStatus } from '@prisma/client';
import type { PlanBucket, RevenueCoverage } from '@/lib/founder-revenue';

export const dynamic = 'force-dynamic';

async function updateSeats(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerSeats(access, formData).catch((error) => {
    console.error('[founder-revenue] seat update failed', error);
  });
  revalidatePath('/founder/revenue');
}

export default async function FounderRevenuePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; plan?: string; status?: string; coverage?: string; page?: string }>;
}) {
  const access = await getFounderAccess();
  const readOnly = !access.ok || access.readOnly;

  const sp = await searchParams;
  const q = sp?.q ?? '';
  const plan = (sp?.plan ?? '') as PlanBucket | '';
  const status = (sp?.status ?? '') as CustomerAccountStatus | '';
  const coverage = (sp?.coverage ?? '') as RevenueCoverage | '';
  const page = Math.max(1, Number(sp?.page ?? '1') || 1);

  const result = await buildRevenuePortfolio({
    q: q || undefined,
    plan: plan || undefined,
    status: status || undefined,
    coverage: coverage || undefined,
    page,
  });
  const data = result.data;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Commercial</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Revenue</h2>
        <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-600">
          Understand ApprovLine&apos;s estimated commercial position, customer contribution, plan mix, and revenue coverage.
        </p>
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-[11px] font-black text-white select-none" aria-hidden="true">
          i
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-800">Revenue data status</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-blue-900">
            ApprovLine currently tracks Founder-entered estimated ARR at the customer-account level. Actual invoices, payments, collections, and recurring billing are not currently available in this Founder Console.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <FounderMetricCard label="Estimated ARR" value={fmtEstimatedArr(data.kpis.estimatedArrTotal || null)} detail="Founder-entered estimate" />
        <FounderMetricCard label="Active Estimated ARR" value={fmtEstimatedArr(data.kpis.activeEstimatedArrTotal || null)} detail="From active accounts" />
        <FounderMetricCard label="Customers with ARR" value={`${data.kpis.customersWithArr} / ${data.kpis.totalCustomers}`} detail="Non-null estimate recorded" />
        <FounderMetricCard label="ARR Coverage" value={fmtCoveragePercent(data.kpis.arrCoveragePercent)} detail={`${data.kpis.customersWithArr} of ${data.kpis.totalCustomers} customers`} />
        <FounderMetricCard label="Business Accounts" value={data.kpis.businessCount} detail={`${fmtEstimatedArr(data.planMix.find((p) => p.bucket === 'BUSINESS')?.estimatedArrTotal || null)} estimated ARR`} />
        <FounderMetricCard label="Enterprise Accounts" value={data.kpis.enterpriseCount} detail={`${fmtEstimatedArr(data.planMix.find((p) => p.bucket === 'ENTERPRISE')?.estimatedArrTotal || null)} estimated ARR`} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Plan Mix</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">Customer distribution and estimated ARR by plan.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {data.planMix.map((entry) => {
            const isLegacy = entry.bucket === 'TRIAL_LEGACY';
            return (
              <div key={entry.bucket} className={`rounded-xl border p-4 ${isLegacy ? 'border-dashed border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
                <p className={`text-sm font-black ${isLegacy ? 'text-slate-500' : 'text-slate-950'}`}>{entry.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{entry.customerCount}</p>
                <p className="text-xs font-semibold text-slate-500">customers</p>
                <p className="mt-2 text-sm font-black text-slate-950">{fmtEstimatedArr(entry.estimatedArrTotal || null)}</p>
                <p className="text-xs font-semibold text-slate-500">estimated ARR</p>
              </div>
            );
          })}
        </div>
      </section>

      <RevenuePortfolioClient
        rows={data.rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }))}
        page={data.page}
        totalPages={data.totalPages}
        totalCustomers={data.totalCustomers}
        hasAnyCustomers={data.hasAnyCustomers}
        filters={{ q, plan, status, coverage }}
        canWrite={!readOnly}
        updateSeatsAction={updateSeats}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Commercial Attention</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">Customers that may need commercial review.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/founder/revenue?coverage=MISSING"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300"
          >
            <div>
              <p className="text-2xl font-black text-amber-800">{data.attention.missingArrCount}</p>
              <p className="text-xs font-bold text-amber-800">Customers without ARR</p>
              <p className="mt-1 text-[11px] font-semibold text-amber-700">Commercial estimate has not been recorded.</p>
            </div>
            <span className="text-amber-600" aria-hidden="true">→</span>
          </Link>
          <Link
            href="/founder/revenue?coverage=MISSING&status=ACTIVE"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 transition hover:border-rose-300"
          >
            <div>
              <p className="text-2xl font-black text-rose-800">{data.attention.activeWithoutArrCount}</p>
              <p className="text-xs font-bold text-rose-800">Active customers without ARR</p>
              <p className="mt-1 text-[11px] font-semibold text-rose-700">Active accounts have no estimated ARR.</p>
            </div>
            <span className="text-rose-600" aria-hidden="true">→</span>
          </Link>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-2xl font-black text-slate-800">{data.attention.inactiveWithArrCount}</p>
            <p className="text-xs font-bold text-slate-800">Inactive account with ARR</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-600">Account retains a recorded ARR estimate but is not active.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
