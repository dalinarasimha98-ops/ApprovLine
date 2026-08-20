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
// forever. This bounds it: if the route hasn't changed by this point, the
// link reverts to its normal clickable state so a retry click always
// works, instead of the user being stuck. Set above the slowest documented
// worst-case detail-page load (core timeout + one retry, ~9-10s under
// connection-pool pressure) so it doesn't fire while a real navigation is
// still legitimately in flight.
const STUCK_TRANSITION_TIMEOUT_MS = 10_000;

export function PendingLink({ href, children, pendingText = 'Redirecting...', className, prefetch }: PendingLinkProps) {
  const [pending, setPending] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  // markNavigationPending()/markNavigationSettled() (lib/navigation-pending.ts)
  // let AutoRetryOnDegraded's background router.refresh() polling know a
  // real navigation is in flight, so it can skip a cycle instead of racing
  // it - a concurrent refresh can interrupt an in-flight Link push, which
  // looks exactly like this: the destination page's data loads fine
  // server-side, but the browser never actually lands on the new route.
  useEffect(() => {
    if (!pending) return;
    markNavigationPending();
    const timeout = setTimeout(() => setPending(false), STUCK_TRANSITION_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
      markNavigationSettled();
    };
  }, [pending]);

  const isExternal = href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:');
  const targetPath = isExternal ? href : href.split('?')[0];
  const isCurrentPage = targetPath === pathname;
  const shouldPrefetch = prefetch ?? !isExternal;

  const primeRoute = () => {
    if (!isExternal) router.prefetch(href);
  };

  const markPending = () => {
    if (!isCurrentPage && !isExternal) setPending(true);
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
