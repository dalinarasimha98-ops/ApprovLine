'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function ApprovalDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[approval-detail] unhandled error reached boundary:', error.message, error.stack, error.digest);
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-[#030b18] p-6">
      <section className="w-full max-w-2xl rounded-2xl border border-[#1E2D4A] bg-[#0E1830] p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Approval unavailable</p>
        <h1 className="mt-2 text-2xl font-bold text-[#E8EEFF]">This approval could not be displayed</h1>
        <p className="mt-3 text-sm leading-6 text-[#6B7FA8]">Your workspace is still available. Retry this record or return to Approval History.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
          >
            Retry
          </button>
          <a
            href="/dashboard/approvals"
            className="inline-flex h-10 items-center rounded-lg border border-[#1E2D4A] bg-[#07111f] px-5 text-sm font-semibold text-[#A8BAD8] hover:text-[#E8EEFF] transition-colors"
          >
            Approval History
          </a>
        </div>
      </section>
    </main>
  );
}

