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
  if (action.includes('demo')) return 'bg-blue-50 text-al-accent border-blue-100';
  if (action.includes('connected') || action.includes('created')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return 'bg-al-surface-elevated text-al-text-secondary border-al-border';
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
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-al-border bg-white p-6 shadow-sm sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-al-accent">Compliance activity</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-al-text">Audit Logs</h2>
          <p className="mt-2 text-sm leading-6 text-al-text-secondary">Chronological, immutable activity stream for compliance review and operational debugging.</p>
        </div>
        <PendingLink href="/api/export/approvals?format=csv" pendingText="Preparing export..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-al-accent px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
          Export evidence
        </PendingLink>
      </div>

      {result.message ? (
        <div className={result.alert ? 'rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm' : 'rounded-2xl border border-al-border bg-white p-4 text-al-text-secondary shadow-sm'}>
          {result.alert ? <AutoRetryOnDegraded /> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={result.alert ? 'text-sm font-black text-amber-950' : 'text-sm font-black text-al-text'}>
                {result.alert ? 'Audit history is recovering' : 'Refreshing...'}
              </p>
              <p className="mt-1 text-sm leading-6">{result.message}</p>
            </div>
            <RefreshButton className="inline-flex h-10 items-center gap-2 rounded-lg border border-al-border bg-white px-4 text-sm font-bold text-al-text-secondary disabled:opacity-70" />
          </div>
        </div>
      ) : null}
      {!result.message && result.staleAsOfMs ? (
        <p className="-mt-2 text-xs font-bold text-al-text-muted">Last updated {minutesAgo(result.staleAsOfMs)}.</p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-al-border bg-white p-2 shadow-sm">
        {result.logs.map((log) => (
          <div key={log.id} className="grid gap-3 rounded-xl p-4 transition hover:bg-al-surface-sunken sm:grid-cols-[auto_1fr_auto] sm:items-start">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-al-accent shadow-[0_0_0_4px_rgba(33,85,217,0.12)]" />
            <div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${badgeClass(log.action)}`}>{log.action}</span>
              <p className="mt-2 text-sm font-semibold text-al-text-secondary">
                {log.actorUserId ? `Actor: ${log.actorUserId}` : 'System event'} {log.approvalRecordId ? `· Approval ${log.approvalRecordId.slice(0, 8)}` : ''}
              </p>
              {log.metadata ? <p className="mt-1 text-xs text-al-text-muted">Metadata captured for audit review</p> : null}
            </div>
            <span className="text-sm font-semibold text-al-text-muted">{log.createdAt.toLocaleString()}</span>
          </div>
        ))}
        {result.logs.length === 0 && !result.message ? (
          <div className="p-10 text-center">
            <h3 className="text-lg font-black text-al-text">No audit logs yet</h3>
            <p className="mt-2 text-sm text-al-text-muted">Events will appear here as onboarding, integrations, and approval ingestion run.</p>
            <form action="/api/demo/seed" method="post" className="mt-5">
              <button className="rounded-lg bg-al-accent px-4 py-2 text-sm font-black text-white shadow-sm shadow-blue-200">Generate demo data</button>
            </form>
          </div>
        ) : null}
      </div>

      {result.nextCursor ? (
        <div className="flex justify-center">
          <PendingLink
            href={`/dashboard/audit-log?cursor=${result.nextCursor}`}
            pendingText="Loading older logs..."
            className="inline-flex h-11 items-center justify-center rounded-lg border border-al-border bg-white px-5 text-sm font-bold text-al-text-secondary shadow-sm hover:bg-al-surface-sunken"
          >
            Load older logs
          </PendingLink>
        </div>
      ) : null}
    </section>
  );
}
