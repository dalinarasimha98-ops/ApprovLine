import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Anti-downgrade regression suite for the OAuth state-signing fail-closed
// fix (services/integrations/oauthState.ts, consumed by all 7 connectors'
// stateSecret() helpers). config/env.ts's `env` export is a snapshot
// parsed once per process at import time, so a scenario that needs a
// *different* secret configuration than another scenario cannot be
// faked via a same-process re-import (verified: dynamic import with a
// cache-busting query still resolves the shared `@/config/env` import
// inside it to the same already-parsed singleton). Each scenario below
// therefore runs in its own child process with its own env, exactly as
// this repo's real deployments each boot with one fixed env.

function run(envOverrides: Record<string, string | undefined>, script: string): { stdout: string; ok: boolean } {
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') childEnv[k] = v;
  }
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  try {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
      cwd: process.cwd(),
      env: childEnv as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });
    return { stdout, ok: true };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { stdout: `${e.stdout ?? ''}${e.stderr ?? ''}`, ok: false };
  }
}

const NO_SECRETS = { ENCRYPTION_KEY: undefined, CLERK_SECRET_KEY: undefined };
const REAL_SECRET_A = '1111111111111111111111111111111111111111111111111111111111111111';
const REAL_SECRET_B = '2222222222222222222222222222222222222222222222222222222222222222';

// ── 1 & 2: valid configured secret → signing succeeds, verification succeeds ──

{
  const { stdout, ok } = run({ ENCRYPTION_KEY: REAL_SECRET_A, CLERK_SECRET_KEY: undefined }, `
    const { signSlackState, verifySlackState } = await import('./services/integrations/slack.ts');
    const state = signSlackState({ organizationId: 'org_1', userId: 'user_1' });
    console.log('STATE:' + state);
    const payload = verifySlackState(state);
    console.log('VERIFIED:' + JSON.stringify(payload));
  `);
  assert.ok(ok, `expected success with a configured secret, got: ${stdout}`);
  assert.match(stdout, /STATE:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/); // real body.signature shape
  assert.match(stdout, /VERIFIED:\{"organizationId":"org_1","userId":"user_1"/);
}

// ── 3: wrong secret → verification fails ──────────────────────────────────

{
  const signResult = run({ ENCRYPTION_KEY: REAL_SECRET_A, CLERK_SECRET_KEY: undefined }, `
    const { signSlackState } = await import('./services/integrations/slack.ts');
    console.log(signSlackState({ organizationId: 'org_1', userId: 'user_1' }));
  `);
  assert.ok(signResult.ok);
  const state = signResult.stdout.trim();

  const verifyResult = run({ ENCRYPTION_KEY: REAL_SECRET_B, CLERK_SECRET_KEY: undefined }, `
    const { verifySlackState } = await import('./services/integrations/slack.ts');
    console.log(JSON.stringify(verifySlackState(${JSON.stringify(state)})));
  `);
  assert.ok(verifyResult.ok);
  assert.equal(verifyResult.stdout.trim(), 'null'); // a state signed with a different secret must never verify
}

// ── 4: tampered state → verification fails ─────────────────────────────────

{
  const { stdout, ok } = run({ ENCRYPTION_KEY: REAL_SECRET_A, CLERK_SECRET_KEY: undefined }, `
    const { signSlackState, verifySlackState } = await import('./services/integrations/slack.ts');
    const state = signSlackState({ organizationId: 'org_1', userId: 'user_1' });
    console.log('TAMPERED_SUFFIX:' + JSON.stringify(verifySlackState(state + 'x')));
    const [body, signature] = state.split('.');
    const flippedSignature = signature.slice(0, -1) + (signature.at(-1) === 'A' ? 'B' : 'A');
    console.log('TAMPERED_SIG:' + JSON.stringify(verifySlackState(body + '.' + flippedSignature)));
    console.log('UNSIGNED:' + JSON.stringify(verifySlackState(body)));
  `);
  assert.ok(ok, stdout);
  assert.match(stdout, /TAMPERED_SUFFIX:null/);
  assert.match(stdout, /TAMPERED_SIG:null/);
  assert.match(stdout, /UNSIGNED:null/); // an unsigned body (no ".signature" half) is never accepted
}

// ── 5: expired state → verification fails ───────────────────────────────────

{
  const { stdout, ok } = run({ ENCRYPTION_KEY: REAL_SECRET_A, CLERK_SECRET_KEY: undefined }, `
    const { signSlackState, verifySlackState } = await import('./services/integrations/slack.ts');
    const elevenMinutesAgo = Date.now() - 11 * 60_000;
    const state = signSlackState({ organizationId: 'org_1', userId: 'user_1', createdAt: elevenMinutesAgo });
    console.log('EXPIRED:' + JSON.stringify(verifySlackState(state)));
    const fiveMinutesAgo = Date.now() - 5 * 60_000;
    const freshState = signSlackState({ organizationId: 'org_1', userId: 'user_1', createdAt: fiveMinutesAgo });
    console.log('STILL_VALID:' + JSON.stringify(verifySlackState(freshState)));
  `);
  assert.ok(ok, stdout);
  assert.match(stdout, /EXPIRED:null/);
  assert.match(stdout, /STILL_VALID:\{/);
}

// ── 6 & 7: missing secret → signing AND verification both throw ────────────

{
  const { stdout, ok } = run(NO_SECRETS, `
    const { signSlackState, verifySlackState } = await import('./services/integrations/slack.ts');
    try {
      signSlackState({ organizationId: 'org_1', userId: 'user_1' });
      console.log('SIGN_THREW:false');
    } catch (e) {
      console.log('SIGN_THREW:true:' + e.message);
    }
    try {
      verifySlackState('anything.at-all');
      console.log('VERIFY_THREW:false');
    } catch (e) {
      console.log('VERIFY_THREW:true:' + e.message);
    }
  `);
  assert.ok(ok, stdout);
  assert.match(stdout, /SIGN_THREW:true:OAuth connection is temporarily unavailable/);
  assert.match(stdout, /VERIFY_THREW:true:OAuth connection is temporarily unavailable/);
  // The error is generic and safe: it names neither env var, no secret value.
  assert.doesNotMatch(stdout, /ENCRYPTION_KEY|CLERK_SECRET_KEY/);
}

// ── 8: empty secret → signing throws/fails ──────────────────────────────────

{
  const { stdout, ok } = run({ ENCRYPTION_KEY: '', CLERK_SECRET_KEY: undefined }, `
    const { signSlackState } = await import('./services/integrations/slack.ts');
    try {
      signSlackState({ organizationId: 'org_1', userId: 'user_1' });
      console.log('THREW:false');
    } catch (e) {
      console.log('THREW:true');
    }
  `);
  assert.ok(ok, stdout);
  assert.match(stdout, /THREW:true/); // config/env.ts normalizes "" to undefined before this is ever reached
}

// ── 9: whitespace-only secret → signing throws/fails ────────────────────────

{
  const { stdout, ok } = run({ ENCRYPTION_KEY: '   ', CLERK_SECRET_KEY: undefined }, `
    const { signSlackState } = await import('./services/integrations/slack.ts');
    try {
      signSlackState({ organizationId: 'org_1', userId: 'user_1' });
      console.log('THREW:false');
    } catch (e) {
      console.log('THREW:true');
    }
  `);
  assert.ok(ok, stdout);
  assert.match(stdout, /THREW:true/); // config/env.ts normalizes whitespace-only to undefined before this is ever reached
}

console.log('Validated the OAuth state-signing anti-downgrade properties across real child-process scenarios: a configured secret signs and verifies correctly; a different secret, a tampered signature, an unsigned body, and an expired timestamp are all rejected; a missing, empty, or whitespace-only secret makes both signing and verification throw a generic error naming no env var and no secret value.');

// ── 10, 11, 12: static-analysis regression assertions ──────────────────────
// (no hardcoded fallback, no unsigned-state code path, no generated
// per-request fallback secret) across every one of the 7 real connectors
// plus the shared helper module itself.

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const oauthStateLib = read('services/integrations/oauthState.ts');
const oauthStateLibCodeOnly = stripComments(oauthStateLib);

// 10. No hardcoded fallback secret exists anywhere: the shared helper is
//     the ONE place a secret is selected, and it has no `?? '...'`/`|| '...'`
//     literal fallback of any kind — only `env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY`
//     followed by a throw.
assert.match(oauthStateLibCodeOnly, /const secret = env\.ENCRYPTION_KEY \?\? env\.CLERK_SECRET_KEY;/);
assert.doesNotMatch(oauthStateLibCodeOnly, /\?\?\s*['"`][^'"`]+['"`]/); // no `?? "literal"` anywhere in this file
assert.doesNotMatch(oauthStateLibCodeOnly, /\|\|\s*['"`][^'"`]+['"`]/); // no `|| "literal"` anywhere in this file
assert.match(oauthStateLibCodeOnly, /if \(!secret\) \{\s*\n\s*throw new OAuthStateConfigurationError\(provider\);/);

for (const provider of ['slack', 'gmail', 'outlook', 'jira', 'teams', 'zoom', 'servicenow']) {
  const connector = stripComments(read(`services/integrations/${provider}.ts`));
  // No provider re-implements its own secret-selection or fallback logic —
  // each one delegates to the single shared helper.
  assert.match(connector, /return requireOAuthStateSecret\(/);
  assert.doesNotMatch(connector, /env\.ENCRYPTION_KEY\s*\?\?\s*env\.CLERK_SECRET_KEY/); // no re-inlined duplicate of the shared logic
  assert.doesNotMatch(connector, /'approvline-dev-[a-z-]*state-secret'/); // the exact old hardcoded literal
  assert.doesNotMatch(connector, /DEFAULT_SECRET|DEV_SECRET/i);
  // 12. No per-request generated secret: crypto.randomBytes/randomUUID is
  //     never used as a substitute signing key anywhere in these files.
  assert.doesNotMatch(connector, /randomBytes\([^)]*\)[\s\S]{0,40}createHmac|createHmac\([^,]+,\s*crypto\.random/);
  assert.doesNotMatch(connector, /createHmac\(['"]sha256['"],\s*['"]{2}\)/); // never HMAC with a literal empty-string key
}

// 11. No unsigned state is ever accepted: verify() always requires a real
//     `body.signature` split and a timingSafeEqual comparison — a state
//     with no signature half is rejected structurally, not by a secret
//     comparison that could be bypassed. Verified across every connector.
for (const provider of ['slack', 'gmail', 'outlook', 'jira', 'teams', 'zoom', 'servicenow']) {
  const connector = stripComments(read(`services/integrations/${provider}.ts`));
  assert.match(connector, /if \(!body \|\| !signature\) return null;/);
  assert.match(connector, /timingSafeEqual/);
}

console.log('Validated static-analysis regression assertions: no hardcoded fallback secret, no re-inlined duplicate secret-selection logic, no per-request generated secret, and no code path that accepts an unsigned OAuth state, across all 7 real connectors and the shared services/integrations/oauthState.ts helper.');
