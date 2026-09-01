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
  type ComplianceTrendPoint,
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

  // Fetch overview — getComplianceOverview never throws; it returns { degraded: true }
  // when the DB is unreachable or the tables don't exist yet.
  const overview = await getComplianceOverview(orgId);

  // Auto-seed only when the overview succeeded and returned no frameworks.
  // Skip seeding when degraded so a missing migration doesn't crash the page.
  if (!overview.degraded && overview.frameworks.length === 0) {
    try {
      await seedComplianceFrameworks(orgId);
    } catch (err) {
      console.error('[compliance-hub] seed failed', err);
    }
  }

  // Trend points — defensive: returns [] on any failure.
  let trendPoints: ComplianceTrendPoint[] = [];
  try {
    trendPoints = await getComplianceTrend(orgId, 30);
  } catch (err) {
    console.error('[compliance-hub] trend fetch failed', err);
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
