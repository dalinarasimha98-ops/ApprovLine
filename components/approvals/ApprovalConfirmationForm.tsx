'use client';

import { useEffect, useState } from 'react';

type ConfirmationRecord = {
  subject: string;
  approverName: string | null;
  decision: string;
  expiresAt: string;
  conditions: string | null;
  approvalTimestamp: string;
  recorderContext: string;
};

type Decision = 'CONFIRMED' | 'REJECTED' | 'CORRECTED';

export function ApprovalConfirmationForm({ token }: { token: string }) {
  const [record, setRecord] = useState<ConfirmationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [responseNote, setResponseNote] = useState('');
  const [correction, setCorrection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/confirmations/${token}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'This confirmation request is no longer available.');
        if (active) setRecord(payload);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'This confirmation request could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  async function respond(decision: Decision) {
    if (responseNote.trim().length < 3) {
      setError('Add a short response note before submitting.');
      return;
    }
    if (decision === 'CORRECTED' && correction.trim().length < 3) {
      setError('Describe what should be corrected in the approval record.');
      return;
    }
    setSubmitting(decision);
    setError(null);
    const response = await fetch(`/api/confirmations/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision,
        responseNote: responseNote.trim(),
        ...(decision === 'CORRECTED' ? { correction: { summary: correction.trim() } } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSubmitting(null);
    if (!response.ok) {
      setError(payload.error ?? 'Your response could not be recorded. Please retry.');
      return;
    }
    setComplete(
      decision === 'CONFIRMED'
        ? 'Verbal approval confirmed. Your response is now part of the immutable audit trail.'
        : decision === 'REJECTED'
          ? 'Approval disputed. The original record and your response have both been preserved.'
          : 'Correction submitted. The record is disputed until an authorized reviewer resolves it.',
    );
  }

  if (loading) {
    return <div className="grid gap-4" aria-label="Loading confirmation request"><div className="h-8 w-2/3 animate-pulse rounded-lg bg-slate-200" /><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>;
  }

  if (error && !record) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><p className="font-black text-rose-900">Confirmation unavailable</p><p className="mt-2 text-sm leading-6 text-rose-800">{error}</p></div>;
  }

  if (!record) return null;

  if (complete) {
    return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Response recorded</p><h2 className="mt-2 text-2xl font-black text-slate-950">Thank you for confirming the record</h2><p className="mt-3 text-sm leading-6 text-emerald-900">{complete}</p></div>;
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2155d9]">Verbal approval confirmation</p>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">Pending confirmation</span>
        </div>
        <h2 className="mt-3 text-2xl font-black text-slate-950">{record.subject}</h2>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-4"><dt className="text-xs font-black uppercase text-slate-500">Stated approver</dt><dd className="mt-1 font-black text-slate-950">{record.approverName ?? 'Not specified'}</dd></div>
          <div className="rounded-xl bg-white p-4"><dt className="text-xs font-black uppercase text-slate-500">Approval time</dt><dd className="mt-1 font-black text-slate-950">{new Date(record.approvalTimestamp).toLocaleString()}</dd></div>
        </dl>
        {record.conditions ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><span className="font-black">Conditions:</span> {record.conditions}</div> : null}
        <p className="mt-4 text-sm leading-6 text-slate-600">{record.recorderContext}</p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-black text-slate-800">Response note<textarea value={responseNote} onChange={(event) => setResponseNote(event.target.value)} rows={4} placeholder="Confirm the context, explain a dispute, or add clarification." className="resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-950 outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" /></label>
        <label className="grid gap-2 text-sm font-black text-slate-800">Correction details <span className="font-medium text-slate-500">(only required when correcting)</span><textarea value={correction} onChange={(event) => setCorrection(event.target.value)} rows={3} placeholder="Describe the corrected decision, conditions, approver, or timestamp." className="resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-950 outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" /></label>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" disabled={submitting !== null} onClick={() => respond('CONFIRMED')} className="h-12 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60">{submitting === 'CONFIRMED' ? 'Confirming...' : 'Confirm approval'}</button>
        <button type="button" disabled={submitting !== null} onClick={() => respond('CORRECTED')} className="h-12 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-black text-amber-900 disabled:opacity-60">{submitting === 'CORRECTED' ? 'Submitting...' : 'Correct record'}</button>
        <button type="button" disabled={submitting !== null} onClick={() => respond('REJECTED')} className="h-12 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-800 disabled:opacity-60">{submitting === 'REJECTED' ? 'Disputing...' : 'Dispute approval'}</button>
      </div>
      <p className="text-xs leading-5 text-slate-500">Your response is retained as immutable evidence. It does not erase or silently replace the original manual record.</p>
    </div>
  );
}
