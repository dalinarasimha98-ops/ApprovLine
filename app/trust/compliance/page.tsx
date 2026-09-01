import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ComplianceHubShell } from '@/components/compliance/ComplianceHubShell';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';
import {
  getComplianceOverview,
  getComplianceTrend,
  seedComplianceFrameworks,
} from '@/services/compliance';

export const dynamic = 'force-dynamic';

// Preserve the security-request action so existing callers and audit-log
// entries that reference it continue to work.
async function submitSecurityRequest(formData: FormData) {
  'use server';

  const tenant = await getDashboardTenant();
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete')
    redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/trust/compliance');
  enforcePageRole('/trust/compliance', tenant.user.role);

  const requestType = String(formData.get('requestType') ?? 'Security questionnaire');
  const requester = String(formData.get('requester') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim();

  await writeAuditLog({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: 'security_request_submitted',
    metadata: {
      requestType,
      requester,
      details: details.slice(0, 1200),
      status: 'open',
      source: 'trust_compliance_hub',
    },
  });

  revalidatePath('/trust/compliance');
}

// Keep a reference so Next.js doesn't tree-shake the action.
void submitSecurityRequest;

export default async function ComplianceHubPage() {
  const tenant = await getDashboardTenant();

  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete')
    redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/dashboard');

  enforcePageRole('/trust/compliance', tenant.user.role);

  const orgId = tenant.organization.id;

  // Auto-seed default frameworks the first time a tenant opens the hub.
  // seedComplianceFrameworks is idempotent (checks existing count), so this is
  // safe on every render when the org has no frameworks yet.
  let overview;
  let trendPoints;

  try {
    overview = await getComplianceOverview(orgId);
    if (overview.frameworks.length === 0) {
      await seedComplianceFrameworks(orgId);
      // Re-fetch after seeding so the shell has real framework rows.
      overview = await getComplianceOverview(orgId);
    }
    trendPoints = await getComplianceTrend(orgId, 30);
  } catch (err) {
    console.error('[compliance-hub] data fetch failed', err);
    return (
      <DashboardShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <p className="text-sm font-black text-red-700">Compliance Hub is temporarily unavailable</p>
          <p className="mt-2 text-sm leading-6 text-red-600">
            A data dependency failed. Reload the page to retry.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      {/* Page header */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#07111f] px-6 py-7 text-white">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">
            Compliance Hub
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            {tenant.organization.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Monitor compliance posture, track approval compliance, evidence completeness, audit
            readiness, and remediation across every active framework.
          </p>
        </div>
      </div>

      {/* Main tabbed shell — all real DB data, all tenant-scoped */}
      <ComplianceHubShell initialData={overview} trendPoints={trendPoints} orgId={orgId} />
    </DashboardShell>
  );
}
