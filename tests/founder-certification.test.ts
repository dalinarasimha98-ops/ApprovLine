import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CERTIFICATION_STATUS_LABELS,
  CERTIFICATION_CATEGORY_LABELS,
  CERTIFICATION_EVIDENCE_TYPE_LABELS,
  certificationStatusTone,
  worstCertificationStatus,
  sortCertificationControls,
  type CertificationStatus,
} from '../lib/founder-certification';

// NOTE: this suite deliberately never imports services/founder-certification.ts
// (or anything from services/founder.ts, which it reuses for Tenant
// Isolation) at module scope. services/founder.ts's Clerk import only
// resolves correctly inside a real Next.js runtime — under plain node/tsx
// (how every npm test:* script here executes) it throws
// "does not provide an export named 'auth'" before a single assertion can
// run. Real, live, DB-backed verification for this module is done the same
// way as every other Founder module this session: a temporary
// app/api/verify-*/route.ts hit with curl against `npm run dev`, then
// deleted — never by importing the builder into a node-executed test file.
// This file therefore covers pure lib/founder-certification.ts unit tests
// plus static-analysis of the already-written source (matching the working
// tests/founder-system-health.test.ts precedent, which avoids the same trap).

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const ALL_STATUSES: CertificationStatus[] = ['VERIFIED', 'ATTENTION', 'NOT_VERIFIED', 'FAILED', 'NOT_ASSESSED'];

// ── Part 1 — pure lib/founder-certification.ts unit tests ──────────────

assert.deepEqual(Object.keys(CERTIFICATION_STATUS_LABELS).sort(), [...ALL_STATUSES].sort());
for (const status of ALL_STATUSES) {
  assert.equal(typeof CERTIFICATION_STATUS_LABELS[status], 'string');
  assert.ok(CERTIFICATION_STATUS_LABELS[status].length > 0);
}

assert.equal(certificationStatusTone('VERIFIED'), 'green');
assert.equal(certificationStatusTone('ATTENTION'), 'amber');
assert.equal(certificationStatusTone('NOT_VERIFIED'), 'slate');
assert.equal(certificationStatusTone('FAILED'), 'red');
assert.equal(certificationStatusTone('NOT_ASSESSED'), 'blue');

assert.equal(worstCertificationStatus([]), 'NOT_ASSESSED');
assert.equal(worstCertificationStatus(['VERIFIED']), 'VERIFIED');
assert.equal(worstCertificationStatus(['VERIFIED', 'ATTENTION']), 'ATTENTION');
assert.equal(worstCertificationStatus(['VERIFIED', 'NOT_ASSESSED', 'NOT_VERIFIED']), 'NOT_VERIFIED');
assert.equal(worstCertificationStatus(['ATTENTION', 'FAILED', 'VERIFIED']), 'FAILED');
// FAILED must outrank everything, including a bare NOT_ASSESSED mix.
assert.equal(worstCertificationStatus(['NOT_ASSESSED', 'FAILED']), 'FAILED');

const sorted = sortCertificationControls([
  { status: 'VERIFIED' as const, id: 'a' },
  { status: 'FAILED' as const, id: 'b' },
  { status: 'NOT_ASSESSED' as const, id: 'c' },
  { status: 'ATTENTION' as const, id: 'd' },
]);
assert.deepEqual(sorted.map((s) => s.id), ['b', 'd', 'c', 'a']); // FAILED, ATTENTION, NOT_ASSESSED, VERIFIED — worst first

for (const category of Object.keys(CERTIFICATION_CATEGORY_LABELS)) {
  assert.ok(CERTIFICATION_CATEGORY_LABELS[category as keyof typeof CERTIFICATION_CATEGORY_LABELS].length > 0);
}
assert.deepEqual(Object.keys(CERTIFICATION_EVIDENCE_TYPE_LABELS).sort(), ['DOCUMENTED_POLICY', 'LIVE_CHECK']);

// ── Part 2 — static-analysis: engine invariants + exactly one engine ───

const certificationService = read('services/founder-certification.ts');
const certificationPage = read('app/founder/certification/page.tsx');
const readinessPage = read('app/founder/readiness/page.tsx');
const certificationClient = read('components/founder/CertificationClient.tsx');
const founderShell = read('components/founder/FounderShell.tsx');
const pkg = read('package.json');

// This file's own header doc-comment names the old engine's fabricated
// field names (p95LatencyMs, score: 100, ...) for audit purposes — strip
// comments before checking for their absence, so the checks below assert
// against real code, not the prose describing what was removed.
const serviceCodeOnly = certificationService.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The old, fabricated engine (services/founderCertification.ts — hardcoded
// score: 100 / status: 'Pass' everywhere, invented p95LatencyMs/errorRatePct
// with no load-testing evidence) must no longer be imported by either page
// that used to render its numbers.
assert.doesNotMatch(certificationPage, /founderCertification['"]/);
assert.doesNotMatch(certificationPage, /buildProductionCertificationReport/);
assert.doesNotMatch(readinessPage, /founderCertification['"]/);
assert.doesNotMatch(readinessPage, /buildProductionCertificationReport/);

// The new engine reuses existing authoritative builders — never a second,
// competing computation of the same fact.
assert.match(certificationService, /buildFounderSecurityPosture/);
assert.match(certificationService, /buildFounderSystemHealth/);
assert.match(certificationService, /buildIntegrationHealthPortfolio/);
assert.match(certificationService, /buildFounderBackgroundJobs/);
assert.match(certificationService, /buildFounderObservability/);
assert.match(certificationService, /buildFounderTenantIsolationReport/);

// No fabricated numeric claims carried over from the old engine (checked
// against code only — the header comment above names these on purpose).
assert.doesNotMatch(serviceCodeOnly, /p95LatencyMs/);
assert.doesNotMatch(serviceCodeOnly, /errorRatePct/);
assert.doesNotMatch(serviceCodeOnly, /overallScore/);
assert.doesNotMatch(serviceCodeOnly, /score:\s*100/);

// The page/client wiring.
assert.match(certificationPage, /buildFounderCertificationCenter/);
assert.match(certificationPage, /getFounderAccess/);
assert.match(certificationClient, /FounderDrawer/);
assert.match(certificationClient, /CERTIFICATION_STATUS_LABELS/);
assert.match(certificationClient, /CERTIFICATION_CATEGORY_FILTER_OPTIONS/);

// FounderShell.tsx must still link to /founder/certification.
assert.match(founderShell, /\/founder\/certification/);

// The npm script now points at this file, not the retired one.
assert.match(pkg, /"test:certification":\s*"node --import tsx tests\/founder-certification\.test\.ts"/);

// No two statically-keyed controls share a key — every `key: '...'` string
// literal in the source must be unique (the one dynamic, per-module
// template-literal key for Tenant Isolation is excluded since it can only
// ever match `'...'`, not a template literal). A duplicate key would
// silently collide in the client's `controls.find((c) => c.key ===
// selectedKey)` drawer lookup.
const controlKeys = [...certificationService.matchAll(/\bkey: '([a-zA-Z0-9_-]+)'/g)].map((m) => m[1]);
assert.ok(controlKeys.length >= 10, 'expected at least 10 statically-keyed controls');
assert.equal(new Set(controlKeys).size, controlKeys.length, 'duplicate static control key found in services/founder-certification.ts');

// The two categories with no automated check anywhere in this codebase
// (Backup & Disaster Recovery, Load & Performance) must always be
// NOT_ASSESSED/DOCUMENTED_POLICY — never presented as a live-verified pass.
for (const key of ['backup-recovery-policy', 'disaster-recovery-runbooks', 'load-performance-targets']) {
  const block = new RegExp(`key: '${key}'[\\s\\S]{0,1400}?requiredAction:`);
  const match = certificationService.match(block);
  assert.ok(match, `could not find the ${key} control block`);
  assert.match(match![0], /status: 'NOT_ASSESSED'/, `${key} must be NOT_ASSESSED`);
  assert.match(match![0], /evidenceType: 'DOCUMENTED_POLICY'/, `${key} must be DOCUMENTED_POLICY`);
  assert.match(match![0], /lastVerifiedAt: null/, `${key} must not carry a lastVerifiedAt timestamp`);
}

console.log('Validated certification status vocabulary, unique control keys, honest NOT_ASSESSED/DOCUMENTED_POLICY treatment of Backup/Recovery and Load/Performance, and single-engine wiring across the certification and readiness pages.');
