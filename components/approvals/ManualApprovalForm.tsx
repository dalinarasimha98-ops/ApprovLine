'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ManualApprovalFormValues = {
  kind: 'VERBAL' | 'MANUAL';
  subject: string;
  outcome: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED';
  approvalType: 'EXPLICIT' | 'IMPLICIT' | 'CONDITIONAL' | 'REJECTION' | 'ESCALATION';
  approverName: string;
  approverEmail: string;
  approverRole: string;
  approvalTimestamp: string;
  communicationChannel: string;
  location: string;
  businessContext: string;
  conditions: string;
  department: string;
  category: string;
  relatedEntityType: string;
  relatedEntityId: string;
  supportingNotes: string;
  verificationStatus: 'PENDING_CONFIRMATION' | 'CONFIRMED_BY_APPROVER' | 'DISPUTED' | 'SUPERSEDED';
  confidenceLevel: number;
  secondPersonRequired: boolean;
  secondVerifierUserId: string;
  changeReason: string;
};

const defaults: ManualApprovalFormValues = {
  kind: 'VERBAL', subject: '', outcome: 'APPROVED', approvalType: 'EXPLICIT', approverName: '', approverEmail: '', approverRole: '',
  approvalTimestamp: new Date().toISOString().slice(0, 16), communicationChannel: 'Phone call', location: '', businessContext: '', conditions: '',
  department: '', category: '', relatedEntityType: '', relatedEntityId: '', supportingNotes: '', verificationStatus: 'PENDING_CONFIRMATION',
  confidenceLevel: 50, secondPersonRequired: false, secondVerifierUserId: '', changeReason: 'Initial manual approval record',
};

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100';
const textAreaClass = `${inputClass} min-h-28 resize-y py-3`;

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`grid gap-1.5 ${wide ? 'md:col-span-2' : ''}`}><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

export function ManualApprovalForm({ approvalId, initial, onCancel }: { approvalId?: string; initial?: Partial<ManualApprovalFormValues>; onCancel?: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<ManualApprovalFormValues>({ ...defaults, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof ManualApprovalFormValues>(key: K, value: ManualApprovalFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(approvalId ? `/api/approvals/${approvalId}/manual` : '/api/approvals/manual', {
        method: approvalId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The approval record could not be saved.');
      if (approvalId) { router.refresh(); onCancel?.(); }
      else router.push(`/approvals/${payload.approvalId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The approval record could not be saved.'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <strong>Manual evidence remains explicitly labelled.</strong> Verbal approvals start as pending confirmation unless an authorized reviewer records a different verified state.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Record type"><select className={inputClass} disabled={saving} value={values.kind} onChange={(e) => update('kind', e.target.value as ManualApprovalFormValues['kind'])}><option value="VERBAL">Verbal approval</option><option value="MANUAL">Manually recorded</option></select></Field>
        <Field label="Outcome"><select className={inputClass} disabled={saving} value={values.outcome} onChange={(e) => update('outcome', e.target.value as ManualApprovalFormValues['outcome'])}><option value="APPROVED">Approved</option><option value="PENDING_REVIEW">Pending review</option><option value="REJECTED">Rejected</option></select></Field>
        <Field label="Approval type"><select className={inputClass} disabled={saving} value={values.approvalType} onChange={(e) => update('approvalType', e.target.value as ManualApprovalFormValues['approvalType'])}><option value="EXPLICIT">Explicit</option><option value="IMPLICIT">Implicit</option><option value="CONDITIONAL">Conditional</option><option value="REJECTION">Rejection</option><option value="ESCALATION">Escalation</option></select></Field>
        <Field label="Decision being approved" wide><input required minLength={3} className={inputClass} disabled={saving} value={values.subject} onChange={(e) => update('subject', e.target.value)} placeholder="Approve Vendor ABC contract" /></Field>
        <Field label="Approver name"><input required className={inputClass} disabled={saving} value={values.approverName} onChange={(e) => update('approverName', e.target.value)} /></Field>
        <Field label="Approver email"><input type="email" className={inputClass} disabled={saving} value={values.approverEmail} onChange={(e) => update('approverEmail', e.target.value)} /></Field>
        <Field label="Approver role"><input required className={inputClass} disabled={saving} value={values.approverRole} onChange={(e) => update('approverRole', e.target.value)} placeholder="CFO" /></Field>
        <Field label="Approval date and time"><input required type="datetime-local" className={inputClass} disabled={saving} value={values.approvalTimestamp.slice(0, 16)} onChange={(e) => update('approvalTimestamp', e.target.value)} /></Field>
        <Field label="Channel"><input required className={inputClass} disabled={saving} value={values.communicationChannel} onChange={(e) => update('communicationChannel', e.target.value)} placeholder="Phone call, meeting, in person" /></Field>
        <Field label="Location"><input className={inputClass} disabled={saving} value={values.location} onChange={(e) => update('location', e.target.value)} /></Field>
        <Field label="Department"><input className={inputClass} disabled={saving} value={values.department} onChange={(e) => update('department', e.target.value)} /></Field>
        <Field label="Category"><input className={inputClass} disabled={saving} value={values.category} onChange={(e) => update('category', e.target.value)} /></Field>
        <Field label="Business context / reason" wide><textarea required minLength={10} className={textAreaClass} disabled={saving} value={values.businessContext} onChange={(e) => update('businessContext', e.target.value)} /></Field>
        <Field label="Conditions or limitations" wide><textarea className={textAreaClass} disabled={saving} value={values.conditions} onChange={(e) => update('conditions', e.target.value)} /></Field>
        <Field label="Related object type"><input className={inputClass} disabled={saving} value={values.relatedEntityType} onChange={(e) => update('relatedEntityType', e.target.value)} placeholder="Contract, ticket, project" /></Field>
        <Field label="Related object reference"><input className={inputClass} disabled={saving} value={values.relatedEntityId} onChange={(e) => update('relatedEntityId', e.target.value)} placeholder="CON-1024" /></Field>
        <Field label="Supporting notes" wide><textarea className={textAreaClass} disabled={saving} value={values.supportingNotes} onChange={(e) => update('supportingNotes', e.target.value)} /></Field>
        <Field label="Verification status"><select className={inputClass} disabled={saving} value={values.verificationStatus} onChange={(e) => update('verificationStatus', e.target.value as ManualApprovalFormValues['verificationStatus'])}><option value="PENDING_CONFIRMATION">Pending confirmation</option>{values.verificationStatus === 'CONFIRMED_BY_APPROVER' ? <option value="CONFIRMED_BY_APPROVER">Confirmed by approver</option> : null}<option value="DISPUTED">Disputed</option><option value="SUPERSEDED">Superseded</option></select><span className="text-xs font-semibold leading-5 text-slate-500">Approver confirmation can only be granted through the secure confirmation workflow.</span></Field>
        <Field label={`Confidence: ${values.confidenceLevel}%`}><input type="range" min="0" max="100" className="h-11 w-full accent-[#2155d9]" disabled={saving} value={values.confidenceLevel} onChange={(e) => update('confidenceLevel', Number(e.target.value))} /></Field>
        <Field label="Reason for this change" wide><textarea required minLength={5} className={textAreaClass} disabled={saving} value={values.changeReason} onChange={(e) => update('changeReason', e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#2155d9]" checked={values.secondPersonRequired} disabled={saving} onChange={(e) => update('secondPersonRequired', e.target.checked)} />Require second-person verification</label>
      {values.secondPersonRequired ? <Field label="Second verifier user ID"><input required className={inputClass} disabled={saving} value={values.secondVerifierUserId} onChange={(e) => update('secondVerifierUserId', e.target.value)} placeholder="ApprovLine user ID" /></Field> : null}
      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel ? <button type="button" disabled={saving} onClick={onCancel} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 disabled:opacity-60">Cancel</button> : null}
        <button type="submit" disabled={saving} className="h-11 rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving...' : approvalId ? 'Save changes' : 'Record approval'}</button>
      </div>
    </form>
  );
}
