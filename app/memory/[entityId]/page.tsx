import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { getMemoryEntityProfile, memoryEntityLabels } from '@/services/memory';

export const dynamic = 'force-dynamic';

type EntityPageProps = {
  params: Promise<{ entityId: string }>;
};

function dateText(value: Date) {
  return value.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function typeClass(type: string) {
  if (type === 'RISK') return 'bg-rose-50 text-rose-700';
  if (type === 'POLICY') return 'bg-violet-50 text-violet-700';
  if (type === 'INVESTIGATION') return 'bg-amber-50 text-amber-800';
  if (type === 'APPROVAL' || type === 'DECISION') return 'bg-blue-50 text-[#2155d9]';
  return 'bg-slate-100 text-slate-700';
}

function RelationshipCard({
  label,
  title,
  subtitle,
  href,
}: {
  label: string;
  title: string;
  subtitle?: string | null;
  href: string;
}) {
  return (
    <PendingLink href={href} pendingText="Opening related entity..." className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200">
      <p className="text-[10px] font-black uppercase tracking-wide text-[#2155d9]">{label.replaceAll('_', ' ')}</p>
      <p className="mt-2 text-sm font-black text-slate-950">{title}</p>
      {subtitle ? <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p> : null}
    </PendingLink>
  );
}

export default async function MemoryEntityPage({ params }: EntityPageProps) {
  const { entityId } = await params;
  const tenant = await getDashboardTenant(6000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const entity = await getMemoryEntityProfile(tenant.organization.id, entityId).catch(() => null);
  if (!entity) notFound();

  const outgoing = entity.outgoingRelationships;
  const incoming = entity.incomingRelationships;
  const relatedApprovals = [...outgoing.map((item) => item.toEntity), ...incoming.map((item) => item.fromEntity)].filter((item) => item.type === 'APPROVAL');
  const relatedPolicies = [...outgoing.map((item) => item.toEntity), ...incoming.map((item) => item.fromEntity)].filter((item) => item.type === 'POLICY');
  const relatedRisks = [...outgoing.map((item) => item.toEntity), ...incoming.map((item) => item.fromEntity)].filter((item) => item.type === 'RISK');
  const relatedInvestigations = [...outgoing.map((item) => item.toEntity), ...incoming.map((item) => item.fromEntity)].filter((item) => item.type === 'INVESTIGATION');

  return (
    <DashboardShell>
      <div className="grid gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <PendingLink href="/memory" pendingText="Opening Memory Graph..." className="text-sm font-black text-[#2155d9]">
            ← Memory Graph
          </PendingLink>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <span className={`inline-flex rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${typeClass(entity.type)}`}>
                {memoryEntityLabels[entity.type]}
              </span>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">{entity.title}</h1>
              {entity.subtitle ? <p className="mt-2 text-lg font-semibold text-slate-600">{entity.subtitle}</p> : null}
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{entity.summary ?? 'This entity is connected to ApprovLine records, evidence, policy, risk, and timeline events.'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Entity Risk Score</p>
              <p className="mt-3 text-5xl font-black tracking-tight text-slate-950">{entity.riskScore}</p>
              <div className="mt-4 h-2.5 rounded-full bg-white">
                <div className="h-2.5 rounded-full bg-[#2155d9]" style={{ width: `${Math.min(100, Math.max(0, entity.riskScore))}%` }} />
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-500">Last seen {dateText(entity.lastSeenAt)}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Approvals</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{relatedApprovals.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Policies</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{relatedPolicies.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Risks</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{relatedRisks.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Investigations</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{relatedInvestigations.length}</p>
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#2155d9]">Relationship Engine</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Connected records</h2>
            </div>
            <p className="text-sm font-semibold text-slate-500">{outgoing.length + incoming.length} relationships</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {outgoing.map((relationship) => (
              <RelationshipCard
                key={relationship.id}
                label={relationship.relationshipType}
                title={relationship.toEntity.title}
                subtitle={`${memoryEntityLabels[relationship.toEntity.type]} · ${relationship.toEntity.subtitle ?? 'Connected entity'}`}
                href={`/memory/${relationship.toEntity.id}`}
              />
            ))}
            {incoming.map((relationship) => (
              <RelationshipCard
                key={relationship.id}
                label={relationship.relationshipType}
                title={relationship.fromEntity.title}
                subtitle={`${memoryEntityLabels[relationship.fromEntity.type]} · ${relationship.fromEntity.subtitle ?? 'Connected entity'}`}
                href={`/memory/${relationship.fromEntity.id}`}
              />
            ))}
            {outgoing.length + incoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-500 md:col-span-2">No relationships have been generated for this entity yet.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#2155d9]">Timeline View</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Chronological history</h2>
          <div className="mt-6 grid gap-4">
            {entity.timelineEvents.map((event) => (
              <div key={event.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[160px_1fr]">
                <div>
                  <p className="text-sm font-black text-slate-950">{dateText(event.occurredAt)}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{event.eventType.replaceAll('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-950">{event.title}</p>
                  {event.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{event.description}</p> : null}
                  {event.sourceLink ? (
                    <a href={event.sourceLink} className="mt-2 inline-flex text-xs font-black uppercase tracking-wide text-[#2155d9]">
                      Open evidence
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
            {entity.timelineEvents.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm font-semibold text-slate-500">Timeline events will appear as approvals, investigations, policies, and evidence are linked.</p>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
