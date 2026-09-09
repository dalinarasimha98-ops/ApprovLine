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

console.log('Validated Founder Console provisioning: authorization gates, duplicate-domain rejection, seat/admin validation, feature/integration configuration, audit events, transactional writes, idempotent replay, and honest invitation status.');
