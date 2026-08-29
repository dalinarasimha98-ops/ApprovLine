import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';
import { hasAnyRole } from '@/lib/rbac';
import { enforcePageRole } from '@/lib/rbac';
import { ensureMemoryStorage } from '@/services/memory-storage';
import { rebuildMemoryGraphForOrganization } from '@/services/memory';
import { MemoryGraphWorkspace } from '@/components/memory/MemoryGraphWorkspace';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'OWNER'] as const;

async function refreshMemoryGraphAction() {
  'use server';
  const tenant = await getDashboardTenant(5000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/memory', tenant.user.role);
  try {
    await rebuildMemoryGraphForOrganization(tenant.organization.id);
  } catch (error) {
    console.error('[memory] graph refresh failed', error);
    redirect('/memory?refresh=error');
  }
  redirect('/memory?refresh=complete');
}

type MemoryPageProps = {
  searchParams: Promise<{ q?: string; refresh?: string }>;
};

export default async function MemoryPage({ searchParams }: MemoryPageProps) {
  const tenant = await getDashboardTenant(6000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/dashboard');
  enforcePageRole('/memory', tenant.user.role);
  if (!hasAnyRole(tenant.user.role, [...ALLOWED_ROLES])) redirect('/dashboard');

  const params = await searchParams;
  const orgId = tenant.organization.id;

  // Pre-fetch initial graph data for SSR (avoid waterfall on first render)
  let normalizedEntities: import('@/components/memory/MemoryGraphWorkspace').GraphEntity[] = [];
  let normalizedRelationships: import('@/components/memory/MemoryGraphWorkspace').GraphRelationship[] = [];
  let initialTotal = 0;

  try {
    await ensureMemoryStorage();

    const [rawEntities, count] = await withTimeout(
      'memory page initial entities',
      Promise.all([
        prisma.memoryEntity.findMany({
          where: { organizationId: orgId },
          select: {
            id: true, type: true, title: true, subtitle: true,
            riskScore: true, sourceSystem: true, externalId: true,
            metadata: true, firstSeenAt: true, lastSeenAt: true, updatedAt: true,
            _count: { select: { outgoingRelationships: true, incomingRelationships: true } },
          },
          orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
          take: 80,
        }),
        prisma.memoryEntity.count({ where: { organizationId: orgId } }),
      ]),
      4000,
    );
    initialTotal = count;

    normalizedEntities = rawEntities.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      subtitle: e.subtitle,
      riskScore: e.riskScore,
      sourceSystem: e.sourceSystem,
      externalId: e.externalId,
      metadata: e.metadata,
      firstSeenAt: e.firstSeenAt.toISOString(),
      lastSeenAt: e.lastSeenAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      connectionCount: (e._count.outgoingRelationships) + (e._count.incomingRelationships),
    }));

    const entityIds = rawEntities.map((e) => e.id);
    if (entityIds.length > 0) {
      const rawRels = await withTimeout(
        'memory page initial relationships',
        prisma.memoryRelationship.findMany({
          where: { organizationId: orgId, fromEntityId: { in: entityIds }, toEntityId: { in: entityIds } },
          select: { id: true, fromEntityId: true, toEntityId: true, relationshipType: true, confidence: true, evidenceSnippet: true },
          take: 500,
        }),
        2000,
      );
      normalizedRelationships = rawRels.map((r) => ({
        id: r.id,
        fromEntityId: r.fromEntityId,
        toEntityId: r.toEntityId,
        relationshipType: r.relationshipType,
        confidence: r.confidence,
        evidenceSnippet: r.evidenceSnippet,
      }));
    }
  } catch {
    // Any SSR error (missing tables, timeout, etc.) — client workspace fetches on mount
  }

  return (
    <DashboardShell>
      <div className="flex flex-col h-full min-h-0 gap-0">
        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-[#1E2D4A] flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400">Enterprise Intelligence</p>
            <h1 className="mt-0.5 text-xl font-bold text-[#E8EEFF] tracking-tight">Memory Graph</h1>
            <p className="mt-0.5 text-xs text-[#6B7FA8] max-w-xl">
              Relationships between approvals, people, vendors, contracts, policies, evidence, and risk signals — visualized as an interactive graph.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {params.refresh === 'complete' && (
              <span className="rounded-lg bg-emerald-950/60 border border-emerald-900/50 px-3 py-1.5 text-xs font-semibold text-emerald-400">Graph refreshed</span>
            )}
            {params.refresh === 'error' && (
              <span className="rounded-lg bg-rose-950/50 border border-rose-900/50 px-3 py-1.5 text-xs font-semibold text-rose-400">Refresh failed — try again</span>
            )}
            <form action={refreshMemoryGraphAction}>
              <button type="submit" className="rounded-lg bg-[#0E1830] border border-[#1E2D4A] px-3 py-1.5 text-xs font-semibold text-[#6B7FA8] hover:text-[#E8EEFF] hover:border-violet-500/50 transition">
                ↺ Rebuild Graph
              </button>
            </form>
          </div>
        </div>

        {/* Interactive workspace */}
        <div className="flex-1 min-h-0" style={{ height: 'calc(100vh - 160px)' }}>
          <MemoryGraphWorkspace
            initialEntities={normalizedEntities}
            initialRelationships={normalizedRelationships}
            initialTotal={initialTotal}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
