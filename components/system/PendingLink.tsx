'use client';

import Link from 'next/link';
import { useState } from 'react';

type PendingLinkProps = {
  href: string;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  prefetch?: boolean;
};

export function PendingLink({ href, children, pendingText = 'Redirecting...', className, prefetch }: PendingLinkProps) {
  const [pending, setPending] = useState(false);

  return (
    <Link
      href={href}
      prefetch={prefetch ?? false}
      aria-disabled={pending}
      onClick={() => setPending(true)}
      className={`${className ?? ''} ${pending ? 'pointer-events-none opacity-80' : ''}`}
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
