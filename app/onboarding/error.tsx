'use client';

import { useEffect } from 'react';

export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('ApprovLine onboarding error', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-al-surface-sunken px-6 py-10">
      <section className="mx-auto grid max-w-3xl gap-4 rounded-lg border border-al-warning/30 bg-al-surface p-6">
        <p className="text-sm font-bold uppercase text-al-warning">Onboarding paused</p>
        <h1 className="text-3xl font-black text-al-text">We could not load setup right now</h1>
        <p className="text-al-text-secondary">
          Your account is created. Check the readiness page for database, Redis, Clerk, and AI configuration status, then try setup again.
        </p>
        {error.digest ? <p className="text-sm text-al-text-muted">Digest: {error.digest}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button onClick={reset} className="rounded-md bg-al-accent px-4 py-2 font-bold text-white">
            Try onboarding again
          </button>
          <a href="/health" className="rounded-md border border-al-border px-4 py-2 font-bold text-al-text-secondary">
            Open health check
          </a>
        </div>
      </section>
    </main>
  );
}
