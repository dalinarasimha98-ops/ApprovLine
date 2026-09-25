'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function UnifiedEvidenceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[70vh] place-items-center bg-al-bg p-6 text-al-text">
      <div className="w-full max-w-xl rounded-2xl border border-rose-400/20 bg-al-surface-elevated p-6 shadow-2xl">
        <AlertTriangle className="h-8 w-8 text-al-danger" />
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-al-danger">
          Evidence temporarily unavailable
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">The record could not load safely</h1>
        <p className="mt-3 text-sm leading-6 text-al-text-muted">
          Your workspace is still available. Retry this evidence record without losing your place.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-al-info/100"
        >
          <RefreshCw className="h-4 w-4" /> Retry evidence
        </button>
      </div>
    </div>
  );
}
