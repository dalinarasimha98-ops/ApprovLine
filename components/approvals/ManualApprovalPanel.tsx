'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ManualApprovalForm, type ManualApprovalFormValues } from '@/components/approvals/ManualApprovalForm';

type ManualDetail = {
  kind: 'VERBAL' | 'MANUAL';
  approverRole: string;
  communicationChannel: string;
  location: string | null;
  businessContext: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  supportingNotes: string | null;
  verificationStatus: 'PENDING_CONFIRMATION' | 'CONFIRMED_BY_APPROVER' | 'DISPUTED' | 'SUPERSEDED';
  confidenceLevel: number;
  secondPersonRequired: boolean;
  secondVerifierUserId: string | null;
  secondVerifiedAt: string | null;
  secondVerificationNote: string | null;
  recorder: { id: string; name: string | null; email: string };
  secondVerifier: { name: string | null; email: string } | null;
};

type EvidenceAssociation = {
  id: string;
  origin: string;
  status: 'SUGGESTED' | 'CONFIRMED' | 'REJECTED';
  confidence: number;
  matchingReasons: string[];
  sourceTimestamp: string;
  rejectionReason: string | null;
  messageSource: { provider: string; channel: string | null; sender: string | null; senderEmail: string | null; excerpt: string; receivedAt: string };
};

type Version = { id: string; version: number; changeReason: string; createdAt: string; previousValues: unknown; actorUser: { name: string | null; email: string } };
type Confirmation = { id: string; approverEmail: string; decision: string; createdAt: string; respondedAt: string | null; responseNote: string | null; requestedByUser: { name: string | null; email: string } };

const statusTone: Record<string, string> = {
  PENDING_CONFIRMATION: 'border-amber-200 bg-amber-50 text-amber-800',
  CONFIRMED_BY_APPROVER: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DISPUTED: 'border-rose-200 bg-rose-50 text-rose-800',
  SUPERSEDED: 'border-slate-200 bg-slate-100 text-slate-700',
};

function display(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase()); }

export function ManualApprovalPanel({ approval, detail, evidence, versions, confirmations, canManage, currentUserId, currentUserRole }: {
  approval: { id: string; subject: string; status: ManualApprovalFormValues['outcome']; approvalType: ManualApprovalFormValues['approvalType']; approverName: string | null; approverEmail: string | null; approvalTimestamp: string; conditions: string | null; department: string | null; category: string | null };
  detail: ManualDetail;
  evidence: EvidenceAssociation[];
  versions: Version[];
  confirmations: Confirmation[];
  canManage: boolean;
  currentUserId: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmationUrl, setConfirmationUrl] = useState<string | null>(null);
  const initial = useMemo<Partial<ManualApprovalFormValues>>(() => ({
    kind: detail.kind, subject: approval.subject, outcome: approval.status, approvalType: approval.approvalType,
    approverName: approval.approverName ?? '', approverEmail: approval.approverEmail ?? '', approverRole: detail.approverRole,
    approvalTimestamp: approval.approvalTimestamp, communicationChannel: detail.communicationChannel, location: detail.location ?? '',
    businessContext: detail.businessContext, conditions: approval.conditions ?? '', department: approval.department ?? '', category: approval.category ?? '',
    relatedEntityType: detail.relatedEntityType ?? '', relatedEntityId: detail.relatedEntityId ?? '', supportingNotes: detail.supportingNotes ?? '',
    verificationStatus: detail.verificationStatus, confidenceLevel: detail.confidenceLevel, secondPersonRequired: detail.secondPersonRequired,
    secondVerifierUserId: detail.secondVerifierUserId ?? '', changeReason: '',
  }), [approval, detail]);

  async function requestSuggestions() {
    setWorking('suggestions'); setMessage(null);
    const response = await fetch(`/api/approvals/${approval.id}/evidence/suggestions`, { method: 'POST' });
    const payload = await response.json().catch(() => ({}));
    setWorking(null);
    if (!response.ok) return setMessage(payload.error ?? 'Evidence suggestions could not be refreshed.');
    setMessage(`${payload.suggestions?.length ?? 0} potential evidence matches reviewed.`); router.refresh();
  }

  async function reviewEvidence(id: string, status: 'CONFIRMED' | 'REJECTED') {
    const reason = status === 'REJECTED' ? window.prompt('Why is this evidence not related?') : undefined;
    if (status === 'REJECTED' && !reason) return;
    setWorking(id); setMessage(null);
    const response = await fetch(`/api/approvals/${approval.id}/evidence/associations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason }) });
    const payload = await response.json().catch(() => ({})); setWorking(null);
    if (!response.ok) return setMessage(payload.error ?? 'Evidence review could not be saved.');
    setMessage(status === 'CONFIRMED' ? 'Evidence linked and human-verified.' : 'Suggestion rejected and retained in the audit history.'); router.refresh();
  }

  async function createConfirmation() {
    if (!approval.approverEmail) return setMessage('Add the approver email before requesting confirmation.');
    setWorking('confirmation'); setMessage(null);
    const response = await fetch(`/api/approvals/${approval.id}/confirmations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approverEmail: approval.approverEmail, approverName: approval.approverName }) });
    const payload = await response.json().catch(() => ({})); setWorking(null);
    if (!response.ok) return setMessage(payload.error ?? 'Confirmation request could not be created.');
    setConfirmationUrl(new URL(payload.confirmationUrl, window.location.origin).toString());
    setMessage(payload.delivery === 'email'
      ? 'Confirmation request emailed to the approver.'
      : 'Secure confirmation link created. Send it through your approved business channel.');
    router.refresh();
  }

  async function submitSecondVerification(decision: 'VERIFIED' | 'REJECTED') {
    const promptText = decision === 'VERIFIED'
      ? 'Add a verification note describing what you checked.'
      : 'Explain why this record failed second-person verification.';
    const note = window.prompt(promptText);
    if (!note?.trim()) return;
    setWorking('second-verification'); setMessage(null);
    const response = await fetch(`/api/approvals/${approval.id}/second-verification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }),
    });
    const payload = await response.json().catch(() => ({})); setWorking(null);
    if (!response.ok) return setMessage(payload.error ?? 'Second-person verification could not be recorded.');
    setMessage(decision === 'VERIFIED' ? 'Second-person verification recorded.' : 'Verification rejected and the approval marked disputed.');
    router.refresh();
  }

  const elevatedVerifier = currentUserRole === 'ADMIN' || currentUserRole === 'COMPLIANCE_OFFICER';
  const canSecondVerify = detail.secondPersonRequired
    && !detail.secondVerifiedAt
    && !detail.secondVerificationNote
    && currentUserId !== detail.recorder.id
    && (detail.secondVerifierUserId === currentUserId || elevatedVerifier);

  if (editing) return <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm"><ManualApprovalForm approvalId={approval.id} initial={initial} onCancel={() => setEditing(false)} /></section>;

  return (
    <section className="grid gap-5 rounded-3xl border border-blue-200 bg-white p-6 shadow-sm" aria-labelledby="manual-approval-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#2155d9]">Defensible manual evidence</p><h3 id="manual-approval-heading" className="mt-1 text-xl font-black text-slate-950">{detail.kind === 'VERBAL' ? 'Verbal approval record' : 'Manually recorded approval'}</h3><p className="mt-2 text-sm leading-6 text-slate-600">Recorded by {detail.recorder.name ?? detail.recorder.email}. This record is never presented as automatically captured evidence.</p></div>
        <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1.5 text-xs font-black ${statusTone[detail.verificationStatus]}`}>{display(detail.verificationStatus)}</span>{canManage ? <button type="button" onClick={() => setEditing(true)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">Edit record</button> : null}</div>
      </div>

      <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Approver role', detail.approverRole], ['Channel / location', [detail.communicationChannel, detail.location].filter(Boolean).join(' · ')],
          ['Confidence', `${detail.confidenceLevel}%`], ['Related record', [detail.relatedEntityType, detail.relatedEntityId].filter(Boolean).join(' · ') || 'None'],
          ['Recorder', detail.recorder.name ?? detail.recorder.email], ['Second verification', !detail.secondPersonRequired ? 'Not required' : detail.secondVerifiedAt ? `Verified ${new Date(detail.secondVerifiedAt).toLocaleString()}` : (detail.secondVerifier?.name ?? detail.secondVerifier?.email ?? 'Required, not assigned')],
        ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-black text-slate-950">{value}</dd></div>)}
      </dl>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Business context</p><p className="mt-2 text-sm leading-6 text-slate-700">{detail.businessContext}</p>{detail.supportingNotes ? <p className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600">{detail.supportingNotes}</p> : null}</div>

      {canManage ? <div className="flex flex-wrap gap-3"><button type="button" disabled={working !== null} onClick={requestSuggestions} className="h-11 rounded-xl bg-[#2155d9] px-4 text-sm font-black text-white disabled:opacity-60">{working === 'suggestions' ? 'Searching...' : 'Find supporting evidence'}</button><button type="button" disabled={working !== null} onClick={createConfirmation} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60">{working === 'confirmation' ? 'Creating...' : 'Request approver confirmation'}</button></div> : null}
      {canSecondVerify ? <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-violet-800">Second-person verification required</p><p className="mt-1 text-sm leading-6 text-violet-950">Review the recorder, decision context, and linked evidence before recording an independent result.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={working !== null} onClick={() => submitSecondVerification('VERIFIED')} className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60">{working === 'second-verification' ? 'Recording...' : 'Verify record'}</button><button type="button" disabled={working !== null} onClick={() => submitSecondVerification('REJECTED')} className="h-10 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 disabled:opacity-60">Reject verification</button></div></div> : null}
      {detail.secondVerificationNote ? <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><strong>Second verifier note:</strong> {detail.secondVerificationNote}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-900">{message}</p> : null}
      {confirmationUrl ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-emerald-800">Secure confirmation link</p><p className="mt-2 break-all text-sm font-semibold text-emerald-950">{confirmationUrl}</p></div> : null}

      <div><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Supporting evidence</p><h4 className="mt-1 font-black text-slate-950">Chronological associations</h4></div><span className="text-xs font-bold text-slate-500">{evidence.length} records</span></div><div className="mt-3 grid gap-3">{evidence.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No supporting evidence linked or suggested yet.</p> : evidence.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{display(item.origin)}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#2155d9]">{item.confidence}% match</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">{display(item.status)}</span></div><p className="mt-3 font-black text-slate-950">{item.messageSource.provider} · {item.messageSource.channel ?? 'Source record'}</p><p className="mt-1 text-xs font-bold text-slate-500">{new Date(item.sourceTimestamp).toLocaleString()} · {item.messageSource.sender ?? item.messageSource.senderEmail ?? 'Unknown sender'}</p></div>{canManage && item.status === 'SUGGESTED' ? <div className="flex gap-2"><button type="button" disabled={working === item.id} onClick={() => reviewEvidence(item.id, 'CONFIRMED')} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white">Link</button><button type="button" disabled={working === item.id} onClick={() => reviewEvidence(item.id, 'REJECTED')} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-700">Reject</button></div> : null}</div><blockquote className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{item.messageSource.excerpt}</blockquote><p className="mt-2 text-xs font-semibold text-slate-500">Match reasons: {item.matchingReasons.join(', ') || 'Human association'}</p>{item.rejectionReason ? <p className="mt-2 text-xs font-bold text-rose-700">Rejected: {item.rejectionReason}</p> : null}</article>)}</div></div>

      <div className="grid gap-5 xl:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Version history</p><div className="mt-3 grid gap-2">{versions.map((version) => <div key={version.id} className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between gap-3"><p className="font-black text-slate-950">Version {version.version}</p><p className="text-xs font-bold text-slate-500">{new Date(version.createdAt).toLocaleString()}</p></div><p className="mt-1 text-sm text-slate-600">{version.changeReason}</p><p className="mt-1 text-xs font-bold text-slate-500">By {version.actorUser.name ?? version.actorUser.email}</p></div>)}</div></div><div><p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Confirmation history</p><div className="mt-3 grid gap-2">{confirmations.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">No confirmation requests sent.</p> : confirmations.map((confirmation) => <div key={confirmation.id} className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between gap-3"><p className="font-black text-slate-950">{display(confirmation.decision)}</p><p className="text-xs font-bold text-slate-500">{new Date(confirmation.respondedAt ?? confirmation.createdAt).toLocaleString()}</p></div><p className="mt-1 text-sm text-slate-600">{confirmation.approverEmail}</p>{confirmation.responseNote ? <p className="mt-2 text-sm text-slate-700">{confirmation.responseNote}</p> : null}</div>)}</div></div></div>
    </section>
  );
}
