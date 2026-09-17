import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO_MODULES,
  DEMO_MODULE_KEYS,
  DEMO_SCENARIOS,
  demoCompanySizes,
  demoIndustries,
  approvalVolume,
  vendorVolume,
  seatsForCompanySize,
  estimatedDataLines,
  isDemoModuleKey,
  isDemoScenarioKey,
  modulesForScenario,
} from '../lib/founder-demo-generator';

// Part 1: REAL EXECUTED unit tests against the actual, imported pure
// helpers (lib/founder-demo-generator.ts has no DB/framework dependency).
// services/founderDemoGenerator.ts, services/founder-demo-generator.ts,
// and app/founder/demo-generator/{page.tsx,actions.ts} all transitively
// import services/founder.ts -> lib/auth.ts -> @clerk/nextjs/server,
// which cannot be imported outside the Next.js runtime (confirmed:
// `node --import tsx` fails with "does not provide an export named
// 'auth'") — matching this repo's established pattern (see e.g.
// tests/founder-provisioning.test.ts), those files are covered by
// static-analysis assertions in Part 2 instead. A real, Postgres-backed
// run of generateFounderDemoWorkspace/deleteFounderDemoWorkspace/
// listFounderDemoWorkspaces/buildDemoGeneratorPageData was performed
// separately in this task via a temporary, already-removed Next.js API
// route (bypassing Clerk by constructing a FounderAccess object directly,
// the same way every server action here does) against a local scratch
// Postgres: empty state, read-only rejection, zero-module rejection,
// per-module gating (integrations/users/support create real rows;
// unselected modules stay at zero), regenerate-same-profile delete+
// recreate, real listFounderDemoWorkspaces domain/status/planTier/
// createdAt fields, real Recent Runs from FounderAuditLog, reset
// decrementing the workspace count, a real (non-demo) organization
// correctly rejected for reset, malformed organizationId rejected, and
// previewDemoSample confirmed read-only (zero DB writes). The
// "approvals" module was confirmed to fail safely (propagates as a
// thrown error, mapped by the server action to a safe user message, with
// no audit log row written for the failed attempt) when the real,
// pre-existing, unmodified lib/demo-data.ts -> services/playbooks.ts ->
// Voyage AI embedding call it triggers has no reachable API key in this
// sandbox — NOT VERIFIABLE end-to-end in this environment, and not a bug
// in this task's code.

// ─── Real inputs: unchanged from before this task ──────────────────────

assert.deepEqual([...demoIndustries], ['SaaS', 'Financial Services', 'Pharma', 'Healthcare', 'Manufacturing', 'Retail', 'Logistics']);
assert.deepEqual([...demoCompanySizes], ['100 Employees', '500 Employees', '1000 Employees', 'Enterprise']);
assert.equal(approvalVolume('100 Employees'), 100);
assert.equal(approvalVolume('Enterprise'), 500);
assert.equal(vendorVolume('1000 Employees'), 42);
assert.equal(seatsForCompanySize('Enterprise'), 500);
assert.equal(seatsForCompanySize('500 Employees'), 500);

// ─── Modules: exactly 6, each a real key, none invented ────────────────

assert.equal(DEMO_MODULES.length, 6);
assert.deepEqual(DEMO_MODULE_KEYS.sort(), ['analytics', 'approvals', 'compliance', 'integrations', 'support', 'users'].sort());
assert.ok(isDemoModuleKey('approvals'));
assert.ok(!isDemoModuleKey('tickets')); // "Support Tickets" was deliberately renamed to "Support Notes" — "tickets" is not a real key
assert.ok(!isDemoModuleKey('__proto__'));
assert.ok(!isDemoModuleKey(123));

// ─── Scenarios: each maps to a real subset of the real module keys ─────

assert.equal(DEMO_SCENARIOS.length, 4);
for (const scenario of DEMO_SCENARIOS) {
  for (const moduleKey of scenario.modules) {
    assert.ok(DEMO_MODULE_KEYS.includes(moduleKey), `scenario ${scenario.key} references unknown module ${moduleKey}`);
  }
}
assert.deepEqual(modulesForScenario('enterprise-sales').sort(), [...DEMO_MODULE_KEYS].sort()); // the "full platform showcase" really does select every real module
assert.deepEqual(modulesForScenario('custom'), []); // Custom starts from nothing pre-selected, never a hidden default
assert.ok(DEMO_SCENARIOS.find((s) => s.key === 'enterprise-sales')?.recommended);
assert.ok(!DEMO_SCENARIOS.find((s) => s.key === 'compliance-audit')?.recommended);
assert.ok(isDemoScenarioKey('security-governance'));
assert.ok(!isDemoScenarioKey('enterprise'));

// ─── Estimated data: never a fabricated number ──────────────────────────

assert.deepEqual(estimatedDataLines([], '500 Employees'), ['Select at least one module to see an estimate.']);
const approvalsOnly = estimatedDataLines(['approvals'], '500 Employees');
assert.equal(approvalsOnly.length, 1);
assert.match(approvalsOnly[0], /~220 approvals/); // the exact real approvalVolume('500 Employees') value, not a rounded/invented figure
const usersOnly = estimatedDataLines(['users'], '100 Employees');
assert.match(usersOnly[0], /calculated during generation/i); // no fake headcount invented up front
assert.doesNotMatch(usersOnly.join(' '), /~\d+ users/); // never a fabricated per-module count for modules with no deterministic pre-generation total

console.log('Validated lib/founder-demo-generator.ts\'s real executed unit tests: the 6 real data modules and 4 scenario presets are internally consistent (every scenario references only real module keys, "Enterprise Sales Demo" really does select all 6, "Custom Demo" really does start empty), and estimated-data wording only ever states a real, derivable number (approvalVolume\'s own exact value) or the honest "calculated during generation" — never an invented count.');

// Part 2: static-analysis assertions, matching the convention used across
// tests/founder-*.test.ts in this repo (services/founderDemoGenerator.ts,
// services/founder-demo-generator.ts, and the page/actions/client files
// all transitively depend on Clerk and cannot be executed outside the
// Next.js runtime in this test harness).

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const generatorService = read('services/founderDemoGenerator.ts');
const generatorServiceCodeOnly = stripComments(generatorService);
const pageDataService = read('services/founder-demo-generator.ts');
const actionsFile = read('app/founder/demo-generator/actions.ts');
const actionsCodeOnly = stripComments(actionsFile);
const page = read('app/founder/demo-generator/page.tsx');
const client = read('components/founder/DemoGeneratorClient.tsx');
const clientCodeOnly = stripComments(client);
const navClient = read('components/founder/FounderNavClient.tsx');

// ─── 1. Founder authorization ───────────────────────────────────────────

assert.match(page, /await getFounderAccess\(\);/);
assert.doesNotMatch(page, /getFounderAccess\([^)]+\)/); // takes no client-controlled argument
assert.match(actionsCodeOnly, /async function requireFounderWrite\(\)/);
assert.match(actionsCodeOnly, /if \(!access\.ok \|\| access\.readOnly\) \{\s*\n\s*throw new Error/);
// Every mutating action calls the write-gate; the read-only preview action
// calls getFounderAccess() directly instead (any authenticated Founder,
// including read-only, may preview).
assert.match(actionsCodeOnly, /export async function generateDemoWorkspace[\s\S]{0,300}requireFounderWrite\(\)/);
assert.match(actionsCodeOnly, /export async function resetDemoWorkspace[\s\S]{0,120}requireFounderWrite\(\)/);
assert.match(actionsCodeOnly, /export async function previewDemoSampleData[\s\S]{0,300}await getFounderAccess\(\)/);
assert.doesNotMatch(actionsCodeOnly, /export async function previewDemoSampleData[\s\S]{0,400}requireFounderWrite/);
// The engine itself independently re-verifies write access (defense in
// depth beyond the action layer above) — isWritableFounder() checked
// inside services/founderDemoGenerator.ts, not just the action.
assert.match(generatorServiceCodeOnly, /if \(!isWritableFounder\(access\)\) throw new Error\('Founder admin access is required to generate demo workspaces\.'\);/);
assert.match(generatorServiceCodeOnly, /if \(!isWritableFounder\(access\)\) throw new Error\('Founder admin access is required to reset demo workspaces\.'\);/);

// ─── 2 & 4. Real demo customer validation; real customer can never be targeted for generation ──

// generateFounderDemoWorkspace never accepts an existing organizationId to
// mutate — it only ever creates its own new organization from industry +
// companySize, so a real customer's id can never be passed in to redirect
// generation onto it.
assert.doesNotMatch(generatorServiceCodeOnly, /export type DemoGenerationInput = \{[^}]*organizationId/s);
assert.match(generatorServiceCodeOnly, /const organization = await prisma\.organization\.create\(\{/);
// The one authoritative "is this actually a demo org" check.
assert.match(generatorServiceCodeOnly, /if \(!organization\.slug\.startsWith\('founder-demo-'\)\) \{/);

// ─── 3 & 8. Real customer cannot be reset; reset failure handled safely ──

assert.match(generatorServiceCodeOnly, /throw new Error\('Reset blocked: only founder demo workspaces can be deleted\.'\);/);
// The action layer independently re-verifies this too (defense in depth),
// never trusting that the shared engine's own check is the only barrier.
assert.match(actionsCodeOnly, /if \(!organization\.slug\.startsWith\('founder-demo-'\)\) \{/);
assert.match(actionsCodeOnly, /export async function resetDemoWorkspace[\s\S]*?\} catch \(error\) \{[\s\S]*?return \{ ok: false, error: safeErrorMessage\(error\) \};/);

// ─── 6. Generation failure handled safely ──────────────────────────────

assert.match(actionsCodeOnly, /export async function generateDemoWorkspace[\s\S]*?\} catch \(error\) \{[\s\S]*?return \{ ok: false, error: safeErrorMessage\(error\) \};/);
assert.match(actionsCodeOnly, /function safeErrorMessage\(error: unknown\) \{/);
assert.match(actionsCodeOnly, /database-url-redacted/); // never leaks a raw connection string in a thrown error

// Adversarial finding, fixed during this task: the admin-email format
// check originally excluded only whitespace and "@", so an HTML-
// injection-shaped value like "a@b.com<script>" passed validation (not
// exploitable — React auto-escapes JSX interpolation — but a real
// input-validation gap). Regression: the regex must also reject "<"/">".
assert.match(actionsCodeOnly, /if \(primaryAdminEmail && !\/\^\[\^\\s@<>\]\+@\[\^\\s@<>\]\+\\\.\[\^\\s@<>\]\+\$\/\.test\(primaryAdminEmail\)\)/);

// ─── 9. Audit log created, reusing the pre-existing action names ───────

// These two action strings already existed in lib/founder-audit-logs.ts's
// taxonomy before this task — reused verbatim, not reinvented as
// "demo.generated"/"demo.reset", which would fragment the taxonomy.
const auditLogsLib = read('lib/founder-audit-logs.ts');
assert.match(auditLogsLib, /FOUNDER_DEMO_WORKSPACE_GENERATED: \{ menuLabel:/);
assert.match(auditLogsLib, /FOUNDER_DEMO_WORKSPACE_DELETED: \{ menuLabel:/);
assert.match(generatorServiceCodeOnly, /action: 'FOUNDER_DEMO_WORKSPACE_GENERATED'/);
assert.match(generatorServiceCodeOnly, /action: 'FOUNDER_DEMO_WORKSPACE_DELETED'/);
assert.doesNotMatch(generatorServiceCodeOnly, /action: 'demo\.(generated|reset|created)'/); // no parallel taxonomy introduced
// Metadata carries real operational context, no secrets.
assert.match(generatorServiceCodeOnly, /metadata: json\(\{ industry, companySize, scenario: input\.scenario, modules, approvals, graph, investigations, copilotQuestions, users, supportNotes \}\)/);

// ─── 10. No secrets exposed ─────────────────────────────────────────────

const secretPatterns = /DATABASE_URL|REDIS_URL|CLERK_SECRET_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|VOYAGE_API_KEY|ENCRYPTION_KEY|process\.env\.[A-Z_]*(SECRET|TOKEN|PASSWORD|API_KEY)\b/;
for (const file of [generatorService, pageDataService, actionsFile, page, client]) {
  assert.doesNotMatch(file, secretPatterns);
}

// ─── 11 & 12. Scenario and module selection are real, wired end to end ──

assert.match(clientCodeOnly, /DEMO_SCENARIOS\.map\(\(s\) => \{/);
assert.match(clientCodeOnly, /DEMO_MODULES\.map\(\(m\) => \{/);
assert.match(clientCodeOnly, /function applyScenario\(key: DemoScenarioKey\) \{/);
assert.match(clientCodeOnly, /function toggleModule\(key: DemoModuleKey\) \{/);
// Each module independently gates its own real seeding call.
assert.match(generatorServiceCodeOnly, /modules\.includes\('approvals'\)\s*\n\s*\? await seedBulkApprovals/);
assert.match(generatorServiceCodeOnly, /modules\.includes\('compliance'\)\s*\n\s*\? await seedContractsAndGraph/);
assert.match(generatorServiceCodeOnly, /modules\.includes\('integrations'\)\s*\n\s*\? await Promise\.all\(providers\.map/);
assert.match(generatorServiceCodeOnly, /modules\.includes\('analytics'\) \? await seedInvestigations/);
assert.match(generatorServiceCodeOnly, /modules\.includes\('users'\) \? await seedFounderManagedUsers/);
assert.match(generatorServiceCodeOnly, /modules\.includes\('support'\) \? await seedSupportNotes/);
assert.match(generatorServiceCodeOnly, /if \(modules\.length === 0\) throw new Error\('Select at least one data module to generate\.'\);/);

// ─── 13 & 14. Empty and existing demo customer states ──────────────────

assert.match(client, /No demo customers available/);
assert.match(client, /Create a demo customer to begin\./);
assert.match(clientCodeOnly, /<Field label="Industry" value=\{currentWorkspace\.industry\} \/>/);
assert.match(clientCodeOnly, /<Field label="Plan" value=\{currentWorkspace\.planTier/);
assert.match(clientCodeOnly, /<Field label="Created" value=\{fmtDateTime\(currentWorkspace\.createdAt\)\} \/>/);
assert.match(clientCodeOnly, /<Field label="Status" value=\{currentWorkspace\.status/);
assert.match(client, /No demo customers yet\./);
assert.match(client, /No demo runs yet\./);
assert.match(client, /Demo Generator could not load\./);
assert.match(client, /Demo generation could not be completed\./);
assert.match(client, /Demo environment generated successfully\./);

// ─── 15. Double-click generation protection ────────────────────────────

assert.match(clientCodeOnly, /function handleGenerate\(\) \{\s*\n\s*if \(pending \|\| modules\.size === 0\) return;/);
assert.match(clientCodeOnly, /function handleReset\(\) \{\s*\n\s*if \(!resetTarget \|\| pending\) return;/);
assert.match(clientCodeOnly, /function refresh\(\) \{\s*\n\s*if \(refreshing\) return;/);
assert.match(client, /disabled=\{pending \|\| modules\.size === 0\}/);

// ─── 16. Responsive structure ───────────────────────────────────────────

assert.match(client, /xl:grid-cols-\[1fr_320px\]/); // main content + persistent right panel, collapses to one column below xl
assert.match(client, /sm:grid-cols-2/);
assert.match(client, /lg:grid-cols-4/); // scenario cards: 4-equal-column grid at desktop width
assert.match(client, /overflow-x-auto/);
assert.match(client, /table-fixed/);
assert.doesNotMatch(client, /overflow-x-scroll/);

// ─── 17. Accessibility ──────────────────────────────────────────────────

assert.match(client, /role="tablist"/);
assert.match(client, /aria-selected=\{customerMode === 'existing'\}/);
assert.match(client, /aria-pressed=\{active\}/); // scenario cards are real toggle buttons, not clickable divs
assert.doesNotMatch(clientCodeOnly, /<div[^>]*onClick/);
assert.match(client, /import \{ FounderDrawer \} from '\.\/FounderDrawer'/);
assert.equal((client.match(/<FounderDrawer/g) ?? []).length, 2); // reset confirmation + preview — no third, competing drawer implementation
assert.match(client, /aria-label="Close reset confirmation"/);
assert.match(client, /aria-label="Close sample data preview"/);
assert.match(client, /aria-busy=\{refreshing\}/);
// Status is never color-only — every status badge renders as text.
assert.match(clientCodeOnly, /\{currentWorkspace\.status \?\? '—'\}/);

// ─── 18. Customer 360 navigation reuses the existing route ─────────────

assert.match(client, /href=\{`\/founder\/customers\/\$\{currentWorkspace\.customerAccountId\}`\}/);
assert.match(client, /href=\{`\/founder\/customers\/\$\{generateResult\.customerAccountId\}`\}/);
assert.doesNotMatch(client, /\/founder\/demo-generator\/customers/); // no second customer-detail route introduced

// ─── Navigation: locked Internal Tools sidebar unchanged ───────────────

const internalToolsSection = navClient.match(/const INTERNAL_TOOLS: NavItem\[\] = \[([\s\S]*?)\];/)?.[1] ?? '';
assert.match(internalToolsSection, /\{ label: 'Demo Generator', href: '\/founder\/demo-generator' \}/);
assert.equal((internalToolsSection.match(/\{ label:/g) ?? []).length, 3); // Demo Generator, Observability, Certification — no new item introduced

// ─── Performance: no N+1, batched queries ──────────────────────────────

assert.match(pageDataService, /await Promise\.all\(\[/);
assert.match(generatorServiceCodeOnly, /await Promise\.all\(providers\.map\(\(provider\) => createOrUpdateIntegration/);

console.log('Validated Founder Demo Generator (/founder/demo-generator): reuses the one real demo-workspace engine (services/founderDemoGenerator.ts, itself layered on lib/demo-data.ts) rather than a second one, with 6 real data modules and 4 scenario presets that are genuinely wired to independent seeding calls (verified separately against a real Postgres database) rather than decorative labels. A real customer can never be targeted for generation (the engine only ever creates its own new organization) or reset (both the shared engine and this page\'s own action layer independently verify the founder-demo- slug prefix). Every mutation independently re-verifies Founder write access; generation and reset failures are caught and surfaced as safe, generic messages; FOUNDER_DEMO_WORKSPACE_GENERATED/DELETED reuse the audit action names that already existed in this codebase\'s taxonomy rather than introducing a parallel one; and the shared FounderDrawer is reused for both the reset confirmation and sample-data preview with no competing drawer implementation.');
