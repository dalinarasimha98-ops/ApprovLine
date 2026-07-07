import type { ReactNode } from 'react';
import { FounderForbidden, FounderShell } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';

export const dynamic = 'force-dynamic';

export default async function FounderLayout({ children }: { children: ReactNode }) {
  const access = await getFounderAccess();
  if (!access.ok) return <FounderForbidden />;
  return <FounderShell email={access.email} role={access.role}>{children}</FounderShell>;
}
