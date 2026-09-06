import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { isFounderIdentity } from '@/lib/founder-identity';
import { MigrationNotice } from '@/components/founder/FounderShell';
import { CustomersTableClient, FilterBar } from '@/components/founder/CustomersTableClient';
import { getFounderAccess, listFounderCustomers, updateCustomerStatus, type FounderAccess, type CustomerListResult } from '@/services/founder';

export const dynamic = 'force-dynamic';

const TAKE = 25;

async function updateStatus(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return;
  await updateCustomerStatus(access, String(formData.get('customerId')), String(formData.get('status')));
  revalidatePath('/founder/customers');
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums tracking-tight text-slate-950">{value}</p>
      {sub ? <p className="mt-1 text-xs font-semibold text-slate-400">{sub}</p> : null}
    </article>
  );
}

function Pagination({
  page,
  total,
  take,
  q,
  status,
  plan,
  health,
}: {
  page: number;
  total: number;
  take: number;
  q?: string;
  status?: string;
  plan?: string;
  health?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / take));
  const from = Math.min((page - 1) * take + 1, total);
  const to = Math.min(page * take, total);

  function href(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (plan) params.set('plan', plan);
    if (health) params.set('health', health);
    params.set('page', String(p));
    return `/founder/customers?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
      <p className="font-semibold text-slate-500">
        {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total} customer${total === 1 ? '' : 's'}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {page > 1 ? (
            <Link href={href(page - 1)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
              Previous
            </Link>
          ) : (
            <span className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-300 cursor-not-allowed">Previous</span>
          )}
          <span className="px-3 py-1.5 text-xs font-black text-slate-500">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={href(page + 1)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
              Next
            </Link>
          ) : (
            <span className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-300 cursor-not-allowed">Next</span>
          )}
        </div>
      )}
    </div>
  );
}

export default async function FounderCustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; plan?: string; health?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!isFounderIdentity(session.userId, email)) redirect('/');

  const params = await searchParams;
  const q = params?.q?.trim() || undefined;
  const status = params?.status || undefined;
  const plan = params?.plan || undefined;
  const health = params?.health || undefined;
  const page = Math.max(1, parseInt(params?.page ?? '1') || 1);

  const [access, result] = await Promise.all([
    getFounderAccess().catch((): FounderAccess => ({ ok: false, reason: 'forbidden' })),
    listFounderCustomers({ query: q, status, planTier: plan, healthStatus: health, page, take: TAKE }).catch(
      (): { data: CustomerListResult; migrationRequired: boolean; safeError?: string } => ({
        migrationRequired: false,
        data: { customers: [], total: 0, summary: { total: 0, active: 0, atRisk: 0, trial: 0 } },
      })
    ),
  ]);

  const summary = result.data.summary;
  const isFiltered = !!(q || status || plan || health);

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      {/* Header */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2557dc]">Customer Portfolio</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">All Customers</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Search, filter, review health, manage lifecycle status, and open Customer 360 profiles.
            </p>
          </div>
          <Link
            href="/founder/provision"
            className="shrink-0 self-start rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white"
          >
            Provision customer
          </Link>
        </div>

        {/* KPI strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total Customers" value={summary.total} />
          <KpiCard label="Active" value={summary.active} sub="Status: ACTIVE" />
          <KpiCard label="Elevated Risk" value={summary.atRisk} sub="Customers with at-risk or critical health" />
          <KpiCard label="Trial" value={summary.trial} sub="Status: TRIAL" />
        </div>
      </section>

      {/* Table */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Filter bar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <FilterBar q={q} status={status} plan={plan} health={health} />
          {isFiltered && (
            <p className="text-xs font-semibold text-slate-400 shrink-0">
              {result.data.total} result{result.data.total === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {/* Table */}
        <CustomersTableClient
          customers={result.data.customers}
          readOnly={!access.ok || access.readOnly}
          updateStatusAction={updateStatus}
        />

        {/* Pagination */}
        <div className="border-t border-slate-100">
          <Pagination
            page={page}
            total={result.data.total}
            take={TAKE}
            q={q}
            status={status}
            plan={plan}
            health={health}
          />
        </div>
      </section>
    </div>
  );
}
