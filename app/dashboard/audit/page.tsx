import { prisma } from '@/lib/prisma';
import { getDashboardTenant } from '@/lib/auth';
import { PendingLink } from '@/components/system/PendingLink';
import { withTimeout } from '@/lib/performance';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Compliance activity</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Audit logs</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Immutable activity stream for compliance review and operational debugging.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loadError ? (
          <div className="border-b border-amber-100 bg-amber-50 p-5 text-amber-900">
            <h3 className="font-black">Unable to load audit logs</h3>
            <p className="mt-1 text-sm">The dashboard stopped waiting so this page can still render safely.</p>
            <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs font-semibold">{loadError}</p>
            <PendingLink href="/dashboard/audit" pendingText="Retrying..." className="mt-3 inline-flex min-h-0 h-10 items-center justify-center rounded-lg bg-[#2155d9] px-3 text-sm font-bold text-white">
              Retry
            </PendingLink>
          </div>
        ) : null}
        {logs.map((log) => (
          <div key={log.id} className="grid gap-1 border-b border-slate-100 p-4 transition hover:bg-slate-50 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
            <span className="font-mono text-xs font-bold uppercase tracking-wide text-[#2155d9]">{log.action}</span>
            <span className="text-sm font-semibold text-slate-500">{log.createdAt.toISOString()}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="p-10 text-center">
            <h3 className="text-lg font-black text-slate-950">No audit logs yet</h3>
            <p className="mt-2 text-sm text-slate-500">Events will appear here as onboarding, integrations, and approval ingestion run.</p>
          </div>
        )}
      </div>
    </section>
  );
}
