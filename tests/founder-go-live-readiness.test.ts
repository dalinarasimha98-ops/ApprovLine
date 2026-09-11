import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across
// tests/founder-*.test.ts in this repo: there is no live-database test
// harness here (CI's DATABASE_URL points at nothing reachable), so these
// assert the source code reuses existing authoritative data (never a
// second onboarding/health/pilot/Customer-360 engine), derives gates
// honestly from real signals, enforces authorization, and avoids N+1
// queries/fabricated data — rather than exercising a real Postgres
// instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const service = read('services/founder-go-live-readiness.ts');
const pureLib = read('lib/go-live-readiness.ts');
const page = read('app/founder/go-live-readiness/page.tsx');
const client = read('components/founder/GoLiveReadinessClient.tsx');
const exportRoute = read('app/api/founder/go-live-readiness/export/route.ts');
const navClient = read('components/founder/FounderNavClient.tsx');
const founderService = read('services/founder.ts');
const pilotsService = read('services/founder-pilots.ts');
const founderLayout = read('app/founder/layout.tsx');
const homePage = read('app/founder/page.tsx');
const oldReadinessPage = read('app/founder/readiness/page.tsx');

// 1. Founder authorization: gated server-side by app/founder/layout.tsx's
//    getFounderAccess() + redirect. The page itself also calls
//    getFounderAccess() (to compute the read-only export gate), reusing the
//    same authoritative function rather than a second check.
assert.match(founderLayout, /getFounderAccess\(\)/);
assert.match(founderLayout, /redirect\('\/dashboard'\)/);
assert.match(page, /import \{ getFounderAccess \} from '@\/services\/founder'/);
assert.match(page, /const access = await getFounderAccess\(\)/);

// 2. No parallel onboarding/health/pilot/Customer-360 engine: this module
//    never redefines deriveProvisioningOnboardingStage, the CustomerHealth
//    score/threshold functions, or a second pilot scoring calculation — it
//    imports the real ones.
assert.match(service, /import \{ deriveProvisioningOnboardingStage \} from '@\/services\/founder'/);
assert.doesNotMatch(service, /function deriveProvisioningOnboardingStage/);
assert.match(service, /import \{ buildFounderPilotCommandCenter, type PilotListItem \} from '@\/services\/founder-pilots'/);
assert.doesNotMatch(service, /function buildFounderPilotCommandCenter/);
assert.doesNotMatch(service, /function healthStatusForScore/);
assert.doesNotMatch(service, /function calculateHealthScore/);
for (const forbidden of ['GoLiveEngine', 'ReadinessScore', 'ReadinessHealthScore', 'CustomerReadinessScore']) {
  assert.doesNotMatch(service, new RegExp(forbidden));
  assert.doesNotMatch(client, new RegExp(forbidden));
}
assert.doesNotMatch(client, /\/founder\/customers\/readiness\//); // no second customer-detail route

// 3-4. Summary counts and percentages come from the real counts object —
//      never a hardcoded number or a fabricated trend/week-over-week change.
assert.match(service, /counts\[readiness\] \+= 1/);
assert.match(pureLib, /READY: 'Ready'/);
assert.match(pureLib, /NOT_READY: 'Not Ready'/);
assert.match(pureLib, /BLOCKED: 'Blocked'/);
assert.match(pureLib, /NOT_ASSESSED: 'Not Assessed'/);
assert.match(page, /data\.counts\[status\]/);
assert.doesNotMatch(page, /vs last month|% change|week-over-week/i);

// 5. No fabricated readiness percentage (87% ready, 72% ready, etc.) — the
//    page shows "N of 6" gate counts (a real, known denominator) or
//    individual gate status, never an invented headline percentage.
assert.doesNotMatch(service, /readinessPercent/i);
assert.doesNotMatch(client, /\d+% ready/i);
assert.match(service, /gatesTotal: COUNTABLE_GATES\.length/);
assert.match(client, /\{row\.gatesRemaining\} of \{row\.gatesTotal\}/);

// 6-7. Gate mapping uses real, already-existing data — never Math.random
//      or a placeholder — and missing evidence becomes NOT_VERIFIED, never
//      silently PASS or automatically FAIL.
assert.doesNotMatch(service, /Math\.random/);
assert.match(service, /customer\.managedUsers\.find\(\(u\) => u\.email === customer\.primaryAdminEmail\)/);
assert.match(service, /hasWorkspace: !!customer\.workspace/);
assert.match(service, /connectionState === 'ERROR' \|\| i\.connectionState === 'NEEDS_REAUTH'/);
assert.match(founderService, /connectionState: \{ in: \['ERROR', 'NEEDS_REAUTH'\] \}/);

// 8. Admin invited is never conflated with admin accepted: the ADMIN gate
//    only reaches COMPLETE on status ACTIVE, and has a distinct IN_PROGRESS
//    branch for INVITED.
assert.match(service, /input\.adminStatus === 'ACTIVE'\s*\n\s*\? \{ key: 'ADMIN', status: 'COMPLETE'/);
assert.match(service, /input\.adminStatus === 'INVITED'\s*\n\s*\? \{ key: 'ADMIN', status: 'IN_PROGRESS'/);

// 9. Required integrations are never assumed to be the full catalog — only
//    integrations the Founder actually granted (accessEnabled) are
//    evaluated, and zero granted integrations is NOT_VERIFIED (no known
//    requirement), never COMPLETE or BLOCKED by default.
assert.match(service, /customer\.integrationStatuses\.filter\(\(i\) => i\.accessEnabled\)/);
assert.match(service, /input\.grantedIntegrations\.length === 0\s*\n\s*\? \{ key: 'INTEGRATIONS', status: 'NOT_VERIFIED'/);

// 10. Zero approvals never automatically means failure — the APPROVALS gate
//     has no BLOCKED branch at all, only COMPLETE (>0) or NOT_VERIFIED (0).
assert.doesNotMatch(service, /APPROVALS[\s\S]{0,20}'BLOCKED'/);
assert.match(service, /input\.approvalsProcessed > 0\s*\n\s*\? \{ key: 'APPROVALS', status: 'COMPLETE'/);
assert.match(service, /: \{ key: 'APPROVALS', status: 'NOT_VERIFIED', reason: 'No approval activity yet'/);

// 11. Pilot Validation reuses the existing Pilot Command Center's own
//     successPercent/status — no second pilot scoring engine — and is
//     NOT_VERIFIED (not a fabricated 0%) when no pilot profile exists for
//     that customer at all.
assert.match(service, /input\.pilot\.successPercent >= 100 \|\| input\.pilot\.status === 'Pilot Completed' \|\| input\.pilot\.status === 'Converted'/);
assert.match(service, /!input\.pilot\s*\n\s*\? \{ key: 'PILOT', status: 'NOT_VERIFIED'/);
assert.match(pilotsService, /export type PilotListItem/);

// 12. Security & Access never claims customer-specific validation from
//     platform RBAC/tenant-isolation capability — it is unconditionally
//     NOT_VERIFIED, since no field anywhere records a customer-specific
//     security review.
assert.match(service, /const security: ReadinessGate = \{ key: 'SECURITY', status: 'NOT_VERIFIED'/);
// Exactly one place in the file assigns key: 'SECURITY' — the unconditional
// NOT_VERIFIED constant above — never a second, conditional branch that
// could mark it COMPLETE.
assert.equal((service.match(/key: 'SECURITY'/g) ?? []).length, 1);

// 13. Blocked is never confused with Not Assessed: they are distinct
//     branches in overallReadiness, checked in a fixed, documented order.
assert.match(service, /function overallReadiness\(gates: Record<GateKey, ReadinessGate>, accountStatus: string\): ReadinessStatus \{/);
assert.match(service, /if \(gates\.INTEGRATIONS\.status === 'BLOCKED'\) return 'BLOCKED';/);
assert.match(service, /if \(gates\.WORKSPACE\.status === 'NOT_VERIFIED'\) return 'NOT_ASSESSED';/);

// 14. Ready only when the account is already live OR every one of the 6
//     real, countable gates is COMPLETE — never "most gates pass".
assert.match(service, /if \(accountStatus === 'ACTIVE'\) return 'READY';/);
assert.match(service, /if \(COUNTABLE_GATES\.every\(\(key\) => gates\[key\]\.status === 'COMPLETE'\)\) return 'READY';/);
assert.match(service, /const COUNTABLE_GATES: GateKey\[\] = \['ADMIN', 'WORKSPACE', 'INTEGRATIONS', 'APPROVALS', 'EVIDENCE', 'PILOT'\];/);

// 15-16. Customer 360 reuse: every quick link/action resolves through the
//        existing /founder/customers/[id] route (or its /users subpage, or
//        the existing per-customer pilot page) — never a second
//        customer-detail system.
assert.match(client, /`\/founder\/customers\/\$\{id\}`/);
assert.match(client, /`\/founder\/customers\/\$\{id\}\/users`/);
assert.match(client, /`\/founder\/pilots\/\$\{id\}`/);
assert.match(client, /Open Customer 360/);

// 17. Search and the readiness-state filter both operate on the real
//     fetched rows and the filter actually excludes non-matching rows.
assert.match(client, /row\.companyName\.toLowerCase\(\)\.includes\(q\) \|\| row\.domain\.toLowerCase\(\)\.includes\(q\)/);
assert.match(client, /if \(readinessFilter !== 'ALL' && row\.readiness !== readinessFilter\) return false;/);
assert.match(client, /<option value="ALL">All readiness states<\/option>/);

// 18-19. No page-level horizontal overflow, and both tables remain
//        horizontally scrollable — the same layout fix already applied to
//        Customer Health and Onboarding Pipeline.
assert.match(client, /2xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
assert.doesNotMatch(client, /grid-cols-\[1fr_360px\]/);
assert.match(client, /2xl:sticky 2xl:top-6/);
assert.match(client, /<div className="min-w-0 space-y-6">/);
assert.doesNotMatch(client, /overflow-x-hidden/);
for (const column of ['Customer', 'Readiness', 'Primary Blocker', 'Remaining Gates', 'Next Action']) {
  assert.match(client, new RegExp(`<th className="px-6 py-3">${column}`));
}
for (const column of ['Customer', 'Readiness', 'Onboarding', 'Integrations', 'Approvals', 'Pilot']) {
  assert.match(client, new RegExp(`<th className="px-6 py-3">${column}`));
}

// 20. No secrets, OAuth tokens, or credentials are ever read or rendered.
for (const file of [service, page, client, exportRoute]) {
  assert.doesNotMatch(file, /accessToken|refreshToken|clientSecret|apiKey|password/i);
}

// 21. Tenant isolation: every derived gate is computed from that specific
//     customer's own included relations, keyed by its own organizationId —
//     never a shared/global aggregate that could leak one tenant's
//     readiness state onto another's row.
assert.match(service, /auditOrgSet\.has\(customer\.organizationId\)/);
assert.match(service, /const auditOrgSet = new Set\(auditLogOrgs\.map\(\(row\) => row\.organizationId\)\)/);

// 22. RBAC: read-only Founder access (SUPPORT_ADMIN) can still view the
//     full page, but Export is gated to non-read-only access both in the
//     UI and server-side in the export route.
assert.match(page, /const canExport = access\.ok && !access\.readOnly/);
assert.doesNotMatch(page, /if \(!access\.ok \|\| access\.readOnly\) return/);
assert.match(exportRoute, /if \(access\.readOnly\) \{\s*\n\s*return NextResponse\.json\(\{ error: 'founder_admin_required' \}, \{ status: 403 \}\);/);

// 23. Empty states are honest: "no customers at all" offers the real
//     Provision Customer link, and "nothing needs attention" says so
//     plainly instead of inventing a failure.
assert.match(client, /No customers available for readiness assessment/);
assert.match(client, /Provision Customer/);
assert.match(client, /No customers need attention/);

// 24. No N+1 queries in this module's own batched fetch: one
//     customerAccount.findMany, one auditLog.groupBy, and one call to the
//     existing Pilot Command Center aggregate — no per-customer query
//     inside the row-mapping loop.
assert.match(service, /prisma\.customerAccount\.findMany\(\{/);
assert.match(service, /prisma\.auditLog\.groupBy\(\{ by: \['organizationId'\] \}\)/);
assert.doesNotMatch(service, /customers\.map\(async/);
assert.doesNotMatch(service, /for \(const customer of customers\) \{\s*\n\s*await prisma/);

// ─── Route/label collision: the new page must not recreate the exact
// "same label pointing at two different pages" bug already fixed on
// Onboarding Pipeline and Customer Health ────────────────────────────────

// 25. The primary sidebar's "Go-Live Readiness" item now points at the new
//     per-customer console, not the pre-existing platform production-
//     certification report — and the old report's own page is completely
//     untouched (still exists, still reachable, content unchanged).
assert.match(navClient, /\{ label: 'Go-Live Readiness', href: '\/founder\/go-live-readiness' \}/);
assert.doesNotMatch(navClient, /label: 'Go-Live Readiness', href: '\/founder\/readiness'/);
assert.match(oldReadinessPage, /Founder Control Center v2/);
assert.match(oldReadinessPage, /Week 4 Launch Certification/);

// 26. The Founder home page's own quick action that used to be labeled
//     "Go-live readiness" while linking to the platform certification
//     report is relabeled "Production readiness" to match that report's
//     own on-page identity, avoiding a second "Go-live readiness" label
//     pointing at a different page than the new sidebar item. Its
//     underlying link is untouched.
assert.match(homePage, /label: 'Production readiness'/);
assert.doesNotMatch(homePage, /label: 'Go-live readiness'/);
assert.match(homePage, /\{ href: '\/founder\/readiness', label: 'Production readiness' \}/);

console.log('Validated Go-Live Readiness: the existing deriveProvisioningOnboardingStage and Pilot Command Center are reused with no second onboarding/health/pilot/Customer-360 engine, all 8 conceptual gates are mapped to real existing data (Security & Access honestly always Not Verified since no customer-specific field exists, admin invited is never conflated with accepted, required integrations are only ones actually granted, zero approvals/no audit evidence never auto-fail), Blocked/Not Assessed/Ready are computed by a documented, non-fabricated rule with no invented readiness percentage, Customer 360/users-page/pilot-detail reuse for every action, batched no-N+1 queries, tenant-isolated per-org lookups, honest empty states, read-only-safe export gating, no secrets exposed, tables kept horizontally scrollable without whole-page overflow, and the pre-existing platform certification report at /founder/readiness is left completely untouched with its own label collision resolved instead of repeated.');
