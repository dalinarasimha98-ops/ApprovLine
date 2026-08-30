'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the provider name (e.g. when clicking "Request" on a known COMING_SOON provider) */
  defaultProviderName?: string;
  defaultProviderSlug?: string;
};

const CATEGORIES = [
  'Communication',
  'Email',
  'Meetings',
  'Engineering',
  'Finance',
  'Procurement',
  'Legal',
  'HR',
  'CRM',
  'ERP',
  'ITSM',
  'Other',
];

const EVIDENCE_TYPES = [
  'Chat / message approvals',
  'Email approvals',
  'Ticket / workflow approvals',
  'Contract / signature approvals',
  'Financial / purchase approvals',
  'HR / headcount approvals',
  'Deployment / change approvals',
  'Other',
];

type FormState = 'idle' | 'submitting' | 'success' | 'already_requested' | 'error';

export function RequestIntegrationModal({ open, onClose, defaultProviderName = '', defaultProviderSlug }: Props) {
  const [providerName, setProviderName] = useState(defaultProviderName);
  const [providerWebsite, setProviderWebsite] = useState('');
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [evidenceType, setEvidenceType] = useState('');
  const [userCount, setUserCount] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [state, setState] = useState<FormState>('idle');
  const [totalRequests, setTotalRequests] = useState(0);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      setProviderName(defaultProviderName);
      setProviderWebsite('');
      setCategory('');
      setReason('');
      setEvidenceType('');
      setUserCount('');
      setPriority('MEDIUM');
      setState('idle');
      setError('');
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open, defaultProviderName]);

  const handleClose = useCallback(() => {
    dialogRef.current?.close();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener('close', handler);
    return () => el.removeEventListener('close', handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || !providerName.trim()) return;
    setState('submitting');
    setError('');

    try {
      const res = await fetch('/api/integrations/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerName: providerName.trim(),
          providerSlug: defaultProviderSlug,
          providerWebsite: providerWebsite.trim() || undefined,
          category: category || undefined,
          reason: reason.trim(),
          evidenceType: evidenceType || undefined,
          userCount: userCount ? parseInt(userCount, 10) : undefined,
          priority,
        }),
      });

      const data = await res.json() as { success?: boolean; error?: string; totalRequests?: number };

      if (res.status === 409 && data.error === 'already_requested') {
        setState('already_requested');
        setTotalRequests(data.totalRequests ?? 1);
        return;
      }

      if (!res.ok) {
        setState('error');
        setError(data.error ?? 'Failed to submit request. Please try again.');
        return;
      }

      setState('success');
      setTotalRequests(data.totalRequests ?? 1);
    } catch {
      setState('error');
      setError('Network error. Please check your connection and try again.');
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_20px_60px_rgba(15,23,42,0.25)] backdrop:bg-slate-950/60"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-950">Request an Integration</h2>
          <p className="mt-0.5 text-sm font-semibold text-slate-500">
            Tell us what tool you need. We prioritize by customer demand.
          </p>
        </div>
        <button
          onClick={handleClose}
          className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {state === 'success' ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl">
              ✓
            </div>
            <h3 className="text-lg font-black text-emerald-900">Request submitted!</h3>
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              {totalRequests > 1
                ? `${totalRequests} customer${totalRequests === 1 ? '' : 's'} have requested this integration. We'll notify you when it launches.`
                : "We've logged your request. You'll be notified when this integration becomes available."}
            </p>
            <button
              onClick={handleClose}
              className="mt-5 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        ) : state === 'already_requested' ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-blue-100 text-2xl">
              📋
            </div>
            <h3 className="text-lg font-black text-blue-900">Already requested</h3>
            <p className="mt-2 text-sm font-semibold text-blue-700">
              You&apos;ve already requested this integration.
              {totalRequests > 1 ? ` ${totalRequests} customers in total have requested it.` : ''}
              {' '}We&apos;ll notify you when it becomes available.
            </p>
            <button
              onClick={handleClose}
              className="mt-5 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-black text-white transition hover:bg-blue-700"
            >
              Got it
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-sm font-black text-slate-700">
                Tool name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                required
                maxLength={200}
                placeholder="e.g. Salesforce, Coupa, Ironclad…"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-black text-slate-700">Website URL</label>
              <input
                type="url"
                value={providerWebsite}
                onChange={(e) => setProviderWebsite(e.target.value)}
                maxLength={500}
                placeholder="https://example.com"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-black text-slate-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">Select…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-black text-slate-700">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High — blocking work</option>
                </select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-black text-slate-700">Type of approval evidence</label>
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
              >
                <option value="">Select…</option>
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-black text-slate-700">
                Why do you need this? <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                placeholder="Describe your use case and what approval workflows you need to capture…"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100 resize-none"
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-black text-slate-700">Approx. affected users</label>
              <input
                type="number"
                value={userCount}
                onChange={(e) => setUserCount(e.target.value)}
                min={1}
                max={1_000_000}
                placeholder="e.g. 50"
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={state === 'submitting' || !providerName.trim() || !reason.trim()}
                className="rounded-xl bg-[#2155d9] px-6 py-2.5 text-sm font-black text-white transition hover:bg-[#1a44be] disabled:opacity-50"
              >
                {state === 'submitting' ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
