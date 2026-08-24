import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AutoRetryOnDegraded } from '@/components/dashboard/AutoRetryOnDegraded';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { RefreshButton } from '@/components/system/RefreshButton';
import { CardSkeleton } from '@/components/system/Skeletons';
import { getDashboardTenant } from '@/lib/auth';
import { isMigrationError } from '@/lib/prisma-errors';
import { buildMemoryDashboard, isDemoMemoryEntity, memoryEntityLabels, rebuildMemoryGraphForOrganization } from '@/services/memory';
import { enforcePageRole } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const AUTO_RETRY_INTERVAL_MS = 30_000;

type MemoryPageProps = {
  searchParams: Promise<{ q?: string; refresh?: string }>;
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 260) : 'Memory Graph could not load safely.';
}

function minutesAgo(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes === 0) return 'less than a minute ago';
  if (minutes === 1) return '1 minute ago';
  return `${minutes} minutes ago`;
}

function dateText(value: Date) {
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function typeTone(type: string) {
  if (type === 'RISK') return 'bg-rose-50 text-rose-700';
  if (type === 'POLICY') return 'bg-violet-50 text-violet-700';
  if (type === 'INVESTIGATION') return 'bg-amber-50 text-amber-800';
  if (type === 'APPROVAL' || type === 'DECISION') return 'bg-blue-50 text-[#2155d9]';
  return 'bg-slate-100 text-slate-700';
}

async function refreshMemoryGraphAction() {
  'use server';
  const tenant = await getDashboardTenant(5000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  enforcePageRole('/memory', tenant.user.role);

  try {
    await rebuildMemoryGraphForOrganization(tenant.organization.id);
  } catch (error) {
    // A genuinely exhausted retry (see findMemoryEntitiesForRelationship in
    // services/memory.ts) or any other rebuild failure must never crash this
    // Server Action - the user gets sent back to a working page with an
    // inline notice instead of Next's generic error boundary.
    console.error('[memory] graph refresh failed', error);
    redirect('/memory?refresh=error');
  }
  redirect('/memory?refresh=complete');
}

function StatCard({ label, value, help }: { label: string; value: number; help: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2155d9]">{label}</p>
      <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">{value.toLocaleString()}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{help}</p>
    </div>
  );
}

function DemoBadge() {
  return <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#2155d9]">Demo</span>;
}

function EntityList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ id: string; title: string; type: keyof typeof memoryEntityLabels; subtitle: string | null; riskScore: number; lastSeenAt: Date; metadata: unknown }>;
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>
      <div className="mt-4 grid gap-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">{empty}</p>
        ) : (
          items.map((item) => (
            <PendingLink key={item.id} href={`/memory/${item.id}`} pendingText="Opening entity..." className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${typeTone(item.type)}`}>
                    {memoryEntityLabels[item.type]}
                  </span>
                  <p className="mt-2 text-sm font-black text-slate-950">
                    {item.title}
                    {isDemoMemoryEntity(item) ? <DemoBadge /> : null}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{item.subtitle ?? dateText(item.lastSeenAt)}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-700 shadow-sm">Risk {item.riskScore}</span>
              </div>
            </PendingLink>
          ))
        )}
      </div>
    </section>
  );
}

function GraphPreview({
  entities,
  relationships,
}: {
  entities: Array<{ id: string; title: string; type: keyof typeof memoryEntityLabels; riskScore: number; metadata: unknown }>;
  relationships: Array<{ id: string; fromEntityId: string; toEntityId: string; relationshipType: string }>;
}) {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  return (
    <section className="rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-200">Graph View</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">Connected enterprise memory</h2>
        </div>
        <form action={refreshMemoryGraphAction}>
          <button className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm transition hover:bg-blue-50">Refresh graph</button>
        </form>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative min-h-80 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="absolute left-8 top-10 h-48 w-48 rounded-full border border-blue-300/20" />
          <div className="absolute bottom-8 right-10 h-56 w-56 rounded-full border border-emerald-300/20" />
          <div className="relative grid grid-cols-2 gap-4 sm:grid-cols-3">
            {entities.slice(0, 12).map((entity) => (
              <Link key={entity.id} href={`/memory/${entity.id}`} className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 backdrop-blur transition hover:bg-white/[0.13]">
                <span className="text-[10px] font-black uppercase tracking-wide text-blue-200">
                  {memoryEntityLabels[entity.type]}
                  {isDemoMemoryEntity(entity) ? <span className="ml-1.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] text-blue-100">Demo</span> : null}
                </span>
                <p className="mt-2 line-clamp-2 text-sm font-black text-white">{entity.title}</p>
                <p className="mt-2 text-xs font-semibold text-slate-400">Risk {entity.riskScore}</p>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-blue-200">Recent relationships</h3>
          <div className="mt-4 grid gap-3">
            {relationships.slice(0, 8).map((relationship) => {
              const from = entityMap.get(relationship.fromEntityId);
              const to = entityMap.get(relationship.toEntityId);
              return (
                <div key={relationship.id} className="rounded-xl bg-white/[0.06] p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">{relationship.relationshipType.replaceAll('_', ' ')}</p>
                  <p className="mt-1 text-sm font-bold text-white">{from?.title ?? 'Entity'} → {to?.title ?? 'Entity'}</p>
                </div>
              );
            })}
            {relationships.length === 0 ? <p className="text-sm font-semibold text-slate-400">Relationships appear after approvals, policies, investigations, or evidence are captured.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function DegradedNotice({ message, alert }: { message: string; alert: boolean }) {
  return (
    <div className={alert ? 'rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm' : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm'}>
      {alert ? <AutoRetryOnDegraded intervalMs={AUTO_RETRY_INTERVAL_MS} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={alert ? 'text-sm font-black text-amber-950' : 'text-sm font-black text-slate-950'}>
            {alert ? 'Memory Graph is recovering' : 'Refreshing...'}
          </p>
          <p className="mt-1 text-sm leading-6">{message}</p>
        </div>
        <RefreshButton className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-70" />
      </div>
    </div>
  );
}

/**
 * The only part of the page that depends on the database. Wrapped in
 * Suspense so the header, search form, and shell above always render
 * immediately regardless of query speed. buildMemoryDashboard() itself
 * never throws for a slow/failing query anymore (it returns a
 * degraded/alert/message shape instead) - the try/catch here only exists
 * for ensureMemoryStorage() failing outright (genuinely missing tables),
 * which is a distinct, rarer failure mode from a slow query.
 */
async function MemoryDashboardSection({ organizationId, query }: { organizationId: string; query?: string }) {
  let data: Awaited<ReturnType<typeof buildMemoryDashboard>> | null = null;
  let error: string | null = null;
  try {
    data = await buildMemoryDashboard(organizationId, query);
  } catch (cause) {
    error = safeError(cause);
  }

  if (error) {
    return isMigrationError(error) ? (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-black uppercase tracking-wide text-amber-800">Database migration required</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">Memory Graph storage is not ready yet</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">Run <code className="rounded bg-white px-2 py-1">npm run db:deploy</code> in production to enable Memory Graph tables.</p>
        <p className="mt-3 rounded-xl bg-white p-3 text-xs font-bold text-amber-900">Safe diagnostic: {error}</p>
      </section>
    ) : (
      <DegradedNotice alert message="Memory Graph is temporarily unavailable. The rest of the dashboard remains usable." />
    );
  }

  if (!data) return null;

  return (
    <>
      {data.message ? <DegradedNotice message={data.message} alert={data.alert} /> : null}
      {!data.message && data.staleAsOfMs ? (
        <p className="-mt-2 text-xs font-bold text-slate-400">Last updated {minutesAgo(data.staleAsOfMs)}.</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total entities" value={data.totalEntities} help="Vendors, approvals, policies, risks, people, projects, and evidence nodes." />
        <StatCard label="Relationships" value={data.totalRelationships} help="Connected links such as approved by, governed by, created from, and investigates." />
        <StatCard label="High-risk nodes" value={data.recentRisks.length} help="Risk-bearing entities surfaced from approvals and policy evaluations." />
      </div>

      {query ? (
        <EntityList title={`Search results for "${query}"`} items={data.searchResults} empty="No matching graph entities found yet." />
      ) : null}

      <GraphPreview entities={data.graphEntities} relationships={data.graphRelationships} />

      <div className="grid gap-6 lg:grid-cols-2">
        <EntityList title="Recent entities" items={data.recentEntities} empty="Entities will appear as ApprovLine captures approvals and evidence." />
        <EntityList title="Recent decisions" items={data.recentDecisions} empty="Decisions appear after approvals or meeting decisions are captured." />
        <EntityList title="Recent risks" items={data.recentRisks} empty="Risk nodes appear after high-risk approvals or compliance findings." />
        <EntityList title="Recent investigations" items={data.recentInvestigations} empty="Investigation entities appear after cases are created." />
      </div>
    </>
  );
}

export default async function MemoryPage({ searchParams }: MemoryPageProps) {
  const params = await searchParams;
  const tenant = await getDashboardTenant(6000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization || !tenant.user) redirect('/dashboard');
  enforcePageRole('/memory', tenant.user.role);

  return (
    <DashboardShell>
      <div className="grid gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#2155d9]">Enterprise Memory Graph</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950">Connected decision intelligence</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                Connect vendors, contracts, approvals, policies, investigations, risks, messages, meetings, tickets, and gateway records into one explainable enterprise graph.
              </p>
            </div>
            <form action="/memory" className="flex min-w-0 gap-2">
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Search vendor, policy, approval, project..."
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-[#2155d9]"
              />
              <button className="min-h-11 rounded-xl bg-[#2155d9] px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">Search</button>
            </form>
          </div>
        </section>

        {params.refresh === 'complete' ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">Memory Graph refreshed from the latest ApprovLine records.</div>
        ) : null}
        {params.refresh === 'error' ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            Memory Graph refresh could not complete right now. Existing data below is unaffected — try again in a moment.
          </div>
        ) : null}

        <Suspense key={`${params.q ?? ''}`} fallback={<CardSkeleton rows={4} />}>
          <MemoryDashboardSection organizationId={tenant.organization.id} query={params.q} />
        </Suspense>
      </div>
    </DashboardShell>
  );
}
