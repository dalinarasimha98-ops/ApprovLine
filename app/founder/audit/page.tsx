import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { listCustomerAccountOptions, listFounderAuditLogs } from '@/services/founder';

export const dynamic = 'force-dynamic';

export default async function FounderAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const result = await listFounderAuditLogs({
    q: params.q,
    customerAccountId: params.customerAccountId,
    actor: params.actor,
    action: params.action,
    from: params.from,
    to: params.to,
  });
  const customers = await listCustomerAccountOptions();
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Founder Audit</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Internal operations trail</h2>
        <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
          Founder provisioning, feature changes, integration access changes, support notes, and customer status changes are recorded here.
        </p>
      </section>

      <form className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-6">
        <input name="q" defaultValue={params.q ?? ''} placeholder="Search audit trail" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc] lg:col-span-2" />
        <select name="customerAccountId" defaultValue={params.customerAccountId ?? ''} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]">
          <option value="">All customers</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
        </select>
        <input name="actor" defaultValue={params.actor ?? ''} placeholder="Actor email" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]" />
        <input name="action" defaultValue={params.action ?? ''} placeholder="Action" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]" />
        <button className="rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white">Filter</button>
        <input name="from" type="date" defaultValue={params.from ?? ''} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]" />
        <input name="to" type="date" defaultValue={params.to ?? ''} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-[#2557dc]" />
        <a href={`/api/founder/audit/export?${query.toString()}&format=csv`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-700">Export CSV</a>
        <a href={`/api/founder/audit/export?${query.toString()}&format=json`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-700">Export JSON</a>
      </form>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Action</th>
                <th className="px-5 py-4">Actor</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Target</th>
                <th className="px-5 py-4">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.data.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-5 font-black text-slate-950">{log.action}</td>
                  <td className="px-5 py-5 font-semibold text-slate-600">{log.actorEmail ?? 'system'}</td>
                  <td className="px-5 py-5"><FounderBadge tone="blue">{log.actorRole ?? 'SYSTEM'}</FounderBadge></td>
                  <td className="px-5 py-5 font-semibold text-slate-600">{log.targetType}{log.targetId ? ` · ${log.targetId}` : ''}</td>
                  <td className="px-5 py-5 font-semibold text-slate-500">{log.createdAt.toLocaleString()}</td>
                </tr>
              ))}
              {!result.data.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center font-semibold text-slate-500">
                    No founder audit events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
