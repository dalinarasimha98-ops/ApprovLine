import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant, isTenantDatabaseError } from '@/lib/auth';
import { RedisWarningBanner } from '@/components/system/RedisWarningBanner';

export const dynamic = 'force-dynamic';

const categories = ['Finance', 'Procurement', 'Legal', 'HR', 'Engineering', 'Security', 'Compliance'];
const defaultDepartments = ['Finance', 'Legal', 'Procurement', 'Engineering', 'Security', 'Compliance', 'HR'];

async function saveOrganization(formData: FormData) {
  'use server';
  const { organization } = await getCurrentTenant();
  const name = String(formData.get('name') ?? '').trim();
  if (name) {
    await prisma.organization.update({ where: { id: organization.id }, data: { name } });
  }
  redirect('/onboarding?step=invite');
}

async function saveInvites(formData: FormData) {
  'use server';
  const { organization, user } = await getCurrentTenant();
  const emails = String(formData.get('emails') ?? '')
    .split(/[\n,]/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length) {
    await prisma.event.create({
      data: {
        organizationId: organization.id,
        type: 'onboarding.team_invites.created',
        payload: { emails, invitedByUserId: user.id },
      },
    });
  }
  redirect('/onboarding?step=departments');
}

async function saveDepartments(formData: FormData) {
  'use server';
  const { organization } = await getCurrentTenant();
  const departments = formData.getAll('departments').map(String);
  await prisma.organization.update({
    where: { id: organization.id },
    data: { departments },
  });
  redirect('/onboarding?step=categories');
}

async function saveCategories(formData: FormData) {
  'use server';
  const { organization } = await getCurrentTenant();
  const approvalCategories = formData.getAll('categories').map(String);
  await prisma.organization.update({
    where: { id: organization.id },
    data: { approvalCategories },
  });
  redirect('/onboarding?step=connect');
}

async function completeOnboarding() {
  'use server';
  const { organization } = await getCurrentTenant();
  await prisma.organization.update({
    where: { id: organization.id },
    data: { onboardedAt: new Date() },
  });
  redirect('/onboarding?step=complete');
}

function StepShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section className="mx-auto grid max-w-3xl gap-6 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <p className="text-sm font-bold uppercase text-[#2155d9]">ApprovLine setup</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{title}</h1>
        </div>
        <RedisWarningBanner />
        {children}
      </section>
    </main>
  );
}

function DatabaseSetupError() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section className="mx-auto grid max-w-3xl gap-4 rounded-lg border border-rose-200 bg-white p-6">
        <div>
          <p className="text-sm font-bold uppercase text-rose-600">Database setup required</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">ApprovLine database is not ready</h1>
        </div>
        <p className="text-slate-600">
          Add a valid <code>DATABASE_URL</code> in Vercel Project Settings and redeploy so Prisma migrations can run before onboarding opens.
        </p>
        <a href="/health" className="w-fit rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">
          Open health check
        </a>
      </section>
    </main>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  let tenant;
  try {
    tenant = await getCurrentTenant();
  } catch (error) {
    if (isTenantDatabaseError(error)) return <DatabaseSetupError />;
    throw error;
  }
  const { organization } = tenant;
  const step = (await searchParams).step ?? 'organization';

  if (organization.onboardedAt && step !== 'complete') {
    redirect('/dashboard');
  }

  if (step === 'invite') {
    return (
      <StepShell title="Invite team members">
        <form action={saveInvites} className="grid gap-4">
          <textarea name="emails" placeholder="teammate@company.com, compliance@company.com" className="min-h-32 rounded-md border border-slate-200 px-3 py-2" />
          <button className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">Continue</button>
        </form>
      </StepShell>
    );
  }

  if (step === 'departments') {
    return (
      <StepShell title="Select departments">
        <form action={saveDepartments} className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-2">
            {defaultDepartments.map((department) => (
              <label key={department} className="flex items-center gap-2 rounded-md border border-slate-200 p-3">
                <input name="departments" type="checkbox" value={department} defaultChecked={organization.departments.includes(department)} />
                <span>{department}</span>
              </label>
            ))}
          </div>
          <button className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">Continue</button>
        </form>
      </StepShell>
    );
  }

  if (step === 'categories') {
    return (
      <StepShell title="Choose approval categories">
        <form action={saveCategories} className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-2">
            {categories.map((category) => (
              <label key={category} className="flex items-center gap-2 rounded-md border border-slate-200 p-3">
                <input name="categories" type="checkbox" value={category} defaultChecked={organization.approvalCategories.includes(category)} />
                <span>{category}</span>
              </label>
            ))}
          </div>
          <button className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">Continue</button>
        </form>
      </StepShell>
    );
  }

  if (step === 'connect') {
    return (
      <StepShell title="Connect Slack">
        <p className="text-slate-600">Connect Slack with read-only scopes so ApprovLine can classify approval messages without writing back to Slack.</p>
        <div className="flex gap-3">
          <a href="/api/integrations/slack/install" className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">Connect Slack</a>
          <form action={completeOnboarding}>
            <button className="rounded-md border border-slate-200 px-4 py-2 font-bold text-slate-700">Skip for now</button>
          </form>
        </div>
      </StepShell>
    );
  }

  if (step === 'complete') {
    return (
      <StepShell title="Setup complete">
        <p className="text-slate-600">Your organization is ready to capture approvals, classify decisions, and build an audit-ready timeline.</p>
        <a href="/dashboard" className="rounded-md bg-[#2155d9] px-4 py-2 text-center font-bold text-white">Open dashboard</a>
      </StepShell>
    );
  }

  return (
    <StepShell title="Create organization">
      <form action={saveOrganization} className="grid gap-4">
        <input name="name" defaultValue={organization.name} placeholder="Company name" className="rounded-md border border-slate-200 px-3 py-2" />
        <button className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white">Continue</button>
      </form>
    </StepShell>
  );
}
