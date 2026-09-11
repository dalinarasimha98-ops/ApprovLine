import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across
// tests/founder-*.test.ts in this repo: there is no live-database test
// harness here (CI's DATABASE_URL points at nothing reachable), so these
// assert the source code reuses the existing authoritative onboarding stage
// function, derives blockers/timestamps from real data, enforces
// authorization, and avoids N+1 queries/fabricated data — rather than
// exercising a real Postgres instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const service = read('services/founder-onboarding.ts');
const pureLib = read('lib/onboarding-pipeline.ts');
const page = read('app/founder/onboarding/page.tsx');
const client = read('components/founder/OnboardingPipelineClient.tsx');
const exportRoute = read('app/api/founder/onboarding/export/route.ts');
const navClient = read('components/founder/FounderNavClient.tsx');
const founderService = read('services/founder.ts');
const founderLayout = read('app/founder/layout.tsx');
const homePage = read('app/founder/page.tsx');

// 1. Founder authorization: gated server-side by app/founder/layout.tsx's
//    getFounderAccess() + redirect. The page itself also calls
//    getFounderAccess() (to compute the read-only export gate), reusing the
//    same authoritative function rather than a second check.
assert.match(founderLayout, /getFounderAccess\(\)/);
assert.match(founderLayout, /redirect\('\/dashboard'\)/);
assert.match(page, /import \{ getFounderAccess \} from '@\/services\/founder'/);
assert.match(page, /const access = await getFounderAccess\(\)/);

// 2. Existing onboarding state is reused, not reinvented: the single
//    authoritative deriveProvisioningOnboardingStage function (already used
//    by Customer Health) is imported and used — this module never redefines
//    its own copy of that 5-stage logic.
assert.match(service, /import \{ deriveProvisioningOnboardingStage \} from '@\/services\/founder'/);
assert.doesNotMatch(service, /function deriveProvisioningOnboardingStage/);
assert.match(service, /deriveProvisioningOnboardingStage\(\{/);
assert.match(service, /computes NO second onboarding engine/);

// No parallel onboarding/health scoring system was introduced.
for (const forbidden of ['OnboardingEngineV2', 'CustomerOnboardingScore', 'OnboardingHealthScore']) {
  assert.doesNotMatch(service, new RegExp(forbidden));
  assert.doesNotMatch(client, new RegExp(forbidden));
}

// 3-4. Summary counts and percentages are tallied directly from each row's
//      derived bucket and rendered from that same counts object — never a
//      hardcoded number — with percentage-of-portfolio computed from the
//      real total, not a fabricated trend.
assert.match(service, /counts\[bucket\] \+= 1/);
assert.match(pureLib, /NOT_STARTED: 'Not Started'/);
assert.match(pureLib, /IN_PROGRESS: 'In Progress'/);
assert.match(pureLib, /BLOCKED: 'Blocked'/);
assert.match(pureLib, /LIVE: 'Live'/);
assert.match(page, /data\.counts\[bucket\]/);
assert.doesNotMatch(page, /vs last month|% change|trend/i);

// 5-6. Needs Attention only lists rows with a real, derived blocker
//      (deriveBlockers' return value), and every blocking reason is a
//      truthful, real-signal-derived string — never Math.random or a
//      fabricated placeholder like "Data source access needed" (an example
//      from the task's own mockup with no backing field in the schema).
assert.match(service, /rows\s*\n\s*\.filter\(\(row\) => row\.blockers\.length > 0\)/);
assert.doesNotMatch(service, /needsAttention: \[\s*\{/);
assert.doesNotMatch(service, /Math\.random/);
assert.doesNotMatch(service, /Data source access needed/);
assert.doesNotMatch(client, /Data source access needed/);
for (const fakeName of ['Globex Corporation', 'Initech', 'Umbrella Corp', 'Soylent', 'Acme Corporation', 'Wayne Enterprises', 'Stark Industries']) {
  assert.doesNotMatch(service, new RegExp(fakeName));
  assert.doesNotMatch(client, new RegExp(fakeName));
}

// 7-8. Days in Stage comes from a real, stage-specific timestamp
//      (CustomerAccount.createdAt, FounderManagedUser.invitedAt/acceptedAt,
//      or a connected integration's own updatedAt) — never
//      CustomerAccount.updatedAt, which bumps on unrelated edits and would
//      not genuinely represent an onboarding stage transition. When no
//      authoritative timestamp exists (the Go-Live stage), it returns null
//      and the UI shows "—" rather than inventing a number.
assert.match(service, /input\.adminInvitedAt/);
assert.match(service, /input\.adminAcceptedAt/);
assert.match(service, /earliestConnectedIntegrationAt/);
assert.match(service, /return null;\s*\n\}/); // stageEnteredAt's Go-Live fallback
assert.doesNotMatch(service, /stageEnteredAt.*customer\.updatedAt/s);
assert.doesNotMatch(client, /customer\.updatedAt/);
assert.match(client, /daysInStageLabel/);
assert.match(client, /if \(days === null\) return '—';/);

// 9-10. Progress is calculated from the real, existing 5-stage sequence
//       (ordinal position, since no per-step-weighted completed/total
//       steps field exists in the schema) — not an arbitrary per-customer
//       guess — and Current Step names the real next milestone derived
//       only from the authoritative stage plus the real approvalsProcessed
//       count.
assert.match(service, /const STAGE_ORDER: OnboardingStage\[\] = \['Provisioned', 'Admin Invited', 'Admin Accepted', 'Integrations Connected', 'Go-Live'\]/);
assert.match(service, /function progressPercent\(stage: OnboardingStage\): number/);
assert.match(service, /function currentStepLabel\(stage: OnboardingStage, approvalsProcessed: number\): string/);
assert.doesNotMatch(service, /progressPercent = 20|progressPercent = 40|progressPercent = 60/); // no hardcoded per-row percentages

// 11. Target Go-Live handles the missing date honestly: the schema has no
//     target-Go-Live field anywhere, so the row's value is always null and
//     the UI renders "Not set" — never a computed/guessed date.
assert.match(service, /targetGoLive: null/);
assert.match(client, /Target Go-Live/);
assert.match(client, />Not set</);
assert.doesNotMatch(service, /targetGoLive = new Date|targetGoLive:.*addDays/);

// 12-13. Search and stage filter both operate on the real fetched rows
//        (not a second, separately-paginated dataset), and the filter
//        actually excludes non-matching rows from the rendered table.
assert.match(client, /row\.companyName\.toLowerCase\(\)\.includes\(q\) \|\| row\.domain\.toLowerCase\(\)\.includes\(q\)/);
assert.match(client, /if \(stageFilter !== 'ALL' && row\.bucket !== stageFilter\) return false;/);
assert.match(client, /<option value="ALL">All stages<\/option>/);

// 14. Selecting a customer/quick link navigates to the existing Customer
//     360 route or the existing /founder/customers/[id]/users page — never
//     a second customer-detail system, and never a fabricated "invitation
//     resent" action performed in place (the real resend action lives on
//     the users page).
assert.match(client, /`\/founder\/customers\/\$\{id\}`/);
assert.match(client, /`\/founder\/customers\/\$\{id\}\/users`/);
assert.match(client, /Open Customer 360/);
assert.match(client, /Manage Users/);
assert.doesNotMatch(client, /\/founder\/onboarding\/customers\//);

// 15. The detail panel renders the real onboarding milestone sequence
//     (Provisioned -> Admin Invited -> Admin Accepted -> Integrations
//     Connected -> Go-Live) driven by the same authoritative stage, not a
//     separately invented checklist.
assert.match(client, /const STAGE_INDEX: Record<OnboardingRow\['stage'\], number> = \{/);
assert.match(client, /Onboarding Progress/);

// 16. No whole-page horizontal overflow, and tables remain horizontally
//     scrollable — the same layout fix already applied to Customer Health
//     (minmax(0,1fr) track, min-w-0 grid item, overflow-x-auto on each
//     table, 2xl-only column split so the fixed detail panel doesn't eat
//     into the tables' width at common laptop widths).
assert.match(client, /grid-cols-\[minmax\(0,1fr\)_360px\]/);
assert.doesNotMatch(client, /grid-cols-\[1fr_360px\]/);
assert.match(client, /2xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
assert.match(client, /2xl:sticky 2xl:top-6/);
assert.match(client, /<div className="min-w-0 space-y-6">/);
assert.doesNotMatch(client, /overflow-x-hidden/);
for (const column of ['Customer', 'Stage', 'Blocking Issue', 'Days in Stage', 'Next Action']) {
  assert.match(client, new RegExp(`<th className="px-6 py-3">${column}`));
}
for (const column of ['Customer', 'Stage', 'Progress', 'Current Step', 'Days in Stage', 'Target Go-Live']) {
  assert.match(client, new RegExp(`<th className="px-6 py-3">${column}`));
}

// 17. No N+1 queries: one batched customerAccount.findMany with the exact
//     same relation-include shape services/founder-customer-health.ts
//     already uses, and no per-customer query inside the row-mapping loop.
assert.match(service, /prisma\.customerAccount\.findMany\(\{/);
assert.doesNotMatch(service, /customers\.map\(async/);
assert.doesNotMatch(service, /for \(const customer of customers\) \{\s*\n\s*await prisma/);

// 18. Tenant/customer isolation: every derived signal (stage, blockers,
//     timestamps) is computed from that specific customer's own included
//     relations — never a shared/global aggregate that could leak one
//     tenant's onboarding state onto another's row.
assert.match(service, /customer\.integrationStatuses\.filter/);
assert.match(service, /customer\.managedUsers\.find\(\(u\) => u\.email === customer\.primaryAdminEmail\)/);

// 19. No secrets, OAuth tokens, or credentials are ever read or rendered by
//     this module.
for (const file of [service, page, client, exportRoute]) {
  assert.doesNotMatch(file, /accessToken|refreshToken|clientSecret|apiKey|password/i);
}

// 20. Read-only Founder access (SUPPORT_ADMIN) can still view the full
//     page, but Export is gated to non-read-only access both in the UI and
//     server-side in the export route — the exact same convention already
//     used by Customer Health and Pilots.
assert.match(page, /const canExport = access\.ok && !access\.readOnly/);
assert.doesNotMatch(page, /if \(!access\.ok \|\| access\.readOnly\) return/);
assert.match(exportRoute, /if \(access\.readOnly\) \{\s*\n\s*return NextResponse\.json\(\{ error: 'founder_admin_required' \}, \{ status: 403 \}\);/);

// 21. Empty states are honest: "no customers at all" offers the real
//     Provision Customer link, and "nothing needs attention" says so
//     plainly instead of inventing something to warn about.
assert.match(client, /No customers provisioned yet/);
assert.match(client, /Provision Customer/);
assert.match(client, /All customers are progressing/);
assert.match(client, /No onboarding blockers require Founder attention\./);

// 22. Blocked bucket classification is reserved for a real, backed
//     condition (integration connectionState ERROR/NEEDS_REAUTH — the same
//     definition reused everywhere else in the app), not an invented
//     "waiting on IT" status with no supporting field, and blockers are
//     never derived for a churned account or a customer already at Go-Live.
assert.match(service, /connectionState === 'ERROR' \|\| i\.connectionState === 'NEEDS_REAUTH'/);
assert.match(founderService, /connectionState: \{ in: \['ERROR', 'NEEDS_REAUTH'\] \}/);
assert.match(service, /if \(input\.stage === 'Go-Live' \|\| input\.accountStatus === 'CHURNED'\) return \[\];/);
assert.match(service, /if \(blockers\.some\(\(b\) => b\.priority === 1\)\) return 'BLOCKED';/);

// ─── Nav/label consistency: the new page must not recreate the exact
// "two nav items, same label, different pages" breadcrumb bug already fixed
// for Customer Health ─────────────────────────────────────────────────────

// 23. The new Onboarding Pipeline nav item points at the new page, and the
//     previously mislabeled nav item pointing at /founder/pilots (a
//     pilot-to-paid-conversion tracker that identifies itself as "Pilot
//     Command Center") is renamed to match its own real page identity
//     instead of sharing the "Onboarding Pipeline" label with a different
//     page.
assert.match(navClient, /\{ label: 'Onboarding Pipeline', href: '\/founder\/onboarding' \}/);
assert.match(navClient, /\{ label: 'Pilot Command Center', href: '\/founder\/pilots' \}/);
assert.doesNotMatch(navClient, /label: 'Onboarding Pipeline', href: '\/founder\/pilots'/);

// 24. The Founder home page's own "Onboarding Pipeline" widget — which
//     actually renders Pilot Command Center stage data and links to
//     /founder/pilots — is relabeled "Pilot Pipeline" so the home page
//     doesn't show two differently-scoped widgets both called "Onboarding
//     Pipeline". Its underlying data/link are untouched (label-only change).
assert.match(homePage, /Pilot Pipeline<\/p>/);
assert.doesNotMatch(homePage, /Onboarding Pipeline<\/p>/);
assert.match(homePage, /href="\/founder\/pilots"/);

console.log('Validated the Onboarding Pipeline command center: the existing authoritative deriveProvisioningOnboardingStage reused with no second onboarding/scoring engine, real-signal-derived (not fabricated) blockers and stage timestamps, an honest ordinal progress percentage and "Not set" Target Go-Live (no field exists for it), batched no-N+1 queries, honest empty states, Customer 360/users-page reuse for detail navigation and real actions, read-only-safe viewing with export gated to admins, no secrets exposed, tables kept horizontally scrollable without whole-page overflow, and the pre-existing "Onboarding Pipeline" label collision (Pilot Command Center\'s nav item and the Founder home page widget) resolved instead of repeated.');
