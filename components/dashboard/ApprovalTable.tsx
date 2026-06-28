import type { ApprovalRecord } from '@prisma/client';

export function ApprovalTable({ approvals }: { approvals: ApprovalRecord[] }) {
  if (approvals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 p-10 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#2155d9]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
            <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="1.8" />
            <path d="m9 12 2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-black text-slate-950">No approvals yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Connect Slack or Gmail, run demo ingestion, or adjust the filters to reveal captured approval records.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
      <table className="min-w-[980px] w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Approver</th>
            <th className="px-4 py-3">Department</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {approvals.map((approval) => (
            <tr key={approval.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
              <td className="px-4 py-4 font-bold text-slate-950">{approval.subject}</td>
              <td className="px-4 py-3 text-slate-600">
                {approval.approverName ?? 'Unknown'}
                {approval.approverEmail ? <div className="text-xs text-slate-400">{approval.approverEmail}</div> : null}
              </td>
              <td className="px-4 py-3 text-slate-600">{approval.department ?? 'Unassigned'}</td>
              <td className="px-4 py-3 text-slate-600">{approval.category ?? 'Unassigned'}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">{approval.riskLevel ?? 'low'}</span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold capitalize text-[#2155d9]">{approval.sourcePlatform ?? 'unknown'}</span>
              </td>
              <td className="px-4 py-3 font-mono text-[#2155d9]">{approval.confidence}%</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  {approval.status.replaceAll('_', ' ')}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500">{approval.createdAt.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
