import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getCurrentTenant } from '@/lib/auth';

export default async function GetStartedPage() {
  const session = await auth();

  if (!session.userId) {
    redirect('/sign-up?redirect_url=/onboarding');
  }

  const { organization } = await getCurrentTenant();
  redirect(organization.onboardedAt ? '/dashboard' : '/onboarding');
}
