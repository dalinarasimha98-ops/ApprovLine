'use client';

import { useEffect } from 'react';

export default function ActionCenterError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[action-center] page error', error);
  }, [error]);

  return (
    <div className="rounded-xl border border-al-warning/20 bg-al-warning/5 p-6 text-al-warning">
      <p className="text-xs font-bold uppercase tracking-wide text-al-warning">Action Center unavailable</p>
      <h1 className="mt-2 text-xl font-black text-al-text">Action Center couldn&apos;t load</h1>
      <p className="mt-2 text-sm leading-6">Please try again. Your other workspace data is unaffected.</p>
      {error.digest ? <p className="mt-2 text-xs font-bold opacity-60">Reference: {error.digest}</p> : null}
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-al-accent px-5 text-sm font-bold text-white hover:bg-al-accent-hover"
      >
        Retry
      </button>
    </div>
  );
}
