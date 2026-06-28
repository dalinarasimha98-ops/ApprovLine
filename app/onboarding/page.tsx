import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant, isTenantDatabaseError } from '@/lib/auth';
import { RedisWarningBanner } from '@/components/system/RedisWarningBanner';

export const dynamic = 'force-dynamic';

const categories = ['Finance', 'Procurement', 'Legal', 'HR', 'Engineering', 'Security', 'Compliance'];
const defaultDepartments = ['Finance', 'Legal', 'Procurement', 'Engineering', 'Security', 'Compliance', 'HR'];
const onboardingSteps = [
  { key: 'organization', label: 'Organization' },
  { key: 'departments', label: 'Departments' },
  { key: 'categories', label: 'Approval Categories' },
  { key: 'connect', label: 'Integrations' },
] as const;

const inputClass =
  'h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100';
const primaryButtonClass =
  'inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-[#1b49bd]';
const secondaryButtonClass =
  'inline-flex min-h-0 h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950';

async function saveOrganization(formData: FormData) {
  'use server';
  const { organization } = await getCurrentTenant();
  const name = String(formData.get('name') ?? '').trim();
  if (name) {
    await prisma.organization.update({ where: { id: organization.id }, data: { name } });
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

function getStepIndex(step: string) {
  const index = onboardingSteps.findIndex((item) => item.key === step);
  return index >= 0 ? index : 0;
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#2155d9] shadow-lg shadow-blue-200">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="#dbe7ff" strokeWidth="1.9" />
          <path d="m8.8 12 2.1 2.1 4.5-5" stroke="#dbe7ff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>
        <span className="block text-base font-black text-[#2155d9]">ApprovLine</span>
        <span className="block text-xs font-semibold text-slate-500">Every approval. Captured. Proven.</span>
      </span>
    </div>
  );
}

function ProgressIndicator({ currentStep }: { currentStep: string }) {
  const current = getStepIndex(currentStep);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Step {current + 1} of 4</p>
        <p className="hidden text-xs font-semibold text-slate-500 sm:block">{onboardingSteps[current]?.label ?? 'Organization'}</p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {onboardingSteps.map((item, index) => {
          const isActive = index === current;
          const isComplete = index < current;
          return (
            <div key={item.key} className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-black ${
                  isActive || isComplete ? 'border-[#2155d9] bg-[#2155d9] text-white' : 'border-slate-300 bg-white text-slate-400'
                }`}
              >
                {isComplete ? '✓' : index + 1}
              </span>
              <span className={`hidden truncate text-xs font-bold sm:block ${isActive ? 'text-slate-950' : 'text-slate-400'}`}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(33,85,217,0.10),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-6 text-slate-950 sm:px-6">
      <div className="pointer-events-none fixed inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="ApprovLine home">
            <BrandMark />
          </Link>
          <Link href="/dashboard" className="hidden rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-bold text-slate-600 shadow-sm backdrop-blur hover:bg-white sm:inline-flex">
            Dashboard
          </Link>
        </header>
        <section className="grid flex-1 place-items-center py-10">
          <div className="w-full max-w-[600px] rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
            <ProgressIndicator currentStep={step} />
            <div className="mt-7">
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{subtitle}</p>
            </div>
            <div className="mt-6">
              <RedisWarningBanner />
            </div>
            <div className="mt-6">{children}</div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-5 text-xs font-bold text-slate-500">
              <span>✓ Enterprise Security</span>
              <span>✓ Audit Ready</span>
              <span>✓ Read-only Integrations</span>
              <span>✓ AI Approval Intelligence</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function DatabaseSetupError({ message }: { message?: string }) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-6 text-slate-950 sm:px-6">
      <section className="mx-auto mt-20 grid max-w-xl gap-4 rounded-2xl border border-rose-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-8">
        <BrandMark />
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-rose-600">Database setup required</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">ApprovLine database is not ready</h1>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          {message ??
            'Invalid DATABASE_URL format. In Vercel, the variable name should be DATABASE_URL and the value should start with postgresql:// or postgres://. Do not include DATABASE_URL= in the value field.'}
        </p>
        <a href="/health" className={primaryButtonClass}>
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
    if (isTenantDatabaseError(error)) return <DatabaseSetupError message={error.message} />;
    throw error;
  }
  const { organization } = tenant;
  const step = (await searchParams).step ?? 'organization';

  if (organization.onboardedAt && step !== 'complete') {
    redirect('/dashboard');
  }

  if (step === 'invite') {
    redirect('/onboarding?step=departments');
  }

  if (step === 'departments') {
    return (
      <StepShell step="departments" title="Select departments" subtitle="Tell ApprovLine where approval decisions happen so your dashboard can group evidence cleanly.">
        <form action={saveDepartments} className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {defaultDepartments.map((department) => (
              <label key={department} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <input name="departments" type="checkbox" value={department} defaultChecked={organization.departments.includes(department)} className="h-4 w-4 accent-[#2155d9]" />
                <span>{department}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link href="/onboarding" className={secondaryButtonClass}>Back</Link>
            <button className={primaryButtonClass}>Continue</button>
          </div>
        </form>
      </StepShell>
    );
  }

  if (step === 'categories') {
    return (
      <StepShell step="categories" title="Choose approval categories" subtitle="Select the business areas ApprovLine should classify, search, and report for compliance review.">
        <form action={saveCategories} className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((category) => (
              <label key={category} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <input name="categories" type="checkbox" value={category} defaultChecked={organization.approvalCategories.includes(category)} className="h-4 w-4 accent-[#2155d9]" />
                <span>{category}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link href="/onboarding?step=departments" className={secondaryButtonClass}>Back</Link>
            <button className={primaryButtonClass}>Continue</button>
          </div>
        </form>
      </StepShell>
    );
  }

  if (step === 'connect') {
    return (
      <StepShell step="connect" title="Connect your first integration" subtitle="Start with Slack using read-only scopes. ApprovLine can capture approval evidence without writing back to your tools.">
        <div className="grid gap-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#4a154b] text-sm font-black text-white">S</span>
              <div>
                <h2 className="font-black text-slate-950">Slack approval capture</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Read-only message events, verified signatures, encrypted tokens, and audit-ready source evidence.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link href="/onboarding?step=categories" className={secondaryButtonClass}>Back</Link>
            <a href="/api/integrations/slack/install" className={primaryButtonClass}>Connect Slack</a>
          </div>
          <form action={completeOnboarding}>
            <button className="min-h-0 h-11 w-full rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
              Skip for now and open dashboard
            </button>
          </form>
        </div>
      </StepShell>
    );
  }

  if (step === 'complete') {
    return (
      <StepShell step="connect" title="Setup complete" subtitle="Your organization is ready to capture approvals, classify decisions, and build an audit-ready timeline.">
        <a href="/dashboard" className={`${primaryButtonClass} w-full`}>Open dashboard</a>
      </StepShell>
    );
  }

  return (
    <StepShell step="organization" title="Welcome to ApprovLine" subtitle="Let's create your workspace and configure approval intelligence.">
      <form action={saveOrganization} className="grid gap-5">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">Organization Name</span>
          <input name="name" defaultValue={organization.name} placeholder="Acme Inc." className={inputClass} />
        </label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Link href="/" className={secondaryButtonClass}>Back</Link>
          <button className={primaryButtonClass}>Continue</button>
        </div>
      </form>
    </StepShell>
  );
}
