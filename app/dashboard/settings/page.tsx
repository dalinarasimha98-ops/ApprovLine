import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { PendingLink } from '@/components/system/PendingLink';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const tenant = await getDashboardTenant(1500);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');

  const organization = tenant.organization;

  return (
    <section className="grid gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Settings</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Workspace configuration</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Manage organization details, security posture, and connector readiness.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-black text-slate-950">Organization</h3>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Workspace name</dt>
              <dd className="mt-1 text-sm font-bold text-slate-950">{organization?.name ?? 'Unavailable'}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Onboarding</dt>
              <dd className="mt-1 text-sm font-bold text-slate-950">{organization?.onboardedAt ? 'Complete' : 'Incomplete'}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Departments</dt>
              <dd className="mt-1 text-sm font-bold text-slate-950">{organization?.departments.length ?? 0} configured</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Approval categories</dt>
              <dd className="mt-1 text-sm font-bold text-slate-950">{organization?.approvalCategories.length ?? 0} configured</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-black text-slate-950">Quick links</h3>
          <div className="mt-4 grid gap-2">
            <PendingLink href="/dashboard/settings/integrations" pendingText="Opening integrations..." className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Manage integrations
            </PendingLink>
            <PendingLink href="/health" pendingText="Opening health..." className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Service health
            </PendingLink>
            <PendingLink href="/api/debug/dashboard" pendingText="Opening diagnostics..." className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Dashboard diagnostics
            </PendingLink>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Demo mode</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Customer-ready demo workspace</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Generate marked demo approvals, rejections, Slack and Gmail evidence, audit logs, timeline events, confidence scores, and export-ready records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action="/api/demo/seed" method="post">
              <FormSubmitButton pendingText="Generating..." className="inline-flex min-h-0 h-11 items-center gap-2 rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
                Generate Demo Workspace
              </FormSubmitButton>
            </form>
            <form action="/api/demo/reset" method="post">
              <FormSubmitButton pendingText="Resetting..." className="inline-flex min-h-0 h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                Reset Demo Data
              </FormSubmitButton>
            </form>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-blue-200">Security posture</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {['Read-only connectors', 'Encrypted tokens', 'Audit trail', 'GDPR-ready architecture'].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-sm font-bold text-slate-200">
              ✓ {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
