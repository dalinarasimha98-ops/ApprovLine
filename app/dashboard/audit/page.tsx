import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const { organization } = await getCurrentTenant();
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <section className="grid gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Compliance activity</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Audit logs</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Immutable activity stream for compliance review and operational debugging.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
