import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentTenant, isTenantDatabaseError } from '@/lib/auth';
import { RedisWarningBanner } from '@/components/system/RedisWarningBanner';

export const dynamic = 'force-dynamic';

const defaultDepartments = ['Legal', 'Finance', 'Procurement', 'IT & Security', 'Engineering', 'Human Resources', 'Sales', 'Operations'];
const onboardingSteps = [
  { key: 'organization', label: 'Organization' },
  { key: 'departments', label: 'Departments' },
  { key: 'categories', label: 'Categories' },
  { key: 'connect', label: 'Integrations' },
] as const;

const inputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100';
const primaryButtonClass =
  'inline-flex min-h-0 h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-[#1b49bd]';
const secondaryButtonClass =
  'inline-flex min-h-0 h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950';

const categoryDetails = [
  ['Contracts', 'Legal sign-offs, redlines, and commercial approvals.'],
  ['Vendor Onboarding', 'New supplier, partner, and procurement approvals.'],
  ['Budget Approvals', 'Spend, headcount, and finance authorization.'],
  ['Policy Changes', 'Operational, HR, and internal policy decisions.'],
  ['Hiring Approvals', 'Recruiting, offer, and team expansion approvals.'],
  ['Security Reviews', 'Security exceptions, access, and risk reviews.'],
  ['Engineering Changes', 'Release, architecture, and technical decision approvals.'],
  ['Compliance Decisions', 'Audit, privacy, governance, and control approvals.'],
] as const;

const integrations = [
  ['Slack', 'Capture approvals from channels and DMs.', 'Connect', '/api/integrations/slack/install', '#4A154B'],
  ['Gmail', 'Read approval evidence from email threads.', 'Connect', '/api/integrations/gmail/install', '#EA4335'],
  ['Microsoft Teams', 'Teams messages and Graph events.', 'Coming Soon', '', '#6264A7'],
  ['Outlook', 'Microsoft 365 mailbox approvals.', 'Coming Soon', '', '#0078D4'],
  ['Zoom', 'Meeting transcript approval capture.', 'Coming Soon', '', '#2D8CFF'],
  ['Jira', 'Issue transition and release approvals.', 'Coming Soon', '', '#0C66E4'],
] as const;

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
  const departments = formData.getAll('departments').map(String).map((department) => department.trim()).filter(Boolean);
  await prisma.organization.update({
    where: { id: organization.id },
    data: { departments },
  });
  redirect('/onboarding?step=categories');
}

async function saveCategories(formData: FormData) {
  'use server';
  const { organization } = await getCurrentTenant();
  const approvalCategories = formData.getAll('categories').map(String).map((category) => category.trim()).filter(Boolean);
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

function BrandMark({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const isDark = theme === 'dark';
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#2155d9] shadow-lg shadow-blue-950/20">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="#dbe7ff" strokeWidth="1.9" />
          <path d="m8.8 12 2.1 2.1 4.5-5" stroke="#dbe7ff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>
        <span className={`block text-base font-black ${isDark ? 'text-white' : 'text-[#2155d9]'}`}>ApprovLine</span>
        <span className={`block text-xs font-semibold ${isDark ? 'text-white/65' : 'text-slate-500'}`}>Every approval. Captured. Proven.</span>
      </span>
    </div>
  );
}

function ProgressIndicator({ currentStep }: { currentStep: string }) {
  const current = getStepIndex(currentStep);
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Step {current + 1} of 4</p>
      <div className="mt-4 grid grid-cols-4 gap-0">
        {onboardingSteps.map((item, index) => {
          const isActive = index === current;
          const isComplete = index < current;
          return (
            <div key={item.key} className="relative grid justify-items-center gap-2">
              {index > 0 ? <span className={`absolute left-[-50%] top-3 h-px w-full ${index <= current ? 'bg-[#2155d9]' : 'bg-slate-200'}`} /> : null}
              <span
                className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-black ${
                  isActive || isComplete ? 'border-[#2155d9] bg-[#2155d9] text-white shadow-sm shadow-blue-200' : 'border-slate-300 bg-white text-slate-400'
                }`}
              >
                {isComplete ? '✓' : index + 1}
              </span>
              <span className={`hidden text-center text-[11px] font-bold sm:block ${isActive ? 'text-slate-950' : 'text-slate-400'}`}>{item.label}</span>
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
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[minmax(420px,0.92fr)_1.08fr]">
        <aside className="relative hidden overflow-hidden bg-[#030612] px-10 py-8 text-white lg:flex lg:flex-col">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(47,107,255,0.35),transparent_28%),radial-gradient(circle_at_78%_72%,rgba(33,85,217,0.22),transparent_34%)]" />
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />
          <div className="relative z-10">
            <Link href="/" aria-label="ApprovLine home">
              <BrandMark theme="dark" />
            </Link>
          </div>
          <div className="relative z-10 my-auto max-w-xl py-14">
            <div className="mb-8 inline-flex rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-bold text-blue-100">
              Universal Approval Intelligence
            </div>
            <h1 className="text-[40px] font-black leading-[1.05] tracking-tight text-white xl:text-[52px]">Every approval. Captured. Proven.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
              Turn Slack, Gmail, Microsoft Teams, and email approvals into a searchable audit trail.
            </p>
            <div className="mt-10 rounded-[24px] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
              <div className="grid h-40 place-items-center rounded-2xl border border-blue-300/15 bg-gradient-to-br from-blue-500/20 to-white/5">
                <div className="grid h-24 w-24 place-items-center rounded-3xl bg-[#2155d9] shadow-[0_24px_80px_rgba(47,107,255,0.35)]">
                  <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" aria-hidden="true">
                    <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="#dbe7ff" strokeWidth="1.5" />
                    <path d="m8.8 12 2.1 2.1 4.5-5" stroke="#dbe7ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="relative z-10 grid grid-cols-2 gap-3 text-xs font-bold text-slate-200">
            {['Enterprise Security', 'Audit Ready', 'Read-only Integrations', 'AI Approval Intelligence'].map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">✓ {item}</span>
            ))}
          </div>
        </aside>

        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6 sm:px-6 lg:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(33,85,217,0.10),transparent_32%)]" />
          <div className="relative w-full max-w-[620px]">
            <header className="mb-6 flex items-center justify-between gap-4 lg:hidden">
              <Link href="/" aria-label="ApprovLine home" className="rounded-xl bg-[#030612] px-3 py-2">
                <BrandMark theme="dark" />
              </Link>
              <Link href="/dashboard" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm">
                Dashboard
              </Link>
            </header>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-8">
            <ProgressIndicator currentStep={step} />
            <div className="mt-7">
              <h1 className="text-[30px] font-black leading-tight tracking-tight text-slate-950 sm:text-[34px]">{title}</h1>
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
      <StepShell step="departments" title="Add your departments" subtitle="Choose the teams whose approvals ApprovLine should track.">
        <form action={saveDepartments} className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {defaultDepartments.map((department) => (
              <label key={department} className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <input name="departments" type="checkbox" value={department} defaultChecked={organization.departments.includes(department)} className="h-4 w-4 rounded border-slate-300 accent-[#2155d9]" />
                <span>{department}</span>
              </label>
            ))}
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-slate-700">Add another department</span>
            <input name="departments" placeholder="Customer Success" className={inputClass} />
          </label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link href="/onboarding" className={secondaryButtonClass}>Back</Link>
            <button className={primaryButtonClass}>Continue →</button>
          </div>
        </form>
      </StepShell>
    );
  }

  if (step === 'categories') {
    return (
      <StepShell step="categories" title="Configure approval categories" subtitle="Select the approval types ApprovLine should detect and audit.">
        <form action={saveCategories} className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {categoryDetails.map(([category, description], index) => (
              <label key={category} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-xs font-black text-[#2155d9]">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-950">{category}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                </span>
                <input name="categories" type="checkbox" value={category} defaultChecked={organization.approvalCategories.includes(category)} className="mt-1 h-4 w-4 accent-[#2155d9]" />
              </label>
            ))}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link href="/onboarding?step=departments" className={secondaryButtonClass}>Back</Link>
            <button className={primaryButtonClass}>Continue →</button>
          </div>
        </form>
      </StepShell>
    );
  }

  if (step === 'connect') {
    return (
      <StepShell step="connect" title="Connect your tools" subtitle="Start capturing approvals where your team already works.">
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {integrations.map(([name, description, status, href, color]) => (
              <div key={name} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-black text-white" style={{ background: color }}>{name[0]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-black text-slate-950">{name}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${status === 'Connect' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                        {status === 'Connect' ? 'Not Connected' : status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                    {href ? (
                      <a href={href} className="mt-3 inline-flex min-h-0 h-9 items-center justify-center rounded-lg bg-[#2155d9] px-3 text-xs font-bold text-white shadow-sm hover:bg-[#1b49bd]">
                        Connect
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link href="/onboarding?step=categories" className={secondaryButtonClass}>Back</Link>
            <form action={completeOnboarding}>
              <button className={primaryButtonClass}>Complete Setup →</button>
            </form>
          </div>
          <form action={completeOnboarding} className="sm:hidden">
            <button className="min-h-0 h-11 w-full rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
              Skip integrations for now
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
          <input name="name" defaultValue={organization.name} placeholder="Acme Inc." className={inputClass} required />
          <span className="text-xs font-semibold text-slate-500">This will be your workspace name.</span>
        </label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Link href="/" className={secondaryButtonClass}>Back</Link>
          <button className={primaryButtonClass}>Continue →</button>
        </div>
      </form>
    </StepShell>
  );
}
