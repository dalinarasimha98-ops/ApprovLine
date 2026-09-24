/**
 * Static-source regression test for the /api/health deployment-info
 * addition, prompted by not having any way to confirm which commit was
 * actually live on the production deployment. Vercel automatically injects
 * VERCEL_GIT_COMMIT_SHA (and related vars) as System Environment Variables
 * for every deployment - no secret, no manual configuration - so exposing
 * them here answers "is the live site on the latest commit?" without
 * needing hosting-platform dashboard access.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const healthRoute = read('app/api/health/route.ts');
assert.match(healthRoute, /VERCEL_GIT_COMMIT_SHA/);
assert.match(healthRoute, /VERCEL_GIT_COMMIT_REF/);
assert.match(healthRoute, /VERCEL_ENV/);
assert.match(healthRoute, /deployment:/);
// Never throws when the env vars are absent (e.g. running outside Vercel) -
// every field falls back to null via `??`, not a crash.
assert.match(healthRoute, /process\.env\.VERCEL_GIT_COMMIT_SHA \?\? null/);

const healthPage = read('app/health/page.tsx');
assert.match(healthPage, /VERCEL_GIT_COMMIT_SHA/);
assert.match(healthPage, /Deployment/);

console.log(
  'Validated /api/health exposes the live deployment\'s git commit SHA/branch/environment via Vercel\'s automatically-injected System Environment Variables, with safe fallbacks when unset, and that the human-readable /health page surfaces the same information.',
);
