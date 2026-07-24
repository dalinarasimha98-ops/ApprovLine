'use client';

import { useEffect, useState } from 'react';
import { PendingLink } from '@/components/system/PendingLink';

type ApprovalActionsProps = {
  approvalId: string;
  subject: string;
  memoryEntityId?: string | null;
};

const actionClass = 'inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2155d9]';

type DownloadKind = 'evidence' | 'pdf' | 'json' | 'csv';

function downloadName(response: Response, fallback: string) {
  const disposition = response.headers.get('content-disposition');
  return disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

export function ApprovalActions({ approvalId, subject, memoryEntityId }: ApprovalActionsProps) {
  const [online, setOnline] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<DownloadKind | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [retryDownload, setRetryDownload] = useState<DownloadKind | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setMessage({ tone: 'success', text: 'Approval link copied.' });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setMessage({ tone: 'error', text: 'The link could not be copied. Select the browser address and copy it manually.' });
    }
  }

  async function download(kind: DownloadKind) {
    if (!online || pendingDownload) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    const url = kind === 'evidence'
      ? `/api/approvals/${approvalId}/evidence`
      : `/api/export/approvals?approvalId=${encodeURIComponent(approvalId)}&format=${kind}`;
    const fallback = kind === 'evidence' ? `approvline-evidence-${approvalId}.json` : `approvline-approval-${approvalId}.${kind}`;

    setPendingDownload(kind);
    setMessage(null);
    setRetryDownload(null);
    try {
      const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (response.status === 401) throw new Error('Your session expired. Sign in again, then retry.');
        if (response.status === 403) throw new Error('You do not have permission to download this approval.');
        if (response.status === 404) throw new Error('This approval or its retained evidence is no longer available.');
        throw new Error(body?.error ?? 'The download could not be prepared. Please retry.');
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('The generated file was empty. Please retry.');
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = downloadName(response, fallback);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage({ tone: 'success', text: `${kind === 'evidence' ? 'Evidence' : kind.toUpperCase()} download is ready.` });
    } catch (error) {
      const text = error instanceof DOMException && error.name === 'AbortError'
        ? 'The download is taking longer than expected. Retry when your connection is stable.'
        : error instanceof Error ? error.message : 'The download could not be prepared. Please retry.';
      setMessage({ tone: 'error', text });
      setRetryDownload(kind);
    } finally {
      window.clearTimeout(timeout);
      setPendingDownload(null);
    }
  }

  return (
    <section aria-label="Approval actions" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Actions</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Continue the investigation</h3>
        </div>
        {!online ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">Offline - reconnect to continue</span>
        ) : null}
      </div>
      <div className={`mt-4 flex flex-wrap gap-2 ${online ? '' : 'opacity-60'}`}>
        <PendingLink href={`/approvals/${approvalId}/source`} pendingText="Opening evidence..." className={actionClass}>Open Source</PendingLink>
        <button type="button" onClick={() => download('evidence')} disabled={!online || Boolean(pendingDownload)} className={actionClass}>
          {pendingDownload === 'evidence' ? 'Preparing evidence...' : 'Download Evidence'}
        </button>
        {(['pdf', 'json', 'csv'] as const).map((format) => (
          <button key={format} type="button" onClick={() => download(format)} disabled={!online || Boolean(pendingDownload)} className={actionClass}>
            {pendingDownload === format ? `Preparing ${format.toUpperCase()}...` : `Export ${format.toUpperCase()}`}
          </button>
        ))}
        <button type="button" onClick={copyLink} className={actionClass}>{copied ? 'Link copied' : 'Copy Link'}</button>
        <a href="#timeline" className={actionClass}>View Timeline</a>
        <PendingLink href={`/investigations?approvalId=${approvalId}`} pendingText="Opening investigations..." className={actionClass}>Open Investigation</PendingLink>
        <PendingLink href={memoryEntityId ? `/memory/${memoryEntityId}` : `/memory?search=${encodeURIComponent(subject)}`} pendingText="Opening graph..." className={actionClass}>Open Memory Graph</PendingLink>
        <PendingLink href={`/copilot?q=${encodeURIComponent(`Explain approval: ${subject}`)}`} pendingText="Opening Copilot..." className={actionClass}>Open Copilot</PendingLink>
        <PendingLink href={`/playbooks?approvalId=${approvalId}`} pendingText="Opening Playbook AI..." className={actionClass}>Open Playbook</PendingLink>
      </div>
      {message ? (
        <div role="status" aria-live="polite" className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${message.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          <span>{message.text}</span>
          {retryDownload ? (
            <button type="button" onClick={() => download(retryDownload)} className="rounded-lg bg-white px-3 py-2 text-xs font-black shadow-sm">Retry</button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
