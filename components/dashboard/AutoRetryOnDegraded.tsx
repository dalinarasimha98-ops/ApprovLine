'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const DEFAULT_RETRY_INTERVAL_MS = 15_000;

/**
 * Rendered only while a page is in its "recovering" (breaker open) state.
 * Silently re-runs the Server Component on an interval so live data comes
 * back on its own — cleaned up automatically once a refresh succeeds and
 * this component is no longer rendered.
 */
export function AutoRetryOnDegraded({ intervalMs = DEFAULT_RETRY_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
