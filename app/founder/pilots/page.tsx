import Link from 'next/link';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';
import { buildFounderPilotCommandCenter, type PilotHealthLabel, type PilotListItem, type PilotStatus } from '@/services/founder-pilots';

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

function dollars(value: number) {
  return `$${value.toLocaleString()}`;
}

function PilotMiniList({ title, pilots, empty }: { title: string; pilots: PilotListItem[]; empty: string }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{title}</h3>
      <div className="mt-4 space-y-3">
        {pilots.length ? pilots.map((pilot) => (
          <Link key={pilot.id} href={`/founder/pilots/${pilot.id}`} className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">{pilot.companyName}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{pilot.industry} · {pilot.pilotOwner}</p>
              </div>
              <FounderBadge tone={healthTone(pilot.healthLabel)}>{pilot.healthScore}</FounderBadge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-[#2557dc]" style={{ width: `${Math.min(100, pilot.successPercent)}%` }} />
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">{pilot.successPercent}% criteria · {dollars(pilot.expectedArr)} ARR</p>
          </Link>
        )) : (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-500">{empty}</p>
        )}
      </div>
    </article>
  );
}

function FounderAdminRequired() {
  return (
    <section className="rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Founder admin required</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">Pilot Command Center is restricted</h2>
      <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-600">
        Support admins can view support operations, but pilot conversion and revenue operations require SUPER_ADMIN or FOUNDER_ADMIN access.
      </p>
    </section>
  );
}

export default async function FounderPilotsPage() {
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return <FounderAdminRequired />;

  const result = await buildFounderPilotCommandCenter();
  const data = result.data;

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Pilot Command Center</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Manage pilots from demo to paid conversion</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Track pilot health, success criteria, adoption, ROI, feedback, tasks, and conversion signals without managing a separate spreadsheet.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/api/founder/pilots/export?format=csv" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
              Export CSV
            </Link>
            <Link href="/api/founder/pilots/export?format=pdf" className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
              Export PDF
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FounderMetricCard label="Total pilot customers" value={data.metrics.totalPilots} detail="All tracked pilot and conversion accounts" />
        <FounderMetricCard label="Active pilots" value={data.metrics.activePilots} detail="Demo scheduled, active, or at-risk pilots" />
        <FounderMetricCard label="Completed pilots" value={data.metrics.completedPilots} detail="Completed pilots plus converted customers" />
        <FounderMetricCard label="Converted customers" value={data.metrics.convertedCustomers} detail="Pilots converted to paid accounts" />
        <FounderMetricCard label="Failed pilots" value={data.metrics.failedPilots} detail="Lost or churned pilot opportunities" />
        <FounderMetricCard label="Average pilot health" value={`${data.metrics.averagePilotHealth}/100`} detail="Usage, integrations, and success progress" />
        <FounderMetricCard label="Pilot conversion rate" value={`${data.metrics.pilotConversionRate}%`} detail="Converted customers divided by total pilots" />
        <FounderMetricCard label="Readiness" value={result.migrationRequired ? 'Fallback' : 'Live'} detail="Pilot operations storage and metrics mode" />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <PilotMiniList title="Top opportunities" pilots={data.topOpportunities} empty="No conversion opportunities yet. Provision or generate demo customers to populate this list." />
        <PilotMiniList title="At-risk pilots" pilots={data.atRiskPilots} empty="No at-risk pilots detected right now." />
        <PilotMiniList title="Highest usage" pilots={data.highestUsagePilots} empty="No approval usage yet." />
        <PilotMiniList title="Ready to convert" pilots={data.readyToConvert} empty="No pilot has crossed the conversion threshold yet." />
        <PilotMiniList title="Upcoming renewals" pilots={data.upcomingRenewals} empty="No upcoming renewal dates available." />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">AI Insights</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Recommended founder actions</h3>
          <div className="mt-5 grid gap-3">
            {data.aiInsights.recommendedActions.map((action) => (
              <p key={action} className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-900">{action}</p>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Risk Signals</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Likely churn and pilot risks</h3>
          <div className="mt-5 grid gap-3">
            {[...data.aiInsights.likelyToChurn, ...data.aiInsights.pilotRisks].slice(0, 6).map((risk) => (
              <p key={risk} className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-900">{risk}</p>
            ))}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Pilot Pipeline</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">All pilot customers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Company</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Health</th>
                <th className="px-5 py-4">Success</th>
                <th className="px-5 py-4">Adoption</th>
                <th className="px-5 py-4">Conversion</th>
                <th className="px-5 py-4">Dates</th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.pilots.map((pilot) => (
                <tr key={pilot.id}>
                  <td className="px-5 py-5">
                    <p className="font-black text-slate-950">{pilot.companyName}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{pilot.industry} · {pilot.pilotOwner}</p>
                  </td>
                  <td className="px-5 py-5"><FounderBadge tone={statusTone(pilot.status)}>{pilot.status}</FounderBadge></td>
                  <td className="px-5 py-5"><FounderBadge tone={healthTone(pilot.healthLabel)}>{pilot.healthLabel} · {pilot.healthScore}</FounderBadge></td>
                  <td className="px-5 py-5">
                    <p className="font-black text-slate-950">{pilot.successPercent}%</p>
                    <div className="mt-2 h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#2557dc]" style={{ width: `${Math.min(100, pilot.successPercent)}%` }} />
                    </div>
                  </td>
                  <td className="px-5 py-5 font-bold text-slate-700">{pilot.approvalsCaptured} approvals · {pilot.integrationsConnected} integrations</td>
                  <td className="px-5 py-5 font-bold text-slate-700">{dollars(pilot.expectedArr)} · {pilot.probabilityToClose}%</td>
                  <td className="px-5 py-5 text-xs font-bold text-slate-500">{pilot.startDate}<br />{pilot.endDate}</td>
                  <td className="px-5 py-5 text-right">
                    <Link href={`/founder/pilots/${pilot.id}`} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {!data.pilots.length ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center font-semibold text-slate-500">
                    No pilot customers yet. Use Founder Provisioning or Demo Generator to create the first pilot workspace.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
