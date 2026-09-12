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

// 22. Provision Customer must never *automatically calculate* or fabricate
//     an ARR figure from the plan tier — no plan-tier-derived revenue
//     estimate function anywhere in the wizard, no duplicated copy of
//     arrFromPlanTier, no "Plan-based estimate" label, no rupee-formatted
//     output, and no leftover hardcoded 25000/25,000 sample value from the
//     removed card. This does NOT forbid "Estimated ARR" itself — a later
//     task (see assertion set 36+) reintroduces it as a required,
//     Founder-*entered* field, which is an explicit, distinct concept from
//     the auto-calculated figure this assertion set guards against.
assert.doesNotMatch(wizard, /estimateArr/);
assert.doesNotMatch(wizard, /formatArr/);
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
assert.match(provisionPage, /import \{ commercialPlans, formatPlanPrice, suggestedAnnualEstimate \} from '@\/lib\/plans'/);
assert.match(provisionPage, /Object\.values\(commercialPlans\)\.map/);
assert.doesNotMatch(wizard, /amountUsd: 999/);
assert.doesNotMatch(wizard, /'Business'/); // display name comes from the plans prop, never a wizard-local literal

// 29. Provision Customer still shows no *automatically calculated* ARR
//     after adding real plan pricing — the earlier no-fabricated-ARR
//     regression coverage (assertion set 22) must still hold with the plan
//     catalog wired in. (Founder-entered Estimated ARR, added later, is a
//     distinct, explicitly-confirmed concept — see assertion set 36+.)
assert.doesNotMatch(wizard, /estimateArr|formatArr\(/);

// 30. Business's seat limit is enforced both client-side (the wizard) and
//     server-side (provisionFounderCustomer never trusts the client) —
//     sourced from the shared catalog, not a hardcoded 25 in two places.
assert.match(wizard, /selectedPlan\?\.seatLimit != null && draft\.seats > selectedPlan\.seatLimit/);
assert.match(founderService, /import \{ commercialPlans, MAX_ESTIMATED_ARR_USD \} from '@\/lib\/plans'/);
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

// ─── Founder-entered Estimated ARR (required, never auto-calculated as
// commercial fact) ───────────────────────────────────────────────────────
const billingPage = read('app/founder/billing/page.tsx');

// 36. (Scenario: field exists) The wizard exposes a real, named form field —
//     not just display text — and it is wired into the hidden-field payload
//     the final submit sends to provisionFounderCustomer.
assert.match(wizard, /estimatedArrUsd: string;/);
assert.match(wizard, /<input type="hidden" name="estimatedArrUsd" value=\{draft\.estimatedArrUsd\} \/>/);
assert.match(wizard, />\s*Estimated ARR\s*<span className="text-rose-600"> \*<\/span>/);

// 37. (Scenario: required) Both the wizard's client-side validation and
//     provisionFounderCustomer's server-side validation reject an empty
//     value with the exact required copy — the server never trusts the
//     client's own check.
assert.match(wizard, /if \(!arrRaw\) \{\s*errors\.estimatedArrUsd = 'Estimated ARR is required\.';/);
assert.match(founderService, /if \(!estimatedArrUsdRaw\) throw new FounderProvisioningError\('Estimated ARR is required\.', 'VALIDATION'\);/);

// 38. (Scenario: empty blocks) readyToProvision is gated on the full
//     `validation` map being empty, and estimatedArrUsd is one of the keys
//     that map can carry (assertion 37) — so an empty field blocks
//     progression to Provision exactly like every other required field.
assert.match(wizard, /const readyToProvision = Object\.keys\(validation\)\.length === 0 && !readOnly;/);
assert.match(wizard, /1: \['estimatedArrUsd'\],/);

// 39. (Scenario: zero blocks) Zero is explicitly rejected, client- and
//     server-side, with the exact required copy — not silently coerced to
//     a falsy-empty state or accepted as "no revenue yet".
assert.match(wizard, /else if \(arrNum <= 0\) errors\.estimatedArrUsd = 'Estimated ARR must be greater than zero\.';/);
assert.match(founderService, /if \(estimatedArrUsd <= 0\) throw new FounderProvisioningError\('Estimated ARR must be greater than zero\.', 'VALIDATION'\);/);

// 40. (Scenario: negative blocks) The same `<= 0` comparison rejects
//     negative values too — there is no separate, missing negative-number
//     branch that would let a negative slip through as "not zero".
assert.doesNotMatch(wizard, /arrNum < 0/); // would imply a gap letting exactly 0 or a separate negative path diverge
assert.doesNotMatch(founderService, /estimatedArrUsd < 0(?! *\|\|)/);

// 41. (Scenario: invalid blocks) A non-numeric entry (e.g. "abc") produces
//     Number(...) => NaN, which is explicitly checked and rejected with the
//     exact "enter a valid" copy before the zero/negative check ever runs.
assert.match(wizard, /if \(!Number\.isFinite\(arrNum\)\) errors\.estimatedArrUsd = 'Enter a valid estimated ARR\.';/);
assert.match(founderService, /if \(!Number\.isFinite\(estimatedArrUsd\)\) throw new FounderProvisioningError\('Enter a valid estimated ARR\.', 'VALIDATION'\);/);

// 42. (Scenario: valid accepted) There is a sane, generous ceiling (not a
//     narrow one that would reject legitimate large enterprise contracts),
//     shared by both layers from the same lib/plans.ts constant — never two
//     independently hardcoded ceiling numbers that could drift apart.
assert.match(plansModule, /export const MAX_ESTIMATED_ARR_USD = 100_000_000;/);
assert.match(wizard, /import \{ MAX_ESTIMATED_ARR_USD \} from '@\/lib\/plans';/);
assert.match(founderService, /import \{ commercialPlans, MAX_ESTIMATED_ARR_USD \} from '@\/lib\/plans';/);
assert.match(wizard, /arrNum > MAX_ESTIMATED_ARR_USD/);
assert.match(founderService, /estimatedArrUsd > MAX_ESTIMATED_ARR_USD/);

// 43. (Scenario: Enterprise gets no auto-ARR) suggestedAnnualEstimate only
//     ever returns a number for fixed/monthly pricing; Enterprise's pricing
//     is `{ type: 'custom' }`, so it always resolves to null — the wizard's
//     default draft (Enterprise-selected) starts with an empty string, not
//     a pre-filled figure.
assert.match(plansModule, /export function suggestedAnnualEstimate\(pricing: PlanPricing\): number \| null \{/);
{
  const suggestFn = plansModule.match(/export function suggestedAnnualEstimate[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(suggestFn, /return pricing\.amountUsd \* 12;/);
  assert.match(suggestFn, /return null;/);
}
assert.match(wizard, /estimatedArrUsd: '',/); // defaultDraft's initial value — Enterprise is the default planTier
assert.doesNotMatch(founderService, /estimatedArrUsd = .*ENTERPRISE/); // never derived from the Enterprise plan name

// 44. (Scenario: Business can suggest $11,988) 999 * 12 = 11,988 is never
//     hardcoded anywhere — it is only ever computed at runtime from
//     commercialPlans.STARTER's own published $999/month price via
//     suggestedAnnualEstimate, so a future price change can't leave a stale
//     11988 literal behind.
assert.doesNotMatch(plansModule, /11[,_]?988/);
assert.doesNotMatch(wizard, /11[,_]?988/);
assert.doesNotMatch(provisionPage, /11[,_]?988/);
assert.match(provisionPage, /suggestedArrUsd: suggestedAnnualEstimate\(plan\.pricing\)/);
assert.match(wizard, /suggestedArrUsd: number \| null/);

// 45. (Scenario: suggestion is clearly a suggestion) The suggestion is only
//     ever surfaced as help copy, gated on the current value still matching
//     the plan's suggestion exactly — never injected as a value the Founder
//     didn't see labeled, and never silently required.
assert.match(wizard, /isSuggestedArrValue/);
assert.match(wizard, /Suggested from the current Business monthly price\. Confirm or adjust for the customer agreement\./);
assert.match(wizard, /Estimated annual recurring revenue for internal planning\. This is not actual billed revenue\./);
assert.doesNotMatch(wizard, /Actual ARR/i);

// 46. (Scenario: Founder can confirm/adjust) The Estimated ARR input is a
//     normal editable numeric field — not disabled, not read-only — so a
//     pre-filled Business suggestion can be changed like any other field.
assert.match(wizard, /value=\{draft\.estimatedArrUsd\}\s*\n\s*onChange=\{\(e\) => set\('estimatedArrUsd', e\.target\.value\)\}/);
assert.doesNotMatch(wizard, /name="estimatedArrUsd"[\s\S]{0,40}disabled/);

// 47. (Scenario: summary updates dynamically) The sidebar Provisioning
//     Summary reads the live draft value (not a snapshot taken once), and
//     falls back to an honest "Required" label — never a fabricated
//     placeholder number — when the field is empty or invalid.
assert.match(wizard, /Estimated ARR — Required/);
assert.match(wizard, /Est\. ARR \$\$\{Number\(draft\.estimatedArrUsd\)\.toLocaleString\(\)\}/);
assert.doesNotMatch(wizard, /Est\. ARR \$0\b/);

// 48. (Scenario: Review shows entered value) The Review step's Plan &
//     Commercial section carries a distinctly-labeled "Estimated ARR" row
//     (never "Actual ARR") alongside Plan, Billing type, and the contract
//     dates already covered by assertion 23.
assert.match(wizard, /\['Estimated ARR', draft\.estimatedArrUsd\.trim\(\) && !validation\.estimatedArrUsd \? `\$\$\{Number\(draft\.estimatedArrUsd\)\.toLocaleString\(\)\}` : 'Estimated ARR — Required'\]/);

// 49. (Scenario: provisioning persists correctly) The validated value is
//     actually written to CustomerAccount.estimatedArrUsd in both the
//     create and update branches of the upsert — parsed-and-validated is
//     not enough on its own; it must reach the database write.
{
  const upsertBlock = founderService.match(/const customer = await tx\.customerAccount\.upsert\(\{[\s\S]*?\n {6}\}\);/)?.[0] ?? '';
  assert.notEqual(upsertBlock, '', 'customerAccount.upsert() block not found in provisionFounderCustomer');
  const updateBlock = upsertBlock.match(/update: \{[\s\S]*?\n {8}\},/)?.[0] ?? '';
  const createBlock2 = upsertBlock.match(/create: \{[\s\S]*?\n {8}\},/)?.[0] ?? '';
  assert.match(updateBlock, /estimatedArrUsd,/);
  assert.match(createBlock2, /estimatedArrUsd,/);
}
assert.match(prismaSchema, /estimatedArrUsd\s+Int\?/);

// 50. (Scenario: actual revenue never created from estimate) There is no
//     "actual"/"recognized"/"invoice" revenue field anywhere in the schema
//     or provisioning code that estimatedArrUsd is ever copied into — the
//     Founder-entered figure stays confined to its own column, with no
//     code path promoting it to a billed-revenue concept.
assert.doesNotMatch(prismaSchema, /actualArrUsd|recognizedRevenue|invoiceAmount|paidRevenue/i);
assert.doesNotMatch(founderService, /actualArr|recognizedRevenue|invoiceAmount|paidRevenue/i);
assert.match(prismaSchema, /Founder-entered internal planning estimate[\s\S]{0,400}never automatically\s*\n\s*\/\/ becomes actual\/recognized revenue/);

// 51. (Scenario: Revenue page not broken / terminology stays accurate)
//     Founder Revenue's own pipeline "Expected ARR" metric (a separate,
//     pre-existing, legitimately-labeled concept — assertion 32) is
//     untouched: it is not reading from or renamed to estimatedArrUsd.
assert.doesNotMatch(revenuePage, /estimatedArrUsd/);
assert.match(founderPilots, /function arrForPlan\(planTier: string, seats: number\)/);

// 52. (Superseded by the Plans & Billing control-plane build: Plans &
//     Billing now legitimately surfaces the Founder-entered Estimated ARR
//     as an explicit, first-class KPI/column — this is that task's own
//     scope, not a naming collision. It must read the real
//     CustomerAccount.estimatedArrUsd field via the shared fmtEstimatedArr
//     helper (lib/founder-billing.ts) and never fall back to a plan/seat-
//     derived formula for that figure.)
const founderBillingService = read('services/founder-billing.ts');
const billingLib = read('lib/founder-billing.ts');
const billingDrawer = read('components/founder/BillingPortfolioClient.tsx');
assert.match(billingPage, /import \{ fmtEstimatedArr \} from '@\/lib\/founder-billing'/);
assert.doesNotMatch(billingPage, /calcArr\(|arrFromPlanTier\(|arrForPlan\(/);
assert.doesNotMatch(billingDrawer, /calcArr\(|arrFromPlanTier\(|arrForPlan\(/);
assert.match(founderBillingService, /_sum: \{ estimatedArrUsd: true \}/);
assert.match(billingLib, /estimatedArrUsd == null\) return 'Not set'/);

// 53. (Scenario: tenant isolation intact) CustomerAccount.estimatedArrUsd
//     lives on the same tenant-scoped commercial record as every other
//     Founder-only commercial field (planTier, dataRetentionDays) — it
//     carries no cross-tenant reference and does not appear in
//     lib/tenant-isolation.ts, since Founder Console commercial data is
//     deliberately separate from tenant-scoped Organization data (see
//     CLAUDE.md's "Founder/internal ops" architecture note).
const tenantIsolationLib = read('lib/tenant-isolation.ts');
assert.doesNotMatch(tenantIsolationLib, /estimatedArrUsd/);

// 54. Audit trail: the Founder's confirmed commercial inputs are logged via
//     the existing FounderAuditLog mechanism (no second audit system),
//     capturing plan/billing type/estimated ARR without duplicating admin
//     PII or contract dates into this event.
assert.match(founderService, /action: 'customer\.provision\.commercial_configured'/);
{
  const commercialEventBlock = founderService.match(/action: 'customer\.provision\.commercial_configured'[\s\S]*?\n {8}\},/)?.[0] ?? '';
  assert.match(commercialEventBlock, /metadata: \{ planTier, billingType, estimatedArrUsd \}/);
  assert.doesNotMatch(commercialEventBlock, /primaryAdminEmail|contractStartDate|contractEndDate/);
}

console.log('Validated Founder-entered Estimated ARR: required client- and server-side with exact copy for empty/zero/negative/invalid input, a shared sane ceiling, Enterprise never auto-calculated, Business\'s suggestion derived at runtime from the authoritative $999/month price (never a hardcoded 11,988), the suggestion clearly labeled and freely editable, live Provisioning Summary and Review display, correct persistence into CustomerAccount.estimatedArrUsd, no path that ever promotes the estimate into actual/recognized revenue, Revenue/Billing pages and tenant isolation left untouched, and a dedicated commercial_configured audit event with no PII over-logging.');

// ─── Commercial plan naming audit: STARTER is an internal legacy identifier
// only — every surface that shows a plan name to a Founder or a real
// customer must render it through lib/plans.ts, never the raw
// CustomerPlanTier enum value or a second hardcoded label map ──────────────
const dashboardShell = read('components/dashboard/DashboardShell.tsx');
const customersTableClient = read('components/founder/CustomersTableClient.tsx');
const founderHomePage = read('app/founder/page.tsx');
const founderPilotsService = read('services/founder-pilots.ts');
const customerSuccessService = read('services/customerSuccess.ts');
const customerSuccessPage = read('app/dashboard/customer-success/page.tsx');
const revenuePageSource = revenuePage; // already read above

// 55. The real, live customer-facing app shell (components/dashboard/
//     DashboardShell.tsx — rendered on every /dashboard, /approvals, etc.
//     page for actual paying customers) no longer has its own separate
//     PLAN_LABELS map with the literal 'Starter' — it sources the label
//     from lib/plans.ts's planDisplayName, the same authoritative mapping
//     used everywhere else.
assert.doesNotMatch(dashboardShell, /PLAN_LABELS/);
assert.doesNotMatch(dashboardShell, /STARTER:\s*'Starter'/);
assert.match(dashboardShell, /import \{ planDisplayName \} from '@\/lib\/plans'/);
assert.match(dashboardShell, /planLabel: planDisplayName\(account\.planTier\)/);

// 56. The Founder Console home page's "Recent Customers" widget — the very
//     first page a Founder sees — renders the plan name via
//     planDisplayName, not a raw enum replace.
assert.doesNotMatch(founderHomePage, /customer\.planTier\.replace/);
assert.match(founderHomePage, /import \{ planDisplayName \} from '@\/lib\/plans'/);
assert.match(founderHomePage, /\{planDisplayName\(customer\.planTier\)\}/);

// 57. Founder Plans & Billing's customer commercial table renders the plan
//     name via planDisplayName, not a raw enum replace (this was the same
//     bug already fixed on Customer 360 in an earlier task, but had been
//     missed on Billing itself). The table itself lives in
//     BillingPortfolioClient.tsx (page.tsx is a thin server wrapper that
//     fetches data and renders KPIs), so the naming guarantee is checked
//     there.
const billingPortfolioClient = read('components/founder/BillingPortfolioClient.tsx');
assert.doesNotMatch(billingPortfolioClient, /customer\.planTier\.replace/);
assert.match(billingPortfolioClient, /import \{ commercialPlans, planDisplayName \} from '@\/lib\/plans'/);
assert.match(billingPortfolioClient, /\{planDisplayName\(customer\.planTier\)\}/);

// 58. The All Customers list (CustomersTableClient.tsx) — its plan filter
//     dropdown, its mobile card view, and its desktop table row all source
//     the plan name/options from lib/plans.ts rather than a hardcoded
//     '<option value="STARTER">Starter</option>' or a raw enum replace.
assert.doesNotMatch(customersTableClient, /<option value="STARTER">Starter<\/option>/);
assert.match(customersTableClient, /import \{ commercialPlans, planDisplayName \} from '@\/lib\/plans'/);
assert.match(customersTableClient, /Object\.values\(commercialPlans\)\.map\(\(plan\) => \(\s*\n\s*<option key=\{plan\.tier\} value=\{plan\.tier\}>\{plan\.displayName\}<\/option>/);
assert.doesNotMatch(customersTableClient, /customer\.planTier\.replace/);
assert.match(customersTableClient, /\{ label: 'Plan', value: planDisplayName\(customer\.planTier\) \}/);
assert.match(customersTableClient, /\{planDisplayName\(customer\.planTier\)\}/);

// 59. Founder Pilots (the pipeline profile shown on /founder/pilots/[id],
//     and its "target package" conversion metric) render the plan name via
//     planDisplayName rather than a raw single-underscore replace — the
//     FREE_TRIAL upsell-target special case ('Growth' as the suggested next
//     package) is untouched, since that is a separate business decision,
//     not a naming bug.
assert.doesNotMatch(founderPilotsService, /customer\.planTier\.replace\(/);
assert.match(founderPilotsService, /import \{ planDisplayName \} from '@\/lib\/plans'/);
assert.match(founderPilotsService, /planTier: planDisplayName\(customer\.planTier\)/);
assert.match(founderPilotsService, /packageTarget: customer\.planTier === 'FREE_TRIAL' \? 'Growth' : planDisplayName\(customer\.planTier\)/);

// 60. Founder Revenue's "Commercial Management" table still buckets its
//     Plan column by ARR thresholds (a pre-existing heuristic — PilotListItem
//     carries no real planTier field, so this is a separate, larger design
//     question this audit did not rebuild), but the label itself now says
//     "Business" instead of the wrong "Starter" — consistent with every
//     other page's naming.
assert.doesNotMatch(revenuePageSource, /: 'Starter'\}<\/td>/);
assert.match(revenuePageSource, /pilot\.expectedArr >= 25000 \? 'Enterprise' : pilot\.expectedArr >= 6000 \? 'Growth' : 'Business'/);

// 61. The customer-facing "Plan readiness" upgrade widget on
//     /dashboard/customer-success no longer offers a fabricated, stale
//     four-tier catalog ("Starter $49/mo", "Growth $199/mo") that
//     contradicted the real Business/Enterprise model — its plan list is
//     now derived from lib/plans.ts's commercialPlans, filtered to the
//     plans ApprovLine currently sells (publiclyOffered), so it always
//     matches the landing page and Provision Customer.
assert.doesNotMatch(customerSuccessService, /\$49\/mo|\$199\/mo/);
assert.doesNotMatch(customerSuccessService, /name: 'Starter'/);
assert.match(customerSuccessService, /import \{ commercialPlans, formatPlanPrice \} from '@\/lib\/plans'/);
assert.match(customerSuccessService, /Object\.values\(commercialPlans\)\s*\n\s*\.filter\(\(plan\) => plan\.publiclyOffered\)/);
assert.doesNotMatch(customerSuccessPage, /plan\.audience/);

console.log('Validated the commercial plan naming audit: STARTER is confirmed a purely internal/legacy CustomerPlanTier enum identifier (never renamed, never exposed as a database value change) with exactly one authoritative display mapping (lib/plans.ts\'s planDisplayName/commercialPlans), and every surface that previously leaked the raw "STARTER"/"Starter" string or a separately fabricated stale plan list — the live customer app shell, the Founder home page, Plans & Billing, All Customers, Founder Pilots, Revenue, and the customer-facing Plan readiness upgrade widget — now renders "Business" consistently and sources pricing from the same $999/month catalog entry used by Provision Customer\'s Estimated ARR suggestion.');

// ─── Provision step must name its outstanding items, not just count them ───
// Regression: the final "8. Provision" panel showed a bare "N items need
// attention" with no indication of which field(s), leaving the Founder no
// way to fix it without manually re-clicking through every prior step.

// 62. The Provision panel derives a reverse (field key -> step index) map
//     from the existing stepErrorKeys table — never a second, separately
//     maintained mapping that could drift from it — and lists every
//     outstanding validation message as a clickable jump-to-step control.
assert.match(wizard, /const keyToStep: Record<string, number> = \{\};/);
assert.match(wizard, /for \(const \[stepIndexKey, keys\] of Object\.entries\(stepErrorKeys\)\)/);
assert.match(wizard, /const outstandingItems = Object\.entries\(validation\)\.map/);
assert.match(wizard, /onClick=\{\(\) => jumpToStep\(item\.stepIndex\)\}/);
assert.match(wizard, /\{item\.message\}/);

// 63. The outstanding-items list only renders when there is something to
//     fix (never shown alongside "Ready to provision", and never for a
//     read-only role where the message is about permissions, not a
//     fixable field).
assert.match(wizard, /\{!readyToProvision && !readOnly \? \(/);

console.log('Validated the Provision step names every outstanding item (not just a bare count) and lets the Founder jump straight to the step that needs fixing.');
