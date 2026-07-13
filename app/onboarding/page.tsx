import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CustomerOnboardingWizard } from '@/components/onboarding/CustomerOnboardingWizard';
import { getCurrentTenant, isTenantDatabaseError } from '@/lib/auth';
import { buildOnboardingState, type CopilotSetupDraft, type IntegrationDraft, type PlaybookDraft, type TeamInviteDraft } from '@/services/onboarding';

export const dynamic = 'force-dynamic';

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function jsonObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

function DatabaseSetupError({ message }: { message?: string }) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-6 text-slate-950 sm:px-6">
      <section className="mx-auto mt-20 grid max-w-xl gap-4 rounded-2xl border border-rose-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wide text-rose-600">Database setup required</p>
        <h1 className="text-2xl font-black text-slate-950">ApprovLine database is not ready</h1>
        <p className="text-sm leading-6 text-slate-600">
          {message ?? 'Confirm DATABASE_URL is set correctly and Prisma migrations have been deployed.'}
        </p>
        <Link href="/health" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white">
          Open health check
        </Link>
      </section>
    </main>
  );
}

export default async function OnboardingPage({ searchParams }: { searchParams?: Promise<{ restart?: string }> }) {
  const params = await searchParams;
  const restartRequested = params?.restart === '1';
  let tenant;
  try {
    tenant = await getCurrentTenant();
  } catch (error) {
    if (isTenantDatabaseError(error)) return <DatabaseSetupError message={error.message} />;
    throw error;
  }

  if (tenant.user.role !== 'ADMIN') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="max-w-xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700">Org admin required</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">Only organization admins can complete onboarding</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Ask an organization admin to finish workspace setup or update your role.</p>
          <Link href="/dashboard" className="mt-5 inline-flex rounded-xl bg-[#2155d9] px-5 py-3 text-sm font-black text-white">Return to dashboard</Link>
        </section>
      </main>
    );
  }

  if (tenant.organization.onboardedAt && !restartRequested) redirect('/dashboard');

  const state = await buildOnboardingState(tenant.organization.id);
  const organization = state.organization;

  return (
    <CustomerOnboardingWizard
      initialState={{
        organization: {
          name: organization.name,
          companyDomain: organization.companyDomain ?? '',
          industry: organization.industry ?? '',
          companySize: organization.companySize ?? '',
          country: organization.country ?? '',
          primaryAdminName: organization.primaryAdminName ?? tenant.user.name ?? '',
          primaryAdminEmail: organization.primaryAdminEmail ?? tenant.user.email,
          departments: organization.departments,
          approvalCategories: organization.approvalCategories,
          onboardingStep: organization.onboardingStep,
          onboardingReadinessScore: organization.onboardingReadinessScore,
          onboardedAt: organization.onboardedAt?.toISOString() ?? null,
          onboardingLastSavedAt: organization.onboardingLastSavedAt?.toISOString() ?? null,
          invitedTeamMembers: jsonArray<TeamInviteDraft>(organization.invitedTeamMembers),
          integrationSetup: jsonArray<IntegrationDraft>(organization.integrationSetup),
          playbookSetup: jsonArray<PlaybookDraft>(organization.playbookSetup),
          copilotSetup: jsonObject<CopilotSetupDraft>(organization.copilotSetup, {
            dataSources: [],
            permissions: [],
            scope: '',
          }),
          memoryGraphInitializedAt: organization.memoryGraphInitializedAt?.toISOString() ?? null,
        },
        seatUsage: state.seatUsage,
      }}
    />
  );
}
