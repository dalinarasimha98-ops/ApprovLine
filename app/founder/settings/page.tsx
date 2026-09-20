import { getFounderAccess } from '@/services/founder';
import { buildFounderSettingsOverview } from '@/services/founder-settings';
import { FounderSettingsClient } from '@/components/founder/FounderSettingsClient';

export const dynamic = 'force-dynamic';

export default async function FounderSettingsPage() {
  // Defense in depth alongside app/founder/layout.tsx's own getFounderAccess()
  // gate — matching every other Founder page's convention (e.g.
  // app/founder/seats/page.tsx). getFounderAccess() is wrapped in React's
  // cache(), so this costs no extra Clerk/DB round trip on top of the
  // layout's own call within the same request.
  const access = await getFounderAccess();
  const email = access.ok ? access.email : '';
  const role = access.ok ? access.role : 'SUPER_ADMIN';
  const readOnly = !access.ok || access.readOnly;

  const overview = await buildFounderSettingsOverview();

  // /founder/security/isolation (the Tenant Isolation Center) is a real,
  // already-shipped page not listed in FounderNavClient's own sidebar —
  // Founder Settings is its only real navigation entry point, so this
  // route is passed through explicitly rather than left to be
  // rediscovered/reinvented inside the client component.
  const isolationReportHref = '/founder/security/isolation';

  // /founder/reliability (the Universal Gateway reliability/background-job
  // hardening report) is the same situation: a real, pre-existing page
  // with no sidebar entry of its own, previously only reachable from the
  // Founder Overview page and this page's old "Quick links" section.
  // tests/founder-background-jobs.test.ts already asserts this exact
  // link stays intact.
  const reliabilityReport = { href: '/founder/reliability', label: 'Reliability report' };

  return (
    <FounderSettingsClient
      email={email}
      role={role}
      readOnly={readOnly}
      generatedAt={overview.generatedAt.toISOString()}
      certificationDecision={overview.certificationDecision}
      securityKpis={overview.securityKpis}
      securityItems={overview.securityItems}
      operationalItems={overview.operationalItems}
      isolationReportHref={isolationReportHref}
      reliabilityReportHref={reliabilityReport.href}
    />
  );
}
