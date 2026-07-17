'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('ApprovLine application error', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section className="mx-auto grid max-w-2xl gap-4 rounded-lg border border-rose-200 bg-white p-6">
        <p className="text-sm font-bold uppercase text-rose-600">ApprovLine error</p>
        <h1 className="text-3xl font-black text-slate-950">Something needs attention</h1>
        <p className="text-slate-600">
          The page could not load safely. The issue has been logged for diagnosis.
        </p>
        {error.digest ? <p className="text-sm text-slate-500">Digest: {error.digest}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button onClick={reset} className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">
            Try again
          </button>
          <a href="/health" className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-700">
            Open health check
          </a>
        </div>
      </section>
    </main>
  );
}
