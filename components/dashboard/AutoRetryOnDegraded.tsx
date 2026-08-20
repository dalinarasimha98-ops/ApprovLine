'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isNavigationPending } from '@/lib/navigation-pending';

const DEFAULT_RETRY_INTERVAL_MS = 15_000;

/**
 * Rendered only while a page is in its "recovering" (breaker open) state.
 * Silently re-runs the Server Component on an interval so live data comes
 * back on its own — cleaned up automatically once a refresh succeeds and
 * this component is no longer rendered.
 *
 * Skips a cycle whenever a PendingLink transition is in flight
 * (lib/navigation-pending.ts) - router.refresh() and an in-flight Link
 * push both go through Next's client router, and a refresh firing
 * mid-transition can interrupt the push. That produces a click that
 * silently never completes even though the destination page's data
 * loaded fine server-side, since the browser never actually commits the
 * route change.
 */
export function AutoRetryOnDegraded({ intervalMs = DEFAULT_RETRY_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (isNavigationPending()) return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
