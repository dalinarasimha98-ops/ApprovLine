import type { ApprovalRecord } from '@prisma/client';

export function ApprovalTable({ approvals }: { approvals: ApprovalRecord[] }) {
  if (approvals.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500">
        No approvals found for the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
            <tr key={approval.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-semibold text-slate-950">{approval.subject}</td>
              <td className="px-4 py-3 text-slate-600">
                {approval.approverName ?? 'Unknown'}
                {approval.approverEmail ? <div className="text-xs text-slate-400">{approval.approverEmail}</div> : null}
              </td>
              <td className="px-4 py-3 text-slate-600">{approval.department ?? 'Unassigned'}</td>
              <td className="px-4 py-3 text-slate-600">{approval.category ?? 'Unassigned'}</td>
              <td className="px-4 py-3 text-slate-600">{approval.riskLevel ?? 'low'}</td>
              <td className="px-4 py-3 text-slate-600">{approval.sourcePlatform ?? 'unknown'}</td>
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
  );
}
