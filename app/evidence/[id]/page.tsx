import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { getUnifiedEvidenceDetail } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

type EvidenceDetailPageProps = {
  params: Promise<{ id: string }>;
};

function dateText(value: Date) {
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function eventUrl(links: unknown) {
  for (const link of jsonArray(links)) {
    if (typeof link === 'string') {
      const safe = getSafeEvidenceUrl(link);
      if (safe) return safe;
    }
    if (link && typeof link === 'object') {
      const candidate = (link as { url?: unknown }).url;
      if (typeof candidate === 'string') {
        const safe = getSafeEvidenceUrl(candidate);
        if (safe) return safe;
      }
    }
  }
  return null;
}

function sourceLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function EvidenceDetailPage({ params }: EvidenceDetailPageProps) {
  const { id } = await params;
  const tenant = await getDashboardTenant(6000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') {
    redirect('/onboarding');
  }
  if (!tenant.organization) redirect('/dashboard');

  const record = await getUnifiedEvidenceDetail(tenant.organization.id, id).catch(() => null);
  if (!record) notFound();

  const suggested = record.members.filter((member) => member.status === 'SUGGESTED');

  return (
    <DashboardShell>
      <div className="grid gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <PendingLink href="/evidence" pendingText="Opening evidence..." className="text-sm font-black text-[#2155d9]">
            ← Unified Evidence
          </PendingLink>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#2155d9]">
                  {record.verificationStatus.replaceAll('_', ' ')}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-700">
                  {record.riskLevel ?? 'Risk unscored'}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {record.subject}
              </h1>
              <p className="mt-3 text-base font-semibold leading-7 text-slate-600">
                {[record.outcome ?? record.decision, record.category, record.department]
                  .filter(Boolean)
                  .join(' · ') || 'Unified decision record'}
              </p>
              {record.primaryApproval ? (
                <PendingLink
                  href={`/approvals/${record.primaryApproval.id}`}
                  pendingText="Opening approval..."
                  className="mt-4 inline-flex rounded-xl bg-[#2155d9] px-4 py-2.5 text-sm font-black text-white"
                >
                  View approval record
                </PendingLink>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Evidence confidence</p>
              <p className="mt-2 text-5xl font-black tracking-tight text-slate-950">{record.confidence}%</p>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-[#2155d9]" style={{ width: `${Math.max(0, Math.min(100, record.confidence))}%` }} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="font-bold text-slate-500">Sources</dt>
                  <dd className="mt-1 font-black text-slate-950">{record.sourceCount}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-500">Evidence</dt>
                  <dd className="mt-1 font-black text-slate-950">{record.evidenceCount}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Approver', record.approverName ?? 'Unknown'],
            ['Approver email', record.approverEmail ?? 'Not captured'],
            ['First seen', dateText(record.firstSeenAt)],
            ['Last updated', dateText(record.lastSeenAt)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 break-words text-sm font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        {suggested.length > 0 ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-amber-800">Human review required</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">
              {suggested.length} suggested evidence {suggested.length === 1 ? 'match' : 'matches'}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
              These associations remain visibly unverified until an authorized user confirms or rejects them.
            </p>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#2155d9]">
            Unified timeline
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Chronological supporting evidence
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Source events remain immutable. Correlation adds relationships without changing the original evidence.
          </p>
          <div className="relative mt-6 grid gap-4 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-slate-200">
            {record.events.map((event) => {
              const sourceUrl = eventUrl(event.links);
              const membership = record.members.find((member) => member.eventId === event.id);
              return (
                <article key={event.id} className="relative grid gap-4 pl-12 sm:grid-cols-[170px_1fr]">
                  <span className="absolute left-2.5 top-5 z-10 h-5 w-5 rounded-full border-4 border-white bg-[#2155d9] shadow-sm" />
                  <div className="pt-4">
                    <p className="text-sm font-black text-slate-950">{dateText(event.occurredAt)}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#2155d9]">
                      {sourceLabel(event.providerKey)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">
                          {sourceLabel(event.providerEventType)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {event.actorName ?? event.actorEmail ?? 'Unknown actor'} · {event.objectType}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 shadow-sm">
                        {membership?.status.replaceAll('_', ' ') ?? event.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    {event.content ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
                        {event.content}
                      </p>
                    ) : null}
                    {membership?.matchingReasons.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {membership.matchingReasons.map((reason) => (
                          <span key={reason} className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#2155d9]">
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-xs font-black uppercase tracking-wide text-[#2155d9]"
                      >
                        Open immutable source ↗
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
