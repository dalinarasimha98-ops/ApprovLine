import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { CopilotClient } from '@/components/copilot/CopilotClient';
import { copilotSuggestions } from '@/services/copilot/copilot';
import { PendingLink } from '@/components/system/PendingLink';

export const dynamic = 'force-dynamic';

const COPILOT_TENANT_TIMEOUT_MS = 8000;

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const tenant = await getDashboardTenant(COPILOT_TENANT_TIMEOUT_MS);
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    redirect('/onboarding');
  }

  const params = await searchParams;

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-[radial-gradient(circle_at_top_right,_rgba(33,85,217,0.16),_transparent_32%),linear-gradient(135deg,#07111f,#0b1730)] p-6 text-white sm:p-8 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-200">AI Copilot</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl">
              Enterprise decision intelligence, searchable in plain English.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
              Ask about approvals, policies, risks, investigations, vendors, departments, meetings, documents, and audit trails. Every answer includes evidence, citations, confidence, and next actions.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-blue-200">Trusted context</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {[
                ['Approvals', 'Evidence'],
                ['Playbooks', 'Policy'],
                ['Audits', 'Timeline'],
                ['ROI', 'Insights'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
                  <p className="text-lg font-black text-white">{label}</p>
                  <p className="text-xs font-semibold text-slate-400">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tenant.status !== 'ready' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <h2 className="font-black">Workspace context is delayed</h2>
          <p className="mt-1 text-sm leading-6">
            Copilot can open, but answers may be limited until workspace readiness completes. {tenant.error ?? 'Workspace lookup is still warming up.'}
          </p>
          <PendingLink href="/api/debug/dashboard" pendingText="Opening diagnostics..." className="mt-3 inline-flex min-h-0 h-10 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-black text-amber-900">
            Open diagnostics
          </PendingLink>
        </div>
      ) : null}

      <CopilotClient suggestions={copilotSuggestions()} initialQuestion={params.q} />
    </section>
  );
}
