import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
