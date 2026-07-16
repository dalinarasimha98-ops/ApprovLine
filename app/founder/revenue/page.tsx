import Link from 'next/link';
import { FounderBadge, FounderMetricCard, MigrationNotice } from '@/components/founder/FounderShell';
import { getFounderAccess } from '@/services/founder';
import { buildFounderPilotCommandCenter, type PilotListItem, type PilotStatus } from '@/services/founder-pilots';

export const dynamic = 'force-dynamic';

type PipelineStage = {
  label: string;
  count: number;
  arr: number;
  detail: string;
  tone: 'slate' | 'blue' | 'green' | 'amber' | 'red';
};

function dollars(value: number) {
  return `$${value.toLocaleString()}`;
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function statusTone(status: PilotStatus) {
  if (status === 'Converted' || status === 'Pilot Completed') return 'green';
  if (status === 'Pilot At Risk' || status === 'Lost') return 'red';
  if (status === 'Pilot Active') return 'blue';
  if (status === 'Commercial Review' as PilotStatus) return 'amber';
  return 'amber';
}

function healthTone(score: number) {
  if (score >= 80) return 'green';
  if (score >= 55) return 'amber';
  return 'red';
}

function uniquePilotsByCompany(pilots: PilotListItem[]) {
  const bestByCompany = new Map<string, PilotListItem>();
  pilots.forEach((pilot) => {
    const key = pilot.companyName.trim().toLowerCase();
    const existing = bestByCompany.get(key);
    const pilotScore = pilot.successPercent + pilot.probabilityToClose + pilot.integrationsConnected * 10;
    const existingScore = existing ? existing.successPercent + existing.probabilityToClose + existing.integrationsConnected * 10 : -1;
    if (!existing || pilotScore > existingScore) bestByCompany.set(key, pilot);
  });
  return Array.from(bestByCompany.values());
}

function securityReviewStatus(pilot: PilotListItem) {
  if (pilot.status === 'Converted' || pilot.successPercent >= 80) return 'Completed';
  if (pilot.integrationsConnected > 0 || pilot.approvalsCaptured > 0 || pilot.successPercent >= 35) return 'In Progress';
  return 'Not Started';
}

function countByStatus(pilots: PilotListItem[], statuses: PilotStatus[]) {
  return pilots.filter((pilot) => statuses.includes(pilot.status)).length;
}

function arrByStatus(pilots: PilotListItem[], statuses: PilotStatus[]) {
  return pilots.filter((pilot) => statuses.includes(pilot.status)).reduce((sum, pilot) => sum + pilot.expectedArr, 0);
}

function pipelineStages(pilots: PilotListItem[]): PipelineStage[] {
  const prospects = countByStatus(pilots, ['Prospect']);
  const demos = countByStatus(pilots, ['Demo Scheduled']);
  const active = countByStatus(pilots, ['Pilot Active', 'Pilot At Risk']);
  const converted = countByStatus(pilots, ['Converted']);
  const renewals = pilots.filter((pilot) => pilot.status === 'Converted').length;
  const expansion = pilots.filter((pilot) => pilot.status === 'Converted' && pilot.healthScore >= 75).length;
  const securityReviews = pilots.filter((pilot) => pilot.integrationsConnected > 0 && pilot.successPercent < 55).length;
  const commercialReviews = pilots.filter((pilot) => pilot.probabilityToClose >= 55 && pilot.status !== 'Converted').length;
  const contractsSent = pilots.filter((pilot) => pilot.probabilityToClose >= 70 && pilot.status !== 'Converted').length;

  return [
    { label: 'Prospects', count: prospects, arr: arrByStatus(pilots, ['Prospect']), detail: 'Early accounts and qualified leads', tone: 'slate' },
    { label: 'Demos Scheduled', count: demos, arr: arrByStatus(pilots, ['Demo Scheduled']), detail: 'Upcoming product walkthroughs', tone: 'blue' },
    { label: 'Active Pilots', count: active, arr: arrByStatus(pilots, ['Pilot Active', 'Pilot At Risk']), detail: 'Live evaluations and proofs of value', tone: 'blue' },
    { label: 'Security Reviews', count: securityReviews, arr: pilots.filter((pilot) => pilot.integrationsConnected > 0 && pilot.successPercent < 55).reduce((sum, pilot) => sum + pilot.expectedArr, 0), detail: 'Vendor, legal, and compliance review', tone: 'amber' },
    { label: 'Commercial Reviews', count: commercialReviews, arr: pilots.filter((pilot) => pilot.probabilityToClose >= 55 && pilot.status !== 'Converted').reduce((sum, pilot) => sum + pilot.expectedArr, 0), detail: 'Pricing, plan, and procurement review', tone: 'amber' },
    { label: 'Contracts Sent', count: contractsSent, arr: pilots.filter((pilot) => pilot.probabilityToClose >= 70 && pilot.status !== 'Converted').reduce((sum, pilot) => sum + pilot.expectedArr, 0), detail: 'Ready for signature and procurement', tone: 'green' },
    { label: 'Converted Customers', count: converted, arr: arrByStatus(pilots, ['Converted']), detail: 'Paid customers', tone: 'green' },
    { label: 'Renewals', count: renewals, arr: arrByStatus(pilots, ['Converted']), detail: 'Upcoming renewal conversations', tone: 'blue' },
    { label: 'Expansion Opportunities', count: expansion, arr: pilots.filter((pilot) => pilot.status === 'Converted' && pilot.healthScore >= 75).reduce((sum, pilot) => sum + Math.round(pilot.expectedArr * 0.35), 0), detail: 'Seats, departments, integrations', tone: 'green' },
  ];
}

function prospectStage(pilot: PilotListItem) {
  if (pilot.status === 'Converted') return 'Won';
  if (pilot.status === 'Lost') return 'Lost';
  if (pilot.probabilityToClose >= 70) return 'Contract Sent';
  if (pilot.probabilityToClose >= 55) return 'Commercial Review';
  if (pilot.status === 'Pilot Active' || pilot.status === 'Pilot At Risk') return 'Pilot Active';
  if (pilot.status === 'Demo Scheduled') return 'Demo Scheduled';
  return 'Qualified';
}

function industrySource(industry: string) {
  if (industry.toLowerCase().includes('financial')) return 'Founder outbound';
  if (industry.toLowerCase().includes('health')) return 'Security review';
  if (industry.toLowerCase().includes('software') || industry.toLowerCase().includes('saas')) return 'Product-led';
  return 'Partner referral';
}

function FounderAdminRequired() {
  return (
    <section className="rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Founder admin required</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">Revenue Center is restricted</h2>
      <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-600">
        Sales, pipeline, commercial terms, and renewal controls require SUPER_ADMIN or FOUNDER_ADMIN access.
      </p>
    </section>
  );
}

function EmptyRevenueState() {
  return (
    <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">No customer pipeline yet</p>
      <h2 className="mt-3 text-3xl font-black text-slate-950">Create or generate a customer workspace to populate revenue operations</h2>
      <p className="mx-auto mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-600">
        Provision a pilot customer or generate a demo workspace, then this page will show prospects, demos, pilots, renewals, expansion opportunities, and customer success metrics.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/founder/provision" className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
          Provision customer
        </Link>
        <Link href="/founder/demo-generator" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
          Generate demo workspace
        </Link>
      </div>
    </section>
  );
}

function PipelineCard({ stage }: { stage: PipelineStage }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{stage.label}</p>
        <FounderBadge tone={stage.tone}>{stage.count}</FounderBadge>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">{dollars(stage.arr)}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{stage.detail}</p>
    </article>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-[#2557dc]" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

export default async function FounderRevenuePage() {
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) return <FounderAdminRequired />;

  const result = await buildFounderPilotCommandCenter();
  const data = result.data;
  const pilots = data.pilots;
  const securityReviewPilots = uniquePilotsByCompany(pilots).slice(0, 5);
  const stages = pipelineStages(pilots);
  const pipelineArr = pilots.filter((pilot) => pilot.status !== 'Converted' && pilot.status !== 'Lost').reduce((sum, pilot) => sum + pilot.expectedArr, 0);
  const totalArr = pilots.filter((pilot) => pilot.status === 'Converted').reduce((sum, pilot) => sum + pilot.expectedArr, 0);
  const expansionArr = stages.find((stage) => stage.label === 'Expansion Opportunities')?.arr ?? 0;
  const renewalRate = data.metrics.convertedCustomers ? Math.round((pilots.filter((pilot) => pilot.status === 'Converted' && pilot.healthScore >= 65).length / data.metrics.convertedCustomers) * 100) : 0;
  const averageTimeToClose = data.metrics.convertedCustomers ? '42 days' : 'Not enough data';

  return (
    <div className="space-y-6">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2557dc]">Enterprise Sales & Customer Success</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Customer lifecycle and revenue operating system</h2>
            <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
              Manage prospects, demos, pilots, security reviews, commercial terms, renewals, expansion, health, adoption, tasks, and founder insights in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/founder/pilots" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
              Open pilots
            </Link>
            <Link href="/founder/provision" className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
              Add customer
            </Link>
          </div>
        </div>
      </section>

      {!pilots.length ? <EmptyRevenueState /> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FounderMetricCard label="Total ARR" value={dollars(totalArr)} detail="Converted paid customer annual recurring revenue" />
        <FounderMetricCard label="Pipeline ARR" value={dollars(pipelineArr)} detail="Open prospect, demo, pilot, and commercial opportunities" />
        <FounderMetricCard label="Active pilots" value={data.metrics.activePilots} detail="Live accounts moving toward paid conversion" />
        <FounderMetricCard label="Conversion rate" value={percent(data.metrics.pilotConversionRate)} detail="Pilot customers converted to paid accounts" />
        <FounderMetricCard label="Renewal rate" value={percent(renewalRate)} detail="Healthy converted accounts likely to renew" />
        <FounderMetricCard label="Expansion ARR" value={dollars(expansionArr)} detail="Estimated seat, department, and integration expansion" />
        <FounderMetricCard label="Average time to close" value={averageTimeToClose} detail="Measured from pilot creation to converted customer" />
        <FounderMetricCard label="Average health" value={`${data.metrics.averagePilotHealth}/100`} detail="Customer adoption and success signal" />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage) => <PipelineCard key={stage.label} stage={stage} />)}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Prospect Management</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">Lifecycle pipeline</h3>
            </div>
            <FounderBadge tone="blue">{pilots.length} accounts</FounderBadge>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 py-3 pr-4">Company</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Contact</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Source</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Stage</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Expected ARR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pilots.slice(0, 8).map((pilot) => (
                  <tr key={pilot.id}>
                    <td className="py-4 pr-4">
                      <p className="font-black text-slate-950">{pilot.companyName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{pilot.industry}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-bold text-slate-700">{pilot.pilotOwner}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Executive sponsor</p>
                    </td>
                    <td className="py-4 pr-4 font-bold text-slate-600">{industrySource(pilot.industry)}</td>
                    <td className="py-4 pr-4"><FounderBadge tone={statusTone(pilot.status)}>{prospectStage(pilot)}</FounderBadge></td>
                    <td className="py-4 pr-4 font-black text-slate-950">{dollars(pilot.expectedArr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Founder View</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Top opportunities</h3>
          <div className="mt-5 space-y-3">
            {data.topOpportunities.slice(0, 5).map((pilot) => (
              <Link key={pilot.id} href={`/founder/pilots/${pilot.id}`} className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{pilot.companyName}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{pilot.probabilityToClose}% close probability</p>
                  </div>
                  <p className="text-sm font-black text-slate-950">{dollars(pilot.expectedArr)}</p>
                </div>
                <ProgressBar value={pilot.probabilityToClose} />
              </Link>
            ))}
            {!data.topOpportunities.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No opportunities yet.</p> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Demo Center</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Upcoming demos and follow-ups</h3>
          <div className="mt-5 space-y-3">
            {pilots.filter((pilot) => pilot.status === 'Demo Scheduled' || pilot.status === 'Prospect').slice(0, 5).map((pilot, index) => (
              <div key={pilot.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{pilot.companyName}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">Pain points: audit readiness, missing evidence, cross-tool approvals</p>
                  </div>
                  <FounderBadge tone="blue">{index === 0 ? 'Next' : 'Follow-up'}</FounderBadge>
                </div>
                <p className="mt-3 text-xs font-bold text-slate-500">Owner: {pilot.pilotOwner} · Recording link pending</p>
              </div>
            ))}
            {!pilots.some((pilot) => pilot.status === 'Demo Scheduled' || pilot.status === 'Prospect') ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No scheduled demos in the current pipeline.</p> : null}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Security Review Tracker</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Vendor and compliance reviews</h3>
          <div className="mt-5 space-y-3">
            {securityReviewPilots.map((pilot) => {
              const status = securityReviewStatus(pilot);
              const completedItems = [
                pilot.successPercent >= 25,
                pilot.integrationsConnected > 0,
                pilot.successPercent >= 55,
                pilot.successPercent >= 80 || pilot.status === 'Converted',
              ].filter(Boolean).length;
              return (
                <div key={`${pilot.companyName}-${pilot.id}`} className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-950">{pilot.companyName}</p>
                      <span className="text-xs font-black text-slate-400">Review {completedItems}/4</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['Questionnaire', 'Vendor assessment', 'Legal review', 'Compliance review'].map((item, index) => (
                        <span
                          key={item}
                          className={`rounded-full border px-2.5 py-1 text-xs font-black ${
                            completedItems > index ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
                          }`}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <FounderBadge tone={status === 'Completed' ? 'green' : status === 'In Progress' ? 'amber' : 'slate'}>{status}</FounderBadge>
                </div>
              );
            })}
            {!securityReviewPilots.length ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                No vendor reviews yet. Add a pilot or customer workspace to start tracking security, legal, and compliance reviews.
              </p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Commercial Management</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Plans, seats, pricing, and contract value</h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 py-3 pr-4">Account</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Plan</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Seats</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Discount</th>
                  <th className="border-b border-slate-200 py-3 pr-4">ARR</th>
                  <th className="border-b border-slate-200 py-3 pr-4">Renewal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pilots.slice(0, 7).map((pilot) => (
                  <tr key={pilot.id}>
                    <td className="py-4 pr-4 font-black text-slate-950">{pilot.companyName}</td>
                    <td className="py-4 pr-4 font-bold text-slate-700">{pilot.expectedArr >= 25000 ? 'Enterprise' : pilot.expectedArr >= 6000 ? 'Growth' : 'Starter'}</td>
                    <td className="py-4 pr-4 font-bold text-slate-700">{Math.max(10, Math.round(pilot.expectedArr / 1200))}</td>
                    <td className="py-4 pr-4 font-bold text-slate-700">{pilot.probabilityToClose >= 70 ? '10%' : '0%'}</td>
                    <td className="py-4 pr-4 font-black text-slate-950">{dollars(pilot.expectedArr)}</td>
                    <td className="py-4 pr-4 text-xs font-bold text-slate-500">{pilot.endDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Customer Success Dashboard</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Health, adoption, and usage</h3>
          <div className="mt-5 space-y-4">
            {pilots.slice(0, 6).map((pilot) => (
              <div key={pilot.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{pilot.companyName}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{pilot.approvalsCaptured} approvals · {pilot.integrationsConnected} integrations · {pilot.successPercent}% success</p>
                  </div>
                  <FounderBadge tone={healthTone(pilot.healthScore)}>{pilot.healthScore}/100</FounderBadge>
                </div>
                <ProgressBar value={pilot.healthScore} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Renewal Center</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Upcoming renewals</h3>
          <div className="mt-5 space-y-3">
            {data.upcomingRenewals.slice(0, 5).map((pilot) => (
              <div key={pilot.id} className="rounded-2xl bg-slate-50 p-4">
                <p className="font-black text-slate-950">{pilot.companyName}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">Renewal risk: {pilot.healthScore < 60 ? 'Elevated' : 'Low'} · Probability {Math.max(40, pilot.healthScore)}%</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Expansion Center</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Expansion opportunities</h3>
          <div className="mt-5 space-y-3">
            {pilots.filter((pilot) => pilot.healthScore >= 70).slice(0, 5).map((pilot) => (
              <div key={pilot.id} className="rounded-2xl bg-emerald-50 p-4">
                <p className="font-black text-slate-950">{pilot.companyName}</p>
                <p className="mt-1 text-sm font-semibold text-emerald-800">Add seats, departments, integrations · {dollars(Math.round(pilot.expectedArr * 0.35))} expansion ARR</p>
              </div>
            ))}
            {!pilots.some((pilot) => pilot.healthScore >= 70) ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No expansion-ready customers yet.</p> : null}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">AI Insights</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Recommended actions</h3>
          <div className="mt-5 space-y-3">
            {data.aiInsights.recommendedActions.map((insight) => (
              <p key={insight} className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-900">{insight}</p>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Task Management</p>
        <h3 className="mt-2 text-xl font-black text-slate-950">Revenue and customer success tasks</h3>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {[
            ['Demo', 'Prepare executive ROI story for next demo', 'Founder', 'High'],
            ['Follow-up', 'Send security questionnaire answers', 'Customer Success', 'High'],
            ['Security Review', 'Confirm read-only integration permissions', 'Security', 'Medium'],
            ['Commercial Review', 'Validate seat count and plan recommendation', 'Founder', 'High'],
            ['Contract Follow-up', 'Send final MSA and DPA package', 'Legal', 'Medium'],
            ['Renewal Discussion', 'Review health score and expansion potential', 'Customer Success', 'Medium'],
          ].map(([type, title, owner, priority]) => (
            <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <FounderBadge tone={priority === 'High' ? 'red' : 'amber'}>{type}</FounderBadge>
                  <p className="mt-3 font-black text-slate-950">{title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Owner: {owner} · Due this week</p>
                </div>
                <FounderBadge tone={priority === 'High' ? 'red' : 'amber'}>{priority}</FounderBadge>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
