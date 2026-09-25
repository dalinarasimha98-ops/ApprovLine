import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { getMemoryEntityProfile, isDemoMemoryEntity, memoryEntityLabels } from '@/services/memory';

export const dynamic = 'force-dynamic';

type EntityPageProps = {
  params: Promise<{ entityId: string }>;
};

function dateText(value: Date) {
  return value.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function typeClass(type: string) {
  if (type === 'RISK') return 'bg-al-danger/10 text-al-danger';
  if (type === 'POLICY') return 'bg-al-accent/10 text-al-accent';
  if (type === 'INVESTIGATION') return 'bg-al-warning/10 text-al-warning';
  if (type === 'APPROVAL' || type === 'DECISION') return 'bg-al-info/10 text-al-accent';
  return 'bg-al-surface-elevated text-al-text-secondary';
}

function RelationshipCard({
  label,
  title,
  subtitle,
  href,
  demo,
}: {
  label: string;
  title: string;
  subtitle?: string | null;
  href: string;
  demo?: boolean;
}) {
  return (
    <PendingLink href={href} pendingText="Opening related entity..." className="rounded-2xl border border-al-border bg-al-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-al-info/30">
      <p className="text-[10px] font-black uppercase tracking-wide text-al-accent">{label?.replaceAll('_', ' ') ?? ''}</p>
      <p className="mt-2 text-sm font-black text-al-text">
        {title}
        {demo ? <span className="ml-2 rounded-full bg-al-info/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-al-accent">Demo</span> : null}
      </p>
      {subtitle ? <p className="mt-1 text-xs font-semibold text-al-text-muted">{subtitle}</p> : null}
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
        <section className="rounded-3xl border border-al-border bg-al-surface p-6 shadow-sm">
          <PendingLink href="/memory" pendingText="Opening Memory Graph..." className="text-sm font-black text-al-accent">
            ← Memory Graph
          </PendingLink>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <span className={`inline-flex rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${typeClass(entity.type)}`}>
                {memoryEntityLabels[entity.type]}
              </span>
              {isDemoMemoryEntity(entity) ? (
                <span className="ml-2 inline-flex rounded-full bg-al-info/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-al-accent">Demo</span>
              ) : null}
              <h1 className="mt-4 text-4xl font-black tracking-tight text-al-text">{entity.title}</h1>
              {entity.subtitle ? <p className="mt-2 text-lg font-semibold text-al-text-secondary">{entity.subtitle}</p> : null}
              <p className="mt-4 max-w-3xl text-base leading-7 text-al-text-secondary">{entity.summary ?? 'This entity is connected to ApprovLine records, evidence, policy, risk, and timeline events.'}</p>
            </div>
            <div className="rounded-2xl border border-al-border bg-al-surface-sunken p-5">
              <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">Entity Risk Score</p>
              <p className="mt-3 text-5xl font-black tracking-tight text-al-text">{entity.riskScore}</p>
              <div className="mt-4 h-2.5 rounded-full bg-al-surface">
                <div className="h-2.5 rounded-full bg-al-accent" style={{ width: `${Math.min(100, Math.max(0, entity.riskScore))}%` }} />
              </div>
              <p className="mt-4 text-xs font-semibold text-al-text-muted">Last seen {dateText(entity.lastSeenAt)}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-al-border bg-al-surface p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">Approvals</p>
            <p className="mt-2 text-3xl font-black text-al-text">{relatedApprovals.length}</p>
          </div>
          <div className="rounded-2xl border border-al-border bg-al-surface p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">Policies</p>
            <p className="mt-2 text-3xl font-black text-al-text">{relatedPolicies.length}</p>
          </div>
          <div className="rounded-2xl border border-al-border bg-al-surface p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">Risks</p>
            <p className="mt-2 text-3xl font-black text-al-text">{relatedRisks.length}</p>
          </div>
          <div className="rounded-2xl border border-al-border bg-al-surface p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-al-text-muted">Investigations</p>
            <p className="mt-2 text-3xl font-black text-al-text">{relatedInvestigations.length}</p>
          </div>
        </div>

        <section className="rounded-3xl border border-al-border bg-al-surface p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-al-accent">Relationship Engine</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-al-text">Connected records</h2>
            </div>
            <p className="text-sm font-semibold text-al-text-muted">{outgoing.length + incoming.length} relationships</p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {outgoing.map((relationship) => (
              <RelationshipCard
                key={relationship.id}
                label={relationship.relationshipType}
                title={relationship.toEntity.title}
                subtitle={`${memoryEntityLabels[relationship.toEntity.type]} · ${relationship.toEntity.subtitle ?? 'Connected entity'}`}
                href={`/memory/${relationship.toEntity.id}`}
                demo={isDemoMemoryEntity(relationship.toEntity)}
              />
            ))}
            {incoming.map((relationship) => (
              <RelationshipCard
                key={relationship.id}
                label={relationship.relationshipType}
                title={relationship.fromEntity.title}
                subtitle={`${memoryEntityLabels[relationship.fromEntity.type]} · ${relationship.fromEntity.subtitle ?? 'Connected entity'}`}
                href={`/memory/${relationship.fromEntity.id}`}
                demo={isDemoMemoryEntity(relationship.fromEntity)}
              />
            ))}
            {outgoing.length + incoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-al-border p-5 text-sm font-semibold text-al-text-muted md:col-span-2">No relationships have been generated for this entity yet.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-al-border bg-al-surface p-6 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-al-accent">Timeline View</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-al-text">Chronological history</h2>
          <div className="mt-6 grid gap-4">
            {entity.timelineEvents.map((event) => {
              const evidenceUrl = getSafeEvidenceUrl(event.sourceLink);

              return (
              <div key={event.id} className="grid gap-4 rounded-2xl border border-al-border bg-al-surface-sunken p-4 sm:grid-cols-[160px_1fr]">
                <div>
                  <p className="text-sm font-black text-al-text">{dateText(event.occurredAt)}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-al-text-muted">{event.eventType?.replaceAll('_', ' ') ?? 'Event'}</p>
                </div>
                <div>
                  <p className="text-sm font-black text-al-text">{event.title}</p>
                  {event.description ? <p className="mt-1 text-sm leading-6 text-al-text-secondary">{event.description}</p> : null}
                  {evidenceUrl ? (
                    <a href={evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-black uppercase tracking-wide text-al-accent">
                      Open evidence
                    </a>
                  ) : null}
                </div>
              </div>
              );
            })}
            {entity.timelineEvents.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-al-border p-5 text-sm font-semibold text-al-text-muted">Timeline events will appear as approvals, investigations, policies, and evidence are linked.</p>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
