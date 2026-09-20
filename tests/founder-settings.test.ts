import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  SECURITY_SUMMARY_KEYS,
  OPERATIONAL_KEYS,
  findControl,
  securityKpisFrom,
} from '../lib/founder-settings';
import type { CertificationControl } from '../lib/founder-certification';

// NOTE: this suite deliberately never imports services/founder-settings.ts
// (or anything from services/founder-certification.ts, services/founder-
// security.ts, or services/founder.ts, which it transitively reuses) at
// module scope. services/founder.ts's Clerk import only resolves correctly
// inside a real Next.js runtime — under plain node/tsx (how every npm
// test:* script here executes) it throws "does not provide an export named
// 'auth'" before a single assertion can run — the exact trap
// tests/founder-certification.test.ts's own header documents and avoids.
// Real, live, DB-backed verification for the aggregation itself is out of
// scope here for the same reason every other Founder module test in this
// suite is: no live-database test harness exists in this environment
// (CLAUDE.md's own "no Jest/Vitest runner... no live-database test
// harness" note). This file therefore covers pure lib/founder-settings.ts
// unit tests (Part 1) plus static-analysis of the already-written
// services/page/component source (Part 2).

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

function makeControl(overrides: Partial<CertificationControl> & Pick<CertificationControl, 'key' | 'status'>): CertificationControl {
  return {
    title: overrides.key,
    category: 'SECURITY_ACCESS',
    evidenceType: 'LIVE_CHECK',
    summary: `summary for ${overrides.key}`,
    whyThisStatus: 'test fixture',
    evidence: 'test fixture',
    sources: [],
    lastVerifiedAt: null,
    requiredAction: null,
    ...overrides,
  };
}

// Part 1: REAL EXECUTED unit tests against the actual, imported pure lookup
// logic (lib/founder-settings.ts has no DB/Clerk dependency, so unlike the
// rest of this Founder test suite family these run the real functions with
// real inputs rather than asserting on source text).

// ─── findControl: real key lookup, never fabricates a status ───────────────

{
  const controls = [makeControl({ key: 'security-founder-authentication', status: 'VERIFIED', summary: 'Auth is fine.' })];
  const found = findControl(controls, 'security-founder-authentication', 'Founder Authentication');
  assert.deepEqual(found, { key: 'security-founder-authentication', label: 'Founder Authentication', status: 'VERIFIED', summary: 'Auth is fine.' });
}

// A control that genuinely isn't present (and no 'security-unavailable'
// fallback either) is reported as NOT_VERIFIED with a generic, honest
// summary — never silently promoted to VERIFIED, never thrown/crashed.
{
  const found = findControl([], 'security-founder-authentication', 'Founder Authentication');
  assert.equal(found.status, 'NOT_VERIFIED');
  assert.equal(found.summary, 'This control\'s status could not be determined this run.');
}

// When Security itself failed inside Certification (collapsed to a single
// 'security-unavailable' control), every individual security-* lookup
// falls back to that control's own real summary/status context rather than
// a second, disconnected generic message.
{
  const controls = [makeControl({ key: 'security-unavailable', status: 'FAILED', summary: 'The Founder Security posture check could not run.' })];
  const found = findControl(controls, 'security-founder-authentication', 'Founder Authentication');
  assert.equal(found.status, 'NOT_VERIFIED'); // still NOT_VERIFIED, not FAILED — this page never asserts a status stronger than "could not verify"
  assert.equal(found.summary, 'The Founder Security posture check could not run.');
}

// ─── securityKpisFrom: counts only security-* controls, mutually exclusive ─

{
  const kpis = securityKpisFrom([
    makeControl({ key: 'security-a', status: 'VERIFIED' }),
    makeControl({ key: 'security-b', status: 'ATTENTION' }),
    makeControl({ key: 'security-c', status: 'NOT_VERIFIED' }),
    makeControl({ key: 'security-d', status: 'FAILED' }),
    makeControl({ key: 'ai-provider-configuration', status: 'FAILED' }), // not security-*, must not be counted
  ]);
  assert.deepEqual(kpis, { totalControls: 4, verified: 1, attention: 1, notVerified: 1, failed: 1 });
}

assert.deepEqual(securityKpisFrom([]), { totalControls: 0, verified: 0, attention: 0, notVerified: 0, failed: 0 });

// ─── The two key lists are exactly what the task's own spec names, real
//     lookups into Certification's security-* mirror (or Certification's
//     own control for AI Provider), never a second, invented vocabulary ──

assert.deepEqual(
  SECURITY_SUMMARY_KEYS.map((k) => k.label),
  ['Founder Authentication', 'OAuth State Signing', 'Tenant Isolation', 'Audit Logging'],
);
assert.ok(SECURITY_SUMMARY_KEYS.every((k) => k.key.startsWith('security-')));

assert.deepEqual(
  OPERATIONAL_KEYS.map((k) => k.label),
  ['Database', 'Redis', 'AI Provider Configuration', 'Encryption Configuration', 'Error Monitoring'],
);
// Exactly one of the five operational facts (AI Provider) is Certification's
// own control, not a Security mirror — everything else reuses Security's
// infrastructure controls verbatim.
assert.equal(OPERATIONAL_KEYS.filter((k) => !k.key.startsWith('security-')).length, 1);
assert.equal(OPERATIONAL_KEYS.find((k) => !k.key.startsWith('security-'))?.key, 'ai-provider-configuration');

console.log('Validated lib/founder-settings.ts\'s pure lookup logic with real executed unit tests: findControl() never fabricates a status for a missing control (falls back to the honest NOT_VERIFIED plus, when available, the real security-unavailable control\'s own context), securityKpisFrom() counts only security-* controls and never miscounts a non-security control (e.g. AI Provider Configuration) into the security rollup, and both exported key lists match the task\'s own required Security Summary / Operational Configuration item lists exactly.');

// Part 2: static-analysis assertions, matching the convention used across
// tests/founder-*.test.ts in this repo (no live-database test harness
// exists here). These assert the source code reuses the existing
// Certification/Security/Founder-identity architecture, introduces no
// second security/certification/health engine, adds zero mutations, never
// exposes a secret value, and enforces server-side Founder authorization.

const libSettings = read('lib/founder-settings.ts');
const service = read('services/founder-settings.ts');
const page = read('app/founder/settings/page.tsx');
const client = read('components/founder/FounderSettingsClient.tsx');
const navClient = read('components/founder/FounderNavClient.tsx');
const founderService = read('services/founder.ts');
const certificationService = read('services/founder-certification.ts');
const readinessService = read('services/readiness.ts');

// Some assertions below check real code only, deliberately ignoring this
// module's own explanatory doc-comment prose (which legitimately names
// other builders/env vars to document why they are NOT called/rendered
// here — matching services/founder-security.ts's own header convention).
function stripComments(source: string) {
  return source.split('\n').filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/**');
  }).join('\n');
}

// ─── Architecture: no second security/certification/health engine ─────────

// 1. No new Prisma model was introduced for settings.
const prismaSchema = read('prisma/schema.prisma');
assert.doesNotMatch(prismaSchema, /model\s+(FounderSettings|FounderPreferences|ConsoleSettings)\b/);

// 2. Every fact on the page is sourced from exactly one call to
//    buildFounderCertificationCenter() — no second, independent call to
//    buildFounderSecurityPosture() or buildReadinessReport() from this
//    module (both are already called, once each, inside Certification
//    itself — calling either again here would duplicate that same
//    expensive builder in the same request).
assert.match(service, /await buildFounderCertificationCenter\(\)/);
assert.equal((service.match(/await buildFounderCertificationCenter\(\)/g) ?? []).length, 1);
// Prose in this file's own header comment explains, in words, why
// buildFounderSecurityPosture()/buildReadinessReport() are deliberately
// NOT called here — so the real assertion strips comment lines first and
// checks the remaining real code, rather than the string never appearing
// anywhere including explanatory prose.
const serviceCodeOnly = stripComments(service);
assert.doesNotMatch(serviceCodeOnly, /buildFounderSecurityPosture/);
assert.doesNotMatch(serviceCodeOnly, /buildReadinessReport/);
assert.doesNotMatch(service, /prisma\./); // no query of its own — every fact comes from the one builder call

// 3. readiness.ts (the shared, unlocked primitive already reused by
//    Security/Observability/Certification) was not modified to add a
//    second export or check just for this page.
assert.doesNotMatch(readinessService, /export function aiGatewayCheck/);

// 4. Confirms the real reuse path this module's header documents: the
//    security-* prefix and the 'security-unavailable'/'ai-provider-
//    configuration' fallback/keys this page's lookups depend on actually
//    exist, verbatim, in Certification's own source — not assumed.
assert.match(certificationService, /key: `security-\$\{c\.key\}`/);
assert.match(certificationService, /key: 'security-unavailable'/);
assert.match(certificationService, /key: 'ai-provider-configuration'/);

// ─── No fake settings / no invented toggles ─────────────────────────────────

// 5. No persistent-preference toggle was invented — the task's own
//    explicit non-exhaustive ban list, checked verbatim.
for (const forbidden of [
  'Enable Founder Mode', 'Email notifications', 'Default dashboard', 'Auto refresh',
  'Dark mode', 'Default customer', 'Alert preferences',
]) {
  assert.doesNotMatch(client, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

// 6. Zero mutations: no 'use server' action, no form action, no fetch/POST
//    call anywhere in the new page/service/client — a pure read-only
//    overview, exactly as the task's own mutation rule requires by default.
for (const file of [page, service, client]) {
  assert.doesNotMatch(file, /'use server'/);
  assert.doesNotMatch(file, /<form[ >]/);
  assert.doesNotMatch(file, /method="POST"|fetch\(/);
}

// ─── No secret exposure ─────────────────────────────────────────────────────

// 7. No env var name or value that could reveal a secret is ever rendered.
//    (The old, superseded version of this page printed FOUNDER_USER_ID/
//    DATABASE_URL/CLERK_SECRET_KEY/etc. set-vs-missing checklists directly
//    — this rebuild removes that entirely in favor of the same
//    architectural-fact vocabulary Security/Certification already use.)
const SECRET_NAME_PATTERN = /DATABASE_URL|CLERK_SECRET_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|VOYAGE_API_KEY|ENCRYPTION_KEY|FOUNDER_USER_ID|FOUNDER_EMAIL/;
// page.tsx and the client component are what actually reaches the
// rendered page — checked strictly, including any inline text, never just
// their code. service/lib files may legitimately explain, in a source
// comment, which existing env vars an already-shipped builder reads
// (exactly as services/founder-security.ts's own header already does) —
// checked with comments stripped, so real code is still held to the same
// standard without failing on architecture prose.
for (const file of [page, client]) {
  assert.doesNotMatch(file, SECRET_NAME_PATTERN);
  assert.doesNotMatch(file, /process\.env/);
}
for (const file of [service, libSettings]) {
  assert.doesNotMatch(stripComments(file), SECRET_NAME_PATTERN);
  assert.doesNotMatch(stripComments(file), /process\.env/);
}

// ─── Authentication / authorization ─────────────────────────────────────────

// 8. The page itself calls getFounderAccess() server-side (defense in depth
//    alongside app/founder/layout.tsx's own gate) rather than trusting a
//    client-supplied role/email/permission.
assert.match(page, /import \{ getFounderAccess \} from '@\/services\/founder'/);
assert.match(page, /const access = await getFounderAccess\(\);/);
assert.doesNotMatch(page, /searchParams.*role|formData\.get\('role'\)|formData\.get\('email'\)/);

// 9. Session/role/access-mode facts rendered to the client are computed
//    server-side from the real access object, never a hardcoded default
//    silently standing in for a real check.
assert.match(page, /const readOnly = !access\.ok \|\| access\.readOnly;/);
assert.match(page, /const role = access\.ok \? access\.role : 'SUPER_ADMIN';/);

// 10. Sign out reuses Clerk's own SignOutButton — no custom session-
//     termination logic was written.
assert.match(client, /import \{ SignOutButton \} from '@clerk\/nextjs'/);
assert.match(client, /<SignOutButton/);
assert.doesNotMatch(client, /function signOut\(|async function handleSignOut/);

// 10b. Final architecture audit (task's own required search list): Founder
//      role resolution and PlatformAdmin remain centralized in
//      services/founder.ts's single getFounderAccess() — this task defines
//      no second role-resolution function, no second PlatformAdmin query,
//      and does not touch getFounderAccess() itself.
assert.match(founderService, /export const getFounderAccess = cache\(async \(\): Promise<FounderAccess> => \{/);
assert.equal((founderService.match(/prisma\.platformAdmin\./g) ?? []).length, 1);
for (const file of [service, libSettings, client]) {
  assert.doesNotMatch(file, /getFounderAccess\s*=|function getFounderAccess|prisma\.platformAdmin/);
}

// ─── Console controls: every link is a real, existing route ────────────────

// 11. Every href in the Console Controls list is a route that genuinely
//     exists in FounderNavClient's own NAV array (i.e. is a real, already-
//     shipped page) — no dead link, no invented destination.
const hrefMatches = [...client.matchAll(/href: '(\/founder\/[a-z-]+)'/g)].map((m) => m[1]);
assert.ok(hrefMatches.length >= 10);
for (const href of hrefMatches) {
  assert.match(navClient, new RegExp(`href: '${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), `${href} must be a real route already registered in FounderNavClient`);
}

// 12. Revenue is included (a real, already-shipped route), not omitted or
//     rendered as a fake "Coming soon" placeholder.
assert.match(client, /label: 'Revenue', href: '\/founder\/revenue'/);
assert.doesNotMatch(client, /Coming soon/);

// 12b. /founder/security/isolation (the Tenant Isolation Center) predates
//      this task, is not listed in FounderNavClient's own sidebar, and
//      tests/tenant-isolation.test.ts already asserts Founder Settings is
//      its real navigation entry point — this rebuild must keep that link,
//      passed explicitly from the page (so the route lives in page.tsx's
//      own source, not only inside the client) into the client that
//      renders it.
assert.match(page, /const isolationReportHref = '\/founder\/security\/isolation';/);
assert.match(page, /isolationReportHref=\{isolationReportHref\}/);
assert.match(client, /isolationReportHref: string;/);
assert.match(client, /href=\{props\.isolationReportHref\}/);
assert.equal(existsSync(`${root}/app/founder/security/isolation/page.tsx`), true);

// ─── Refresh behavior ────────────────────────────────────────────────────────

// 13. Refresh matches the established Security/Seats/Observability
//     useTransition()+router.refresh() convention — real data reload
//     (re-runs the server component tree), a visible pending/loading
//     state, and no possibility of a duplicate concurrent request (the
//     early return on `pending` plus the disabled button both guard it).
assert.match(client, /const \[pending, startTransition\] = useTransition\(\);/);
assert.match(client, /if \(pending\) return;/);
assert.match(client, /startTransition\(\(\) => \{\s*\n\s*router\.refresh\(\);/);
assert.match(client, /disabled=\{pending\}/);
assert.match(client, /aria-busy=\{pending\}/);

// ─── Accessibility ──────────────────────────────────────────────────────────

// 14. Real semantic headings and links/buttons — no clickable <div> hack.
assert.doesNotMatch(client, /<div[^>]*onClick/);
assert.match(client, /<h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Founder Settings<\/h2>/);
assert.match(client, /<h3 className="text-base font-black text-slate-950">/);

// ─── Honest error semantics (task's own ZERO vs NOT AVAILABLE vs NOT
//     CONFIGURED vs NOT VERIFIED distinction) ────────────────────────────────

// 15. A missing/unreachable control is rendered as NOT_VERIFIED (via
//     findControl's fallback, already unit-tested above) — the client
//     never collapses that into a fabricated 0, a fabricated "Healthy", or
//     silently omits the row.
assert.doesNotMatch(client, /item\.status \?\? 'VERIFIED'|status: 'VERIFIED', \/\/ fallback/);

console.log('Validated Founder Settings (/founder/settings): built entirely on Certification Center\'s already-computed output (one call, no second Security/Readiness/health engine), introduces zero new Prisma model and zero mutations, exposes no secret env var name or value, calls getFounderAccess() server-side independent of the layout gate, reuses Clerk\'s own SignOutButton with no custom session-termination logic, links only to real already-shipped /founder/* routes (including Revenue, which is real and not a "Coming soon" placeholder), matches the established useTransition()+router.refresh() refresh convention, and never fabricates a status for a control it could not find.');
