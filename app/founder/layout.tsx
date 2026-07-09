import type { ReactNode } from 'react';
import { FounderForbidden, FounderShell, FounderSystemError } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';

export const dynamic = 'force-dynamic';

function safeFounderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgresql:\/\/[^ ]+/g, '[database-url-redacted]').slice(0, 220);
}

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const access = await getFounderAccess().catch((error) => {
    console.error('[founder] access check failed', error);
    return { ok: false as const, reason: 'forbidden' as const, email: null, safeError: safeFounderError(error) };
  });
  if ('safeError' in access) return <FounderSystemError detail={access.safeError} />;
  if (!access.ok) return <FounderForbidden email={access.email} />;
  return <FounderShell email={access.email} role={access.role}>{children}</FounderShell>;
}
