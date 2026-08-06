'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const RETRY_INTERVAL_MS = 15_000;

/**
 * Rendered only while the approvals page is in its "recovering" (breaker
 * open) state. Silently re-runs the Server Component every 15s so live data
 * comes back on its own — the interval is cleaned up automatically once a
 * refresh succeeds and this component is no longer rendered.
 */
export function AutoRetryOnDegraded() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
