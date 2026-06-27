import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';

export default async function AuditPage() {
  const { organization } = await getCurrentTenant();
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-2xl font-black">Audit logs</h2>
        <p className="text-slate-600">Immutable activity stream for compliance review.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {logs.map((log) => (
          <div key={log.id} className="grid gap-1 border-b border-slate-100 p-4 last:border-b-0">
            <span className="font-mono text-xs text-[#2155d9]">{log.action}</span>
            <span className="text-sm text-slate-500">{log.createdAt.toISOString()}</span>
          </div>
        ))}
        {logs.length === 0 && <div className="p-10 text-center text-slate-500">No audit logs yet.</div>}
      </div>
    </section>
  );
}
