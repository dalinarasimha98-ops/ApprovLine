import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { isFounderIdentity } from '@/lib/founder-identity';

export const dynamic = 'force-dynamic';

// A short-link convenience alias for the founder - it must never redirect
// toward /founder for anyone but the founder, or the URL bar alone would
// reveal that route exists to a customer.
export default async function GatewayReliabilityAliasPage() {
  const session = await auth();
  if (!session.userId) redirect('/dashboard');
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? null;
  if (!isFounderIdentity(session.userId, email)) redirect('/dashboard');
  redirect('/founder/reliability');
}
