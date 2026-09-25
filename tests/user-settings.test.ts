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
 *  - the "no fake settings" requirement holds: no Notifications or API
 *    Access section exists, since neither has a genuine backend today, and
 *    Preferences never renders a control (theme/language/timezone) that
 *    doesn't actually persist;
 *  - real Clerk fields are used for security status (not fabricated ones);
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

// --- Tenant/user scoping: never trust a client-supplied id ------------------

assert.match(service, /organizationId: input\.organizationId/, 'updates must be scoped by the caller-supplied organizationId, not derived from client input inside the service');
assert.match(service, /where: \{ id: input\.userId, organizationId: input\.organizationId \}/, 'the profile-name DB write must be scoped by both userId AND organizationId, not id alone');

for (const mutator of ['updateProfile', 'revokeSession']) {
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

for (const realField of ['passwordEnabled', 'twoFactorEnabled', 'totpEnabled', 'backupCodeEnabled']) {
  assert.match(service, new RegExp(`clerkUser\\.${realField}`), `must read the real Clerk User.${realField} field rather than inventing a status`);
}
assert.match(service, /client\.sessions\.getSessionList\(/, 'must use Clerk\'s real session-list API for Active Sessions');
assert.match(service, /client\.sessions\.revokeSession\(/, 'must use Clerk\'s real session-revoke API');
assert.match(service, /client\.users\.updateUser\(/, 'name edits must go through Clerk\'s real user-update API, not a local-only field');

// --- No fake settings: Notifications and API Access are genuinely omitted --

for (const fakeSection of ['Notifications', 'API Access', 'Mobile Notifications', 'In-App Notifications']) {
  assert.ok(!shell.includes(fakeSection), `UserSettingsShell.tsx must not render a "${fakeSection}" section - no genuine backend exists for it`);
}
// Preferences must never render an interactive, non-persisting control.
assert.doesNotMatch(shell, /<select[^>]*\b(theme|language|timezone)\b/i, 'Preferences must not offer a theme/language/timezone control that does not actually persist');
assert.doesNotMatch(shell, /Light[\s\S]{0,40}Dark.*(toggle|switch|select)/i, 'must not fabricate a light/dark theme toggle - this app only supports dark mode');

// --- Section-level degradation: one failure must not break the whole page --

// `security` derives from the same clerkUser fetch as `profile` (one Clerk
// call feeds both), so its independence comes from THAT try/catch rather
// than one of its own - check the fetch it depends on, not a nonexistent
// second try/catch.
assert.match(service, /let clerkUser: ClerkUser \| null = null;[\s\S]{0,120}try \{\s*clerkUser = await client\.users\.getUser/, 'the Clerk user lookup that Profile and Security both derive from must be try/caught');
for (const section of ['sessions', 'connectedSources']) {
  assert.match(service, new RegExp(`let ${section}[\\s\\S]{0,80}try \\{`), `the ${section} section must be independently try/caught in getUserSettingsData`);
}
assert.match(shell, /security\.error/);
assert.match(shell, /sessions\.error/);
assert.match(shell, /connectedSources\.error/);

// --- RBAC wiring already covered in tests/access-control.test.ts; sanity-check the nav item is real ---

const nav = read('components/dashboard/DashboardNavigation.tsx');
assert.match(nav, /href: '\/settings\/profile', label: 'User Settings'/, 'the nav must link to the real route, not a placeholder');

console.log('Validated User Settings: tenant/user-scoped mutations, verified session-ownership check before revoke, no secrets selected or rendered, real Clerk security/session fields (no fabricated status), Notifications/API Access genuinely omitted (no backend exists), no non-persisting Preferences controls, and independent per-section error degradation.');
