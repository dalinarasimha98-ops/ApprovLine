import { redirect } from 'next/navigation';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { PendingLink } from '@/components/system/PendingLink';
import { RefreshButton } from '@/components/system/RefreshButton';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { getAuditLogHistory } from '@/services/audit';

export const dynamic = 'force-dynamic';

type AuditPageProps = {
  searchParams: Promise<{ cursor?: string }>;
};

function minutesAgo(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes === 0) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

function badgeClass(action: string) {
  if (action.includes('error') || action.includes('failed')) return 'bg-rose-50 text-rose-700 border-rose-100';
  if (action.includes('demo')) return 'bg-blue-50 text-[#2155d9] border-blue-100';
  if (action.includes('connected') || action.includes('created')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default async function AuditLogPage({ searchParams }: AuditPageProps) {
  const tenant = await getDashboardTenant(3000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  enforcePageRole('/dashboard/audit-log', tenant.user?.role ?? 'VIEWER');

  const params = await searchParams;
  const result = await getAuditLogHistory(tenant.organization.id, params.cursor);

  return (
    <section className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Compliance activity</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Audit Logs</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Chronological, immutable activity stream for compliance review and operational debugging.</p>
        </div>
        <PendingLink href="/api/export/approvals?format=csv" pendingText="Preparing export..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
          Export evidence
        </PendingLink>
      </div>

      {result.message ? (
        <div className={result.alert ? 'rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm' : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm'}>
          {result.alert ? <AutoRetryOnDegraded /> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={result.alert ? 'text-sm font-black text-amber-950' : 'text-sm font-black text-slate-950'}>
                {result.alert ? 'Audit history is recovering' : 'Refreshing...'}
              </p>
              <p className="mt-1 text-sm leading-6">{result.message}</p>
            </div>
            <RefreshButton className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-70" />
          </div>
        </div>
      ) : null}
      {!result.message && result.staleAsOfMs ? (
        <p className="-mt-2 text-xs font-bold text-slate-400">Last updated {minutesAgo(result.staleAsOfMs)}.</p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {result.logs.map((log) => (
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
        {result.logs.length === 0 && !result.message ? (
          <div className="p-10 text-center">
            <h3 className="text-lg font-black text-slate-950">No audit logs yet</h3>
            <p className="mt-2 text-sm text-slate-500">Events will appear here as onboarding, integrations, and approval ingestion run.</p>
            <form action="/api/demo/seed" method="post" className="mt-5">
              <button className="rounded-lg bg-[#2155d9] px-4 py-2 text-sm font-black text-white shadow-sm shadow-blue-200">Generate demo data</button>
            </form>
          </div>
        ) : null}
      </div>

      {result.nextCursor ? (
        <div className="flex justify-center">
          <PendingLink
            href={`/dashboard/audit-log?cursor=${result.nextCursor}`}
            pendingText="Loading older logs..."
            className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Load older logs
          </PendingLink>
        </div>
      ) : null}
    </section>
  );
}
