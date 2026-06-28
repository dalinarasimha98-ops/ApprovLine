'use client';

import { useEffect } from 'react';

export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('ApprovLine onboarding error', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section className="mx-auto grid max-w-3xl gap-4 rounded-lg border border-amber-200 bg-white p-6">
        <p className="text-sm font-bold uppercase text-amber-700">Onboarding paused</p>
        <h1 className="text-3xl font-black text-slate-950">We could not load setup right now</h1>
        <p className="text-slate-600">
          Your account is created. Check the readiness page for database, Redis, Clerk, and AI configuration status, then try setup again.
        </p>
        {error.digest ? <p className="text-sm text-slate-500">Digest: {error.digest}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button onClick={reset} className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">
            Try onboarding again
          </button>
          <a href="/health" className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-700">
            Open health check
          </a>
        </div>
      </section>
    </main>
  );
}
