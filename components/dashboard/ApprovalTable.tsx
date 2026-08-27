import { PendingLink } from '@/components/system/PendingLink';

export type ApprovalTableRecord = {
  id: string;
  subject: string;
  sourceLink: string | null;
  reasoning: string;
  conditions: string | null;
  businessImpact: string | null;
  evidenceSnippet: string | null;
  approverName: string | null;
  approverEmail: string | null;
  department: string | null;
  category: string | null;
  riskLevel: string | null;
  sourcePlatform: string | null;
  confidence: number;
  status: string;
  createdAt: Date;
  /** UnifiedEvidenceRecord.id when this approval has one linked via
   *  primaryApprovalId, null otherwise - drives whether the "View Evidence"
   *  link renders at all (never a broken link). */
  evidenceRecordId: string | null;
};

function riskClass(risk?: string | null) {
  if (risk === 'high') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (risk === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
}

function statusClass(status: string) {
  if (status === 'REJECTED') return 'bg-rose-500/10 text-rose-400';
  if (status === 'PENDING_REVIEW') return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

export function ApprovalTable({ approvals }: { approvals: ApprovalTableRecord[] }) {
  if (approvals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#1E2D4A] bg-[#0E1830] p-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-violet-500/10 text-violet-400">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
            <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="1.8" />
            <path d="m9 12 2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-black text-[#E8EEFF]">No approvals yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B7FA8]">
          Connect Slack or Gmail, run demo ingestion, or adjust the filters to reveal captured approval records.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1E2D4A] bg-[#0E1830]">
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
          <thead className="bg-[#0a1524] text-xs uppercase tracking-wide text-[#6B7FA8]">
            <tr>
              <th className="px-4 py-3 font-semibold">Decision</th>
              <th className="px-4 py-3 font-semibold">Approver</th>
              <th className="px-4 py-3 font-semibold">Department</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Risk</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Confidence</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
              <th className="px-4 py-3 font-semibold">Details</th>
              <th className="px-4 py-3 font-semibold">Unified Evidence</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((approval) => (
              <tr key={approval.id} className="border-t border-[#1E2D4A] align-top transition hover:bg-[#152040]">
                <td className="max-w-[300px] px-4 py-4">
                  <details>
                    <summary className="cursor-pointer list-none font-bold text-[#E8EEFF]">
                      {approval.subject}
                      {approval.sourceLink?.includes('demo') || approval.sourceLink?.includes('TDEMO') ? (
                        <span className="ml-2 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-400">Demo</span>
                      ) : null}
                      <span className="ml-2 text-xs font-semibold text-violet-400">Details</span>
                    </summary>
                    <div className="mt-3 rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-3 text-xs leading-5 text-[#6B7FA8]">
                      <p><b className="text-[#E8EEFF]">Reasoning:</b> {approval.reasoning}</p>
                      {approval.conditions ? <p className="mt-2"><b className="text-[#E8EEFF]">Conditions:</b> {approval.conditions}</p> : null}
                      {approval.businessImpact ? <p className="mt-2"><b className="text-[#E8EEFF]">Business impact:</b> {approval.businessImpact}</p> : null}
                      {approval.evidenceSnippet ? <p className="mt-2"><b className="text-[#E8EEFF]">Evidence:</b> &ldquo;{approval.evidenceSnippet}&rdquo;</p> : null}
                    </div>
                  </details>
                </td>
                <td className="px-4 py-3 text-[#A8BAD8]">
                  {approval.approverName ?? 'Unknown'}
                  {approval.approverEmail ? <div className="text-xs text-[#3D5070]">{approval.approverEmail}</div> : null}
                </td>
                <td className="px-4 py-3 text-[#A8BAD8]">{approval.department ?? 'Unassigned'}</td>
                <td className="px-4 py-3 text-[#A8BAD8]">{approval.category ?? 'Unassigned'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${riskClass(approval.riskLevel)}`}>
                    {approval.riskLevel ?? 'low'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold capitalize text-blue-400">
                    {approval.sourcePlatform ?? 'unknown'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 font-mono text-xs font-bold text-violet-400 tabular-nums">
                    {approval.confidence}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(approval.status)}`}>
                    {approval.status.replaceAll('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#3D5070] tabular-nums">{approval.createdAt.toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <PendingLink href={`/approvals/${approval.id}/source`} pendingText="Opening..." className="text-xs font-bold text-violet-400 hover:text-violet-300 hover:underline">
                    Open source
                  </PendingLink>
                </td>
                <td className="px-4 py-3">
                  <PendingLink href={`/approvals/${approval.id}`} pendingText="Opening..." className="text-xs font-bold text-violet-400 hover:text-violet-300 hover:underline">
                    View Full Approval
                  </PendingLink>
                </td>
                <td className="px-4 py-3">
                  {approval.evidenceRecordId ? (
                    <PendingLink href={`/evidence/${approval.evidenceRecordId}`} pendingText="Opening..." className="text-xs font-bold text-violet-400 hover:text-violet-300 hover:underline">
                      View Evidence →
                    </PendingLink>
                  ) : (
                    <span className="text-xs font-semibold text-[#3D5070]">Not correlated</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
