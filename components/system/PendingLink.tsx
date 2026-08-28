'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { markNavigationPending, markNavigationSettled } from '@/lib/navigation-pending';

type PendingLinkProps = {
  href: string;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  prefetch?: boolean;
};

// pending only clears when usePathname() reports the browser actually
// landed on the new route - by design, with no ceiling, a transition that
// gets interrupted or silently dropped (e.g. a concurrent router.refresh()
// racing an in-flight Link navigation, such as AutoRetryOnDegraded's
// polling while a list is in its degraded state) leaves the spinner shown
// forever. Set above the slowest documented worst-case detail-page load
// (core timeout + one retry, ~9-10s under connection-pool pressure) so it
// doesn't fire while a real navigation is still legitimately in flight.
const STUCK_TRANSITION_TIMEOUT_MS = 10_000;

export function PendingLink({ href, children, pendingText = 'Redirecting...', className, prefetch }: PendingLinkProps) {
  const [pending, setPending] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isExternal = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:');
  const targetPath = isExternal ? href : href.split('?')[0];
  const isCurrentPage = targetPath === pathname;
  const shouldPrefetch = prefetch ?? !isExternal;

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  // markNavigationPending()/markNavigationSettled() (lib/navigation-pending.ts)
  // let AutoRetryOnDegraded's background router.refresh() polling know a
  // real navigation is in flight, so it can skip a cycle instead of racing
  // it - a concurrent refresh can interrupt an in-flight Link push, which
  // looks exactly like this: the destination page's data loads fine
  // server-side, but the browser never actually lands on the new route.
  //
  // If the timeout still fires despite that - client-side navigation can
  // fail to commit for reasons beyond that one identified race - falling
  // back to a real browser navigation (window.location.href) is a strict
  // superset of what a client-side push does: it cannot silently get
  // interrupted or lost the way an in-flight router transition can. This
  // guarantees a click eventually opens the destination even if the exact
  // cause of a stuck SPA transition is never fully pinned down.
  useEffect(() => {
    if (!pending) return;
    // markNavigationPending() is called synchronously in markPending() below so
    // AutoRetryOnDegraded's isNavigationPending() check is satisfied before the
    // next setInterval tick — not after the next React paint.
    const timeout = setTimeout(() => {
      setPending(false);
      if (!isExternal) window.location.href = href;
    }, STUCK_TRANSITION_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
      markNavigationSettled();
    };
  }, [pending, href, isExternal]);

  const primeRoute = () => {
    if (!isExternal) router.prefetch(href);
  };

  const markPending = () => {
    if (!isCurrentPage && !isExternal) {
      markNavigationPending(); // sync — before React batches the state update
      setPending(true);
    }
  };

  return (
    <Link
      href={href}
      prefetch={shouldPrefetch}
      aria-disabled={pending}
      onMouseEnter={primeRoute}
      onPointerDown={markPending}
      onClick={markPending}
      className={`${className ?? ''} ${pending ? 'opacity-80' : ''}`}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Link>
  );
}
