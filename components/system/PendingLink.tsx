'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type PendingLinkProps = {
  href: string;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  prefetch?: boolean;
};

export function PendingLink({ href, children, pendingText = 'Redirecting...', className, prefetch }: PendingLinkProps) {
  const [pending, setPending] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setPending(false);
  }, [pathname]);

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
