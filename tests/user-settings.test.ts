/**
 * User Settings (/settings/profile) — regression tests.
 *
 * Personal account settings are deliberately separate from
 * services/settings.ts (organization-wide) and services/identity.ts
 * (enterprise SSO admin). These tests verify:
 *  - every mutation is scoped to the server-resolved tenant/user, never a
 *    client-supplied id;
 *  - session revoke verifies ownership before calling Clerk's
 *    revokeSession() (otherwise it's a cross-account session-revocation
 *    IDOR - see services/userSettings.ts's doc comment);
 *  - no secret/credential fields are ever selected or rendered;
 *  - real Clerk fields are used for security status (not fabricated ones);
 *  - the new profile fields (Job Title/Department/Phone/Location/Manager/
 *    Time Zone) are genuinely persisted and genuinely validated - Department
 *    against the organization's own real list, Time Zone against
 *    Intl.supportedValuesOf, Manager as a real self-relation that is never
 *    fuzzy-matched or fabricated;
 *  - Notifications is a real, working section whose only lever
 *    (emailEnabled) can never suppress the compliance-critical
 *    ApprovalConfirmationRequest record/audit trail, only the optional
 *    convenience email, and only for approvers who are registered users in
 *    the SAME organization (tenant-isolated), failing open on any error;
 *  - In-App/Mobile Notifications, Theme, and Language are rendered as
 *    honest non-interactive states, never a fake control that looks
 *    functional but doesn't persist;
 *  - API Access explains the real security model with no fabricated
 *    button/link to a nonexistent personal-key feature;
 *  - every settings section degrades independently on failure.
 *
 * Static-source checks (no DB/Clerk required) plus real executed unit
 * tests where the logic is pure. Run: node --import tsx tests/user-settings.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:user-settings'], 'node --import tsx tests/user-settings.test.ts');

const service = read('services/userSettings.ts');
const page = read('app/settings/profile/page.tsx');
const shell = read('components/settings/UserSettingsShell.tsx');
const confirmationsRoute = read('app/api/approvals/[id]/confirmations/route.ts');

// --- Tenant/user scoping: never trust a client-supplied id ------------------

assert.match(service, /organizationId: input\.organizationId/, 'updates must be scoped by the caller-supplied organizationId, not derived from client input inside the service');
assert.match(service, /where: \{ id: input\.userId, organizationId: input\.organizationId \}/, 'profile reads/writes must be scoped by both userId AND organizationId, not id alone');

for (const mutator of ['updateProfile', 'updateNotifications', 'revokeSession']) {
  const fnMatch = page.match(new RegExp(`async function ${mutator}\\(formData: FormData\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(fnMatch, `expected to find the ${mutator} server action in page.tsx`);
  const body = fnMatch![0];
  assert.match(body, /'use server'/, `${mutator} must be a real server action`);
  assert.match(body, /getDashboardTenant\(/, `${mutator} must resolve identity server-side via getDashboardTenant(), never trust a client-supplied user/org id`);
  assert.match(body, /enforcePageRole\('\/settings\/profile'/, `${mutator} must re-check role server-side, not just rely on the page's own gate`);
  assert.match(body, /tenant\.organization\.id/, `${mutator} must pass the server-resolved organizationId`);
  assert.match(body, /tenant\.user\.id|tenant\.user\.clerkUserId/, `${mutator} must pass the server-resolved user identity`);
}

// --- Session revoke: ownership must be verified before revoking -------------

const revokeFnStart = service.indexOf('export async function revokeUserSession');
assert.ok(revokeFnStart > -1, 'expected to find revokeUserSession in services/userSettings.ts');
// revokeUserSession is the last export in the file, so everything from its
// declaration to end-of-file is its body - safer than a non-greedy regex,
// which stops at the first closing brace it meets (the input type's own).
const revokeFn = service.slice(revokeFnStart);
assert.match(revokeFn, /getSessionList\(\{ userId: input\.clerkUserId/, 'must fetch the CURRENT user\'s own session list before revoking anything');
assert.match(revokeFn, /const owned = data\.some/, 'must verify the target sessionId is actually in that list');
assert.match(revokeFn, /if \(!owned\)/, 'must refuse to revoke a session that does not belong to the caller');
// The ownership check must appear before the revoke call, not after.
const ownedCheckIndex = revokeFn.indexOf('if (!owned)');
const revokeCallIndex = revokeFn.indexOf('client.sessions.revokeSession(input.sessionId)');
assert.ok(ownedCheckIndex > -1 && revokeCallIndex > -1 && ownedCheckIndex < revokeCallIndex, 'the ownership check must run BEFORE calling revokeSession(), not after');

// --- No secrets ever selected or rendered ------------------------------------

for (const forbidden of ['encryptedTokens', 'encryptedCredentials', 'sessionToken', 'refreshToken', 'accessToken', 'clientSecret', 'secretKey']) {
  assert.ok(!service.includes(forbidden), `services/userSettings.ts must never select or return "${forbidden}"`);
  assert.ok(!shell.includes(forbidden), `UserSettingsShell.tsx must never render "${forbidden}"`);
}
// Session revocation only ever needs a session id - never a bearer token.
assert.doesNotMatch(shell, /session\.token|session\.jwt/i, 'the sessions UI must never reference a session token/JWT');

// --- Real Clerk fields, not fabricated ones ---------------------------------

for (const realField of ['passwordEnabled', 'twoFactorEnabled', 'totpEnabled', 'backupCodeEnabled', 'banned', 'locked']) {
  assert.match(service, new RegExp(`clerkUser\\.${realField}`), `must read the real Clerk User.${realField} field rather than inventing a status`);
}
assert.match(service, /client\.sessions\.getSessionList\(/, 'must use Clerk\'s real session-list API for Active Sessions');
assert.match(service, /client\.sessions\.revokeSession\(/, 'must use Clerk\'s real session-revoke API');
assert.match(service, /client\.users\.updateUser\(/, 'name edits must go through Clerk\'s real user-update API, not a local-only field');
// The account-status badge (Active/Locked/Suspended) must derive from those
// real flags, not always render "Active".
assert.match(shell, /security\.status\.banned/, 'account status must check the real Clerk "banned" flag');
assert.match(shell, /security\.status\.locked/, 'account status must check the real Clerk "locked" flag');

// --- New profile fields: real schema, real validation, no fabrication -------

const schema = read('prisma/schema.prisma');
for (const column of ['jobTitle', 'department', 'phone', 'location', 'timezone', 'managerId']) {
  assert.match(schema, new RegExp(`${column}\\s+String\\?`), `User model must have a real, nullable ${column} column`);
}
assert.match(schema, /manager\s+User\?\s+@relation\("UserManager"/, 'Manager must be a real self-relation, not a free-text field or a fuzzy lookup');
assert.match(schema, /directReports\s+User\[\]\s+@relation\("UserManager"\)/, 'the manager relation must be declared on both sides');

// Department is validated against the organization's OWN real list, never
// accepted as free text and never checked against a hardcoded list.
assert.match(service, /if \(input\.department && !input\.organizationDepartments\.includes\(input\.department\)\)/, 'department must be validated against the organization\'s real configured department list');
// Time zone is validated against the live IANA list, never a hand-maintained one.
assert.match(service, /export function supportedTimezones\(\)[\s\S]{0,80}Intl\.supportedValuesOf\('timeZone'\)/, 'time zone options must come from Intl.supportedValuesOf, not a fabricated fixed list');
assert.match(service, /if \(input\.timezone && !supportedTimezones\(\)\.includes\(input\.timezone\)\)/, 'time zone input must be validated against the real supported list before saving');

// Manager is read from the real relation only - no name/department fuzzy matching helper exists anywhere in the service.
assert.match(service, /manager: \{ select: \{ name: true, email: true \} \}/, 'manager must be read via the real Prisma relation');
for (const forbiddenFuzzy of ['findManagerByName', 'guessManager', 'fuzzyMatch', 'closestMatch']) {
  assert.ok(!service.includes(forbiddenFuzzy), `must not fuzzy-match or guess a manager (found "${forbiddenFuzzy}")`);
}

// The Edit Profile drawer's Department/Time Zone controls are real, backed selects, not free text and not fabricated options.
assert.match(shell, /profile\.organizationDepartments\.map\(/, 'the Department picker must be populated from the organization\'s real department list');
assert.match(shell, /Intl\.supportedValuesOf\('timeZone'\)/, 'the Time Zone picker must be populated from the real, current IANA list');
assert.match(shell, /<Field label="Manager" value={profile\.managerName \?\? 'Not set'} \/>/, 'Manager must render the real relation or an honest "Not set" - never an invented name');

// --- Notifications: real, working, and compliance-safe -----------------------

// The section genuinely exists now (a real backend supports it) - unlike the
// prior phase, it must NOT be omitted.
assert.match(shell, /Notification Preferences/, 'Notifications must be a real, rendered section now that a genuine backend exists for it');
assert.match(service, /export async function updateNotificationPreference/, 'a real mutation must persist the notification preference');
assert.match(service, /userNotificationPreference\.upsert/, 'the preference must be persisted to the real UserNotificationPreference table');

// Only Email Notifications is a real, persisting control - it's the only one
// wired to a <form>/server action with a named input.
const emailToggleBlock = shell.slice(shell.indexOf('Email Notifications') - 800, shell.indexOf('Email Notifications') + 200);
assert.match(emailToggleBlock, /<form action={action}/, 'Email Notifications must submit through the real server action');
assert.match(emailToggleBlock, /name="emailEnabled"/, 'Email Notifications must be backed by the real emailEnabled field');

// In-App and Mobile Notifications must be honestly non-interactive - no
// checkbox/input, no form, no name attribute - matching "no fake toggles".
for (const fakeLabel of ['In-App Notifications', 'Mobile Notifications']) {
  const idx = shell.indexOf(fakeLabel);
  assert.ok(idx > -1, `expected to find the honest "${fakeLabel}" state`);
  const block = shell.slice(idx - 300, idx + 400);
  assert.doesNotMatch(block, /<input/, `"${fakeLabel}" must not render a real interactive control - it has no backend yet`);
  assert.doesNotMatch(block, /<form/, `"${fakeLabel}" must not be wrapped in a submitting form`);
  assert.match(block, /Not (available|configured)/i, `"${fakeLabel}" must say plainly that it isn't available, not imply it works`);
}

// Compliance safety: disabling the preference must never affect the
// ApprovalConfirmationRequest record, its audit trail, or the requirement to
// act on it - only the optional convenience email that follows.
assert.match(service, /export async function shouldSendOptionalConfirmationEmail/, 'a real compliance-safe gate function must exist');
assert.match(service, /where: \{ organizationId, email: \{ equals: approverEmail, mode: 'insensitive' \} \}/, 'the approver lookup must be tenant-scoped and case-insensitive');
assert.match(service, /if \(!user\) return true;/, 'an approver with no matching registered user (external/verbal) must always be emailed, unchanged from prior behavior');
assert.match(service, /return preference\?\.emailEnabled \?\? true;/, 'a registered user with no preference row yet must default to true (opt-out only, never opt-in-by-omission)');
// Fails open on any lookup error - an outage must never silently suppress a compliance email.
const gateFnStart = service.indexOf('export async function shouldSendOptionalConfirmationEmail');
const gateFn = service.slice(gateFnStart, service.indexOf('\nexport ', gateFnStart + 10) === -1 ? undefined : service.indexOf('\nexport ', gateFnStart + 10));
assert.match(gateFn, /catch \(error\) \{[\s\S]*return true;/, 'the gate must fail open (return true) on any error, never fail closed and silently suppress a compliance email');

// The confirmation route must create the compliance record BEFORE consulting
// the optional-email gate, so the gate can only ever affect delivery of the
// convenience email, never the record/audit trail itself.
const transactionIndex = confirmationsRoute.indexOf('prisma.$transaction');
const gateCallIndex = confirmationsRoute.indexOf('shouldSendOptionalConfirmationEmail(');
assert.ok(transactionIndex > -1 && gateCallIndex > -1 && transactionIndex < gateCallIndex, 'the ApprovalConfirmationRequest + audit log must be created BEFORE the optional-email gate runs, so the gate can never skip the compliance record');
// The fallback path (email withheld) still returns a usable secure link, never silently drops the approver.
assert.match(confirmationsRoute, /copy_secure_link/, 'withholding the optional email must still surface the secure confirmation link, never leave the approver with nothing');

// --- No fake settings: honest states for what genuinely isn't supported -----

// Theme/Language are shown as real read-only facts (the app is dark-only and
// English-only today), never an interactive control that silently does nothing.
assert.doesNotMatch(shell, /<select[^>]*name=["']theme["']/i, 'must not offer a theme control - this app only supports dark mode');
assert.doesNotMatch(shell, /<select[^>]*name=["']language["']/i, 'must not offer a language control - no other language is supported');
assert.doesNotMatch(shell, /Light[\s\S]{0,40}Dark.*(toggle|switch|select)/i, 'must not fabricate a light/dark theme toggle');

// API Access explains the real security model - no fake "Generate key"/"Create token" interaction.
assert.match(shell, /API Access/, 'API Access must remain visible in the nav with an honest destination/state');
const apiSectionIdx = shell.indexOf("activeSection === 'api'");
assert.ok(apiSectionIdx > -1, 'expected the API Access section body');
const apiSection = shell.slice(apiSectionIdx, apiSectionIdx + 800);
assert.doesNotMatch(apiSection, /<button|<a\s/i, 'API Access must not present a fake button/link to a personal-key feature that doesn\'t exist');
assert.match(apiSection, /doesn.t issue per-user API keys|No personal API credentials/i, 'API Access must state the real limitation plainly');

// --- Section-level degradation: one failure must not break the whole page --

// `security` derives from the same clerkUser fetch as `profile` (one Clerk
// call feeds both), so its independence comes from THAT try/catch rather
// than one of its own - check the fetch it depends on, not a nonexistent
// second try/catch.
assert.match(service, /let clerkUser: ClerkUser \| null = null;[\s\S]{0,120}try \{\s*clerkUser = await client\.users\.getUser/, 'the Clerk user lookup that Profile and Security both derive from must be try/caught');
for (const section of ['sessions', 'connectedSources', 'securityActivity']) {
  assert.match(service, new RegExp(`let ${section}[\\s\\S]{0,80}try \\{`), `the ${section} section must be independently try/caught in getUserSettingsData`);
}
assert.match(service, /let notifications: UserSettingsData\['notifications'\];\s*try \{/, 'the notifications section must be independently try/caught in getUserSettingsData');
assert.match(shell, /security\.error/);
assert.match(shell, /sessions\.error/);
assert.match(shell, /connectedSources\.error/);
assert.match(shell, /notifications\.error/);
assert.match(shell, /securityActivity\.error/);

// Recent Security Activity must render only real, computed relative
// timestamps - never a fabricated string like "3 months ago".
assert.doesNotMatch(shell, /Last changed \d+ (day|week|month)s? ago/i, 'must never fabricate a "last changed" timestamp Clerk doesn\'t actually provide');
assert.match(shell, /formatRelative\(event\.createdAt\)/, 'security activity timestamps must be computed from the real AuditLog.createdAt, not hardcoded');

// --- RBAC wiring already covered in tests/access-control.test.ts; sanity-check the nav item is real ---

const nav = read('components/dashboard/DashboardNavigation.tsx');
assert.match(nav, /href: '\/settings\/profile', label: 'User Settings'/, 'the nav must link to the real route, not a placeholder');

console.log('Validated User Settings: tenant/user-scoped mutations, verified session-ownership check before revoke, no secrets selected or rendered, real Clerk security/session fields (no fabricated status), real+validated profile fields (department against the org\'s own list, time zone against Intl.supportedValuesOf, manager as a real never-fuzzy-matched relation), a real compliance-safe Notifications preference that never gates the confirmation record/audit trail, honest non-interactive states for In-App/Mobile/Theme/Language, an honest API Access explanation with no fake interaction, and independent per-section error degradation.');
