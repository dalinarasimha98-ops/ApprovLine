'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function ApprovalDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-2xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-amber-700">Approval unavailable</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">This approval could not be displayed</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Your workspace is still available. Retry this record or return to Approval History.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="h-11 rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white">Retry</button>
          <a href="/dashboard/approvals" className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700">Approval History</a>
        </div>
      </section>
    </main>
  );
}

