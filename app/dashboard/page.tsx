import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PendingLink } from '@/components/system/PendingLink';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const user = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
    include: { organization: true },
  });

  if (!user?.organization) {
    return (
      <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Workspace setup</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Complete onboarding</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Create your ApprovLine organization before opening the dashboard.
          </p>
        </div>
        <PendingLink href="/onboarding" pendingText="Opening onboarding..." className="inline-flex min-h-0 h-11 w-fit items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
          Complete onboarding
        </PendingLink>
      </section>
    );
  }

  if (!user.organization.onboardedAt) {
    redirect('/onboarding');
  }

  redirect('/dashboard/approvals');
}
