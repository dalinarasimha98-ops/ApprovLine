import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FounderBadge, FounderMetricCard } from '@/components/founder/FounderShell';
import {
  deleteFounderDemoWorkspace,
  demoCompanySizes,
  demoIndustries,
  generateFounderDemoWorkspace,
  listFounderDemoWorkspaces,
  type DemoCompanySize,
  type DemoIndustry,
} from '@/services/founderDemoGenerator';
import { getFounderAccess } from '@/services/founder';

export const dynamic = 'force-dynamic';

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/postgresql:\/\/[^ ]+/g, '[database-url-redacted]').slice(0, 220);
}

function parseIndustry(value: FormDataEntryValue | null): DemoIndustry {
  const selected = String(value ?? demoIndustries[0]);
  return demoIndustries.includes(selected as DemoIndustry) ? (selected as DemoIndustry) : demoIndustries[0];
}

function parseCompanySize(value: FormDataEntryValue | null): DemoCompanySize {
  const selected = String(value ?? demoCompanySizes[1]);
  return demoCompanySizes.includes(selected as DemoCompanySize) ? (selected as DemoCompanySize) : demoCompanySizes[1];
}

function expectedApprovals(size: DemoCompanySize) {
  if (size === '100 Employees') return '100+';
  if (size === '500 Employees') return '220+';
  if (size === '1000 Employees') return '340+';
  return '500+';
}

async function generateAction(formData: FormData) {
  'use server';
  const access = await getFounderAccess().catch((error) => {
    console.error('[founder-demo] access check failed', error);
    return null;
  });
  if (!access?.ok || access.readOnly) redirect('/founder/demo-generator?error=forbidden');
  const industry = parseIndustry(formData.get('industry'));
  const companySize = parseCompanySize(formData.get('companySize'));
  const result = await generateFounderDemoWorkspace(access, industry, companySize).catch((error) => {
    console.error('[founder-demo] generation failed', error);
    redirect(`/founder/demo-generator?error=generate_failed&detail=${encodeURIComponent(safeError(error))}`);
  });
  redirect(`/founder/demo-generator?generated=${result.organizationId}`);
}

async function deleteAction(formData: FormData) {
  'use server';
  const access = await getFounderAccess().catch((error) => {
    console.error('[founder-demo] reset access check failed', error);
    return null;
  });
  if (!access?.ok || access.readOnly) redirect('/founder/demo-generator?error=forbidden');
  const organizationId = String(formData.get('organizationId') ?? '');
  await deleteFounderDemoWorkspace(access, organizationId).catch((error) => {
    console.error('[founder-demo] reset failed', error);
    redirect(`/founder/demo-generator?error=reset_failed&detail=${encodeURIComponent(safeError(error))}`);
  });
  redirect('/founder/demo-generator?reset=1');
}

function errorCopy(error?: string) {
  if (error === 'forbidden') return 'Only SUPER_ADMIN and FOUNDER_ADMIN users can generate or reset demo workspaces.';
  if (error === 'generate_failed') return 'Demo workspace generation could not complete safely.';
  if (error === 'reset_failed') return 'Demo workspace reset could not complete safely.';
  return null;
}

export default async function FounderDemoGeneratorPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; detail?: string; generated?: string; reset?: string }>;
}) {
  const [access, params, workspaces] = await Promise.all([
    getFounderAccess().catch((error) => {
      console.error('[founder-demo] page access failed', error);
      return null;
    }),
    searchParams,
    listFounderDemoWorkspaces().catch((error) => {
      console.error('[founder-demo] workspace list failed', error);
      return [];
    }),
  ]);
  const readOnly = !access?.ok || access.readOnly;
  const copy = errorCopy(params?.error);

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-8 bg-[radial-gradient(circle_at_top_right,#dbeafe,transparent_38%),linear-gradient(135deg,#fff,#f8fbff)] p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2557dc]">Demo Workspace Generator</p>
              <FounderBadge tone="blue">Founder only</FounderBadge>
              {readOnly ? <FounderBadge tone="amber">Read only</FounderBadge> : null}
            </div>
            <h2 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-slate-950 lg:text-5xl">
              Generate a full enterprise demo workspace in under a minute.
            </h2>
            <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Create a realistic ApprovLine environment with approvals, vendors, contracts, playbooks, investigations, analytics,
              copilot history, simulated integrations, and memory graph relationships. Every generated workspace is marked as demo data.
            </p>
          </div>
          <div className="rounded-3xl border border-blue-100 bg-white/85 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Dataset preview</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ['Approvals', '100-500'],
                ['Vendors', '20-50'],
                ['Contracts', '20-60'],
                ['Integrations', '8 simulated'],
                ['Playbooks', '5 policies'],
                ['Memory Graph', 'Entity links'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {copy ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-800">
          <p>{copy}</p>
          {params?.detail ? <p className="mt-2 text-xs leading-5">{params.detail}</p> : null}
        </section>
      ) : null}
      {params?.generated ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">
          Demo workspace generated successfully. Open it from the generated workspace list below.
        </section>
      ) : null}
      {params?.reset ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm font-bold text-blue-800">
          Demo workspace deleted. Real customer workspaces were not touched.
        </section>
      ) : null}

      <div className="grid gap-7 xl:grid-cols-[0.9fr_1.1fr]">
        <form action={generateAction} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Generate</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">Choose demo profile</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Regenerating the same industry and size replaces the prior founder demo workspace for that profile.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Industry
              <select name="industry" className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100">
                {demoIndustries.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-black text-slate-700">
              Company size
              <select name="companySize" defaultValue="500 Employees" className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100">
                {demoCompanySizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Generation flow</p>
            <div className="mt-4 grid gap-3">
              {['Create workspace', 'Seed approvals and evidence', 'Build vendors and contracts', 'Create investigations', 'Link memory graph', 'Prepare analytics and copilot history'].map((step, index) => (
                <div key={step} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2557dc] text-xs text-white">{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          </div>

          <button disabled={readOnly} className="mt-6 w-full rounded-xl bg-[#2557dc] px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            Generate Demo Workspace
          </button>
        </form>

        <section className="grid gap-4 md:grid-cols-2">
          {demoCompanySizes.map((size) => (
            <FounderMetricCard
              key={size}
              label={size}
              value={expectedApprovals(size)}
              detail="Approvals plus vendors, contracts, investigations, policy checks, simulated activity, and memory graph records."
            />
          ))}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Generated workspaces</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">Founder demo environments</h3>
          </div>
          <FounderBadge tone="green">{workspaces.length} active</FounderBadge>
        </div>

        <div className="mt-5 grid gap-4">
          {workspaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-lg font-black text-slate-950">No founder demo workspaces yet</p>
              <p className="mt-2 text-sm font-semibold text-slate-600">Generate one above to create a customer-ready story for sales calls, pilots, and investor demos.</p>
            </div>
          ) : (
            workspaces.map((workspace) => (
              <article key={workspace.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xl font-black text-slate-950">{workspace.name}</h4>
                      <FounderBadge tone="blue">{workspace.industry}</FounderBadge>
                      <FounderBadge tone="slate">{workspace.companySize}</FounderBadge>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      {workspace.approvals} approvals · {workspace.integrations} integrations · {workspace.investigations} investigations · {workspace.memoryEntities} memory entities
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">Updated {workspace.updatedAt.toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {workspace.customerAccountId ? (
                      <Link href={`/founder/customers/${workspace.customerAccountId}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
                        Customer profile
                      </Link>
                    ) : null}
                    <Link href="/founder/readiness" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
                      Readiness
                    </Link>
                    <form action={deleteAction}>
                      <input type="hidden" name="organizationId" value={workspace.id} />
                      <button disabled={readOnly} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
                        Delete Demo
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
