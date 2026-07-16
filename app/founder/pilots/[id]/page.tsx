import Link from 'next/link';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';
import { getFounderPilotProfile, type PilotHealthLabel, type PilotStatus } from '@/services/founder-pilots';

export const dynamic = 'force-dynamic';

function statusTone(status: PilotStatus) {
  if (status === 'Converted' || status === 'Pilot Completed') return 'green';
  if (status === 'Pilot At Risk' || status === 'Lost') return 'red';
  if (status === 'Pilot Active') return 'blue';
  return 'amber';
}

function healthTone(health: PilotHealthLabel) {
  if (health === 'Healthy') return 'green';
  if (health === 'Needs Attention') return 'amber';
  return 'red';
}

function taskTone(status: string) {
  if (status === 'Done') return 'green';
  if (status === 'Blocked') return 'red';
  if (status === 'In Progress') return 'blue';
  return 'slate';
}

function dollars(value: number) {
  return `$${value.toLocaleString()}`;
}

function FounderAdminRequired() {
  return (
    <section className="rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Founder admin required</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">Pilot profile is restricted</h2>
      <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-600">
        Pilot conversion details are available to SUPER_ADMIN and FOUNDER_ADMIN roles only.
      </p>
    </section>
  );
}

export default async function FounderPilotProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return <FounderAdminRequired />;

  const { id } = await params;
  const result = await getFounderPilotProfile(id);
  const pilot = result.data;

  if (!pilot) {
    return (
      <div className="space-y-6">
        {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Pilot not found</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950">This pilot customer could not be loaded</h2>
          <p className="mt-3 text-base font-semibold text-slate-600">Return to the Pilot Command Center and select another customer.</p>
          <Link href="/founder/pilots" className="mt-6 inline-flex rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
            Back to pilots
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div>
            <Link href="/founder/pilots" className="text-sm font-black text-[#2557dc]">← Back to pilots</Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Pilot Customer Profile</p>
              <FounderBadge tone={statusTone(pilot.status)}>{pilot.status}</FounderBadge>
              <FounderBadge tone={healthTone(pilot.healthLabel)}>{pilot.healthLabel}</FounderBadge>
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{pilot.companyName}</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              {pilot.industry} · {pilot.domain} · Pilot owner {pilot.pilotOwner}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/api/founder/pilots/export?format=csv&customerAccountId=${pilot.id}`} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
              Export CSV
            </Link>
            <Link href={`/api/founder/pilots/export?format=pdf&customerAccountId=${pilot.id}`} className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
              Export PDF
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FounderMetricCard label="Pilot health" value={`${pilot.healthScore}/100`} detail={pilot.healthLabel} />
        <FounderMetricCard label="Success criteria" value={`${pilot.successPercent}%`} detail="Completed pilot outcomes" />
        <FounderMetricCard label="Expected ARR" value={dollars(pilot.expectedArr)} detail={`${pilot.conversion.packageTarget} target package`} />
        <FounderMetricCard label="Close probability" value={`${pilot.probabilityToClose}%`} detail="Based on health, adoption, and success criteria" />
        <FounderMetricCard label="Approvals captured" value={pilot.approvalsCaptured} detail="Approval evidence created during pilot" />
        <FounderMetricCard label="Connected integrations" value={pilot.integrationsConnected} detail="Live approval source coverage" />
        <FounderMetricCard label="Seats" value={pilot.seats} detail={`${pilot.conversion.expectedSeats} expected paid seats`} />
        <FounderMetricCard label="Pilot window" value={pilot.endDate} detail={`Started ${pilot.startDate}`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Success Criteria</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Pilot outcome tracker</h3>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#2557dc]" style={{ width: `${Math.min(100, pilot.successPercent)}%` }} />
          </div>
          <div className="mt-5 grid gap-3">
            {pilot.successCriteria.map((criterion) => (
              <div key={criterion.label} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:flex-row md:items-center">
                <div>
                  <p className="font-black text-slate-950">{criterion.label}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Current: {criterion.current} · Target: {criterion.target}</p>
                </div>
                <FounderBadge tone={criterion.complete ? 'green' : 'amber'}>{criterion.complete ? 'Complete' : 'Remaining'}</FounderBadge>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Executive Summary</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Pilot narrative</h3>
          <p className="mt-4 rounded-2xl bg-blue-50 p-5 text-sm font-bold leading-7 text-blue-950">{pilot.executiveSummary}</p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Primary admin</p>
              <p className="mt-2 font-black text-slate-950">{pilot.primaryAdminName}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{pilot.primaryAdminEmail}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Conversion target</p>
              <p className="mt-2 font-black text-slate-950">{pilot.conversion.packageTarget}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{pilot.conversion.expectedRenewalDate} renewal target</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Adoption Metrics</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Feature usage</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {pilot.adoptionMetrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{metric.value}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{metric.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">ROI Tracker</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Pilot business value</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {pilot.roiMetrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{metric.label}</p>
                <p className="mt-2 text-2xl font-black text-emerald-950">{metric.value}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-emerald-800">{metric.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Pilot Tasks</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Next actions</h3>
          <div className="mt-5 space-y-3">
            {pilot.tasks.map((task) => (
              <div key={task.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{task.title}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{task.owner} · Due {task.dueDate}</p>
                  </div>
                  <FounderBadge tone={taskTone(task.status)}>{task.status}</FounderBadge>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Feedback Center</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Customer feedback signals</h3>
          <div className="mt-5 space-y-3">
            {pilot.feedback.length ? pilot.feedback.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{item.title}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{item.type} · {item.createdAt}</p>
                  </div>
                  <FounderBadge tone={item.status === 'OPEN' ? 'amber' : 'slate'}>{item.status}</FounderBadge>
                </div>
              </div>
            )) : (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold leading-6 text-slate-500">
                No pilot feedback captured yet. Add feedback from the customer dashboard or pilot readiness flow.
              </p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
