'use client';

import { useEffect } from 'react';

export default function MemoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('ApprovLine Memory Graph error', error);
  }, [error]);

  return (
    <section className="grid gap-4 rounded-lg border border-al-warning/30 bg-al-surface p-6">
      <p className="text-sm font-bold uppercase text-al-warning">Memory Graph unavailable</p>
      <h1 className="text-2xl font-black text-al-text">We could not load the graph this time</h1>
      <p className="text-al-text-secondary">
        Your session is still valid and the rest of the dashboard is unaffected. Retry, or check service readiness.
      </p>
      {error.digest ? <p className="text-sm text-al-text-muted">Digest: {error.digest}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button onClick={reset} className="rounded-md bg-al-accent px-4 py-2 font-bold text-white">
          Retry
        </button>
        <a href="/health" className="rounded-md border border-al-border px-4 py-2 font-bold text-al-text-secondary">
          Open health check
        </a>
      </div>
    </section>
  );
}
