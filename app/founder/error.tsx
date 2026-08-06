'use client';

import { useEffect } from 'react';

export default function FounderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('ApprovLine Founder Console error', error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="max-w-xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Founder console error</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">This section could not load</h1>
        <p className="mt-3 text-base font-semibold leading-7 text-slate-600">
          Customer workspaces are unaffected. The issue has been logged for diagnosis.
        </p>
        {error.digest ? <p className="mt-3 text-sm text-slate-500">Digest: {error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={reset} className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
            Try again
          </button>
          <a href="/health" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
            Open health check
          </a>
        </div>
      </section>
    </main>
  );
}
