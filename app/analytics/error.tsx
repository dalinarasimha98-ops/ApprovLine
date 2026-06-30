'use client';

import { PendingLink } from '@/components/system/PendingLink';

export default function AnalyticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-[#f5f7fb] p-4 text-[#090b12] sm:p-8">
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide">Analytics unavailable</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">We could not load the Executive ROI Dashboard</h2>
        <p className="mt-2 text-sm font-semibold">{error.message || 'The analytics query did not complete.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-0 h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm"
          >
            Retry
          </button>
          <PendingLink href="/analytics?demo=1" pendingText="Loading demo..." className="inline-flex min-h-0 h-11 items-center justify-center rounded-xl border border-amber-200 bg-white px-5 text-sm font-bold text-amber-950 shadow-sm">
            Open demo preview
          </PendingLink>
        </div>
      </section>
    </main>
  );
}
