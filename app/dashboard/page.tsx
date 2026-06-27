import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export default async function DashboardPage() {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const user = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
    include: { organization: true },
  });

  if (!user?.organization) {
    return (
      <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <h2 className="text-2xl font-black">Complete onboarding</h2>
          <p className="mt-2 text-slate-600">
            Create your ApprovLine organization before opening the dashboard.
          </p>
        </div>
        <Link href="/onboarding" className="w-fit rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">
          Complete onboarding
        </Link>
      </section>
    );
  }

  if (!user.organization.onboardedAt) {
    redirect('/onboarding');
  }

  redirect('/dashboard/approvals');
}
