import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import { enforcePageRole } from '@/lib/rbac';
import { CopilotClient } from '@/components/copilot/CopilotClient';
import { copilotSuggestions } from '@/services/copilot/copilot';
import { PendingLink } from '@/components/system/PendingLink';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const COPILOT_TENANT_TIMEOUT_MS = 8000;

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session.userId) redirect('/sign-in');

  const tenant = await getDashboardTenant(COPILOT_TENANT_TIMEOUT_MS);
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    redirect('/onboarding');
  }
  if (tenant.status === 'ready' && tenant.user) {
    enforcePageRole('/copilot', tenant.user.role);
  }

  const params = await searchParams;

  let orgStats = { total: 0, highRisk: 0, violations: 0, evidenceCoverage: 0 };
  if (tenant.status === 'ready' && tenant.organization) {
    const orgId = tenant.organization.id;
    try {
      const [total, highRisk, violations, withEvidence] = await Promise.all([
        prisma.approvalRecord.count({ where: { organizationId: orgId } }),
        prisma.approvalRecord.count({
          where: { organizationId: orgId, riskLevel: { in: ['high', 'critical'] } },
        }),
        prisma.approvalRecord.count({
          where: {
            organizationId: orgId,
            complianceEvaluations: { some: { severity: { in: ['high', 'critical'] } } },
          },
        }),
        prisma.approvalRecord.count({
          where: {
            organizationId: orgId,
            evidenceSnippet: { not: null },
            sourceLink: { not: null },
          },
        }),
      ]);
      orgStats = {
        total,
        highRisk,
        violations,
        evidenceCoverage: total > 0 ? Math.round((withEvidence / total) * 100) : 0,
      };
    } catch {
      // leave defaults; the UI shows zeroes gracefully
    }
  }

  return (
    <DashboardShell>
      {tenant.status !== 'ready' ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <h2 className="font-black">Workspace context is delayed</h2>
          <p className="mt-1 text-sm leading-6">
            Copilot can open, but answers may be limited until workspace readiness completes.{' '}
            {tenant.error ?? 'Workspace lookup is still warming up.'}
          </p>
          <PendingLink
            href="/api/debug/dashboard"
            pendingText="Opening diagnostics..."
            className="mt-3 inline-flex h-10 min-h-0 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-black text-amber-900"
          >
            Open diagnostics
          </PendingLink>
        </div>
      ) : null}

      <CopilotClient
        suggestions={copilotSuggestions()}
        initialQuestion={params.q}
        orgStats={orgStats}
      />
    </DashboardShell>
  );
}
