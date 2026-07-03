import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDashboardTenant } from '@/lib/auth';
import { withTimeout } from '@/lib/performance';
import { buildGatewayMetrics, seedUniversalGatewayDemo } from '@/services/gateway/universalGateway';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';

export const dynamic = 'force-dynamic';

async function seedGatewayDemoAction() {
  'use server';
  const tenant = await getDashboardTenant(2500);
  if (tenant.status !== 'ready' || !tenant.organization) redirect('/onboarding');
  await seedUniversalGatewayDemo(tenant.organization.id);
  revalidatePath('/dashboard/gateway');
  redirect('/dashboard/gateway?demo=created');
}

export default async function UniversalGatewayPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const tenant = await getDashboardTenant(2500);
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');

  const query = await searchParams;
  const metrics = tenant.organization
    ? await withTimeout('gateway metrics', buildGatewayMetrics(tenant.organization.id), 1800).catch(() => null)
    : null;

  const endpointBase = 'https://approvline.com';
  const cards = [
    ['API traffic', metrics?.apiTraffic ?? 0, 'Direct POST approvals from any enterprise system'],
    ['Webhook traffic', metrics?.webhookTraffic ?? 0, 'SAP, Oracle, Coupa, Workday, Salesforce, HubSpot'],
    ['Imports', metrics?.imports ?? 0, 'Historical approval CSV imports'],
    ['Documents processed', metrics?.documentsProcessed ?? 0, 'Contracts, invoices, SOWs, POs'],
    ['Transcripts processed', metrics?.transcriptsProcessed ?? 0, 'Zoom, Teams, and meeting notes'],
  ] as const;

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-200">Universal Approval Gateway</p>
        <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Ingest approvals from any system</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Send approvals from SAP, Oracle, Coupa, Workday, Salesforce, HubSpot, email forwards, CSV files, documents, and transcripts into the same ApprovLine intelligence pipeline.
            </p>
          </div>
          <form action={seedGatewayDemoAction}>
            <FormSubmitButton pendingText="Generating..." className="min-h-0 h-11 rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-950/30 hover:bg-[#2f66ff]">
              Generate gateway demo
            </FormSubmitButton>
          </form>
        </div>
      </div>

      {query.demo === 'created' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
          <h3 className="font-black">Gateway demo data generated</h3>
          <p className="mt-1 text-sm font-semibold">Sample SAP, Oracle, and Salesforce approvals were routed through classifier, audit, and timeline storage.</p>
        </div>
      ) : null}

      {!metrics ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h3 className="font-black">Gateway metrics are warming up</h3>
          <p className="mt-1 text-sm font-semibold">The gateway stays available even if analytics are delayed. Try refreshing in a moment.</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value, help]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-slate-500">{help}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Endpoints</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">30-minute enterprise onboarding</h2>
          <div className="mt-5 grid gap-3">
            {[
              ['Universal Approval API', 'POST', `${endpointBase}/api/v1/approvals`],
              ['Universal Webhook', 'POST', `${endpointBase}/api/v1/webhooks/approvals`],
              ['CSV Import', 'POST', `${endpointBase}/api/v1/imports/csv`],
              ['Document Intelligence', 'POST', `${endpointBase}/api/v1/documents/intelligence`],
              ['Transcript Intelligence', 'POST', `${endpointBase}/api/v1/transcripts/intelligence`],
            ].map(([name, method, url]) => (
              <div key={name} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{name}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-slate-500">{url}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#2155d9]">{method}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">Tenant email capture</p>
            <p className="mt-1 font-mono text-sm font-bold text-[#2155d9]">{metrics?.gatewayEmail ?? 'approvals+tenant@approvline.ai'}</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">Forward approval emails here to ingest decisions without a native connector.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Unified processing</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Every source uses one audit path</h2>
          <div className="mt-5 grid gap-3">
            {[
              'Approval Classifier',
              'Playbook AI policy evaluation',
              'Risk Engine',
              'Investigation Center',
              'Audit Trail',
              'Executive ROI Dashboard',
            ].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2155d9] text-xs font-black text-white">{index + 1}</span>
                <span className="text-sm font-black text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Recent gateway evidence</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Enterprise approvals captured</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Demo records are marked in metadata</span>
        </div>
        <div className="mt-5 grid gap-3">
          {(metrics?.recentApprovals.length ?? 0) > 0 ? metrics?.recentApprovals.map((approval) => (
            <a key={approval.id} href={`/approvals/${approval.id}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{approval.subject}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{approval.sourcePlatform ?? 'gateway'} · {approval.department ?? 'Unassigned'} · {approval.approverName ?? 'Unknown approver'}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 shadow-sm">{approval.confidence}%</span>
              </div>
            </a>
          )) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
              <p className="font-black text-slate-950">No gateway approvals yet</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Generate demo data or POST the first approval into `/api/v1/approvals`.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
