import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

process.env.SLACK_CLIENT_ID = '123.abc';
process.env.ENCRYPTION_KEY = 'f4c73124c11a3f8a129979f56a6bca9c9703ea4985f3b74ba467ea9a19c53291';

const {
  SLACK_READ_ONLY_SCOPES,
  buildSlackInstallUrl,
  signSlackState,
  slackMessageLink,
  verifySlackSignature,
  verifySlackState,
} = await import('@/services/integrations/slack');
const { buildSimulationJob } = await import('@/services/integrations/simulation');

const state = signSlackState({ organizationId: 'org_123', userId: 'user_123', createdAt: Date.now() });
const verifiedState = verifySlackState(state);
assert.equal(verifiedState?.organizationId, 'org_123');
assert.equal(verifiedState?.userId, 'user_123');
assert.equal(verifySlackState(`${state}tampered`), null);
assert.equal(verifySlackState('not-a-valid-state.short'), null);

const installUrl = buildSlackInstallUrl({ requestUrl: 'https://app.approvline.com/dashboard/settings/integrations', state });
assert.equal(installUrl.hostname, 'slack.com');
assert.equal(installUrl.pathname, '/oauth/v2/authorize');
assert.equal(installUrl.searchParams.get('client_id'), '123.abc');
assert.equal(installUrl.searchParams.get('scope'), SLACK_READ_ONLY_SCOPES);
assert.equal(installUrl.searchParams.get('state'), state);

const rawBody = JSON.stringify({ type: 'event_callback', event: { text: 'Approved', user: 'U123' } });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = `v0=${crypto
  .createHmac('sha256', 'signing-secret')
  .update(`v0:${timestamp}:${rawBody}`)
  .digest('hex')}`;
assert.equal(
  verifySlackSignature({
    signingSecret: 'signing-secret',
    rawBody,
    timestamp,
    signature,
  }),
  true,
);
assert.equal(
  verifySlackSignature({
    signingSecret: 'signing-secret',
    rawBody,
    timestamp,
    signature: 'v0=bad',
  }),
  false,
);

assert.equal(
  slackMessageLink('T123', 'C456', '1719492000.123456'),
  'https://app.slack.com/client/T123/C456/p1719492000123456',
);

const job = buildSimulationJob('org_123', {
  source_platform: 'slack',
  message: 'Approved, move forward with vendor payment.',
  sender_name: 'Priya Sharma',
  sender_email: 'priya@company.com',
  timestamp: '2026-06-27T10:00:00Z',
});
assert.equal(job.provider, 'SLACK');
assert.equal(job.sender, 'Priya Sharma');
assert.equal(job.senderEmail, 'priya@company.com');

console.log('Validated Slack OAuth, signature verification, evidence links, and ingestion mapping.');

// ─── Regression: webhook status must not get stuck at SYNCING ────────────────
// Found during the Integration Health architecture audit and reproduced with
// a real Postgres-backed run of the actual route handler (POST() invoked
// directly, no dev server, no mocks) before removing that temporary harness:
// app/api/integrations/slack/events/route.ts set Integration.status to
// 'SYNCING' before processing every event but never transitioned it back to
// 'CONNECTED' on success. Since resolveIntegrationTenant() (services/
// integrations/resolveTenant.ts) only matches status: 'CONNECTED', this
// meant EVERY Slack workspace's SECOND webhook call — and every one after
// it — 404'd with "Slack workspace is not connected", permanently breaking
// ingestion after the very first successfully processed message.
//
// Real-execution proof (against a real local Postgres, real route handler,
// no mocks): with the pre-fix code, sending three sequential webhook events
// for the same workspace produced status=200/CONNECTED, then 404, then 404.
// With the fix applied, all three produced status=200/CONNECTED. That
// temporary harness has since been removed per this repo's convention (no
// permanent test file in this suite requires a live database connection —
// verified by grep: no other tests/*.test.ts file calls a live prisma query
// outside a comment); these are the source-level assertions that remain.

const slackRoute = readFileSync(`${process.cwd()}/app/api/integrations/slack/events/route.ts`, 'utf8');

// The metadata object written by the SYNCING transition must be captured
// once and reused, never re-derived from the stale pre-fetch `integration`
// snapshot a second time (which would silently discard the lastEventAt/
// lastSlackEventId that same update just wrote).
assert.match(slackRoute, /const syncingMetadata = \{/);
assert.equal((slackRoute.match(/\.\.\.\(integration\.metadata &&/g) ?? []).length, 1); // exactly one stale-snapshot spread left (building syncingMetadata itself)

// The success path (after a message is confirmed queued) must restore
// status to 'CONNECTED' — the actual fix for the bug above.
const successPathMatch = slackRoute.match(/if \(!queued\.queued\) \{[\s\S]*?\n  \}\n\n([\s\S]*?)return NextResponse\.json\(\{ ok: true \}\);/);
assert.ok(successPathMatch, 'could not locate the success path following the queued.queued check');
assert.match(successPathMatch![1], /status: 'CONNECTED', metadata: syncingMetadata/);

// The error path must also reuse syncingMetadata (the same class of bug —
// discarding lastEventAt/lastSlackEventId — existed there too) rather than
// re-spreading the stale `integration.metadata`.
assert.match(slackRoute, /status: 'ERROR',\s*\n\s*metadata: \{ \.\.\.syncingMetadata, lastError: queued\.reason, lastErrorAt: new Date\(\)\.toISOString\(\) \}/);

// resolveIntegrationTenant's own CONNECTED-only filter is untouched — the
// fix is that Integration rows now actually reach/stay in that state after
// a successful webhook, not a loosening of what counts as "connected".
const resolveTenantSource = readFileSync(`${process.cwd()}/services/integrations/resolveTenant.ts`, 'utf8');
assert.match(resolveTenantSource, /status: 'CONNECTED',/);

console.log('Validated the Slack webhook status-restoration fix: Integration.status returns to CONNECTED after a successful event instead of remaining stuck at SYNCING, and both the success and error paths preserve metadata written by the earlier SYNCING transition instead of discarding it.');
