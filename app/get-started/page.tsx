import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getCurrentTenant, isTenantDatabaseError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function DatabaseSetupError() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section className="mx-auto grid max-w-3xl gap-4 rounded-lg border border-rose-200 bg-white p-6">
        <div>
          <p className="text-sm font-bold uppercase text-rose-600">Database setup required</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">ApprovLine database is not ready</h1>
        </div>
        <p className="text-slate-600">
          Add <code>DATABASE_URL</code> in Vercel Project Settings and redeploy. ApprovLine needs PostgreSQL before it can create your workspace.
        </p>
        <a href="/health" className="w-fit rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">
          Open health check
        </a>
      </section>
    </main>
  );
}

export default async function GetStartedPage() {
  const session = await auth();

  if (!session.userId) {
    redirect('/sign-up?redirect_url=/onboarding');
  }

  let tenant;
  try {
    tenant = await getCurrentTenant();
  } catch (error) {
    if (isTenantDatabaseError(error)) return <DatabaseSetupError />;
    throw error;
  }
  const { organization } = tenant;
  redirect(organization.onboardedAt ? '/dashboard' : '/onboarding');
}
