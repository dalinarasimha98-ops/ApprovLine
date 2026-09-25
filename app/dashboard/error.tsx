'use client';

import { useEffect } from 'react';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('ApprovLine dashboard error', error);
  }, [error]);

  return (
    <section className="grid gap-4 rounded-lg border border-amber-200 bg-al-surface p-6">
      <p className="text-sm font-bold uppercase text-amber-700">Dashboard unavailable</p>
      <h1 className="text-2xl font-black text-al-text">We could not load your workspace</h1>
      <p className="text-al-text-secondary">
        Your session is still valid. Check service readiness, then retry the dashboard.
      </p>
      {error.digest ? <p className="text-sm text-al-text-muted">Digest: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button onClick={reset} className="rounded-md bg-al-accent px-4 py-2 font-bold text-white">
          Retry dashboard
        </button>
        <a href="/health" className="rounded-md border border-al-border px-4 py-2 font-bold text-al-text-secondary">
          Open health check
        </a>
      </div>
    </section>
  );
}
