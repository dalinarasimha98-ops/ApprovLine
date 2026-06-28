'use client';

import { useEffect } from 'react';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('ApprovLine dashboard error', error);
  }, [error]);

  return (
    <section className="grid gap-4 rounded-lg border border-amber-200 bg-white p-6">
      <p className="text-sm font-bold uppercase text-amber-700">Dashboard unavailable</p>
      <h1 className="text-2xl font-black text-slate-950">We could not load your workspace</h1>
      <p className="text-slate-600">
        Your session is still valid. Check service readiness, then retry the dashboard.
      </p>
      {error.digest ? <p className="text-sm text-slate-500">Digest: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button onClick={reset} className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">
          Retry dashboard
        </button>
        <a href="/health" className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-700">
          Open health check
        </a>
      </div>
    </section>
  );
}
