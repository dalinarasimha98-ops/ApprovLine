import { prisma } from '@/lib/prisma';
import { getDashboardTenant } from '@/lib/auth';
import { PendingLink } from '@/components/system/PendingLink';
import { withTimeout } from '@/lib/performance';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

function badgeClass(action: string) {
  if (action.includes('error') || action.includes('failed')) return 'bg-rose-50 text-rose-700 border-rose-100';
  if (action.includes('demo')) return 'bg-blue-50 text-[#2155d9] border-blue-100';
  if (action.includes('connected') || action.includes('created')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default async function AuditPage() {
  const startedAt = Date.now();
  console.info('[dashboard] audit page start load');
  const tenant = await getDashboardTenant(1500);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  let logs: Awaited<ReturnType<typeof prisma.auditLog.findMany>> = [];
  let loadError: string | null = null;

  try {
    if (!tenant.organization) throw new Error(tenant.error ?? 'Workspace unavailable.');
    console.info('[dashboard] audit logs query start');
    logs = await withTimeout(
      'dashboard audit logs query',
      prisma.auditLog.findMany({
        where: { organizationId: tenant.organization.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      1500,
    );
    console.info(`[dashboard] audit logs query finished in ${Date.now() - startedAt}ms`);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load audit logs.';
    console.error(`[dashboard] audit logs query failed after ${Date.now() - startedAt}ms`, error);
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Compliance activity</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Audit logs</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Chronological, immutable activity stream for compliance review and operational debugging.</p>
        </div>
        <PendingLink href="/api/export/approvals?format=csv" pendingText="Preparing export..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
          Export evidence
        </PendingLink>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {loadError ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-amber-900">
            <h3 className="font-black">Unable to load audit logs</h3>
            <p className="mt-1 text-sm">The dashboard stopped waiting so this page can still render safely.</p>
            <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs font-semibold">{loadError}</p>
            <PendingLink href="/dashboard/audit" pendingText="Retrying..." className="mt-3 inline-flex min-h-0 h-10 items-center justify-center rounded-lg bg-[#2155d9] px-3 text-sm font-bold text-white">
              Retry
            </PendingLink>
          </div>
        ) : null}
        {logs.map((log) => (
          <div key={log.id} className="grid gap-3 rounded-xl p-4 transition hover:bg-slate-50 sm:grid-cols-[auto_1fr_auto] sm:items-start">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#2155d9] shadow-[0_0_0_4px_rgba(33,85,217,0.12)]" />
            <div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${badgeClass(log.action)}`}>{log.action}</span>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {log.actorUserId ? `Actor: ${log.actorUserId}` : 'System event'} {log.approvalRecordId ? `· Approval ${log.approvalRecordId.slice(0, 8)}` : ''}
              </p>
              {log.metadata ? <p className="mt-1 text-xs text-slate-500">Metadata captured for audit review</p> : null}
            </div>
            <span className="text-sm font-semibold text-slate-500">{log.createdAt.toLocaleString()}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="p-10 text-center">
            <h3 className="text-lg font-black text-slate-950">No audit logs yet</h3>
            <p className="mt-2 text-sm text-slate-500">Events will appear here as onboarding, integrations, and approval ingestion run.</p>
            <form action="/api/demo/seed" method="post" className="mt-5">
              <button className="rounded-lg bg-[#2155d9] px-4 py-2 text-sm font-black text-white shadow-sm shadow-blue-200">Generate demo data</button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
