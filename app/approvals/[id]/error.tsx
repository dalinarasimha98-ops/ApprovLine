'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function ApprovalDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[approval-detail] unhandled error reached boundary:', error.message, error.stack, error.digest);
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-al-bg p-6">
      <section className="w-full max-w-2xl rounded-2xl border border-al-border bg-al-surface p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-al-accent">Approval unavailable</p>
        <h1 className="mt-2 text-2xl font-bold text-al-text">This approval could not be displayed</h1>
        <p className="mt-3 text-sm leading-6 text-al-text-muted">Your workspace is still available. Retry this record or return to Approval History.</p>
        {error.digest ? (
          <div className="mt-4 rounded-lg border border-al-border bg-al-bg p-3">
            <p className="font-mono text-[10px] text-al-text-secondary">Reference: {error.digest}</p>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-lg bg-al-accent px-5 text-sm font-semibold text-white hover:bg-al-accent-hover transition-colors"
          >
            Retry
          </button>
          <a
            href="/dashboard/approvals"
            className="inline-flex h-10 items-center rounded-lg border border-al-border bg-al-bg px-5 text-sm font-semibold text-al-text-secondary hover:text-al-text transition-colors"
          >
            Approval History
          </a>
        </div>
      </section>
    </main>
  );
}

