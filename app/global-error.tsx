'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-slate-50 px-6 py-10">
          <section className="mx-auto grid max-w-2xl gap-4 rounded-lg border border-rose-200 bg-white p-6">
            <p className="text-sm font-bold uppercase text-rose-600">ApprovLine error</p>
            <h1 className="text-3xl font-black text-slate-950">Something needs attention</h1>
            <p className="text-slate-600">The page could not load safely. The issue has been reported for diagnosis.</p>
            {error.digest ? <p className="text-sm text-slate-500">Digest: {error.digest}</p> : null}
            <div className="flex flex-wrap gap-3">
              <button onClick={reset} className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">Try again</button>
              <a href="/health" className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-700">Open health check</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
