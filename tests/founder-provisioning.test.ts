import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static-analysis tests, matching the convention used across tests/founder-*.test.ts
// in this repo: there is no live-database test harness here (CI's DATABASE_URL
// points at nothing reachable — see .github/workflows/ci.yml), so these assert
// the source code contains the required authorization gates, validation
// branches, transaction wiring, and audit events, rather than exercising a
// real Postgres instance end-to-end.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const founderService = read('services/founder.ts');
const provisionPage = read('app/founder/provision/page.tsx');
const wizard = read('components/founder/ProvisionWizard.tsx');
const featureManagementPage = read('app/founder/features/page.tsx');
const prismaSchema = read('prisma/schema.prisma');
const authLib = read('lib/auth.ts');
const seedScript = read('prisma/seed.ts');
const universalGateway = read('services/gateway/universalGateway.ts');
const classifierPersistence = read('services/classifier/persistence.ts');
const founderDemoGenerator = read('services/founderDemoGenerator.ts');
const ingestTestRoute = read('app/api/ingest/test/route.ts');

// 1. Unauthorized / forbidden Founder access is checked server-side, on both
//    the page render and the provisioning action — never trusting the client.
assert.match(provisionPage, /getFounderAccess\(\)/);
assert.match(provisionPage, /if \(!access\.ok\)/);
assert.match(provisionPage, /access\.readOnly/);
assert.match(founderService, /if \(access\.readOnly\) throw new FounderProvisioningError/);

// 2. Duplicate domain is rejected explicitly, before any write, with a
//    distinguishable error code the UI can react to — never a silent upsert
//    into an unrelated existing tenant.
assert.match(founderService, /class FounderProvisioningError extends Error/);
assert.match(founderService, /'DUPLICATE_DOMAIN' \| 'VALIDATION'/);
assert.match(founderService, /is already provisioned for/);
assert.match(founderService, /checkFounderDomainAvailability/);
assert.match(wizard, /checkDomainAction/);
assert.match(wizard, /domainTaken/);

// 3. Seat count validation: positive integer, sane enterprise ceiling.
assert.match(founderService, /MAX_PROVISIONING_SEATS = 50_000/);
assert.match(founderService, /Seats must be a positive whole number\./);
assert.match(founderService, /Seats cannot exceed \$\{MAX_PROVISIONING_SEATS/);
assert.match(wizard, /Seats must be at least 1\./);

// 4. Administrator validation: name required, email format checked.
assert.match(founderService, /Administrator name is required\./);
assert.match(founderService, /EMAIL_PATTERN\.test\(primaryAdminEmail\)/);
assert.match(wizard, /EMAIL_PATTERN/);

// 5. Feature access and integration access are both configured from the
//    existing catalogs (founderFeatures / founderIntegrationCatalog) — no
//    duplicate catalog is defined in the wizard.
assert.match(founderService, /for \(const feature of founderFeatures\)/);
assert.match(founderService, /customerFeatureFlag\.upsert/);
assert.match(founderService, /for \(const integration of founderIntegrationCatalog\)/);
assert.match(founderService, /customerIntegrationStatus\.upsert/);
assert.doesNotMatch(wizard, /const features = \[/);
assert.doesNotMatch(wizard, /const integrations = \[/);

// 6. Every provisioning stage writes an auditable event via the existing
//    FounderAuditLog infrastructure — no second audit system introduced.
for (const action of [
  'customer.provision.started',
  'customer.provisioned',
  'customer.provision.failed',
  'customer.feature.configured',
  'customer.integration.access_granted',
  'user.invited',
]) {
  assert.match(founderService, new RegExp(`action: '${action.replace(/\./g, '\\.')}'`));
}
assert.match(founderService, /tx\.founderAuditLog\.create/);

// 7. Provisioning writes run inside a single database transaction, and a
//    failure is captured (customer.provision.failed) and re-thrown — never
//    reported as success, never silently swallowed.
assert.match(founderService, /prisma\.\$transaction\(async \(tx\) => \{/);
assert.match(founderService, /} catch \(error\) \{[\s\S]{0,400}customer\.provision\.failed/);

// 8. Idempotent replay: a resubmission carrying the same requestId returns
//    the already-provisioned customer instead of creating a duplicate.
assert.match(founderService, /Idempotent replay guard/);
assert.match(founderService, /path: \['requestId'\], equals: requestId/);
assert.match(wizard, /useId\(\)/);
assert.match(wizard, /name="requestId"/);

// 9. The administrator invitation reuses the existing FounderManagedUser
//    invite shape (status/inviteToken/expiresAt) — no parallel invite model.
assert.match(founderService, /founderManagedUser\.upsert/);
assert.match(founderService, /status: 'INVITED'/);
assert.match(founderService, /inviteToken: randomUUID\(\)/);

// 10. Invitation status is never claimed as "sent" when no email is actually
//     dispatched — the wizard and success screen say so honestly.
assert.doesNotMatch(wizard, /Email sent/);
assert.match(wizard, /No email has been sent automatically/);

// 11. No credentials, tokens, or secrets are ever logged to the audit trail
//     or rendered in the Founder UI.
assert.doesNotMatch(founderService.match(/metadata: \{[^}]*requestId[^}]*\}/g)?.join('\n') ?? '', /inviteToken/);
assert.doesNotMatch(wizard, /accessToken|refreshToken|clientSecret/i);

// 12. Provisioning hands back a real customer id that links straight into
//     the existing Customer 360 and onboarding views — no parallel customer
//     representation is created.
assert.match(provisionPage, /customerId: customer\.id/);
assert.match(wizard, /\/founder\/customers\/\$\{state\.customerId\}/);
assert.match(wizard, /\/founder\/pilots\/\$\{state\.customerId\}/);

// 13. The wizard reuses the same server-action + useActionState pattern as
//     the existing CustomerAccountDetailsCard, not a bespoke fetch/XHR flow.
assert.match(wizard, /useActionState\(provisionAction, \{\}\)/);

// 14. There is exactly one feature catalog. Feature Management
//     (/founder/features) and Provision Customer (/founder/provision) both
//     import founderFeatures from the same services/founder module — no
//     second catalog was created for either page. If this regresses (a
//     page starts importing a differently-named or locally-defined feature
//     list), these two assertions fail before the pages can drift apart.
assert.match(featureManagementPage, /import \{[^}]*founderFeatures[^}]*\} from '@\/services\/founder'/);
assert.match(provisionPage, /import \{[^}]*founderFeatures[^}]*\} from '@\/services\/founder'/);
assert.doesNotMatch(featureManagementPage, /const founderFeatures\s*=/);
assert.doesNotMatch(wizard, /founderFeatures/); // the wizard only ever sees the `features` prop, never imports the catalog itself

// 15. Neither page truncates or filters the catalog before counting or
//     rendering it (no .slice/.filter applied to founderFeatures itself) —
//     Feature Management's "Feature gates" metric and Provision Customer's
//     grid must both reflect founderFeatures.length exactly.
assert.doesNotMatch(featureManagementPage, /founderFeatures\.(slice|filter)\(/);
assert.doesNotMatch(provisionPage, /founderFeatures\.(slice|filter)\(/);
assert.match(featureManagementPage, /founderFeatures\.length/);

// 16. Every catalog entry declares its own defaultEnabled flag, and the
//     wizard's default selection is computed by filtering on that flag
//     (services/founder.ts's catalog data), not a hardcoded list of keys
//     duplicated into the wizard — a newly added feature is automatically
//     included or excluded correctly with zero wizard changes.
assert.match(founderService, /defaultEnabled: true/);
assert.match(wizard, /features\.filter\(\(f\) => f\.defaultEnabled\)\.map\(\(f\) => f\.key\)/);
assert.doesNotMatch(wizard, /enabledFeatures: \[['"]/); // never a hardcoded array of feature-key literals

// 17. The "X of Y features enabled" summary is computed from the live
//     catalog/selection lengths, never a hardcoded literal like "7 of 7".
assert.match(wizard, /\{draft\.enabledFeatures\.length\} of \{features\.length\} features/);
assert.doesNotMatch(wizard, /\d+ of \d+ features/); // no literal digit pair anywhere in the source
assert.doesNotMatch(wizard, /\d+ of \d+ integrations/);

// 18. REGRESSION — Organization.onboardingCompletedSteps is a NOT NULL
//     String[] column with no DB-level default (its default was dropped in
//     migration 20260812025358_rbac_verified, alongside departments and
//     approvalCategories' defaults — confirmed against the live schema
//     below). Omitting it from an Organization create crashes with a null
//     constraint violation. provisionFounderCustomer's organization.upsert()
//     must always initialize it explicitly, exactly like departments and
//     approvalCategories already are.
assert.match(prismaSchema, /onboardingCompletedSteps\s+String\[\]/);
{
  const createBlock = founderService.match(/const organization = await tx\.organization\.upsert\(\{[\s\S]*?\n {6}\}\);/)?.[0] ?? '';
  assert.notEqual(createBlock, '', 'organization.upsert() block not found in provisionFounderCustomer');
  assert.match(createBlock, /onboardingCompletedSteps: \[\]/);
  assert.match(createBlock, /departments: \[/);
  assert.match(createBlock, /approvalCategories: \[/);
}

// 19. The same field is initialized at every other Organization creation
//     call site in the codebase — this was a pre-existing, repo-wide latent
//     bug (the DROP DEFAULT migration affected all of them identically),
//     not something specific to Founder provisioning, so the regression
//     guard covers all of them to prevent the landmine from reappearing
//     anywhere.
for (const [name, source] of [
  ['lib/auth.ts (canonical tenant bootstrap)', authLib],
  ['prisma/seed.ts', seedScript],
  ['services/gateway/universalGateway.ts', universalGateway],
  ['services/classifier/persistence.ts', classifierPersistence],
  ['services/founderDemoGenerator.ts', founderDemoGenerator],
  ['app/api/ingest/test/route.ts', ingestTestRoute],
] as const) {
  assert.match(source, /onboardingCompletedSteps: \[\]/, `${name} must initialize onboardingCompletedSteps on Organization create`);
}

// 20. Transaction integrity: Organization is the first write inside
//     prisma.$transaction, so a failure there rolls back the entire
//     transaction — no CustomerAccount, workspace, seats, features,
//     integrations, admin invite, or health row can exist without a
//     successful Organization row. The failure path logs
//     customer.provision.failed and re-throws (asserted above in #7);
//     it never returns a success shape.
assert.match(founderService, /const result = await prisma\.\$transaction\(async \(tx\) => \{[\s\S]{0,200}const organization = await tx\.organization\.upsert/);

// 21. The Founder UI never shows raw Prisma/DB internals for unexpected
//     provisioning failures (table/column names, SQL, stack traces) - only
//     FounderProvisioningError's own human-authored copy, or this fixed,
//     safe fallback message. The raw diagnostic still reaches server logs
//     and the customer.provision.failed audit event (assertions #6-7).
assert.match(provisionPage, /No customer was created\. Please retry or contact platform support\./);
assert.doesNotMatch(provisionPage, /Safe diagnostic: \$\{safeProvisionError\(error\)\}/);

console.log('Validated Founder Console provisioning: authorization gates, duplicate-domain rejection, seat/admin validation, feature/integration configuration, audit events, transactional writes, idempotent replay, honest invitation status, single-source-of-truth feature catalog parity with Feature Management, Organization.onboardingCompletedSteps null-constraint regression coverage across every Organization creation call site, and a safe (non-leaking) Founder-facing failure message.');

// 22. Provision Customer must never fabricate or display an ARR figure —
//     no plan-tier-derived revenue estimate anywhere in the wizard, no
//     duplicated copy of arrFromPlanTier, no "Estimated ARR" label, no
//     currency-formatted output, and no leftover hardcoded 25000/25,000
//     sample value from the removed card.
assert.doesNotMatch(wizard, /estimateArr/);
assert.doesNotMatch(wizard, /formatArr/);
assert.doesNotMatch(wizard, /Estimated ARR/i);
assert.doesNotMatch(wizard, /Plan-based estimate/i);
assert.doesNotMatch(wizard, /₹/);
assert.doesNotMatch(wizard, /25,?000/);

// 23. Contract Start Date and Contract End Date remain — removing the ARR
//     card must not have removed real, already-collected commercial
//     fields along with it.
assert.match(wizard, /Contract Start Date/);
assert.match(wizard, /Contract End Date/);

// 24. arrFromPlanTier itself is untouched and still serves its legitimate
//     callers (the Founder customer list's pipeline ARR metric) — this
//     task removes provisioning's *display* of a fabricated estimate, not
//     the shared helper other Founder Revenue/pipeline features rely on.
assert.match(founderService, /export function arrFromPlanTier/);
assert.match(founderService, /expectedArr: arrFromPlanTier\(/);

console.log('Validated Provision Customer displays no fabricated ARR while leaving arrFromPlanTier and its legitimate Founder Revenue/pipeline callers intact.');

// ─── Authoritative commercial plan catalog (lib/plans.ts) ──────────────────
const plansModule = read('lib/plans.ts');
const landingPage = read('components/landing/LandingPage.tsx');
const founderPilots = read('services/founder-pilots.ts');
const revenuePage = read('app/founder/revenue/page.tsx');
const featuresPage = read('app/founder/features/page.tsx');
const prismaSchemaSource = prismaSchema; // already read above for the onboardingCompletedSteps regression

// 25. Business exists, with its published price, seat limit, and
//     connected-system limit — matching the current landing page exactly.
assert.match(plansModule, /displayName: 'Business'/);
assert.match(plansModule, /pricing: \{ type: 'fixed', amountUsd: 999, cadence: 'month' \}/);
assert.match(plansModule, /seatLimit: 25/);
assert.match(plansModule, /connectedSystemLimit: 3/);

// 26. Enterprise exists, with Custom pricing — never a number, never an
//     arbitrary seat limit like Business's 25. Contract-defined (null) for
//     both seats and connected systems.
{
  const enterpriseBlock = plansModule.match(/ENTERPRISE: \{[\s\S]*?\n {2}\},/)?.[0] ?? '';
  assert.notEqual(enterpriseBlock, '', 'ENTERPRISE catalog entry not found');
  assert.match(enterpriseBlock, /displayName: 'Enterprise'/);
  assert.match(enterpriseBlock, /pricing: \{ type: 'custom' \}/);
  assert.match(enterpriseBlock, /seatLimit: null/);
  assert.match(enterpriseBlock, /connectedSystemLimit: null/);
  assert.doesNotMatch(enterpriseBlock, /amountUsd/);
}

// 27. formatPlanPrice never fabricates a number for 'custom' or 'unset'
//     pricing — only 'fixed' pricing ever produces a dollar figure.
assert.match(plansModule, /if \(pricing\.type === 'custom'\) return 'Custom pricing';/);
assert.doesNotMatch(plansModule.match(/function formatPlanPrice[\s\S]*?\n\}/)?.[0] ?? '', /\$\{.*custom/);

// 28. Provision Customer consumes this exact catalog — no second,
//     duplicated plan/pricing definition inside the wizard or its page.
assert.match(provisionPage, /import \{ commercialPlans, formatPlanPrice \} from '@\/lib\/plans'/);
assert.match(provisionPage, /Object\.values\(commercialPlans\)\.map/);
assert.doesNotMatch(wizard, /amountUsd: 999/);
assert.doesNotMatch(wizard, /'Business'/); // display name comes from the plans prop, never a wizard-local literal

// 29. Provision Customer still shows no ARR after adding real plan
//     pricing — the earlier no-ARR regression coverage (assertion set 22)
//     must still hold with the plan catalog wired in.
assert.doesNotMatch(wizard, /estimateArr|formatArr\(/);

// 30. Business's seat limit is enforced both client-side (the wizard) and
//     server-side (provisionFounderCustomer never trusts the client) —
//     sourced from the shared catalog, not a hardcoded 25 in two places.
assert.match(wizard, /selectedPlan\?\.seatLimit != null && draft\.seats > selectedPlan\.seatLimit/);
assert.match(founderService, /import \{ commercialPlans \} from '@\/lib\/plans'/);
assert.match(founderService, /plan\.seatLimit != null && seats > plan\.seatLimit/);
assert.doesNotMatch(founderService.match(/const plan = commercialPlans\[planTier\][\s\S]{0,300}/)?.[0] ?? '', /seatLimit: 25|> 25\b/);

// 31. Feature Management does not define a second, competing plan/pricing
//     catalog — it only ever dealt with founderFeatures (assertion set
//     14), and still does.
assert.doesNotMatch(featuresPage, /commercialPlans|amountUsd|999/);

// 32. Founder Revenue's pipeline ARR (a separate, pre-existing, clearly
//     "expected"/pipeline metric — see services/founder-pilots.ts's
//     arrForPlan) never treats Enterprise's custom pricing as a real
//     number, and Enterprise is not hardcoded to a fabricated dollar
//     amount anywhere in that pipeline.
assert.match(founderPilots, /expectedArr/);
assert.doesNotMatch(revenuePage, /ENTERPRISE.{0,40}\$\d/s);

// 33. The landing page — the commercial reference this task points to —
//     sources its price, seat limit, and feature bullets from the same
//     catalog rather than a second hardcoded pricing array.
assert.match(landingPage, /import \{ commercialPlans, formatPlanPriceParts \} from '@\/lib\/plans'/);
assert.match(landingPage, /commercialPlans\.STARTER\.marketingFeatures/);
assert.match(landingPage, /commercialPlans\.ENTERPRISE\.marketingFeatures/);
assert.doesNotMatch(landingPage, /price: '\$999'/); // no more locally-hardcoded price literal

// 34. No schema/migration change: CustomerPlanTier keeps its existing four
//     values untouched, so every existing customer's stored planTier
//     remains valid — the new catalog only adds a display/commercial layer
//     on top of the unchanged enum.
assert.match(prismaSchemaSource, /enum CustomerPlanTier \{\s*FREE_TRIAL\s*STARTER\s*GROWTH\s*ENTERPRISE\s*\}/);

console.log('Validated the authoritative commercial plan catalog (lib/plans.ts): Business ($999/month, 25 seats, 3 connected systems) and Enterprise (custom, contract-defined) are consistent across the landing page and Provision Customer, seat limits are enforced client- and server-side from one source, and no fabricated pricing or duplicate catalog exists anywhere.');

// 35. Customer 360 now displays "Business" for STARTER too, sourced from
//     the same lib/plans.ts catalog — no separate hardcoded label, and the
//     underlying stored enum value (still 'STARTER') is untouched.
const customer360Page = read('app/founder/customers/[id]/page.tsx');
const accountDetailsCard = read('components/founder/CustomerAccountDetailsCard.tsx');
assert.match(customer360Page, /import \{ planDisplayName \} from '@\/lib\/plans'/);
assert.doesNotMatch(customer360Page, /customer\.planTier\.replaceAll\('_', ' '\)/);
assert.match(accountDetailsCard, /import \{ commercialPlans, planDisplayName \} from '@\/lib\/plans'/);
assert.match(accountDetailsCard, /Object\.values\(commercialPlans\)\.map\(\(plan\) => \[plan\.tier, plan\.displayName\]\)/);
assert.doesNotMatch(accountDetailsCard, /\['STARTER', 'Starter'\]/);

console.log('Validated Customer 360 (page and CustomerAccountDetailsCard) displays plan names from lib/plans.ts, so "Business" is shown consistently everywhere a Founder sees a customer\'s plan.');
