import { revalidatePath } from 'next/cache';
import { founderFeatures, getFounderAccess, updateCustomerFeatureFlag, resetCustomerFeatureOverride } from '@/services/founder';
import { buildFeatureManagementPortfolio } from '@/services/founder-features';
import { MigrationNotice } from '@/components/founder/FounderShell';
import { FeatureManagementClient, type MutationResult } from '@/components/founder/FeatureManagementClient';

export const dynamic = 'force-dynamic';

// Every mutation independently re-checks Founder access and read-only mode
// server-side — the UI disables controls for a read-only Founder, but that
// is a convenience, never the actual gate (see CLAUDE.md / Section 14: never
// rely only on disabled buttons).
async function setFeatureOverride(input: { customerAccountId: string; key: string; enabled: boolean }): Promise<MutationResult> {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return { ok: false, error: 'Not authorized.' };
  if (access.readOnly) return { ok: false, error: 'Read-only Founder access cannot change feature overrides.' };
  const formData = new FormData();
  formData.set('customerAccountId', input.customerAccountId);
  formData.set('key', input.key);
  if (input.enabled) formData.set('enabled', 'on');
  try {
    await updateCustomerFeatureFlag(access, formData);
    revalidatePath('/founder/features');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to update feature access.' };
  }
}

async function resetFeatureOverride(input: { customerAccountId: string; key: string }): Promise<MutationResult> {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return { ok: false, error: 'Not authorized.' };
  if (access.readOnly) return { ok: false, error: 'Read-only Founder access cannot change feature overrides.' };
  const formData = new FormData();
  formData.set('customerAccountId', input.customerAccountId);
  formData.set('key', input.key);
  try {
    await resetCustomerFeatureOverride(access, formData);
    revalidatePath('/founder/features');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to reset feature override.' };
  }
}

export default async function FounderFeaturesPage() {
  const access = await getFounderAccess();
  const canManage = access.ok && !access.readOnly;

  const result = await buildFeatureManagementPortfolio();
  const data = result.data;
  // Categories are read directly off the real catalog (no .slice/.filter
  // applied to founderFeatures itself — the full catalog always renders).
  const categoryCount = new Set(founderFeatures.map((feature) => feature.category)).size;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Product Control</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Feature Management</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Control customer feature access, review plan entitlements, and manage Founder overrides.
            </p>
          </div>
        </div>
      </section>

      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Total Feature Gates</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{founderFeatures.length}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{categoryCount} categories · Founder-controlled modules</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Plan Entitlements</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{data.entitlementBackedCount}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">of {founderFeatures.length} features have a plan-tier policy</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Active Overrides</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{data.totalOverrides}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Real CustomerFeatureFlag records</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Customers Managed</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{data.totalCustomers}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{data.totalCustomers ? 'Provisioned customer accounts' : 'Provision customers first'}</p>
        </article>
      </section>

      <FeatureManagementClient
        features={data.features}
        canManage={canManage}
        onSetOverride={setFeatureOverride}
        onResetOverride={resetFeatureOverride}
        exportHref={canManage ? '/api/founder/features/export' : null}
      />
    </div>
  );
}
